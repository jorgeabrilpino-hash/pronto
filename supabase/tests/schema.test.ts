// Schema constraint tests against the real (remote) Postgres. No Docker.
// Every test runs inside BEGIN ... ROLLBACK; each expected failure runs inside a SAVEPOINT so the
// transaction stays usable. Nothing is ever committed. Needs DATABASE_URL (see supabase/scripts/db.mjs).
import { randomBytes, randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Client, DatabaseError } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { connect, seedFile } from '../scripts/db.mjs';

// Every query is a round trip to the remote database, so allow generous time per test.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ALPHABET_CODE = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const ALPHABET_B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const CHECK = '23514';
const UNIQUE = '23505';
const FK = '23503';
const RESTRICT = '23001';
const RANGE = '22003';

const TABLES = [
  'attachments',
  'audit_events',
  'auth_challenges',
  'companies',
  'invites',
  'invoices',
  'offers',
  'pronto_migrations',
  'rate_limits',
];

let client: Client;

beforeAll(async () => {
  client = await connect();
});
afterAll(async () => {
  await client.end();
});
beforeEach(async () => {
  await client.query('begin');
});
afterEach(async () => {
  await client.query('rollback');
});

// ---- helpers -----------------------------------------------------------------------------------

function pick(alphabet: string, n: number): string {
  let out = '';
  for (let i = 0; i < n; i += 1) out += alphabet[randomInt(alphabet.length)];
  return out;
}
const hex64 = () => randomBytes(32).toString('hex');

/** Runs a statement that must fail; returns the database error and keeps the transaction usable. */
async function violation(sql: string, params: unknown[] = []): Promise<DatabaseError> {
  await client.query('savepoint probe');
  try {
    await client.query(sql, params);
  } catch (err) {
    await client.query('rollback to savepoint probe');
    return err as DatabaseError;
  }
  await client.query('rollback to savepoint probe');
  throw new Error(`Expected statement to fail: ${sql}`);
}

async function insert(table: string, row: Record<string, unknown>) {
  const keys = Object.keys(row);
  const sql = `insert into public.${table} (${keys.join(', ')}) values (${keys
    .map((_, i) => `$${i + 1}`)
    .join(', ')}) returning *`;
  return (
    await client.query(
      sql,
      keys.map((k) => row[k]),
    )
  ).rows[0];
}

/** Statement that must fail with SQLSTATE `code` and (optionally) constraint `name`. */
async function expectViolation(
  table: string,
  row: Record<string, unknown>,
  code: string,
  name?: string,
) {
  const keys = Object.keys(row);
  const sql = `insert into public.${table} (${keys.join(', ')}) values (${keys
    .map((_, i) => `$${i + 1}`)
    .join(', ')})`;
  const err = await violation(
    sql,
    keys.map((k) => row[k]),
  );
  expect(err.code).toBe(code);
  if (name) expect(err.constraint).toBe(name);
}

const companyRow = (o: Record<string, unknown> = {}) => ({
  ruc: pick('0123456789', 11),
  legal_name: 'Empresa de Prueba S.A.C.',
  sector: 'Pruebas',
  wallet: `G${pick(ALPHABET_B32, 55)}`,
  code: `PR-${pick(ALPHABET_CODE, 6)}`,
  ...o,
});

const invoiceRow = (supplier: string, buyer: string, o: Record<string, unknown> = {}) => ({
  supplier_id: supplier,
  buyer_id: buyer,
  series: 'F001',
  number: pick('123456789', 1) + pick('0123456789', 7),
  face_amount: '1000.0000000',
  issue_date: '2026-11-01',
  due_date: '2027-01-01',
  ...o,
});

const offerRow = (invoice: string, o: Record<string, unknown> = {}) => ({
  invoice_id: invoice,
  offer_id_hex: hex64(),
  net_amount: '985.0000000',
  discount_amount: '15.0000000',
  discount_bps: 150,
  expires_at: '2026-12-15T00:00:00Z',
  contract_id: `C${pick(ALPHABET_B32, 55)}`,
  ...o,
});

const attachmentRow = (owner: string, o: Record<string, unknown> = {}) => ({
  owner_company_id: owner,
  kind: 'pdf',
  storage_path: hex64(),
  mime: 'application/pdf',
  size_bytes: 1024,
  ...o,
});

async function twoCompanies() {
  const supplier = await insert('companies', companyRow());
  const buyer = await insert('companies', companyRow());
  return { supplier, buyer };
}

async function oneInvoice() {
  const { supplier, buyer } = await twoCompanies();
  const invoice = await insert('invoices', invoiceRow(supplier.id, buyer.id));
  return { supplier, buyer, invoice };
}

// ---- companies ---------------------------------------------------------------------------------

describe('companies', () => {
  it('accepts a valid company and defaults ficha_publica to false', async () => {
    const row = await insert('companies', companyRow());
    expect(row.ficha_publica).toBe(false);
  });

  it.each([
    ['ruc with 10 digits', { ruc: '1234567890' }, 'companies_ruc_format'],
    ['ruc with letters', { ruc: '2010007097A' }, 'companies_ruc_format'],
    [
      'wallet that is not a G address',
      { wallet: `S${pick(ALPHABET_B32, 55)}` },
      'companies_wallet_format',
    ],
    [
      'wallet with the wrong length',
      { wallet: `G${pick(ALPHABET_B32, 54)}` },
      'companies_wallet_format',
    ],
    ['code with forbidden characters', { code: 'PR-0OIL1U' }, 'companies_code_format'],
    ['code without the PR- prefix', { code: 'XX-7KM2QX' }, 'companies_code_format'],
    ['code with 5 characters', { code: 'PR-7KM2Q' }, 'companies_code_format'],
    ['one-character legal name', { legal_name: 'A' }, 'companies_legal_name_len'],
    ['an unknown profile', { profile: 'seller' }, 'companies_profile_check'],
    ['an uppercase profile', { profile: 'BUYER' }, 'companies_profile_check'],
    ['an empty profile', { profile: '' }, 'companies_profile_check'],
  ])('rejects %s', async (_label, override, name) => {
    await expectViolation('companies', companyRow(override), CHECK, name);
  });

  it('defaults profile to both and accepts supplier, buyer and both', async () => {
    expect((await insert('companies', companyRow())).profile).toBe('both');
    for (const profile of ['supplier', 'buyer', 'both']) {
      expect((await insert('companies', companyRow({ profile }))).profile).toBe(profile);
    }
  });

  it('rejects a null profile', async () => {
    const err = await violation(
      'insert into public.companies (ruc, legal_name, sector, wallet, code, profile) values ($1, $2, $3, $4, $5, null)',
      Object.values(companyRow()),
    );
    expect(err.code).toBe('23502');
  });

  it('enforces unique ruc, wallet and code', async () => {
    const a = await insert('companies', companyRow());
    await expectViolation('companies', companyRow({ ruc: a.ruc }), UNIQUE, 'companies_ruc_key');
    await expectViolation(
      'companies',
      companyRow({ wallet: a.wallet }),
      UNIQUE,
      'companies_wallet_key',
    );
    await expectViolation('companies', companyRow({ code: a.code }), UNIQUE, 'companies_code_key');
  });

  it('refreshes updated_at on update', async () => {
    const row = await insert('companies', companyRow({ updated_at: '2020-01-01T00:00:00Z' }));
    const updated = await client.query(
      'update public.companies set sector = $2 where id = $1 returning updated_at',
      [row.id, 'Otro sector'],
    );
    expect(updated.rows[0].updated_at.getTime()).toBeGreaterThan(new Date('2020-01-01').getTime());
  });
});

// ---- auth_challenges ---------------------------------------------------------------------------

describe('auth_challenges', () => {
  const row = (o: Record<string, unknown> = {}) => ({
    nonce: hex64(),
    address: `G${pick(ALPHABET_B32, 55)}`,
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    ...o,
  });

  it('accepts a valid challenge', async () => {
    const r = await insert('auth_challenges', row());
    expect(r.consumed_at).toBeNull();
  });
  it('rejects a bad address, a duplicate nonce and an expiry in the past', async () => {
    await expectViolation(
      'auth_challenges',
      row({ address: 'GABC' }),
      CHECK,
      'auth_challenges_address_format',
    );
    await expectViolation(
      'auth_challenges',
      row({ expires_at: '2000-01-01T00:00:00Z' }),
      CHECK,
      'auth_challenges_expiry_after_creation',
    );
    const ok = await insert('auth_challenges', row());
    await expectViolation(
      'auth_challenges',
      row({ nonce: ok.nonce }),
      UNIQUE,
      'auth_challenges_pkey',
    );
  });
});

// ---- invoices ----------------------------------------------------------------------------------

describe('invoices', () => {
  it('accepts a valid invoice with defaults version 1, status sent, currency USDC', async () => {
    const { invoice } = await oneInvoice();
    expect(invoice.version).toBe(1);
    expect(invoice.status).toBe('sent');
    expect(invoice.currency).toBe('USDC');
    expect(invoice.max_discount_bps).toBeNull();
  });

  it('keeps 7 decimals exactly and rejects amounts beyond 13 integer digits', async () => {
    const { supplier, buyer } = await twoCompanies();
    const row = await insert(
      'invoices',
      invoiceRow(supplier.id, buyer.id, { face_amount: '1.0000001' }),
    );
    expect(row.face_amount).toBe('1.0000001');
    const err = await violation(
      'insert into public.invoices (supplier_id, buyer_id, series, number, face_amount, issue_date, due_date) values ($1, $2, $3, $4, $5, $6, $7)',
      [supplier.id, buyer.id, 'F001', '77777777', '10000000000000', '2026-11-01', '2027-01-01'],
    );
    expect(err.code).toBe(RANGE);
  });

  it.each([
    ['zero face amount', { face_amount: '0' }, 'invoices_face_amount_positive'],
    ['negative face amount', { face_amount: '-5.0000000' }, 'invoices_face_amount_positive'],
    [
      'due date equal to issue date',
      { issue_date: '2026-11-01', due_date: '2026-11-01' },
      'invoices_due_after_issue',
    ],
    [
      'due date before issue date',
      { issue_date: '2026-11-02', due_date: '2026-11-01' },
      'invoices_due_after_issue',
    ],
    ['max discount above 5000 bps', { max_discount_bps: 5001 }, 'invoices_max_discount_bps_range'],
    ['negative max discount', { max_discount_bps: -1 }, 'invoices_max_discount_bps_range'],
    ['unknown status', { status: 'paid' }, 'invoices_status_check'],
    ['currency other than USDC', { currency: 'EUR' }, 'invoices_currency_check'],
    ['series with 3 characters', { series: 'F01' }, 'invoices_series_format'],
    ['non numeric invoice number', { number: '12AB' }, 'invoices_number_format'],
    ['invoice number with leading zeros', { number: '0123' }, 'invoices_number_format'],
    ['invoice number zero', { number: '0' }, 'invoices_number_format'],
    ['version 0', { version: 0 }, 'invoices_version_positive'],
  ])('rejects %s', async (_label, override, name) => {
    const { supplier, buyer } = await twoCompanies();
    await expectViolation('invoices', invoiceRow(supplier.id, buyer.id, override), CHECK, name);
  });

  it('accepts the max discount boundaries 0, 5000 and null', async () => {
    const { supplier, buyer } = await twoCompanies();
    for (const [i, bps] of [0, 5000, null].entries()) {
      const row = await insert(
        'invoices',
        invoiceRow(supplier.id, buyer.id, { number: `${i + 1}`, max_discount_bps: bps }),
      );
      expect(row.max_discount_bps).toBe(bps);
    }
  });

  it('rejects supplier equal to buyer', async () => {
    const supplier = await insert('companies', companyRow());
    await expectViolation(
      'invoices',
      invoiceRow(supplier.id, supplier.id),
      CHECK,
      'invoices_supplier_not_buyer',
    );
  });

  it('is unique per (supplier, series, number) but allows the same number for another supplier', async () => {
    const { supplier, buyer } = await twoCompanies();
    await insert('invoices', invoiceRow(supplier.id, buyer.id, { number: '1' }));
    await expectViolation(
      'invoices',
      invoiceRow(supplier.id, buyer.id, { number: '1' }),
      UNIQUE,
      'invoices_supplier_series_number_key',
    );
    await insert('invoices', invoiceRow(supplier.id, buyer.id, { number: '1', series: 'F002' }));
    const other = await insert('companies', companyRow());
    await insert('invoices', invoiceRow(other.id, buyer.id, { number: '1' }));
  });

  it('requires existing companies', async () => {
    const { supplier } = await twoCompanies();
    await expectViolation(
      'invoices',
      invoiceRow(supplier.id, '00000000-0000-4000-8000-00000000dead'),
      FK,
      'invoices_buyer_id_fkey',
    );
  });

  it('refreshes updated_at on update', async () => {
    const { supplier, buyer } = await twoCompanies();
    const row = await insert(
      'invoices',
      invoiceRow(supplier.id, buyer.id, { updated_at: '2020-01-01T00:00:00Z' }),
    );
    const updated = await client.query(
      "update public.invoices set status = 'confirmed' where id = $1 returning updated_at",
      [row.id],
    );
    expect(updated.rows[0].updated_at.getTime()).toBeGreaterThan(new Date('2020-01-01').getTime());
  });
});

// ---- attachments -------------------------------------------------------------------------------

describe('attachments', () => {
  it('accepts a valid attachment, with or without an invoice yet', async () => {
    const { supplier, invoice } = await oneInvoice();
    const free = await insert('attachments', attachmentRow(supplier.id));
    expect(free.invoice_id).toBeNull();
    expect(free.status).toBe('pending');
    const linked = await insert(
      'attachments',
      attachmentRow(supplier.id, {
        invoice_id: invoice.id,
        kind: 'xml',
        mime: 'text/xml',
        status: 'ready',
        sha256: hex64(),
      }),
    );
    expect(linked.status).toBe('ready');
  });

  it('allows exactly 5 MiB and rejects one byte more, zero and negative sizes', async () => {
    const { supplier } = await oneInvoice();
    await insert('attachments', attachmentRow(supplier.id, { size_bytes: 5_242_880 }));
    for (const size of [5_242_881, 0, -1]) {
      await expectViolation(
        'attachments',
        attachmentRow(supplier.id, { size_bytes: size }),
        CHECK,
        'attachments_size_bytes_range',
      );
    }
  });

  it.each([
    ['unknown kind', { kind: 'doc' }, 'attachments_kind_check'],
    ['unknown status', { status: 'uploaded' }, 'attachments_status_check'],
    ['mime outside the allow list', { mime: 'text/html' }, 'attachments_kind_mime_match'],
    [
      'pdf kind with an image mime',
      { kind: 'pdf', mime: 'image/png' },
      'attachments_kind_mime_match',
    ],
    [
      'image kind with a pdf mime',
      { kind: 'image', mime: 'application/pdf' },
      'attachments_kind_mime_match',
    ],
    ['malformed sha256', { sha256: 'abc' }, 'attachments_sha256_format'],
  ])('rejects %s', async (_label, override, name) => {
    const { supplier } = await oneInvoice();
    await expectViolation('attachments', attachmentRow(supplier.id, override), CHECK, name);
  });

  it('accepts every allowed kind/mime pair', async () => {
    const { supplier } = await oneInvoice();
    const pairs: Array<[string, string]> = [
      ['pdf', 'application/pdf'],
      ['image', 'image/jpeg'],
      ['image', 'image/png'],
      ['xml', 'application/xml'],
      ['xml', 'text/xml'],
    ];
    for (const [kind, mime] of pairs) {
      await insert('attachments', attachmentRow(supplier.id, { kind, mime }));
    }
  });

  it('requires a unique storage_path and an existing owner', async () => {
    const { supplier } = await oneInvoice();
    const first = await insert('attachments', attachmentRow(supplier.id));
    await expectViolation(
      'attachments',
      attachmentRow(supplier.id, { storage_path: first.storage_path }),
      UNIQUE,
      'attachments_storage_path_key',
    );
    await expectViolation(
      'attachments',
      attachmentRow('00000000-0000-4000-8000-00000000dead'),
      FK,
      'attachments_owner_company_id_fkey',
    );
  });
});

// ---- offers ------------------------------------------------------------------------------------

describe('offers', () => {
  it('accepts a valid offer with chain_status pending by default', async () => {
    const { invoice } = await oneInvoice();
    const offer = await insert('offers', offerRow(invoice.id));
    expect(offer.chain_status).toBe('pending');
    expect(offer.net_amount).toBe('985.0000000');
  });

  it.each([
    ['unknown chain_status', { chain_status: 'done' }, 'offers_chain_status_check'],
    ['offer id with 63 hex chars', { offer_id_hex: 'a'.repeat(63) }, 'offers_offer_id_hex_format'],
    ['offer id with uppercase hex', { offer_id_hex: 'A'.repeat(64) }, 'offers_offer_id_hex_format'],
    ['zero net amount', { net_amount: '0' }, 'offers_net_amount_positive'],
    ['negative discount amount', { discount_amount: '-1' }, 'offers_discount_amount_nonnegative'],
    ['discount of 0 bps', { discount_bps: 0 }, 'offers_discount_bps_range'],
    ['discount above 5000 bps', { discount_bps: 5001 }, 'offers_discount_bps_range'],
    ['malformed tx hash', { tx_create: 'not-a-hash' }, 'offers_tx_create_format'],
  ])('rejects %s', async (_label, override, name) => {
    const { invoice } = await oneInvoice();
    await expectViolation('offers', offerRow(invoice.id, override), CHECK, name);
  });

  it('keeps offer_id_hex unique', async () => {
    const { invoice } = await oneInvoice();
    const first = await insert('offers', offerRow(invoice.id, { chain_status: 'reclaimed' }));
    await expectViolation(
      'offers',
      offerRow(invoice.id, { offer_id_hex: first.offer_id_hex, chain_status: 'reclaimed' }),
      UNIQUE,
      'offers_offer_id_hex_key',
    );
  });

  describe('one live offer per invoice (partial unique index)', () => {
    const LIVE = ['pending', 'open', 'accepted'];

    it.each(LIVE.flatMap((a) => LIVE.map((b) => [a, b] as const)))(
      'a %s offer blocks a second %s offer on the same invoice',
      async (first, second) => {
        const { invoice } = await oneInvoice();
        await insert('offers', offerRow(invoice.id, { chain_status: first }));
        await expectViolation(
          'offers',
          offerRow(invoice.id, { chain_status: second }),
          UNIQUE,
          'offers_one_live_per_invoice',
        );
      },
    );

    it.each(['reclaimed', 'failed'])(
      'allows a new pending offer once the first one is %s',
      async (dead) => {
        const { invoice } = await oneInvoice();
        await insert('offers', offerRow(invoice.id, { chain_status: dead }));
        await insert('offers', offerRow(invoice.id, { chain_status: 'pending' }));
      },
    );

    it('allows a new offer after the first pending offer is updated to failed', async () => {
      const { invoice } = await oneInvoice();
      const first = await insert('offers', offerRow(invoice.id));
      await expectViolation('offers', offerRow(invoice.id), UNIQUE, 'offers_one_live_per_invoice');
      await client.query("update public.offers set chain_status = 'failed' where id = $1", [
        first.id,
      ]);
      await insert('offers', offerRow(invoice.id));
    });

    it('allows any number of dead offers and one live offer per different invoice', async () => {
      const { supplier, buyer, invoice } = await oneInvoice();
      const other = await insert('invoices', invoiceRow(supplier.id, buyer.id));
      await insert('offers', offerRow(invoice.id, { chain_status: 'reclaimed' }));
      await insert('offers', offerRow(invoice.id, { chain_status: 'failed' }));
      await insert('offers', offerRow(invoice.id, { chain_status: 'open' }));
      await insert('offers', offerRow(other.id, { chain_status: 'open' }));
    });

    it('rejects reviving a dead offer while another one is live', async () => {
      const { invoice } = await oneInvoice();
      const dead = await insert('offers', offerRow(invoice.id, { chain_status: 'failed' }));
      await insert('offers', offerRow(invoice.id, { chain_status: 'open' }));
      const err = await violation(
        "update public.offers set chain_status = 'pending' where id = $1",
        [dead.id],
      );
      expect(err.code).toBe(UNIQUE);
      expect(err.constraint).toBe('offers_one_live_per_invoice');
    });
  });
});

// ---- invites, rate_limits ----------------------------------------------------------------------

describe('invites', () => {
  const row = (from: string, o: Record<string, unknown> = {}) => ({
    from_company_id: from,
    target_ruc: pick('0123456789', 11),
    token_hash: hex64(),
    expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    ...o,
  });

  it('accepts a valid invite and rejects bad ruc, duplicate token and past expiry', async () => {
    const company = await insert('companies', companyRow());
    const ok = await insert('invites', row(company.id));
    expect(ok.claimed_at).toBeNull();
    await expectViolation(
      'invites',
      row(company.id, { target_ruc: '123' }),
      CHECK,
      'invites_target_ruc_format',
    );
    await expectViolation(
      'invites',
      row(company.id, { token_hash: ok.token_hash }),
      UNIQUE,
      'invites_token_hash_key',
    );
    await expectViolation(
      'invites',
      row(company.id, { expires_at: '2000-01-01T00:00:00Z' }),
      CHECK,
      'invites_expiry_after_creation',
    );
    await expectViolation(
      'invites',
      row('00000000-0000-4000-8000-00000000dead'),
      FK,
      'invites_from_company_id_fkey',
    );
  });
});

describe('rate_limits', () => {
  it('accepts a counter, rejects negative counts and duplicate windows', async () => {
    const row = { key: 'challenge:ip:1.2.3.4', window_start: '2026-11-23T10:00:00Z', count: 1 };
    await insert('rate_limits', row);
    await expectViolation('rate_limits', row, UNIQUE, 'rate_limits_pkey');
    await expectViolation(
      'rate_limits',
      { ...row, window_start: '2026-11-23T10:01:00Z', count: -1 },
      CHECK,
      'rate_limits_count_nonnegative',
    );
    await insert('rate_limits', { ...row, window_start: '2026-11-23T10:01:00Z' });
  });
});

// ---- audit_events (append-only) ----------------------------------------------------------------

describe('audit_events', () => {
  it('accepts inserts', async () => {
    const row = await insert('audit_events', {
      action: 'invoice.created',
      entity_type: 'invoice',
      entity_id: 'x',
    });
    expect(row.metadata).toEqual({});
  });

  it('rejects UPDATE, DELETE and TRUNCATE', async () => {
    const row = await insert('audit_events', { action: 'invoice.created' });
    const update = await violation(
      "update public.audit_events set action = 'tampered' where id = $1",
      [row.id],
    );
    expect(update.code).toBe(RESTRICT);
    expect(update.message).toContain('append-only');
    const del = await violation('delete from public.audit_events where id = $1', [row.id]);
    expect(del.code).toBe(RESTRICT);
    const truncate = await violation('truncate public.audit_events');
    expect(truncate.code).toBe(RESTRICT);
    const still = await client.query('select action from public.audit_events where id = $1', [
      row.id,
    ]);
    expect(still.rows[0].action).toBe('invoice.created');
  });

  it('rejects a blank action', async () => {
    await expectViolation('audit_events', { action: '' }, CHECK, 'audit_events_action_not_blank');
  });
});

// ---- views -------------------------------------------------------------------------------------

describe('views', () => {
  it('v_contacts lists counterparties from both sides with invoice counts', async () => {
    const { supplier, buyer } = await twoCompanies();
    for (let i = 1; i <= 3; i += 1) {
      await insert('invoices', invoiceRow(supplier.id, buyer.id, { number: `${i}` }));
    }
    const forSupplier = await client.query(
      'select * from public.v_contacts where company_id = $1',
      [supplier.id],
    );
    expect(forSupplier.rows).toHaveLength(1);
    expect(forSupplier.rows[0]).toMatchObject({
      contact_id: buyer.id,
      contact_role: 'buyer',
      contact_code: buyer.code,
      contact_ruc: buyer.ruc,
      invoice_count: 3,
    });
    const forBuyer = await client.query('select * from public.v_contacts where company_id = $1', [
      buyer.id,
    ]);
    expect(forBuyer.rows).toHaveLength(1);
    expect(forBuyer.rows[0]).toMatchObject({
      contact_id: supplier.id,
      contact_role: 'supplier',
      invoice_count: 3,
    });
  });

  it('v_buyer_ficha aggregates funded, accepted, percentage, days advanced and suppliers', async () => {
    const buyer = await insert('companies', companyRow({ ficha_publica: true }));
    const s1 = await insert('companies', companyRow());
    const s2 = await insert('companies', companyRow());
    const inv = (supplier: { id: string }, n: string) =>
      insert(
        'invoices',
        invoiceRow(supplier.id, buyer.id, {
          number: n,
          issue_date: '2026-11-01',
          due_date: '2027-01-31',
        }),
      );
    const [i1, i2, i3, i4] = [
      await inv(s1, '1'),
      await inv(s2, '2'),
      await inv(s1, '3'),
      await inv(s1, '4'),
    ];
    await insert(
      'offers',
      offerRow(i1.id, { chain_status: 'accepted', accepted_at: '2026-12-01T12:00:00Z' }),
    );
    await insert('offers', offerRow(i2.id, { chain_status: 'reclaimed' }));
    await insert('offers', offerRow(i3.id, { chain_status: 'open' }));
    await insert('offers', offerRow(i4.id, { chain_status: 'failed' }));

    const { rows } = await client.query('select * from public.v_buyer_ficha where buyer_id = $1', [
      buyer.id,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      buyer_code: buyer.code,
      ficha_publica: true,
      offers_funded: 3,
      offers_accepted: 1,
      accepted_pct: '50.0',
      avg_days_advanced: '61.0',
      distinct_suppliers: 1,
    });

    const empty = await client.query('select * from public.v_buyer_ficha where buyer_id = $1', [
      s2.id,
    ]);
    expect(empty.rows[0]).toMatchObject({
      offers_funded: 0,
      offers_accepted: 0,
      accepted_pct: null,
      distinct_suppliers: 0,
    });
  });
});

// ---- RLS, privileges, storage, migration tracking ----------------------------------------------

describe('row level security', () => {
  it('is enabled on every table in public and there is no policy anywhere', async () => {
    const tables = await client.query(
      `select c.relname, c.relrowsecurity
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p')
        order by c.relname`,
    );
    expect(tables.rows.map((r) => r.relname)).toEqual(TABLES);
    expect(tables.rows.filter((r) => !r.relrowsecurity)).toEqual([]);
    const policies = await client.query(
      "select count(*)::int as n from pg_policies where schemaname = 'public'",
    );
    expect(policies.rows[0].n).toBe(0);
  });

  it.each(['anon', 'authenticated'])('%s cannot read any table or view', async (role) => {
    for (const rel of [...TABLES, 'v_contacts', 'v_buyer_ficha']) {
      await client.query('savepoint as_role');
      await client.query(`set local role ${role}`);
      let code: string | undefined;
      try {
        await client.query(`select 1 from public.${rel} limit 1`);
      } catch (err) {
        code = (err as DatabaseError).code;
      }
      await client.query('rollback to savepoint as_role');
      expect(code, `${role} on ${rel}`).toBe('42501');
    }
  });
});

describe('anon and authenticated have no privileges in public', () => {
  const roles = ['anon', 'authenticated'];

  it('on any table, view or sequence', async () => {
    const rels = await client.query(
      `select c.oid::regclass::text as rel, c.relkind
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')`,
    );
    expect(rels.rows.length).toBeGreaterThanOrEqual(TABLES.length + 3);
    const granted: string[] = [];
    for (const { rel, relkind } of rels.rows) {
      for (const role of roles) {
        const rows =
          relkind === 'S'
            ? await client.query(
                "select has_sequence_privilege($1, $2::regclass, 'USAGE, SELECT, UPDATE') as p",
                [role, rel],
              )
            : await client.query(
                `select (has_table_privilege($1, $2::regclass, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                      or has_any_column_privilege($1, $2::regclass, 'SELECT, INSERT, UPDATE, REFERENCES')) as p`,
                [role, rel],
              );
        if (rows.rows[0].p) granted.push(`${role}:${rel}`);
      }
    }
    expect(granted).toEqual([]);
  });

  it('to execute any function', async () => {
    const fns = await client.query(
      `select p.oid, p.proname
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`,
    );
    expect(fns.rows.map((r) => r.proname).sort()).toEqual([
      'reject_audit_mutation',
      'rls_auto_enable', // Supabase helper (event trigger), not ours
      'set_updated_at',
    ]);
    for (const { oid, proname } of fns.rows) {
      for (const role of roles) {
        const r = await client.query("select has_function_privilege($1, $2::oid, 'EXECUTE') as p", [
          role,
          oid,
        ]);
        expect(r.rows[0].p, `${role} executes ${proname}`).toBe(false);
      }
    }
  });

  it('by default privileges: nothing in pg_default_acl for public mentions them', async () => {
    const acl = await client.query(
      `select d.defaclobjtype, d.defaclacl::text as acl
         from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
         join pg_roles r on r.oid = d.defaclrole
        where n.nspname = 'public' and r.rolname = current_user`,
    );
    const offenders = acl.rows.filter((r) => /(^|[{,"])(anon|authenticated)=/.test(r.acl));
    expect(offenders).toEqual([]);
  });

  it('on objects created later (default privileges in effect)', async () => {
    await client.query('create table public.zz_probe (id serial primary key)');
    await client.query('create view public.zz_probe_v as select id from public.zz_probe');
    await client.query(
      'create function public.zz_probe_f() returns int language sql as $$ select 1 $$',
    );
    for (const role of roles) {
      const r = await client.query(
        `select has_table_privilege($1, 'public.zz_probe', 'SELECT') as t,
                has_table_privilege($1, 'public.zz_probe_v', 'SELECT') as v,
                has_sequence_privilege($1, 'public.zz_probe_id_seq', 'USAGE') as s,
                has_function_privilege($1, 'public.zz_probe_f()', 'EXECUTE') as f`,
        [role],
      );
      expect(r.rows[0], role).toEqual({ t: false, v: false, s: false, f: false });
    }
  });
});

describe('storage bucket invoices', () => {
  it('exists, is private, capped at 5 MiB and limited to the allowed mime types', async () => {
    const { rows } = await client.query(
      "select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'invoices'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].public).toBe(false);
    expect(Number(rows[0].file_size_limit)).toBe(5_242_880);
    expect([...rows[0].allowed_mime_types].sort()).toEqual(
      ['application/pdf', 'application/xml', 'image/jpeg', 'image/png', 'text/xml'].sort(),
    );
  });
});

describe('migration tracking', () => {
  it('records the init migration in pronto_migrations', async () => {
    const { rows } = await client.query(
      "select name, checksum from public.pronto_migrations where name like '%_init.sql'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].checksum).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---- seed --------------------------------------------------------------------------------------

describe('seed.sql', () => {
  const rucValid = (ruc: string) => {
    const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const sum = w.reduce((acc, weight, i) => acc + weight * Number(ruc[i]), 0);
    return (11 - (sum % 11)) % 10 === Number(ruc[10]);
  };

  it('knows the RUC algorithm (known valid examples)', () => {
    expect(rucValid('20100070970')).toBe(true);
    expect(rucValid('20131312955')).toBe(true);
    expect(rucValid('20100070971')).toBe(false);
  });

  it('is idempotent and produces valid, varied demo data', async () => {
    const sql = readFileSync(seedFile, 'utf8');
    await client.query(sql);
    await client.query(sql);

    const companies = await client.query('select ruc, code, wallet from public.companies');
    expect(companies.rows.length).toBeGreaterThanOrEqual(2);
    for (const c of companies.rows) {
      if (['20604123985', '20605871241'].includes(c.ruc)) expect(rucValid(c.ruc)).toBe(true);
    }
    const seeded = companies.rows.filter((c) => ['20604123985', '20605871241'].includes(c.ruc));
    expect(seeded).toHaveLength(2);
    expect(seeded.map((c) => c.wallet).sort()).toEqual([
      'GABXMVQFX6R74OUC6TGL3YGO7TLGV7R34RVAGTJE42UUXCVA4IELCKU3',
      'GCKU5G3MCJD4HM44QCK2E3D3Y6AIC3YZNG2EZ2HRWT4CF6LNSUWWVQTY',
    ]);

    const statuses = await client.query(
      `select array_agg(distinct i.status order by i.status) as inv, array_agg(distinct o.chain_status order by o.chain_status) filter (where o.chain_status is not null) as off
         from public.invoices i left join public.offers o on o.invoice_id = i.id
        where i.supplier_id in (select id from public.companies where ruc = '20605871241')`,
    );
    expect(statuses.rows[0].inv).toEqual(['cancelled', 'confirmed', 'rejected', 'sent']);
    expect(statuses.rows[0].off).toEqual(['accepted', 'failed', 'open', 'pending', 'reclaimed']);

    const counts = await client.query(
      `select (select count(*) from public.invoices where series = 'F001' and number between '101' and '107')::int as invoices,
              (select count(*) from public.offers where id::text like 'b0000000-%')::int as offers`,
    );
    expect(counts.rows[0]).toEqual({ invoices: 7, offers: 5 });
  });
});
