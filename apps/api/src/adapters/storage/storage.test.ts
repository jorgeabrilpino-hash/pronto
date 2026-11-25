// Supabase Storage adapter. Unit tests use a fake fetch; the live test talks to the private
// `invoices` bucket, uploads one tiny object under test/ and always deletes it.
// The live test skips itself when SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { encodeObjectPath, StorageError, SupabaseFileStorage } from './index';

vi.setConfig({ testTimeout: 60_000 });

const FIXED = { now: () => new Date('2026-11-23T15:00:00Z') };

function fakeFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    return handler(url, init ?? {});
  }) as typeof fetch;
  return { fn, calls };
}

describe('SupabaseFileStorage (unit)', () => {
  it('signs uploads on the private bucket with the service key and caps expiry', async () => {
    const f = fakeFetch(() =>
      Response.json({ url: '/object/upload/sign/invoices/a/b.pdf?token=t', token: 't' }),
    );
    const s = new SupabaseFileStorage({
      url: 'https://ref.supabase.co',
      serviceKey: 'service-key',
      fetch: f.fn,
      clock: FIXED,
    });
    const up = await s.createUploadUrl('a/b.pdf', 'application/pdf', 5_242_880, 600);
    expect(up.url).toBe(
      'https://ref.supabase.co/storage/v1/object/upload/sign/invoices/a/b.pdf?token=t',
    );
    expect(up.expiresAt.toISOString()).toBe('2026-11-23T15:10:00.000Z');
    expect(f.calls[0]?.url).toBe(
      'https://ref.supabase.co/storage/v1/object/upload/sign/invoices/a/b.pdf',
    );
    expect(f.calls[0]?.init.method).toBe('POST');
    const headers = f.calls[0]?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer service-key');
    expect(headers.apikey).toBe('service-key');
    const long = await s.createUploadUrl('a/b.pdf', 'application/pdf', 1, 99_999);
    expect(long.expiresAt.getTime() - FIXED.now().getTime()).toBe(7_200_000);
  });

  it('signs downloads with the requested ttl', async () => {
    const f = fakeFetch(() =>
      Response.json({ signedURL: '/object/sign/invoices/p%20q.pdf?token=x' }),
    );
    const s = new SupabaseFileStorage({
      url: 'https://ref.supabase.co',
      serviceKey: 'k',
      fetch: f.fn,
    });
    expect(await s.createDownloadUrl('p q.pdf', 60)).toBe(
      'https://ref.supabase.co/storage/v1/object/sign/invoices/p%20q.pdf?token=x',
    );
    expect(f.calls[0]?.url).toContain('/object/sign/invoices/p%20q.pdf');
    expect(JSON.parse(String(f.calls[0]?.init.body))).toEqual({ expiresIn: 60 });
  });

  it('head reports size and mime, null when missing, and fails on other errors', async () => {
    let status = 200;
    const f = fakeFetch(
      () =>
        new Response(null, {
          status,
          headers: { 'content-length': '2048', 'content-type': 'application/pdf; charset=binary' },
        }),
    );
    const s = new SupabaseFileStorage({
      url: 'https://ref.supabase.co',
      serviceKey: 'k',
      fetch: f.fn,
    });
    expect(await s.head('a.pdf')).toEqual({ sizeBytes: 2048, mime: 'application/pdf' });
    expect(f.calls[0]?.init.method).toBe('HEAD');
    status = 404;
    expect(await s.head('a.pdf')).toBeNull();
    status = 400;
    expect(await s.head('a.pdf')).toBeNull();
    status = 500;
    await expect(s.head('a.pdf')).rejects.toBeInstanceOf(StorageError);
  });

  it('rejects malformed responses, failed requests and unsafe paths without leaking the key', async () => {
    const bad = fakeFetch(() => Response.json({}));
    const s = new SupabaseFileStorage({
      url: 'https://ref.supabase.co',
      serviceKey: 'secret',
      fetch: bad.fn,
    });
    await expect(s.createUploadUrl('a', 'x', 1, 1)).rejects.toThrow('Unexpected signed upload');
    await expect(s.createDownloadUrl('a', 1)).rejects.toThrow('Unexpected signed download');
    const denied = fakeFetch(() => new Response('{"error":"denied"}', { status: 403 }));
    const d = new SupabaseFileStorage({
      url: 'https://ref.supabase.co',
      serviceKey: 'secret',
      fetch: denied.fn,
    });
    const err = await d.createDownloadUrl('a', 1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StorageError);
    expect(String((err as Error).message)).not.toContain('secret');
    const noHeaders = fakeFetch(() => new Response(null, { status: 200 }));
    const h = new SupabaseFileStorage({
      url: 'https://ref.supabase.co',
      serviceKey: 'k',
      fetch: noHeaders.fn,
    });
    await expect(h.head('a')).rejects.toThrow('did not report');
    for (const p of ['', '../x', 'a//b', 'a/./b', '/a', 'a\\b', 'a\nb']) {
      expect(() => encodeObjectPath(p)).toThrow(StorageError);
    }
    expect(encodeObjectPath('c1/x y.pdf')).toBe('c1/x%20y.pdf');
    expect(
      () => new SupabaseFileStorage({ url: 'http://ref.supabase.co', serviceKey: 'k' }),
    ).toThrow();
  });
});

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!SUPABASE_URL || !SERVICE_KEY)('SupabaseFileStorage (live bucket)', () => {
  it('uploads through a signed URL, heads, downloads and cleans up', async () => {
    const url = SUPABASE_URL ?? '';
    const key = SERVICE_KEY ?? '';
    const storage = new SupabaseFileStorage({ url, serviceKey: key });
    const path = `test/${randomUUID()}.pdf`;
    const bytes = new TextEncoder().encode('%PDF-1.4\n% pronto adapter test\n%%EOF\n');
    try {
      expect(await storage.head(path)).toBeNull();
      const up = await storage.createUploadUrl(path, 'application/pdf', 5_242_880, 600);
      const put = await fetch(up.url, {
        method: 'PUT',
        headers: { 'content-type': 'application/pdf' },
        body: bytes,
      });
      expect(put.ok).toBe(true);
      expect(await storage.head(path)).toEqual({
        sizeBytes: bytes.length,
        mime: 'application/pdf',
      });
      const download = await storage.createDownloadUrl(path, 60);
      const got = await fetch(download);
      expect(got.ok).toBe(true);
      expect(new Uint8Array(await got.arrayBuffer())).toEqual(bytes);
    } finally {
      const base = new URL(url).origin;
      const del = await fetch(`${base}/storage/v1/object/invoices`, {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${key}`,
          apikey: key,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ prefixes: [path] }),
      });
      expect(del.ok).toBe(true);
    }
    expect(await storage.head(path)).toBeNull();
  });
});
