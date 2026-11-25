import {
  AttachmentSchema,
  AttachmentUrlResponseSchema,
  ChallengeResponseSchema,
  CompanyPageSchema,
  CompanySchema,
  DomainError,
  ERROR_CODES,
  ErrorBodySchema,
  type ErrorCode,
  HealthSchema,
  HTTP_STATUS,
  InvoiceSchema,
  MESSAGES_ES,
  NetworkSummarySchema,
  OfferDraftResponseSchema,
  OfferProofSchema,
  OfferSchema,
  PublicCompanySchema,
  UploadUrlResponseSchema,
  VerifyResponseSchema,
} from '@pronto/shared';
import { StrKey } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import type { UseCases } from '../../application/use-cases';
import { ruc, START, wallet } from '../../application/use-cases/__tests__/kit';
import {
  createApp,
  createTestApp,
  type TestApp,
  UnavailableInvoiceExtractor,
} from '../../composition';
import { allowedOrigins, EnvError, parseEnv } from '../../composition/env';
import { FakeSignatureVerifier } from '../memory';
import {
  type ClientIpResolver,
  createHttpApp,
  hashClientId,
  MAX_BODY_BYTES,
  socketOnly,
  trustedHops,
  validIp,
  vercel,
} from './index';

const JSON_HEADERS = { 'content-type': 'application/json' };

function call(t: TestApp, path: string, init: RequestInit & { token?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.token !== undefined) headers.set('authorization', `Bearer ${init.token}`);
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return t.app.request(path, { ...init, headers });
}

const post = (t: TestApp, path: string, body: unknown, token?: string) =>
  call(t, path, {
    method: 'POST',
    body: JSON.stringify(body),
    ...(token === undefined ? {} : { token }),
  });
const patch = (t: TestApp, path: string, body: unknown, token?: string) =>
  call(t, path, {
    method: 'PATCH',
    body: JSON.stringify(body),
    ...(token === undefined ? {} : { token }),
  });
const get = (t: TestApp, path: string, token?: string) =>
  call(t, path, token === undefined ? {} : { token });

async function expectError(res: Response, code: ErrorCode, status: number = HTTP_STATUS[code]) {
  expect(res.status).toBe(status);
  const body = ErrorBodySchema.parse(await res.json());
  expect(body.error.code).toBe(code);
  expect(body.error.message).toBe(MESSAGES_ES[body.error.code].message);
  return body;
}

async function login(t: TestApp, n: number): Promise<string> {
  const address = wallet(n);
  const ch = await post(t, '/v1/auth/challenge', { address });
  expect(ch.status).toBe(200);
  const { nonce } = ChallengeResponseSchema.parse(await ch.json());
  const res = await post(t, '/v1/auth/verify', {
    address,
    signedXdr: FakeSignatureVerifier.sign(address, nonce),
  });
  expect(res.status).toBe(200);
  return VerifyResponseSchema.parse(await res.json()).token;
}

async function company(t: TestApp, n: number, profile: 'supplier' | 'buyer' | 'both' = 'both') {
  const token = await login(t, n);
  const res = await post(
    t,
    '/v1/companies',
    {
      ruc: ruc(n),
      legalName: `Empresa ${n} SAC`,
      sector: 'Imprenta',
      profile,
    },
    token,
  );
  expect(res.status).toBe(201);
  const c = CompanySchema.parse(await res.json());
  return { token, ...c };
}

async function readyAttachment(t: TestApp, token: string): Promise<string> {
  const res = await post(
    t,
    '/v1/attachments/upload-url',
    { kind: 'pdf', mime: 'application/pdf', sizeBytes: 1000 },
    token,
  );
  expect(res.status).toBe(201);
  const { attachmentId } = UploadUrlResponseSchema.parse(await res.json());
  const att = await t.adapters.attachments.byId(attachmentId);
  if (att === null) throw new Error('attachment missing');
  t.adapters.storage.put(att.storagePath, { sizeBytes: 1000, mime: 'application/pdf' });
  const done = await post(t, `/v1/attachments/${attachmentId}/complete`, {}, token);
  expect(done.status).toBe(200);
  AttachmentSchema.parse(await done.json());
  return attachmentId;
}

let invoiceSeq = 0;
function invoiceBody(buyerCompanyId: string, attachmentId: string, extra = {}) {
  invoiceSeq++;
  return {
    buyerCompanyId,
    series: 'F001',
    number: String(invoiceSeq),
    faceAmount: '1000',
    currency: 'USDC',
    issueDate: '2026-11-20',
    dueDate: '2026-12-20',
    attachmentIds: [attachmentId],
    ...extra,
  };
}

async function parties(t: TestApp) {
  const supplier = await company(t, 1);
  const buyer = await company(t, 2);
  const att = await readyAttachment(t, supplier.token);
  const res = await post(t, '/v1/invoices', invoiceBody(buyer.id, att), supplier.token);
  expect(res.status).toBe(201);
  const invoice = InvoiceSchema.parse(await res.json());
  return { supplier, buyer, att, invoice };
}

const fresh = () => createTestApp({ start: START });

// ---- Public ----------------------------------------------------------------------------

describe('public routes', () => {
  it('GET /health and /v1/health answer ok with the clock time', async () => {
    const t = fresh();
    for (const path of ['/health', '/v1/health']) {
      const res = await get(t, path);
      expect(res.status).toBe(200);
      expect(HealthSchema.parse(await res.json())).toEqual({
        status: 'ok',
        time: START.toISOString(),
      });
    }
  });

  it('GET /v1/public/network returns the testnet summary', async () => {
    const t = fresh();
    const res = await get(t, '/v1/public/network');
    expect(res.status).toBe(200);
    const body = NetworkSummarySchema.parse(await res.json());
    expect(body.network).toBe('testnet');
    expect(body.contractId).toBe(t.adapters.chain.contractId());
  });

  it('GET /v1/public/companies/:code respects the public ficha', async () => {
    const t = fresh();
    const c = await company(t, 3);
    const off = await patch(t, '/v1/me/settings', { fichaPublica: false }, c.token);
    expect(off.status).toBe(200);
    await expectError(await get(t, `/v1/public/companies/${c.code}`), 'COMPANY_NOT_FOUND');
    const on = await patch(t, '/v1/me/settings', { fichaPublica: true }, c.token);
    expect(on.status).toBe(200);
    const res = await get(t, `/v1/public/companies/${c.code.toLowerCase()}`);
    expect(res.status).toBe(200);
    expect(CompanyPageSchema.parse(await res.json()).code).toBe(c.code);
    await expectError(await get(t, '/v1/public/companies/nope'), 'VALIDATION_ERROR');
  });

  it('unknown routes are NOT_FOUND with the error body', async () => {
    const t = fresh();
    await expectError(await get(t, '/v1/nothing'), 'NOT_FOUND', 404);
  });
});

// ---- Auth --------------------------------------------------------------------------------

describe('01-02 auth', () => {
  it('challenge then verify issues a token; the nonce is single use', async () => {
    const t = fresh();
    const address = wallet(5);
    const ch = await post(t, '/v1/auth/challenge', { address });
    const { nonce, challengeXdr } = ChallengeResponseSchema.parse(await ch.json());
    expect(challengeXdr).toContain(address);
    const signedXdr = FakeSignatureVerifier.sign(address, nonce);
    const ok = await post(t, '/v1/auth/verify', { address, signedXdr });
    expect(ok.status).toBe(200);
    expect(VerifyResponseSchema.parse(await ok.json()).company).toBeNull();
    await expectError(
      await post(t, '/v1/auth/verify', { address, signedXdr }),
      'CHALLENGE_EXPIRED',
    );
  });

  it('a bad signature is SIGNATURE_INVALID and a bad address VALIDATION_ERROR', async () => {
    const t = fresh();
    const address = wallet(6);
    const ch = ChallengeResponseSchema.parse(
      await (await post(t, '/v1/auth/challenge', { address })).json(),
    );
    await expectError(
      await post(t, '/v1/auth/verify', { address, signedXdr: `signed:${wallet(7)}:${ch.nonce}` }),
      'SIGNATURE_INVALID',
    );
    await expectError(
      await post(t, '/v1/auth/verify', { address, signedXdr: 'junk' }),
      'SIGNATURE_INVALID',
    );
    const bad = await expectError(
      await post(t, '/v1/auth/challenge', { address: 'not-an-address' }),
      'VALIDATION_ERROR',
    );
    expect(bad.error.details?.issues).toEqual([
      { path: 'address', message: 'Invalid Stellar address' },
    ]);
  });

  it('by default the per-client limit uses the socket: rotating x-forwarded-for does not help', async () => {
    const t = fresh();
    const hit = (n: number) =>
      call(t, '/v1/auth/challenge', {
        method: 'POST',
        headers: { ...JSON_HEADERS, 'x-forwarded-for': `203.0.113.${n % 250}` },
        body: JSON.stringify({ address: wallet(n) }),
      });
    for (let i = 0; i < 10; i++) expect((await hit(100 + i)).status).toBe(200);
    const limited = await expectError(await hit(200), 'RATE_LIMITED');
    expect(limited.error.details).toEqual({ windowSeconds: 60 });
  });

  it('with the vercel resolver the limit follows the platform header', async () => {
    const t = createTestApp({ start: START, clientIp: vercel });
    const hit = (n: number, ip: string) =>
      call(t, '/v1/auth/challenge', {
        method: 'POST',
        headers: { ...JSON_HEADERS, 'x-vercel-forwarded-for': ip, 'x-forwarded-for': '9.9.9.9' },
        body: JSON.stringify({ address: wallet(n) }),
      });
    for (let i = 0; i < 10; i++) expect((await hit(100 + i, '203.0.113.9')).status).toBe(200);
    await expectError(await hit(200, '203.0.113.9'), 'RATE_LIMITED');
    expect((await hit(201, '198.51.100.7')).status).toBe(200);
  });

  it('missing or invalid JSON is VALIDATION_ERROR', async () => {
    const t = fresh();
    await expectError(
      await call(t, '/v1/auth/challenge', { method: 'POST', headers: JSON_HEADERS, body: '{' }),
      'VALIDATION_ERROR',
    );
    await expectError(
      await call(t, '/v1/auth/challenge', {
        method: 'POST',
        body: 'x',
        headers: { 'content-type': 'text/plain' },
      }),
      'VALIDATION_ERROR',
    );
  });
});

// ---- Bearer middleware -------------------------------------------------------------------

const PROTECTED: Array<[string, string]> = [
  ['POST', '/v1/companies'],
  ['GET', '/v1/me'],
  ['PATCH', '/v1/me/settings'],
  ['GET', '/v1/companies/lookup?code=PR-222222'],
  ['GET', '/v1/contacts?role=buyer'],
  ['POST', '/v1/attachments/upload-url'],
  ['POST', '/v1/attachments/00000000-0000-4000-8000-000000000000/complete'],
  ['GET', '/v1/attachments/00000000-0000-4000-8000-000000000000/url'],
  ['POST', '/v1/invoices'],
  ['GET', '/v1/invoices?role=buyer'],
  ['GET', '/v1/invoices/00000000-0000-4000-8000-000000000000'],
  ['POST', '/v1/invoices/00000000-0000-4000-8000-000000000000/confirm'],
  ['POST', '/v1/invoices/00000000-0000-4000-8000-000000000000/reject'],
  ['POST', '/v1/invoices/00000000-0000-4000-8000-000000000000/cancel'],
  ['PATCH', '/v1/invoices/00000000-0000-4000-8000-000000000000'],
  ['POST', '/v1/invoices/00000000-0000-4000-8000-000000000000/offers/draft'],
  ['POST', `/v1/offers/${'a'.repeat(64)}/reconcile`],
  ['GET', `/v1/offers/${'a'.repeat(64)}`],
];

const VALID_BODIES: Record<string, unknown> = {
  'POST /v1/companies': {
    ruc: ruc(1),
    legalName: 'Empresa SAC',
    sector: 'Imprenta',
    profile: 'both',
  },
  'PATCH /v1/me/settings': { fichaPublica: true },
  'POST /v1/attachments/upload-url': { kind: 'pdf', mime: 'application/pdf', sizeBytes: 10 },
  'POST /v1/invoices': invoiceBody(
    '00000000-0000-4000-8000-000000000000',
    '00000000-0000-4000-8000-000000000001',
  ),
  'POST /v1/invoices/00000000-0000-4000-8000-000000000000/reject': { reason: 'No corresponde' },
  'PATCH /v1/invoices/00000000-0000-4000-8000-000000000000': { faceAmount: '10' },
  'POST /v1/invoices/00000000-0000-4000-8000-000000000000/offers/draft': {
    discountBps: 100,
    validityDays: 3,
  },
};

describe('bearer auth', () => {
  it('every protected route rejects a missing, malformed or unknown token', async () => {
    const t = fresh();
    for (const [method, path] of PROTECTED) {
      const key = `${method} ${path}`;
      const body = method === 'GET' ? undefined : JSON.stringify(VALID_BODIES[key] ?? {});
      const base = { method, ...(body === undefined ? {} : { body }) };
      await expectError(await call(t, path, base), 'UNAUTHENTICATED');
      await expectError(
        await call(t, path, { ...base, headers: { authorization: 'Basic abc' } }),
        'UNAUTHENTICATED',
      );
      await expectError(await call(t, path, { ...base, token: 'unknown' }), 'UNAUTHENTICATED');
    }
  });

  it('an expired session is UNAUTHENTICATED', async () => {
    const t = fresh();
    const c = await company(t, 8);
    t.adapters.clock.advanceSeconds(3601);
    await expectError(await get(t, '/v1/me', c.token), 'UNAUTHENTICATED');
  });

  it('a signed wallet without a company is FORBIDDEN on company routes', async () => {
    const t = fresh();
    const token = await login(t, 9);
    await expectError(await get(t, '/v1/me', token), 'FORBIDDEN');
    await expectError(await get(t, '/v1/invoices?role=buyer', token), 'FORBIDDEN');
  });
});

// ---- Companies ---------------------------------------------------------------------------

describe('03-05, 14 companies', () => {
  it('register, me, settings, lookup and contacts', async () => {
    const t = fresh();
    const { supplier, buyer } = await parties(t);
    const me = await get(t, '/v1/me', supplier.token);
    expect(me.status).toBe(200);
    expect(CompanySchema.parse(await me.json()).id).toBe(supplier.id);

    const set = await patch(t, '/v1/me/settings', { fichaPublica: true }, supplier.token);
    expect(CompanySchema.parse(await set.json()).fichaPublica).toBe(true);

    const byCode = await get(t, `/v1/companies/lookup?code=${buyer.code}`, supplier.token);
    expect(byCode.status).toBe(200);
    expect(PublicCompanySchema.parse(await byCode.json()).id).toBe(buyer.id);
    const byRuc = await get(t, `/v1/companies/lookup?ruc=${buyer.ruc}`, supplier.token);
    expect(PublicCompanySchema.parse(await byRuc.json()).id).toBe(buyer.id);

    const contacts = await get(t, '/v1/contacts?role=supplier', supplier.token);
    expect(contacts.status).toBe(200);
    expect(((await contacts.json()) as Array<{ id: string }>).map((c) => c.id)).toEqual([buyer.id]);
  });

  it('maps RUC_TAKEN, WALLET_TAKEN, RUC_INVALID, COMPANY_NOT_FOUND and query errors', async () => {
    const t = fresh();
    const a = await company(t, 10);
    await expectError(
      await post(
        t,
        '/v1/companies',
        { ruc: ruc(11), legalName: 'Otra SAC', sector: 'X1', profile: 'both' },
        a.token,
      ),
      'WALLET_TAKEN',
    );
    const other = await login(t, 12);
    await expectError(
      await post(
        t,
        '/v1/companies',
        { ruc: ruc(10), legalName: 'Otra SAC', sector: 'X1', profile: 'both' },
        other,
      ),
      'RUC_TAKEN',
    );
    await expectError(
      await post(
        t,
        '/v1/companies',
        { ruc: '20000000000', legalName: 'Otra SAC', sector: 'X1', profile: 'both' },
        other,
      ),
      'RUC_INVALID',
    );
    await expectError(
      await get(t, `/v1/companies/lookup?ruc=${ruc(99)}`, a.token),
      'COMPANY_NOT_FOUND',
    );
    await expectError(await get(t, '/v1/companies/lookup', a.token), 'VALIDATION_ERROR');
    await expectError(await get(t, '/v1/contacts?role=nobody', a.token), 'VALIDATION_ERROR');
  });
});

// ---- Attachments ---------------------------------------------------------------------------

describe('company profile', () => {
  it('registers with each profile and GET /v1/me returns it', async () => {
    const t = fresh();
    for (const [n, p] of [
      [20, 'supplier'],
      [21, 'buyer'],
      [22, 'both'],
    ] as const) {
      const c = await company(t, n, p);
      expect(c.profile).toBe(p);
      const me = await get(t, '/v1/me', c.token);
      expect(me.status).toBe(200);
      expect(CompanySchema.parse(await me.json()).profile).toBe(p);
    }
  });

  it('register without profile or with an unknown one is VALIDATION_ERROR', async () => {
    const t = fresh();
    const token = await login(t, 23);
    const base = { ruc: ruc(23), legalName: 'Empresa SAC', sector: 'Imprenta' };
    await expectError(await post(t, '/v1/companies', base, token), 'VALIDATION_ERROR');
    await expectError(
      await post(t, '/v1/companies', { ...base, profile: 'seller' }, token),
      'VALIDATION_ERROR',
    );
  });

  it('PATCH /v1/me/settings changes the profile and rejects an empty body', async () => {
    const t = fresh();
    const c = await company(t, 24, 'supplier');
    const res = await patch(t, '/v1/me/settings', { profile: 'buyer' }, c.token);
    expect(res.status).toBe(200);
    const body = CompanySchema.parse(await res.json());
    expect([body.profile, body.fichaPublica]).toEqual(['buyer', true]);
    const me = CompanySchema.parse(await (await get(t, '/v1/me', c.token)).json());
    expect(me.profile).toBe('buyer');
    await expectError(await patch(t, '/v1/me/settings', {}, c.token), 'VALIDATION_ERROR');
    await expectError(
      await patch(t, '/v1/me/settings', { profile: 'seller' }, c.token),
      'VALIDATION_ERROR',
    );
  });

  it('actions outside the profile are FORBIDDEN; lists stay readable', async () => {
    const t = fresh();
    const supplier = await company(t, 25, 'supplier');
    const buyer = await company(t, 26, 'buyer');
    // A buyer-only company cannot send invoices.
    const buyerAtt = await readyAttachment(t, buyer.token);
    await expectError(
      await post(t, '/v1/invoices', invoiceBody(supplier.id, buyerAtt), buyer.token),
      'FORBIDDEN',
    );
    const att = await readyAttachment(t, supplier.token);
    const sent = await post(t, '/v1/invoices', invoiceBody(buyer.id, att), supplier.token);
    expect(sent.status).toBe(201);
    const invoice = InvoiceSchema.parse(await sent.json());

    // Supplier-only cannot confirm, reject or prepare offers; buyer-only cannot cancel or resend.
    await patch(t, '/v1/me/settings', { profile: 'supplier' }, buyer.token);
    await expectError(
      await post(t, `/v1/invoices/${invoice.id}/confirm`, {}, buyer.token),
      'FORBIDDEN',
    );
    await expectError(
      await post(t, `/v1/invoices/${invoice.id}/reject`, { reason: 'No coincide' }, buyer.token),
      'FORBIDDEN',
    );
    await patch(t, '/v1/me/settings', { profile: 'buyer' }, buyer.token);
    const confirmed = await post(t, `/v1/invoices/${invoice.id}/confirm`, {}, buyer.token);
    expect(confirmed.status).toBe(200);
    await patch(t, '/v1/me/settings', { profile: 'supplier' }, buyer.token);
    await expectError(
      await post(
        t,
        `/v1/invoices/${invoice.id}/offers/draft`,
        { discountBps: 100, validityDays: 3 },
        buyer.token,
      ),
      'FORBIDDEN',
    );
    await patch(t, '/v1/me/settings', { profile: 'buyer' }, supplier.token);
    await expectError(
      await post(t, `/v1/invoices/${invoice.id}/cancel`, {}, supplier.token),
      'FORBIDDEN',
    );
    await expectError(
      await patch(t, `/v1/invoices/${invoice.id}`, { faceAmount: '10' }, supplier.token),
      'FORBIDDEN',
    );

    const list = await get(t, '/v1/invoices?role=supplier', supplier.token);
    expect(list.status).toBe(200);
    expect((await list.json()) as unknown[]).toHaveLength(1);
    const buyerList = await get(t, '/v1/invoices?role=buyer', buyer.token);
    expect(buyerList.status).toBe(200);
    expect((await buyerList.json()) as unknown[]).toHaveLength(1);
  });

  it('a reconcile as buyer needs buyer or both; offers carry their dates', async () => {
    const t = fresh();
    const { buyer, invoice } = await parties(t);
    await post(t, `/v1/invoices/${invoice.id}/confirm`, {}, buyer.token);
    const draftRes = await post(
      t,
      `/v1/invoices/${invoice.id}/offers/draft`,
      { discountBps: 100, validityDays: 3 },
      buyer.token,
    );
    expect(draftRes.status).toBe(201);
    const draft = OfferDraftResponseSchema.parse(await draftRes.json());
    expect(draft.acceptedAt).toBeNull();
    expect(draft.createdAt).toBe(START.toISOString());
    await patch(t, '/v1/me/settings', { profile: 'supplier' }, buyer.token);
    await expectError(
      await post(t, `/v1/offers/${draft.offerIdHex}/reconcile`, {}, buyer.token),
      'FORBIDDEN',
    );
  });
});

describe('06 attachments', () => {
  it('upload url, complete and download url; others are FORBIDDEN', async () => {
    const t = fresh();
    const a = await company(t, 20);
    const b = await company(t, 21);
    const id = await readyAttachment(t, a.token);
    const url = await get(t, `/v1/attachments/${id}/url`, a.token);
    expect(url.status).toBe(200);
    AttachmentUrlResponseSchema.parse(await url.json());
    await expectError(await get(t, `/v1/attachments/${id}/url`, b.token), 'FORBIDDEN');
    await expectError(await post(t, `/v1/attachments/${id}/complete`, {}, b.token), 'FORBIDDEN');
  });

  it('maps ATTACHMENT_INVALID and rejects a non-uuid id', async () => {
    const t = fresh();
    const a = await company(t, 22);
    await expectError(
      await post(
        t,
        '/v1/attachments/upload-url',
        { kind: 'pdf', mime: 'image/png', sizeBytes: 10 },
        a.token,
      ),
      'ATTACHMENT_INVALID',
    );
    await expectError(
      await post(
        t,
        '/v1/attachments/upload-url',
        { kind: 'pdf', mime: 'application/pdf', sizeBytes: 6_000_000 },
        a.token,
      ),
      'VALIDATION_ERROR',
    );
    const res = await post(
      t,
      '/v1/attachments/upload-url',
      { kind: 'pdf', mime: 'application/pdf', sizeBytes: 10 },
      a.token,
    );
    const { attachmentId } = UploadUrlResponseSchema.parse(await res.json());
    await expectError(
      await post(t, `/v1/attachments/${attachmentId}/complete`, {}, a.token),
      'ATTACHMENT_INVALID',
    );
    await expectError(await get(t, '/v1/attachments/not-a-uuid/url', a.token), 'VALIDATION_ERROR');
  });
});

// ---- Invoices ------------------------------------------------------------------------------

describe('07-10 invoices', () => {
  it('send, list, get, confirm; reject and resend; cancel', async () => {
    const t = fresh();
    const { supplier, buyer, invoice } = await parties(t);
    expect(invoice.status).toBe('sent');

    const list = await get(t, '/v1/invoices?role=buyer&status=sent', buyer.token);
    expect(list.status).toBe(200);
    expect(((await list.json()) as Array<{ id: string }>).map((i) => i.id)).toEqual([invoice.id]);

    const one = await get(t, `/v1/invoices/${invoice.id}`, supplier.token);
    expect(InvoiceSchema.parse(await one.json()).id).toBe(invoice.id);

    const rejected = await post(
      t,
      `/v1/invoices/${invoice.id}/reject`,
      { reason: 'Monto errado' },
      buyer.token,
    );
    expect(rejected.status).toBe(200);
    expect(InvoiceSchema.parse(await rejected.json()).status).toBe('rejected');

    const resent = await patch(
      t,
      `/v1/invoices/${invoice.id}`,
      { faceAmount: '900.50' },
      supplier.token,
    );
    expect(resent.status).toBe(200);
    const r = InvoiceSchema.parse(await resent.json());
    expect(r.status).toBe('sent');
    expect(r.faceAmount).toBe('900.5000000');

    const confirmed = await post(t, `/v1/invoices/${invoice.id}/confirm`, {}, buyer.token);
    expect(InvoiceSchema.parse(await confirmed.json()).status).toBe('confirmed');

    const cancelled = await post(t, `/v1/invoices/${invoice.id}/cancel`, {}, supplier.token);
    expect(cancelled.status).toBe(200);
    expect(InvoiceSchema.parse(await cancelled.json()).status).toBe('cancelled');
  });

  it('maps FORBIDDEN, INVOICE_NOT_FOUND, INVALID_STATE, INVOICE_DUPLICATE, SELF_INVOICE, INVOICE_OVERDUE', async () => {
    const t = fresh();
    const { supplier, buyer, att, invoice } = await parties(t);
    const outsider = await company(t, 30);
    await expectError(await get(t, `/v1/invoices/${invoice.id}`, outsider.token), 'FORBIDDEN');
    await expectError(
      await post(t, `/v1/invoices/${invoice.id}/confirm`, {}, supplier.token),
      'FORBIDDEN',
    );
    await expectError(
      await get(t, '/v1/invoices/00000000-0000-4000-8000-000000000000', supplier.token),
      'INVOICE_NOT_FOUND',
    );
    await expectError(await get(t, '/v1/invoices/123', supplier.token), 'VALIDATION_ERROR');
    await post(t, `/v1/invoices/${invoice.id}/confirm`, {}, buyer.token);
    await expectError(
      await post(t, `/v1/invoices/${invoice.id}/confirm`, {}, buyer.token),
      'INVALID_STATE',
    );

    const att2 = await readyAttachment(t, supplier.token);
    await expectError(
      await post(
        t,
        '/v1/invoices',
        { ...invoiceBody(buyer.id, att2), number: invoice.number },
        supplier.token,
      ),
      'INVOICE_DUPLICATE',
    );
    await expectError(
      await post(t, '/v1/invoices', invoiceBody(supplier.id, att2), supplier.token),
      'SELF_INVOICE',
    );
    await expectError(
      await post(
        t,
        '/v1/invoices',
        invoiceBody(buyer.id, att2, { issueDate: '2026-10-01', dueDate: '2026-11-01' }),
        supplier.token,
      ),
      'INVOICE_OVERDUE',
    );
    await expectError(
      await post(t, '/v1/invoices', invoiceBody(buyer.id, att), supplier.token),
      'ATTACHMENT_INVALID',
    );
    await expectError(await get(t, '/v1/invoices?role=nobody', supplier.token), 'VALIDATION_ERROR');
  });
});

// ---- Offers --------------------------------------------------------------------------------

describe('11-13 offers', () => {
  it('prepare a draft with cents, reconcile from the chain and read the proof', async () => {
    const t = fresh();
    const supplier = await company(t, 40);
    const buyer = await company(t, 41);
    const att = await readyAttachment(t, supplier.token);
    const sent = await post(
      t,
      '/v1/invoices',
      invoiceBody(buyer.id, att, { faceAmount: '2400.50' }),
      supplier.token,
    );
    const invoice = InvoiceSchema.parse(await sent.json());
    await post(t, `/v1/invoices/${invoice.id}/confirm`, {}, buyer.token);

    await expectError(
      await post(
        t,
        `/v1/invoices/${invoice.id}/offers/draft`,
        { discountBps: 150, validityDays: 7 },
        supplier.token,
      ),
      'FORBIDDEN',
    );
    const res = await post(
      t,
      `/v1/invoices/${invoice.id}/offers/draft`,
      { discountBps: 150, validityDays: 7 },
      buyer.token,
    );
    expect(res.status).toBe(201);
    const draft = OfferDraftResponseSchema.parse(await res.json());
    expect(draft.discountAmount).toBe('36.0100000');
    expect(draft.netAmount).toBe('2364.4900000');
    await expectError(
      await post(
        t,
        `/v1/invoices/${invoice.id}/offers/draft`,
        { discountBps: 150, validityDays: 7 },
        buyer.token,
      ),
      'OFFER_EXISTS',
    );
    await expectError(
      await post(
        t,
        `/v1/invoices/${invoice.id}/offers/draft`,
        { discountBps: 150, validityDays: 5 },
        buyer.token,
      ),
      'VALIDATION_ERROR',
    );

    const offer = await t.adapters.offers.byOfferId(draft.offerIdHex);
    if (offer === null) throw new Error('offer missing');
    t.adapters.chain.setOffer(draft.offerIdHex, {
      buyer: buyer.wallet,
      supplier: supplier.wallet,
      amount: 24_005_000_000n,
      net: offer.netAmount,
      expiresAt: offer.expiresAt,
      status: 'open',
    });
    const rec = await call(t, `/v1/offers/${draft.offerIdHex}/reconcile`, {
      method: 'POST',
      token: supplier.token,
    });
    expect(rec.status).toBe(200);
    expect(OfferSchema.parse(await rec.json()).chainStatus).toBe('open');

    const proof = await get(t, `/v1/offers/${draft.offerIdHex}`, buyer.token);
    expect(proof.status).toBe(200);
    const p = OfferProofSchema.parse(await proof.json());
    expect(p.supplierWallet).toBe(supplier.wallet);
    expect(p.faceAmount).toBe('2400.5000000');

    const outsider = await company(t, 42);
    await expectError(await get(t, `/v1/offers/${draft.offerIdHex}`, outsider.token), 'FORBIDDEN');
    await expectError(await get(t, '/v1/offers/xyz', buyer.token), 'VALIDATION_ERROR');
    await expectError(
      await post(t, `/v1/offers/${draft.offerIdHex}/reconcile`, { txHash: 'nothex' }, buyer.token),
      'VALIDATION_ERROR',
    );

    t.adapters.chain.unavailable = true;
    const cancel = await post(t, `/v1/invoices/${invoice.id}/cancel`, {}, supplier.token);
    expect([409, 502]).toContain(cancel.status);
  });

  it('a chain that cannot be read is CHAIN_UNAVAILABLE (502)', async () => {
    const t = fresh();
    const supplier = await company(t, 43);
    const buyer = await company(t, 44);
    const att = await readyAttachment(t, supplier.token);
    const invoice = InvoiceSchema.parse(
      await (await post(t, '/v1/invoices', invoiceBody(buyer.id, att), supplier.token)).json(),
    );
    await post(t, `/v1/invoices/${invoice.id}/confirm`, {}, buyer.token);
    const draft = OfferDraftResponseSchema.parse(
      await (
        await post(
          t,
          `/v1/invoices/${invoice.id}/offers/draft`,
          { discountBps: 150, validityDays: 3 },
          buyer.token,
        )
      ).json(),
    );
    t.adapters.chain.unavailable = true;
    await expectError(
      await call(t, `/v1/offers/${draft.offerIdHex}/reconcile`, {
        method: 'POST',
        token: buyer.token,
      }),
      'CHAIN_UNAVAILABLE',
      502,
    );
  });
});

// ---- Error mapping -------------------------------------------------------------------------

function throwingApp(err: unknown) {
  const t = createTestApp({ start: START });
  const useCases = {
    ...t.useCases,
    getNetworkSummary: {
      execute: async () => {
        throw err;
      },
    },
  } as unknown as UseCases;
  const logs: string[] = [];
  const app = createHttpApp({
    useCases,
    clock: t.adapters.clock,
    allowedOrigins: [],
    log: (l) => logs.push(l),
  });
  return { app, logs };
}

describe('error mapping', () => {
  it('every DomainError code maps to HTTP_STATUS with { error: { code, message, details } }', async () => {
    for (const code of ERROR_CODES) {
      const { app } = throwingApp(new DomainError(code, 'internal detail', { field: 'x' }));
      const res = await app.request('/v1/public/network');
      expect(res.status).toBe(HTTP_STATUS[code]);
      expect(await res.json()).toEqual({
        error: { code, message: MESSAGES_ES[code].message, details: { field: 'x' } },
      });
    }
  });

  it('an unknown error is INTERNAL with no stack or secret in the body or the log', async () => {
    const secret = 'postgres://user:s3cr3t@db.example/postgres';
    const { app, logs } = throwingApp(new Error(secret));
    const res = await app.request('/v1/public/network', {
      headers: { authorization: 'Bearer tok-secret' },
    });
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({
      error: { code: 'INTERNAL', message: MESSAGES_ES.INTERNAL.message },
    });
    expect(text).not.toContain('s3cr3t');
    expect(text).not.toContain('at ');
    expect(logs.join('\n')).not.toContain('s3cr3t');
    expect(logs.join('\n')).not.toContain('tok-secret');
    const line = JSON.parse(logs[0] ?? '{}');
    expect(line).toMatchObject({
      level: 'error',
      status: 500,
      errorCode: 'INTERNAL',
      method: 'GET',
    });
  });

  it('a body over 1 MB is PAYLOAD_TOO_LARGE', async () => {
    const t = fresh();
    const big = JSON.stringify({ address: 'G'.repeat(MAX_BODY_BYTES + 10) });
    await expectError(
      await call(t, '/v1/auth/challenge', { method: 'POST', headers: JSON_HEADERS, body: big }),
      'PAYLOAD_TOO_LARGE',
      413,
    );
  });
});

// ---- Cross-cutting -------------------------------------------------------------------------

describe('CORS, headers and logs', () => {
  it('allows configured origins only, including the preflight', async () => {
    const t = fresh();
    const ok = await call(t, '/health', { headers: { origin: 'http://localhost:5173' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    const bad = await call(t, '/health', { headers: { origin: 'https://evil.example' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
    const pre = await call(t, '/v1/me', {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      },
    });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(pre.headers.get('access-control-allow-headers')?.toLowerCase()).toContain(
      'authorization',
    );
  });

  it('sets security headers, no-store and a request id', async () => {
    const t = fresh();
    const res = await get(t, '/health');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    const echoed = await call(t, '/health', { headers: { 'x-request-id': 'abc-123' } });
    expect(echoed.headers.get('x-request-id')).toBe('abc-123');
  });

  it('logs one JSON line per request without tokens, bodies or query strings', async () => {
    const t = fresh();
    const c = await company(t, 50);
    t.logs.length = 0;
    await get(t, `/v1/companies/lookup?ruc=${ruc(51)}`, c.token);
    expect(t.logs).toHaveLength(1);
    const line = JSON.parse(t.logs[0] ?? '{}');
    expect(line).toMatchObject({
      level: 'info',
      msg: 'request',
      method: 'GET',
      path: '/v1/companies/lookup',
      status: 404,
      errorCode: 'COMPANY_NOT_FOUND',
    });
    expect(typeof line.durationMs).toBe('number');
    expect(t.logs[0]).not.toContain(c.token);
    expect(t.logs[0]).not.toContain(ruc(51));
  });

  describe('client IP resolvers', () => {
    async function resolve(
      resolver: ClientIpResolver,
      headers: Record<string, string>,
      socketAddr?: string,
    ): Promise<string> {
      const { Hono } = await import('hono');
      const probe = new Hono();
      probe.get('/', (c) =>
        c.text(String(resolver(c, socketAddr === undefined ? undefined : () => socketAddr))),
      );
      return (await probe.request('/', { headers })).text();
    }
    const XFF = { 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 10.0.0.2' };

    it('socketOnly ignores x-forwarded-for and the vercel headers', async () => {
      const headers = { ...XFF, 'x-vercel-forwarded-for': '1.1.1.1', 'x-real-ip': '2.2.2.2' };
      expect(await resolve(socketOnly, headers, '10.1.1.1')).toBe('10.1.1.1');
      expect(await resolve(socketOnly, XFF)).toBe('undefined');
    });

    it('vercel reads x-vercel-forwarded-for, then x-real-ip, never x-forwarded-for', async () => {
      expect(
        await resolve(vercel, { ...XFF, 'x-vercel-forwarded-for': '1.1.1.1' }, '10.1.1.1'),
      ).toBe('1.1.1.1');
      expect(await resolve(vercel, { ...XFF, 'x-real-ip': '2001:db8::1' }, '10.1.1.1')).toBe(
        '2001:db8::1',
      );
      expect(await resolve(vercel, XFF, '10.1.1.1')).toBe('10.1.1.1');
      expect(await resolve(vercel, XFF)).toBe('undefined');
    });

    it('invalid values fall back to the socket, or to no client id', async () => {
      const bad = { 'x-vercel-forwarded-for': 'evil', 'x-real-ip': '999.1.1.1' };
      expect(await resolve(vercel, bad, '10.1.1.1')).toBe('10.1.1.1');
      expect(await resolve(vercel, bad, 'not-an-ip')).toBe('undefined');
      expect(
        await resolve(trustedHops(1), { 'x-forwarded-for': '1.2.3.4, junk' }, '10.1.1.1'),
      ).toBe('10.1.1.1');
      expect(await resolve(socketOnly, {}, '')).toBe('undefined');
      expect(validIp(' 1.2.3.4 ')).toBe('1.2.3.4');
    });

    it('trustedHops counts from the right of x-forwarded-for', async () => {
      expect(await resolve(trustedHops(1), XFF, '10.1.1.1')).toBe('10.0.0.2');
      expect(await resolve(trustedHops(2), XFF, '10.1.1.1')).toBe('5.6.7.8');
      expect(await resolve(trustedHops(3), XFF, '10.1.1.1')).toBe('1.2.3.4');
      expect(await resolve(trustedHops(4), XFF, '10.1.1.1')).toBe('10.1.1.1');
      expect(await resolve(trustedHops(1), {}, '10.1.1.1')).toBe('10.1.1.1');
      expect(() => trustedHops(0)).toThrow(RangeError);
    });

    it('the client id is an opaque hash of the IP', () => {
      expect(hashClientId('1.2.3.4')).toMatch(/^[0-9a-f]{32}$/);
      expect(hashClientId('1.2.3.4')).not.toContain('1.2.3.4');
    });
  });
});

// ---- OpenAPI -------------------------------------------------------------------------------

const EXPECTED_OPERATIONS = [
  'get /health',
  'get /v1/health',
  'post /v1/auth/challenge',
  'post /v1/auth/verify',
  'post /v1/companies',
  'get /v1/me',
  'patch /v1/me/settings',
  'get /v1/companies/lookup',
  'get /v1/public/companies/{code}',
  'get /v1/contacts',
  'post /v1/attachments/upload-url',
  'post /v1/attachments/{id}/complete',
  'get /v1/attachments/{id}/url',
  'post /v1/invoices',
  'get /v1/invoices',
  'get /v1/invoices/{id}',
  'post /v1/invoices/{id}/confirm',
  'post /v1/invoices/{id}/reject',
  'post /v1/invoices/{id}/cancel',
  'patch /v1/invoices/{id}',
  'post /v1/invoices/{id}/offers/draft',
  'post /v1/offers/{offerId}/reconcile',
  'get /v1/offers/{offerId}',
  'get /v1/public/network',
].sort();

describe('OpenAPI document', () => {
  it('is served at /openapi.json and lists every route', async () => {
    const t = fresh();
    const res = await get(t, '/openapi.json');
    expect(res.status).toBe(200);
    const doc = (await res.json()) as {
      openapi: string;
      info: { title: string };
      paths: Record<
        string,
        Record<
          string,
          {
            responses?: object;
            security?: unknown;
            parameters?: Array<{ name: string; in: string }>;
          }
        >
      >;
      components: { securitySchemes: Record<string, unknown> };
    };
    expect(doc.openapi).toBe('3.0.3');
    expect(doc.info.title).toBe('Pronto API');
    const ops = Object.entries(doc.paths)
      .flatMap(([path, methods]) => Object.keys(methods).map((m) => `${m} ${path}`))
      .sort();
    expect(ops).toEqual(EXPECTED_OPERATIONS);
    expect(doc.components.securitySchemes.bearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
    for (const [path, methods] of Object.entries(doc.paths)) {
      const templated = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      for (const [method, op] of Object.entries(methods)) {
        expect(op.responses, `${method} ${path}`).toBeDefined();
        const declared = (op.parameters ?? []).filter((p) => p.in === 'path').map((p) => p.name);
        expect(declared.sort(), `${method} ${path}`).toEqual(templated.sort());
        const isPublic =
          path === '/health' ||
          path === '/v1/health' ||
          path.includes('/public/') ||
          path.includes('/auth/');
        expect(op.security === undefined, `${method} ${path}`).toBe(isPublic);
      }
    }
  });
});

// ---- Composition ----------------------------------------------------------------------------

const FAKE_ENV = {
  DATABASE_URL: 'postgres://u:p@127.0.0.1:5999/postgres',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-placeholder',
  JWT_SECRET: 'x'.repeat(48),
  PRONTO_CONTRACT_ID: StrKey.encodeContract(Buffer.alloc(32, 7)),
};

describe('composition', () => {
  it('parseEnv reports missing names only, never values', () => {
    try {
      parseEnv({ JWT_SECRET: 'short-secret-value', SUPABASE_URL: 'not a url' });
      throw new Error('expected EnvError');
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError);
      const err = e as EnvError;
      expect(err.variables).toEqual([
        'DATABASE_URL',
        'JWT_SECRET',
        'PRONTO_CONTRACT_ID',
        'SUPABASE_SERVICE_ROLE_KEY',
        'SUPABASE_URL',
      ]);
      expect(err.message).not.toContain('short-secret-value');
      expect(err.message).not.toContain('not a url');
    }
  });

  it('only accepts the TESTNET passphrase', () => {
    expect(() =>
      parseEnv({
        ...FAKE_ENV,
        STELLAR_NETWORK_PASSPHRASE: 'Public Global Stellar Network ; September 2015',
      }),
    ).toThrow('STELLAR_NETWORK_PASSPHRASE');
    expect(parseEnv(FAKE_ENV).STELLAR_RPC_URL).toBe('https://soroban-testnet.stellar.org');
  });

  it('allowedOrigins splits the list and adds the Vite origins outside production', () => {
    expect(
      allowedOrigins({
        ALLOWED_ORIGINS: ' https://a.example/ ,https://b.example',
        NODE_ENV: 'production',
      }),
    ).toEqual(['https://a.example', 'https://b.example']);
    expect(allowedOrigins({ ALLOWED_ORIGINS: '', NODE_ENV: 'development' })).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ]);
  });

  it('createApp wires the real adapters without touching the network until a request needs it', async () => {
    const logs: string[] = [];
    const built = createApp(
      { ...FAKE_ENV, ALLOWED_ORIGINS: 'https://app.example' },
      { log: (l) => logs.push(l) },
    );
    const res = await built.app.request('/health', { headers: { origin: 'https://app.example' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example');
    expect(built.useCases.getNetworkSummary).toBeDefined();
    await expect(
      built.extractor.extract({ bytes: new Uint8Array(), mime: 'application/pdf' }),
    ).rejects.toMatchObject({
      code: 'FEATURE_UNAVAILABLE',
    });
    await built.close();
    expect(logs).toHaveLength(1);
  });

  it('the extractor placeholder is a typed domain error', async () => {
    await expect(
      new UnavailableInvoiceExtractor().extract({ bytes: new Uint8Array(), mime: 'text/xml' }),
    ).rejects.toBeInstanceOf(DomainError);
  });
});
