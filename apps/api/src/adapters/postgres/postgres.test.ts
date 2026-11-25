// Postgres adapters against the real (remote) database. Every test runs inside a transaction that
// is ALWAYS rolled back; expected failures run inside a SAVEPOINT so the transaction stays usable.
// Nothing is ever committed. Skips itself when DATABASE_URL is missing (see vitest.setup.ts).
// The scenarios mirror src/adapters/memory/memory.test.ts so both implementations prove the same.
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { DomainError } from '@pronto/shared';
import { sql, type Transaction } from 'kysely';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DB } from '../../../../../supabase/generated/db';
import type { Clock } from '../../application/ports';
import type { Company, Invoice, Offer } from '../../domain/types';
import { RandomIdGenerator } from '../memory';
import {
  createDatabase,
  isTransientConnectError,
  parseDatabaseUrl,
  poolConfig,
  retryingPool,
} from './connection';
import { mapDbError } from './errors';
import { createPostgresAdapters, type PostgresAdapters, type PostgresHandle } from './index';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const DATABASE_URL = process.env.DATABASE_URL;
const NOW = new Date();

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const pick = (alphabet: string, n: number) =>
  Array.from({ length: n }, () => alphabet.charAt(randomInt(alphabet.length))).join('');
const hex64 = () => randomBytes(32).toString('hex');

function company(extra: Partial<Company> = {}): Company {
  return {
    id: randomUUID(),
    ruc: `2${pick('0123456789', 10)}`,
    legalName: 'Test SAC',
    sector: 'Testing',
    wallet: `G${pick(B32, 55)}`,
    code: `PR-${pick(CODE_ALPHABET, 6)}`,
    fichaPublica: true,
    profile: 'both',
    createdAt: NOW,
    ...extra,
  };
}

function invoice(supplierId: string, buyerId: string, extra: Partial<Invoice> = {}): Invoice {
  return {
    id: randomUUID(),
    supplierId,
    buyerId,
    series: 'T001',
    number: String(randomInt(1, 99_999_999)),
    faceAmount: 12_345_678_901_234_567n,
    currency: 'USDC',
    issueDate: '2026-11-20',
    dueDate: '2026-12-20',
    longerTermAgreed: false,
    maxDiscountBps: null,
    status: 'sent',
    rejectionReason: null,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

function offer(invoiceId: string, extra: Partial<Offer> = {}): Offer {
  return {
    id: randomUUID(),
    invoiceId,
    offerIdHex: hex64(),
    netAmount: 9_850_000_001n,
    discountAmount: 150_000_000n,
    discountBps: 150,
    expiresAt: new Date(NOW.getTime() + 86_400_000),
    chainStatus: 'pending',
    txCreate: null,
    txAccept: null,
    txReclaim: null,
    contractId: 'CTEST',
    lastCheckedAt: null,
    createdAt: NOW,
    acceptedAt: null,
    ...extra,
  };
}

class OffsetClock implements Clock {
  offsetMs = 0;
  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }
}

/** Expects `fn` to reject with a DomainError `code`, without breaking the outer transaction. */
async function rejectsWith(trx: Transaction<DB>, code: string, fn: () => Promise<unknown>) {
  await sql`savepoint expected_failure`.execute(trx);
  let caught: unknown;
  try {
    await fn();
  } catch (err) {
    caught = err;
  }
  await sql`rollback to savepoint expected_failure`.execute(trx);
  expect(caught).toBeInstanceOf(DomainError);
  expect((caught as DomainError).code).toBe(code);
}

// ---- Unit tests (no database) --------------------------------------------------------

describe('postgres connection and error mapping (unit)', () => {
  it('parses DATABASE_URL once and ignores query parameters', () => {
    const t = parseDatabaseUrl(
      'postgresql://u%40x:p%2Fw@db.example.com:6543/app?sslmode=disable&host=evil',
    );
    expect(t).toEqual({
      host: 'db.example.com',
      port: 6543,
      user: 'u@x',
      password: 'p/w',
      database: 'app',
    });
    expect(parseDatabaseUrl('postgres://u:p@h/').database).toBe('postgres');
    expect(parseDatabaseUrl('postgres://u:p@h').port).toBe(5432);
    expect(() => parseDatabaseUrl('mysql://u:p@h/db')).toThrow();
  });

  it('uses verified TLS with the pinned CA for remote hosts only', () => {
    const remote = poolConfig('postgres://u:p@db.example.com/app');
    expect(remote.ssl).toMatchObject({ rejectUnauthorized: true, servername: 'db.example.com' });
    expect(String((remote.ssl as { ca: string }).ca)).toContain('BEGIN CERTIFICATE');
    expect(remote.connectionTimeoutMillis).toBe(15_000);
    expect(remote.keepAlive).toBe(true);
    expect(remote.statement_timeout).toBe(30_000);
    expect(poolConfig('postgres://u:p@localhost/app').ssl).toBe(false);
  });

  it('classifies transient connect errors and never statement timeouts', () => {
    expect(isTransientConnectError({ code: 'ECONNRESET' })).toBe(true);
    expect(isTransientConnectError({ message: 'Connection terminated unexpectedly' })).toBe(true);
    expect(isTransientConnectError({ code: '57014', message: 'timeout' })).toBe(false);
    expect(isTransientConnectError({ code: '23505' })).toBe(false);
    expect(isTransientConnectError(null)).toBe(false);
  });

  it('retries only connect() on transient errors', async () => {
    let calls = 0;
    const fake = {
      options: {},
      connect: async () => {
        calls++;
        if (calls < 3) throw Object.assign(new Error('reset'), { code: 'ECONNRESET' });
        return 'client';
      },
      end: async () => {},
    } as unknown as pg.Pool;
    const pool = retryingPool(fake, { connectAttempts: 3, baseDelayMs: 1 });
    expect(await pool.connect()).toBe('client');
    expect(calls).toBe(3);
    calls = -10;
    const permanent = {
      ...fake,
      connect: async () => {
        calls++;
        throw Object.assign(new Error('bad password'), { code: '28P01' });
      },
    } as unknown as pg.Pool;
    await expect(retryingPool(permanent, { baseDelayMs: 1 }).connect()).rejects.toThrow(
      'bad password',
    );
    expect(calls).toBe(-9);
  });

  it('maps only our constraint names to domain errors', () => {
    const cases: Array<[string, string, string]> = [
      ['23505', 'invoices_supplier_series_number_key', 'INVOICE_DUPLICATE'],
      ['23514', 'invoices_supplier_not_buyer', 'SELF_INVOICE'],
      ['23514', 'invoices_number_format', 'VALIDATION_ERROR'],
      ['23505', 'offers_one_live_per_invoice', 'OFFER_EXISTS'],
      ['23505', 'offers_offer_id_hex_key', 'INTERNAL'],
      ['23505', 'companies_ruc_key', 'RUC_TAKEN'],
      ['23505', 'companies_wallet_key', 'WALLET_TAKEN'],
      ['23505', 'companies_code_key', 'INTERNAL'],
    ];
    for (const [code, constraint, domain] of cases) {
      const out = mapDbError({ code, constraint });
      expect(out).toBeInstanceOf(DomainError);
      expect((out as DomainError).code).toBe(domain);
    }
    const other = { code: '23505', constraint: 'something_else' };
    expect(mapDbError(other)).toBe(other);
    const fk = { code: '23503', constraint: 'invoices_buyer_id_fkey' };
    expect(mapDbError(fk)).toBe(fk);
    expect(mapDbError('x')).toBe('x');
  });
});

// ---- Integration tests (real database, always rolled back) ------------------------------

describe.skipIf(!DATABASE_URL)('postgres adapters (real database, rolled back)', () => {
  let handle: PostgresHandle;
  const ROLLBACK = new Error('rollback');

  beforeAll(async () => {
    handle = createDatabase(DATABASE_URL ?? '', { max: 2 });
    // Fail fast and clearly when the database is unreachable (connect timeout is 15 s).
    await sql`select 1`.execute(handle.db);
  });
  afterAll(async () => {
    await handle?.close();
  });

  /** Runs `body` in a transaction and always rolls it back. */
  async function inRollback(
    body: (a: PostgresAdapters, trx: Transaction<DB>, clock: OffsetClock) => Promise<void>,
  ) {
    const clock = new OffsetClock();
    await expect(
      handle.db.transaction().execute(async (trx) => {
        await body(
          createPostgresAdapters(trx, { ids: new RandomIdGenerator(), clock }),
          trx,
          clock,
        );
        throw ROLLBACK;
      }),
    ).rejects.toBe(ROLLBACK);
  }

  it('companies enforce unique RUC, wallet and code and map not found', async () => {
    await inRollback(async (a, trx) => {
      const c = company();
      await a.companies.insert(c);
      expect(await a.companies.byId(c.id)).toEqual({ ...c, createdAt: expect.any(Date) });
      expect((await a.companies.byRuc(c.ruc))?.id).toBe(c.id);
      expect((await a.companies.byCode(c.code))?.id).toBe(c.id);
      expect((await a.companies.byWallet(c.wallet))?.id).toBe(c.id);
      await rejectsWith(trx, 'RUC_TAKEN', () => a.companies.insert(company({ ruc: c.ruc })));
      await rejectsWith(trx, 'WALLET_TAKEN', () =>
        a.companies.insert(company({ wallet: c.wallet })),
      );
      await rejectsWith(trx, 'INTERNAL', () => a.companies.insert(company({ code: c.code })));
      expect((await a.companies.update(c.id, { fichaPublica: false })).fichaPublica).toBe(false);
      expect((await a.companies.update(c.id, {})).fichaPublica).toBe(false);
      const buyer = await a.companies.update(c.id, { profile: 'buyer' });
      expect(buyer.profile).toBe('buyer');
      expect(buyer.fichaPublica).toBe(false);
      expect((await a.companies.byId(c.id))?.profile).toBe('buyer');
      const s = company({ profile: 'supplier' });
      await a.companies.insert(s);
      expect((await a.companies.byId(s.id))?.profile).toBe('supplier');
      await rejectsWith(trx, 'COMPANY_NOT_FOUND', () =>
        a.companies.update(randomUUID(), { fichaPublica: false }),
      );
      await rejectsWith(trx, 'COMPANY_NOT_FOUND', () => a.companies.update('nope', {}));
      expect(await a.companies.byId('nope')).toBeNull();
      expect(await a.companies.byId(randomUUID())).toBeNull();
    });
  });

  it('invoices check versions, duplicates, canonical numbers and filter by role and status', async () => {
    await inRollback(async (a, trx) => {
      const s = company();
      const b = company();
      await a.companies.insert(s);
      await a.companies.insert(b);
      const inv = invoice(s.id, b.id, { number: '123' });
      await a.invoices.insert(inv);

      const got = await a.invoices.byId(inv.id);
      expect(got?.faceAmount).toBe(12_345_678_901_234_567n);
      expect(got?.issueDate).toBe('2026-11-20');
      expect(got?.dueDate).toBe('2026-12-20');

      await rejectsWith(trx, 'INVOICE_DUPLICATE', () =>
        a.invoices.insert(invoice(s.id, b.id, { number: '123' })),
      );
      await rejectsWith(trx, 'VALIDATION_ERROR', () =>
        a.invoices.insert(invoice(s.id, b.id, { number: '0124' })),
      );
      await rejectsWith(trx, 'SELF_INVOICE', () => a.invoices.insert(invoice(s.id, s.id)));
      expect(await a.invoices.duplicateExists(s.id, 'T001', '0123')).toBe(true);
      expect(await a.invoices.duplicateExists(s.id, 'T001', '124')).toBe(false);
      expect(await a.invoices.duplicateExists('x', 'T001', '123')).toBe(false);

      expect(await a.invoices.update(inv.id, 2, { status: 'confirmed' })).toBeNull();
      expect(await a.invoices.update(randomUUID(), 1, {})).toBeNull();
      expect(await a.invoices.update('missing', 1, {})).toBeNull();
      const up = await a.invoices.update(inv.id, 1, {
        status: 'confirmed',
        faceAmount: 10_000_001n,
      });
      expect(up?.version).toBe(2);
      expect(up?.status).toBe('confirmed');
      expect(up?.faceAmount).toBe(10_000_001n);
      expect(await a.invoices.update(inv.id, 1, { status: 'cancelled' })).toBeNull();
      await rejectsWith(trx, 'VALIDATION_ERROR', () =>
        a.invoices.update(inv.id, 2, { number: '007' }),
      );

      expect(await a.invoices.listFor(b.id, 'buyer', 'confirmed')).toHaveLength(1);
      expect(await a.invoices.listFor(b.id, 'buyer', 'sent')).toHaveLength(0);
      expect(await a.invoices.listFor(s.id, 'buyer')).toHaveLength(0);
      expect((await a.invoices.listFor(s.id, 'supplier')).map((i) => i.id)).toEqual([inv.id]);
      expect(await a.invoices.listFor('x', 'supplier')).toEqual([]);
      expect(await a.invoices.byId('x')).toBeNull();
    });
  });

  it('offers keep one live per invoice, unique ids, operations and stats', async () => {
    await inRollback(async (a, trx) => {
      const s = company();
      const b = company();
      await a.companies.insert(s);
      await a.companies.insert(b);
      const inv = invoice(s.id, b.id);
      await a.invoices.insert(inv);
      const before = await a.offers.stats();

      const o = offer(inv.id, { chainStatus: 'open' });
      await a.offers.insertPending(o);
      expect((await a.offers.byOfferId(o.offerIdHex))?.chainStatus).toBe('pending');
      expect((await a.offers.byOfferId(o.offerIdHex))?.netAmount).toBe(9_850_000_001n);
      await rejectsWith(trx, 'INTERNAL', () =>
        a.offers.insertPending(offer(inv.id, { offerIdHex: o.offerIdHex })),
      );
      await rejectsWith(trx, 'OFFER_EXISTS', () => a.offers.insertPending(offer(inv.id)));
      await rejectsWith(trx, 'INVOICE_NOT_FOUND', () => a.offers.update(hex64(), {}));
      await rejectsWith(trx, 'INVOICE_NOT_FOUND', () =>
        a.offers.update(hex64(), { chainStatus: 'open' }),
      );

      const t1 = hex64();
      await a.offers.update(o.offerIdHex, { chainStatus: 'open', txCreate: t1 });
      await a.offers.update(o.offerIdHex, { chainStatus: 'open', txCreate: t1 });
      expect(await a.offers.stats()).toEqual({
        created: before.created + 1,
        accepted: before.accepted,
      });

      const t2 = hex64();
      const accepted = await a.offers.update(o.offerIdHex, {
        chainStatus: 'accepted',
        txAccept: t2,
      });
      expect(accepted.txAccept).toBe(t2);
      expect(accepted.acceptedAt).toBeInstanceOf(Date);
      expect(accepted.createdAt).toBeInstanceOf(Date);
      // accepted_at is stamped once: a later accept write keeps the first time.
      const again = await a.offers.update(o.offerIdHex, { txAccept: t2 });
      expect(again.acceptedAt?.getTime()).toBe(accepted.acceptedAt?.getTime());
      const row = await trx
        .selectFrom('offers')
        .select('accepted_at')
        .where('offer_id_hex', '=', o.offerIdHex)
        .executeTakeFirstOrThrow();
      expect(row.accepted_at).toBeInstanceOf(Date);
      expect(await a.offers.stats()).toEqual({
        created: before.created + 1,
        accepted: before.accepted + 1,
      });

      const ops = (await a.offers.recentOperations(500)).filter((op) =>
        [t1, t2].includes(op.txHash),
      );
      expect(ops.map((op) => op.kind).sort()).toEqual(['accept', 'create']);
      expect(await a.offers.recentOperations(0)).toEqual([]);
      expect(await a.offers.recentOperations(1)).toHaveLength(1);

      expect((await a.offers.listFor(s.id)).map((x) => x.offerIdHex)).toEqual([o.offerIdHex]);
      expect((await a.offers.listFor(b.id)).map((x) => x.offerIdHex)).toEqual([o.offerIdHex]);
      expect(await a.offers.listFor(randomUUID())).toEqual([]);
      expect(await a.offers.listFor('nobody')).toEqual([]);
      expect(await a.offers.byOfferId('none')).toBeNull();
      expect((await a.offers.byInvoice(inv.id)).map((x) => x.offerIdHex)).toEqual([o.offerIdHex]);
      expect(await a.offers.byInvoice('x')).toEqual([]);

      // A failed offer frees the invoice for a new one (the partial index only covers live ones).
      const inv2 = invoice(s.id, b.id);
      await a.invoices.insert(inv2);
      const f = offer(inv2.id);
      await a.offers.insertPending(f);
      await a.offers.update(f.offerIdHex, { chainStatus: 'failed', lastCheckedAt: new Date() });
      await a.offers.insertPending(offer(inv2.id));
      expect(await a.offers.byInvoice(inv2.id)).toHaveLength(2);
    });
  });

  it('attachments: insert, mark ready, link and list', async () => {
    await inRollback(async (a, trx) => {
      const s = company();
      const b = company();
      await a.companies.insert(s);
      await a.companies.insert(b);
      const inv = invoice(s.id, b.id);
      await a.invoices.insert(inv);
      await rejectsWith(trx, 'ATTACHMENT_INVALID', () =>
        a.attachments.markReady(randomUUID(), { sizeBytes: 1, sha256: null }),
      );
      await rejectsWith(trx, 'ATTACHMENT_INVALID', () =>
        a.attachments.markReady('none', { sizeBytes: 1, sha256: null }),
      );
      const id = randomUUID();
      await a.attachments.insert({
        id,
        invoiceId: null,
        ownerCompanyId: s.id,
        kind: 'pdf',
        storagePath: `test/${randomUUID()}.pdf`,
        mime: 'application/pdf',
        sizeBytes: 2048,
        sha256: null,
        status: 'pending',
      });
      const sha = hex64();
      const ready = await a.attachments.markReady(id, { sizeBytes: 2000, sha256: sha });
      expect(ready).toMatchObject({
        status: 'ready',
        sizeBytes: 2000,
        sha256: sha,
        invoiceId: null,
      });
      await a.attachments.linkToInvoice(['none', randomUUID(), id], inv.id);
      await a.attachments.linkToInvoice([], inv.id);
      expect((await a.attachments.listByInvoice(inv.id)).map((x) => x.id)).toEqual([id]);
      expect((await a.attachments.byId(id))?.invoiceId).toBe(inv.id);
      expect(await a.attachments.byId('none')).toBeNull();
      expect(await a.attachments.listByInvoice('x')).toEqual([]);
    });
  });

  it('challenge store: single use nonce with expiry', async () => {
    await inRollback(async (a, _trx, clock) => {
      const address = `G${pick(B32, 55)}`;
      const ch = await a.challenges.create(address, 300);
      expect(ch.nonce).toMatch(/^[0-9a-f]{48}$/);
      expect(await a.challenges.consume(ch.nonce)).toEqual({ address });
      expect(await a.challenges.consume(ch.nonce)).toBeNull();
      expect(await a.challenges.consume('unknown')).toBeNull();

      const expired = await a.challenges.create(address, 60);
      clock.offsetMs = 61_000;
      expect(await a.challenges.consume(expired.nonce)).toBeNull();
      clock.offsetMs = 0;
      // Burned on the first (expired) consume: it never becomes valid again.
      expect(await a.challenges.consume(expired.nonce)).toBeNull();
    });
  });

  it('rate limiter counts atomically per fixed window', async () => {
    await inRollback(async (a, _trx, clock) => {
      const key = `test:${randomUUID()}`;
      expect(await a.rateLimiter.hit(key, 60, 2)).toEqual({ allowed: true, remaining: 1 });
      expect(await a.rateLimiter.hit(key, 60, 2)).toEqual({ allowed: true, remaining: 0 });
      expect(await a.rateLimiter.hit(key, 60, 2)).toEqual({ allowed: false, remaining: 0 });
      clock.offsetMs = 61_000;
      expect(await a.rateLimiter.hit(key, 60, 2)).toEqual({ allowed: true, remaining: 1 });
    });
  });

  it('audit log appends and rejects edits', async () => {
    await inRollback(async (a, trx) => {
      const s = company();
      await a.companies.insert(s);
      await a.audit.record({
        kind: 'test.event',
        actorCompanyId: s.id,
        subject: 'subject-1',
        data: { amount: 10_000_000n, n: 1 },
      });
      await a.audit.record({ kind: 'test.event', actorCompanyId: null });
      const rows = await trx
        .selectFrom('audit_events')
        .selectAll()
        .where('action', '=', 'test.event')
        .orderBy('id')
        .execute();
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        actor_company_id: s.id,
        entity_id: 'subject-1',
        metadata: { amount: '10000000', n: 1 },
      });
      expect(rows[1]).toMatchObject({ actor_company_id: null, entity_id: null, metadata: {} });
      await sql`savepoint edit`.execute(trx);
      await expect(
        trx
          .updateTable('audit_events')
          .set({ action: 'x' })
          .where('action', '=', 'test.event')
          .execute(),
      ).rejects.toThrow(/append-only/);
      await sql`rollback to savepoint edit`.execute(trx);
    });
  });
});
