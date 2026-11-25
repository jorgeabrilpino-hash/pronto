import type { AttachmentKind, ChainStatus, InvoiceStatus, Profile, Role } from '@pronto/shared';
import { DomainError } from '@pronto/shared';
import { type Selectable, sql, type Updateable } from 'kysely';
import type {
  Attachments,
  Companies,
  Invoices,
  Offers,
} from '../../../../../supabase/generated/db';
import type {
  AttachmentRepository,
  AuditEvent,
  AuditLog,
  ChainOperation,
  ChallengeStore,
  Clock,
  CompanyRepository,
  IdGenerator,
  InvoicePatch,
  InvoiceRepository,
  OfferPatch,
  OfferRepository,
  RateLimiter,
} from '../../application/ports';
import type { Attachment, Company, Invoice, Offer } from '../../domain/types';
import { canonicalInvoiceNumber, formatMoney, parseMoney } from '../../domain/values';
import type { Database } from './connection';
import { mapped } from './errors';

export { createDatabase, type Database, type PostgresHandle, parseDatabaseUrl } from './connection';
export { mapDbError } from './errors';

/**
 * Postgres adapters (Kysely over pg). They reproduce the behavior of the memory adapters:
 * same not-found errors, same null results, and the database constraints map to the same
 * domain errors. Money travels as numeric(20,7) strings and becomes bigint (7 decimals) here.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids are uuid columns: a malformed id cannot exist, so lookups return "not found" instead of 22P02. */
function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** numeric(20,7) text ("985.0000000") to scaled bigint. Never goes through Number. */
function money(value: string): bigint {
  return parseMoney(value);
}

const systemClock: Clock = { now: () => new Date() };

// ---- Companies -----------------------------------------------------------------

function toCompany(r: Selectable<Companies>): Company {
  return {
    id: r.id,
    ruc: r.ruc,
    legalName: r.legal_name,
    sector: r.sector,
    wallet: r.wallet,
    code: r.code,
    fichaPublica: r.ficha_publica,
    profile: r.profile as Profile,
    createdAt: r.created_at,
  };
}

export class PgCompanyRepository implements CompanyRepository {
  constructor(private readonly db: Database) {}

  async byId(id: string): Promise<Company | null> {
    if (!isUuid(id)) return null;
    return this.one('id', id);
  }
  async byRuc(ruc: string): Promise<Company | null> {
    return this.one('ruc', ruc);
  }
  async byCode(code: string): Promise<Company | null> {
    return this.one('code', code);
  }
  async byWallet(address: string): Promise<Company | null> {
    return this.one('wallet', address);
  }
  async insert(company: Company): Promise<void> {
    await mapped(() =>
      this.db
        .insertInto('companies')
        .values({
          id: company.id,
          ruc: company.ruc,
          legal_name: company.legalName,
          sector: company.sector,
          wallet: company.wallet,
          code: company.code,
          ficha_publica: company.fichaPublica,
          profile: company.profile,
          created_at: company.createdAt,
        })
        .execute(),
    );
  }
  async update(
    id: string,
    patch: Partial<Pick<Company, 'fichaPublica' | 'profile'>>,
  ): Promise<Company> {
    const notFound = () => new DomainError('COMPANY_NOT_FOUND');
    if (!isUuid(id)) throw notFound();
    const set: Updateable<Companies> = {};
    if (patch.fichaPublica !== undefined) set.ficha_publica = patch.fichaPublica;
    if (patch.profile !== undefined) set.profile = patch.profile;
    if (Object.keys(set).length === 0) {
      const c = await this.byId(id);
      if (c === null) throw notFound();
      return c;
    }
    const row = await this.db
      .updateTable('companies')
      .set(set)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    if (row === undefined) throw notFound();
    return toCompany(row);
  }
  private async one(column: 'id' | 'ruc' | 'code' | 'wallet', value: string) {
    const row = await this.db
      .selectFrom('companies')
      .selectAll()
      .where(column, '=', value)
      .executeTakeFirst();
    return row === undefined ? null : toCompany(row);
  }
}

// ---- Invoices ------------------------------------------------------------------

function toInvoice(r: Selectable<Invoices>): Invoice {
  return {
    id: r.id,
    supplierId: r.supplier_id,
    buyerId: r.buyer_id,
    series: r.series,
    number: r.number,
    faceAmount: money(r.face_amount),
    currency: 'USDC',
    issueDate: r.issue_date,
    dueDate: r.due_date,
    longerTermAgreed: r.longer_term_agreed,
    maxDiscountBps: r.max_discount_bps,
    status: r.status as InvoiceStatus,
    rejectionReason: r.rejection_reason,
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function invoicePatchToRow(patch: InvoicePatch): Updateable<Invoices> {
  const row: Updateable<Invoices> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.rejectionReason !== undefined) row.rejection_reason = patch.rejectionReason;
  if (patch.series !== undefined) row.series = patch.series;
  if (patch.number !== undefined) row.number = patch.number;
  if (patch.faceAmount !== undefined) row.face_amount = formatMoney(patch.faceAmount);
  if (patch.issueDate !== undefined) row.issue_date = patch.issueDate;
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate;
  if (patch.longerTermAgreed !== undefined) row.longer_term_agreed = patch.longerTermAgreed;
  if (patch.maxDiscountBps !== undefined) row.max_discount_bps = patch.maxDiscountBps;
  return row;
}

export class PgInvoiceRepository implements InvoiceRepository {
  constructor(private readonly db: Database) {}

  async insert(invoice: Invoice): Promise<void> {
    await mapped(() =>
      this.db
        .insertInto('invoices')
        .values({
          id: invoice.id,
          supplier_id: invoice.supplierId,
          buyer_id: invoice.buyerId,
          series: invoice.series,
          number: invoice.number,
          face_amount: formatMoney(invoice.faceAmount),
          currency: invoice.currency,
          issue_date: invoice.issueDate,
          due_date: invoice.dueDate,
          longer_term_agreed: invoice.longerTermAgreed,
          max_discount_bps: invoice.maxDiscountBps,
          status: invoice.status,
          rejection_reason: invoice.rejectionReason,
          version: invoice.version,
          created_at: invoice.createdAt,
          updated_at: invoice.updatedAt,
        })
        .execute(),
    );
  }
  async byId(id: string): Promise<Invoice | null> {
    if (!isUuid(id)) return null;
    const row = await this.db
      .selectFrom('invoices')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row === undefined ? null : toInvoice(row);
  }
  async listFor(companyId: string, role: Role, status?: InvoiceStatus): Promise<Invoice[]> {
    if (!isUuid(companyId)) return [];
    let q = this.db
      .selectFrom('invoices')
      .selectAll()
      .where(role === 'supplier' ? 'supplier_id' : 'buyer_id', '=', companyId);
    if (status !== undefined) q = q.where('status', '=', status);
    const rows = await q.orderBy('created_at', 'desc').orderBy('id').execute();
    return rows.map(toInvoice);
  }
  /** Stored numbers are canonical (DB check), so the canonical input is compared directly. */
  async duplicateExists(supplierId: string, series: string, number: string): Promise<boolean> {
    if (!isUuid(supplierId)) return false;
    const wanted = canonicalInvoiceNumber(number) ?? number;
    const row = await this.db
      .selectFrom('invoices')
      .select('id')
      .where('supplier_id', '=', supplierId)
      .where('series', '=', series)
      .where('number', '=', wanted)
      .executeTakeFirst();
    return row !== undefined;
  }
  /** Compare-and-set on `version`: zero rows updated means another change won. */
  async update(id: string, expectedVersion: number, patch: InvoicePatch): Promise<Invoice | null> {
    if (!isUuid(id)) return null;
    const row = await mapped(() =>
      this.db
        .updateTable('invoices')
        .set({ ...invoicePatchToRow(patch), version: sql<number>`version + 1` })
        .where('id', '=', id)
        .where('version', '=', expectedVersion)
        .returningAll()
        .executeTakeFirst(),
    );
    return row === undefined ? null : toInvoice(row);
  }
}

// ---- Offers ------------------------------------------------------------------------

function toOffer(r: Selectable<Offers>): Offer {
  return {
    id: r.id,
    invoiceId: r.invoice_id,
    offerIdHex: r.offer_id_hex,
    netAmount: money(r.net_amount),
    discountAmount: money(r.discount_amount),
    discountBps: r.discount_bps,
    expiresAt: r.expires_at,
    chainStatus: r.chain_status as ChainStatus,
    txCreate: r.tx_create,
    txAccept: r.tx_accept,
    txReclaim: r.tx_reclaim,
    contractId: r.contract_id,
    lastCheckedAt: r.last_checked_at,
    createdAt: r.created_at,
    acceptedAt: r.accepted_at,
  };
}

export class PgOfferRepository implements OfferRepository {
  constructor(private readonly db: Database) {}

  /** The partial unique index `offers_one_live_per_invoice` maps to OFFER_EXISTS. */
  async insertPending(offer: Offer): Promise<void> {
    await mapped(() =>
      this.db
        .insertInto('offers')
        .values({
          id: offer.id,
          invoice_id: offer.invoiceId,
          offer_id_hex: offer.offerIdHex,
          net_amount: formatMoney(offer.netAmount),
          discount_amount: formatMoney(offer.discountAmount),
          discount_bps: offer.discountBps,
          expires_at: offer.expiresAt,
          chain_status: 'pending',
          tx_create: offer.txCreate,
          tx_accept: offer.txAccept,
          tx_reclaim: offer.txReclaim,
          contract_id: offer.contractId,
          last_checked_at: offer.lastCheckedAt,
          created_at: offer.createdAt,
        })
        .execute(),
    );
  }
  async byOfferId(offerIdHex: string): Promise<Offer | null> {
    const row = await this.db
      .selectFrom('offers')
      .selectAll()
      .where('offer_id_hex', '=', offerIdHex)
      .executeTakeFirst();
    return row === undefined ? null : toOffer(row);
  }
  async byInvoice(invoiceId: string): Promise<Offer[]> {
    if (!isUuid(invoiceId)) return [];
    const rows = await this.db
      .selectFrom('offers')
      .selectAll()
      .where('invoice_id', '=', invoiceId)
      .orderBy('created_at', 'desc')
      .orderBy('id')
      .execute();
    return rows.map(toOffer);
  }
  /** Recording `txAccept` also stamps `accepted_at` once (feeds v_buyer_ficha and the feed). */
  async update(offerIdHex: string, patch: OfferPatch): Promise<Offer> {
    const set: Updateable<Offers> = {};
    if (patch.chainStatus !== undefined) set.chain_status = patch.chainStatus;
    if (patch.txCreate !== undefined) set.tx_create = patch.txCreate;
    if (patch.txAccept !== undefined) set.tx_accept = patch.txAccept;
    if (patch.txReclaim !== undefined) set.tx_reclaim = patch.txReclaim;
    if (patch.lastCheckedAt !== undefined) set.last_checked_at = patch.lastCheckedAt;
    const notFound = () => new DomainError('INVOICE_NOT_FOUND', 'Offer not found');
    if (Object.keys(set).length === 0) {
      const o = await this.byOfferId(offerIdHex);
      if (o === null) throw notFound();
      return o;
    }
    const row = await mapped(() =>
      this.db
        .updateTable('offers')
        .set(
          typeof patch.txAccept === 'string'
            ? { ...set, accepted_at: sql<Date>`coalesce(accepted_at, now())` }
            : set,
        )
        .where('offer_id_hex', '=', offerIdHex)
        .returningAll()
        .executeTakeFirst(),
    );
    if (row === undefined) throw notFound();
    return toOffer(row);
  }
  /** Offers on invoices where the company is supplier or buyer. */
  async listFor(companyId: string): Promise<Offer[]> {
    if (!isUuid(companyId)) return [];
    const rows = await this.db
      .selectFrom('offers')
      .innerJoin('invoices', 'invoices.id', 'offers.invoice_id')
      .selectAll('offers')
      .where((eb) =>
        eb.or([
          eb('invoices.supplier_id', '=', companyId),
          eb('invoices.buyer_id', '=', companyId),
        ]),
      )
      .orderBy('offers.created_at', 'desc')
      .orderBy('offers.id')
      .execute();
    return rows.map(toOffer);
  }
  async stats(): Promise<{ created: number; accepted: number }> {
    const row = await this.db
      .selectFrom('offers')
      .select((eb) => [
        eb.fn
          .countAll<string>()
          .filterWhere('chain_status', 'in', ['open', 'accepted', 'reclaimed'])
          .as('created'),
        eb.fn.countAll<string>().filterWhere('chain_status', '=', 'accepted').as('accepted'),
      ])
      .executeTakeFirstOrThrow();
    return { created: Number(row.created), accepted: Number(row.accepted) };
  }
  /**
   * One row per recorded transaction hash. Timestamps: create uses the draft time, accept uses
   * `accepted_at`, reclaim uses the last update of the row (the schema keeps no per-hash time).
   */
  async recentOperations(limit: number): Promise<ChainOperation[]> {
    const n = Math.max(0, Math.trunc(limit));
    if (n === 0) return [];
    const result = await sql<{ kind: ChainOperation['kind']; tx_hash: string; at: Date }>`
      select kind, tx_hash, at from (
        select 'create' as kind, tx_create as tx_hash, created_at as at
          from public.offers where tx_create is not null
        union all
        select 'accept', tx_accept, coalesce(accepted_at, updated_at)
          from public.offers where tx_accept is not null
        union all
        select 'reclaim', tx_reclaim, updated_at
          from public.offers where tx_reclaim is not null
      ) ops
      order by at desc, tx_hash
      limit ${n}`.execute(this.db);
    return result.rows.map((r) => ({ kind: r.kind, txHash: r.tx_hash, at: r.at }));
  }
}

// ---- Attachments -------------------------------------------------------------------

function toAttachment(r: Selectable<Attachments>): Attachment {
  return {
    id: r.id,
    invoiceId: r.invoice_id,
    ownerCompanyId: r.owner_company_id,
    kind: r.kind as AttachmentKind,
    storagePath: r.storage_path,
    mime: r.mime,
    sizeBytes: r.size_bytes,
    sha256: r.sha256,
    status: r.status as Attachment['status'],
  };
}

export class PgAttachmentRepository implements AttachmentRepository {
  constructor(private readonly db: Database) {}

  async insert(attachment: Attachment): Promise<void> {
    await mapped(() =>
      this.db
        .insertInto('attachments')
        .values({
          id: attachment.id,
          invoice_id: attachment.invoiceId,
          owner_company_id: attachment.ownerCompanyId,
          kind: attachment.kind,
          storage_path: attachment.storagePath,
          mime: attachment.mime,
          size_bytes: attachment.sizeBytes,
          sha256: attachment.sha256,
          status: attachment.status,
        })
        .execute(),
    );
  }
  async byId(id: string): Promise<Attachment | null> {
    if (!isUuid(id)) return null;
    const row = await this.db
      .selectFrom('attachments')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row === undefined ? null : toAttachment(row);
  }
  async markReady(
    id: string,
    info: { sizeBytes: number; sha256: string | null },
  ): Promise<Attachment> {
    if (!isUuid(id)) throw new DomainError('ATTACHMENT_INVALID');
    const row = await mapped(() =>
      this.db
        .updateTable('attachments')
        .set({ size_bytes: info.sizeBytes, sha256: info.sha256, status: 'ready' })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst(),
    );
    if (row === undefined) throw new DomainError('ATTACHMENT_INVALID');
    return toAttachment(row);
  }
  /** Unknown ids are ignored, like the memory adapter. */
  async linkToInvoice(ids: string[], invoiceId: string): Promise<void> {
    const valid = ids.filter(isUuid);
    if (valid.length === 0 || !isUuid(invoiceId)) return;
    await this.db
      .updateTable('attachments')
      .set({ invoice_id: invoiceId })
      .where('id', 'in', valid)
      .execute();
  }
  async listByInvoice(invoiceId: string): Promise<Attachment[]> {
    if (!isUuid(invoiceId)) return [];
    const rows = await this.db
      .selectFrom('attachments')
      .selectAll()
      .where('invoice_id', '=', invoiceId)
      .orderBy('created_at')
      .orderBy('id')
      .execute();
    return rows.map(toAttachment);
  }
}

// ---- Challenges, rate limits, audit -----------------------------------------------------

export class PgChallengeStore implements ChallengeStore {
  constructor(
    private readonly db: Database,
    private readonly ids: IdGenerator,
    private readonly clock: Clock = systemClock,
  ) {}

  async create(address: string, ttlSeconds: number): Promise<{ nonce: string; expiresAt: Date }> {
    const nonce = this.ids.token();
    const expiresAt = new Date(this.clock.now().getTime() + ttlSeconds * 1000);
    await this.db
      .insertInto('auth_challenges')
      .values({ nonce, address, expires_at: expiresAt })
      .execute();
    return { nonce, expiresAt };
  }
  /**
   * Single use, atomically: the first consume burns the nonce (valid or expired) in one UPDATE,
   * so two concurrent requests can never both succeed.
   */
  async consume(nonce: string): Promise<{ address: string } | null> {
    const row = await this.db
      .updateTable('auth_challenges')
      .set({ consumed_at: sql<Date>`now()` })
      .where('nonce', '=', nonce)
      .where('consumed_at', 'is', null)
      .returning(['address', 'expires_at'])
      .executeTakeFirst();
    if (row === undefined) return null;
    if (this.clock.now().getTime() >= row.expires_at.getTime()) return null;
    return { address: row.address };
  }
}

/** Fixed window counters aligned to the window size; one atomic upsert per hit. */
export class PgRateLimiter implements RateLimiter {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock = systemClock,
  ) {}

  async hit(
    key: string,
    windowSeconds: number,
    max: number,
  ): Promise<{ allowed: boolean; remaining: number }> {
    const windowMs = Math.max(1, Math.trunc(windowSeconds)) * 1000;
    const now = this.clock.now().getTime();
    const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
    const row = await this.db
      .insertInto('rate_limits')
      .values({ key, window_start: windowStart, count: 1 })
      .onConflict((oc) =>
        oc
          .columns(['key', 'window_start'])
          .doUpdateSet({ count: sql<number>`rate_limits.count + 1` }),
      )
      .returning('count')
      .executeTakeFirstOrThrow();
    return { allowed: row.count <= max, remaining: Math.max(0, max - row.count) };
  }
}

/** JSON for the metadata column; bigint values (money) are stored as decimal strings. */
function toJson(data: Record<string, unknown>): string {
  return JSON.stringify(data, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v));
}

/** Append only: inserts, never updates (the table also rejects UPDATE and DELETE). */
export class PgAuditLog implements AuditLog {
  constructor(private readonly db: Database) {}

  async record(event: AuditEvent): Promise<void> {
    await this.db
      .insertInto('audit_events')
      .values({
        action: event.kind,
        actor_company_id:
          event.actorCompanyId !== null && isUuid(event.actorCompanyId)
            ? event.actorCompanyId
            : null,
        entity_id: event.subject ?? null,
        metadata: toJson(event.data ?? {}),
      })
      .execute();
  }
}

// ---- Wiring ------------------------------------------------------------------------

export interface PostgresAdapters {
  companies: PgCompanyRepository;
  invoices: PgInvoiceRepository;
  offers: PgOfferRepository;
  attachments: PgAttachmentRepository;
  challenges: PgChallengeStore;
  rateLimiter: PgRateLimiter;
  audit: PgAuditLog;
}

export function createPostgresAdapters(
  db: Database,
  deps: { ids: IdGenerator; clock?: Clock },
): PostgresAdapters {
  const clock = deps.clock ?? systemClock;
  return {
    companies: new PgCompanyRepository(db),
    invoices: new PgInvoiceRepository(db),
    offers: new PgOfferRepository(db),
    attachments: new PgAttachmentRepository(db),
    challenges: new PgChallengeStore(db, deps.ids, clock),
    rateLimiter: new PgRateLimiter(db, clock),
    audit: new PgAuditLog(db),
  };
}
