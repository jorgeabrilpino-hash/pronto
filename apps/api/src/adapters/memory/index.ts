import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { InvoiceStatus, Role } from '@pronto/shared';
import { DomainError } from '@pronto/shared';
import type {
  AttachmentRepository,
  AuditEvent,
  AuditLog,
  ChainInvocation,
  ChainOperation,
  ChainReader,
  ChainTransaction,
  ChallengeStore,
  Clock,
  CompanyRepository,
  ExtractedInvoice,
  FileStorage,
  IdGenerator,
  InvoiceExtractor,
  InvoicePatch,
  InvoiceRepository,
  OfferPatch,
  OfferRepository,
  RateLimiter,
  SignatureVerifier,
  TokenClaims,
  TokenService,
} from '../../application/ports';
import { isActiveOffer } from '../../domain/invoice';
import type { Attachment, ChainOffer, Company, Invoice, Offer } from '../../domain/types';
import { canonicalInvoiceNumber, generateCompanyCode } from '../../domain/values';

/**
 * In-memory adapters for every port. They keep copies (never hand out internal objects)
 * so tests observe the same isolation a database gives. Not for production.
 */

function copy<T extends object>(v: T): T {
  return { ...v };
}

// ---- Clock and ids -----------------------------------------------------------

export class MutableClock implements Clock {
  private current: Date;
  constructor(start: Date = new Date('2026-11-23T15:00:00Z')) {
    this.current = new Date(start.getTime());
  }
  now(): Date {
    return new Date(this.current.getTime());
  }
  set(at: Date): void {
    this.current = new Date(at.getTime());
  }
  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
}

export class RandomIdGenerator implements IdGenerator {
  uuid(): string {
    return randomUUID();
  }
  offerId(): string {
    return randomBytes(32).toString('hex');
  }
  companyCode(): string {
    return generateCompanyCode((n) => randomInt(n));
  }
  token(): string {
    return randomBytes(24).toString('hex');
  }
}

/** Random ids, but company codes can be queued to force collisions in tests. */
export class ScriptedIdGenerator extends RandomIdGenerator {
  private readonly codes: string[] = [];
  queueCompanyCodes(...codes: string[]): void {
    this.codes.push(...codes);
  }
  override companyCode(): string {
    return this.codes.shift() ?? super.companyCode();
  }
}

// ---- Repositories --------------------------------------------------------------

export class InMemoryCompanyRepository implements CompanyRepository {
  private readonly rows = new Map<string, Company>();

  async byId(id: string): Promise<Company | null> {
    const c = this.rows.get(id);
    return c === undefined ? null : copy(c);
  }
  async byRuc(ruc: string): Promise<Company | null> {
    return this.find((c) => c.ruc === ruc);
  }
  async byCode(code: string): Promise<Company | null> {
    return this.find((c) => c.code === code);
  }
  async byWallet(address: string): Promise<Company | null> {
    return this.find((c) => c.wallet === address);
  }
  async insert(company: Company): Promise<void> {
    for (const c of this.rows.values()) {
      if (c.ruc === company.ruc) throw new DomainError('RUC_TAKEN');
      if (c.wallet === company.wallet) throw new DomainError('WALLET_TAKEN');
      if (c.code === company.code) throw new DomainError('INTERNAL', 'Company code collision');
    }
    this.rows.set(company.id, copy(company));
  }
  async update(
    id: string,
    patch: Partial<Pick<Company, 'fichaPublica' | 'profile'>>,
  ): Promise<Company> {
    const c = this.rows.get(id);
    if (c === undefined) throw new DomainError('COMPANY_NOT_FOUND');
    const next = { ...c, ...patch };
    this.rows.set(id, next);
    return copy(next);
  }
  private find(pred: (c: Company) => boolean): Company | null {
    for (const c of this.rows.values()) if (pred(c)) return copy(c);
    return null;
  }
}

export class InMemoryInvoiceRepository implements InvoiceRepository {
  private readonly rows = new Map<string, Invoice>();
  constructor(private readonly clock: Clock = new MutableClock()) {}

  /** Mirrors the DB check `number ~ '^[1-9][0-9]{0,7}$'`: only canonical numbers are stored. */
  private static assertCanonical(number: string): void {
    if (canonicalInvoiceNumber(number) !== number) {
      throw new DomainError('VALIDATION_ERROR', 'Invoice number must be canonical', { number });
    }
  }

  async insert(invoice: Invoice): Promise<void> {
    InMemoryInvoiceRepository.assertCanonical(invoice.number);
    if (await this.duplicateExists(invoice.supplierId, invoice.series, invoice.number)) {
      throw new DomainError('INVOICE_DUPLICATE');
    }
    this.rows.set(invoice.id, copy(invoice));
  }
  async byId(id: string): Promise<Invoice | null> {
    const i = this.rows.get(id);
    return i === undefined ? null : copy(i);
  }
  async listFor(companyId: string, role: Role, status?: InvoiceStatus): Promise<Invoice[]> {
    return [...this.rows.values()]
      .filter((i) => (role === 'supplier' ? i.supplierId : i.buyerId) === companyId)
      .filter((i) => status === undefined || i.status === status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(copy);
  }
  /** Compares canonical numbers, so "0123" and "123" are the same invoice. */
  async duplicateExists(supplierId: string, series: string, number: string): Promise<boolean> {
    const wanted = canonicalInvoiceNumber(number) ?? number;
    for (const i of this.rows.values()) {
      if (
        i.supplierId === supplierId &&
        i.series === series &&
        (canonicalInvoiceNumber(i.number) ?? i.number) === wanted
      ) {
        return true;
      }
    }
    return false;
  }
  async update(id: string, expectedVersion: number, patch: InvoicePatch): Promise<Invoice | null> {
    if (patch.number !== undefined) InMemoryInvoiceRepository.assertCanonical(patch.number);
    const i = this.rows.get(id);
    if (i === undefined || i.version !== expectedVersion) return null;
    const next: Invoice = { ...i, ...patch, version: i.version + 1, updatedAt: this.clock.now() };
    this.rows.set(id, next);
    return copy(next);
  }
}

export class InMemoryOfferRepository implements OfferRepository {
  private readonly rows = new Map<string, Offer>();
  private readonly operations: ChainOperation[] = [];
  constructor(
    private readonly clock: Clock = new MutableClock(),
    private readonly invoices?: InvoiceRepository,
  ) {}

  /** Mirrors the partial unique index: at most one pending, open or accepted offer per invoice. */
  async insertPending(offer: Offer): Promise<void> {
    if (this.rows.has(offer.offerIdHex)) throw new DomainError('INTERNAL', 'Offer id reused');
    for (const o of this.rows.values()) {
      if (o.invoiceId === offer.invoiceId && isActiveOffer(o))
        throw new DomainError('OFFER_EXISTS');
    }
    this.rows.set(offer.offerIdHex, { ...copy(offer), chainStatus: 'pending' });
  }
  async byOfferId(offerIdHex: string): Promise<Offer | null> {
    const o = this.rows.get(offerIdHex);
    return o === undefined ? null : copy(o);
  }
  async byInvoice(invoiceId: string): Promise<Offer[]> {
    return [...this.rows.values()]
      .filter((o) => o.invoiceId === invoiceId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(copy);
  }
  async update(offerIdHex: string, patch: OfferPatch): Promise<Offer> {
    const o = this.rows.get(offerIdHex);
    if (o === undefined) throw new DomainError('INVOICE_NOT_FOUND', 'Offer not found');
    const at = this.clock.now();
    // Mirrors the Postgres adapter: the first recorded accept stamps `acceptedAt` once.
    const next: Offer = { ...o, ...patch };
    if (typeof patch.txAccept === 'string' && o.acceptedAt === null) next.acceptedAt = at;
    const ops: Array<[ChainOperation['kind'], string | null, string | null]> = [
      ['create', o.txCreate, next.txCreate],
      ['accept', o.txAccept, next.txAccept],
      ['reclaim', o.txReclaim, next.txReclaim],
    ];
    for (const [kind, before, after] of ops) {
      if (after !== null && after !== before) this.operations.push({ kind, txHash: after, at });
    }
    this.rows.set(offerIdHex, next);
    return copy(next);
  }
  /** Offers on invoices where the company is supplier or buyer (the SQL join in B3). */
  async listFor(companyId: string): Promise<Offer[]> {
    const ids = new Set<string>();
    if (this.invoices !== undefined) {
      for (const role of ['supplier', 'buyer'] as const) {
        for (const i of await this.invoices.listFor(companyId, role)) ids.add(i.id);
      }
    }
    return [...this.rows.values()].filter((o) => ids.has(o.invoiceId)).map(copy);
  }
  async stats(): Promise<{ created: number; accepted: number }> {
    let created = 0;
    let accepted = 0;
    for (const o of this.rows.values()) {
      if (o.chainStatus === 'open' || o.chainStatus === 'accepted' || o.chainStatus === 'reclaimed')
        created++;
      if (o.chainStatus === 'accepted') accepted++;
    }
    return { created, accepted };
  }
  async recentOperations(limit: number): Promise<ChainOperation[]> {
    return [...this.operations]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, limit)
      .map(copy);
  }
}

export class InMemoryAttachmentRepository implements AttachmentRepository {
  private readonly rows = new Map<string, Attachment>();

  async insert(attachment: Attachment): Promise<void> {
    this.rows.set(attachment.id, copy(attachment));
  }
  async byId(id: string): Promise<Attachment | null> {
    const a = this.rows.get(id);
    return a === undefined ? null : copy(a);
  }
  async markReady(
    id: string,
    info: { sizeBytes: number; sha256: string | null },
  ): Promise<Attachment> {
    const a = this.rows.get(id);
    if (a === undefined) throw new DomainError('ATTACHMENT_INVALID');
    const next: Attachment = {
      ...a,
      sizeBytes: info.sizeBytes,
      sha256: info.sha256,
      status: 'ready',
    };
    this.rows.set(id, next);
    return copy(next);
  }
  async linkToInvoice(ids: string[], invoiceId: string): Promise<void> {
    for (const id of ids) {
      const a = this.rows.get(id);
      if (a !== undefined) this.rows.set(id, { ...a, invoiceId });
    }
  }
  async listByInvoice(invoiceId: string): Promise<Attachment[]> {
    return [...this.rows.values()].filter((a) => a.invoiceId === invoiceId).map(copy);
  }
}

// ---- Storage -------------------------------------------------------------------

export class FakeFileStorage implements FileStorage {
  private readonly objects = new Map<
    string,
    { sizeBytes: number; mime: string; sha256?: string }
  >();
  constructor(private readonly clock: Clock = new MutableClock()) {}

  async createUploadUrl(
    path: string,
    _mime: string,
    _maxBytes: number,
    ttlSeconds: number,
  ): Promise<{ url: string; expiresAt: Date }> {
    return {
      url: `https://storage.test/upload/${encodeURIComponent(path)}`,
      expiresAt: new Date(this.clock.now().getTime() + ttlSeconds * 1000),
    };
  }
  async createDownloadUrl(path: string, ttlSeconds: number): Promise<string> {
    return `https://storage.test/download/${encodeURIComponent(path)}?ttl=${ttlSeconds}`;
  }
  async head(path: string): Promise<{ sizeBytes: number; mime: string; sha256?: string } | null> {
    const o = this.objects.get(path);
    return o === undefined ? null : { ...o };
  }
  /** Test helper: simulates the browser uploading the object directly to storage. */
  put(path: string, object: { sizeBytes: number; mime: string; sha256?: string }): void {
    this.objects.set(path, { ...object });
  }
}

// ---- Chain -----------------------------------------------------------------------

export class FakeChainReader implements ChainReader {
  private readonly offers = new Map<string, ChainOffer>();
  private readonly txs = new Map<
    string,
    { status: 'SUCCESS' | 'FAILED'; invocation?: ChainInvocation }
  >();
  unavailable = false;
  getOfferCalls = 0;
  constructor(private contract = 'CPRONTOTESTCONTRACT') {}

  contractId(): string {
    return this.contract;
  }
  setContractId(id: string): void {
    this.contract = id;
  }
  async getOffer(offerIdHex: string): Promise<ChainOffer | null> {
    this.getOfferCalls++;
    if (this.unavailable) throw new Error('RPC unavailable');
    const o = this.offers.get(offerIdHex);
    return o === undefined ? null : copy(o);
  }
  async getTransaction(hash: string): Promise<ChainTransaction> {
    if (this.unavailable) throw new Error('RPC unavailable');
    const tx = this.txs.get(hash);
    if (tx === undefined) return { status: 'NOT_FOUND' };
    return tx.invocation === undefined
      ? { status: tx.status }
      : { status: tx.status, invocation: { ...tx.invocation } };
  }
  /** Test helpers: set the contract state the reconciler will read. */
  setOffer(offerIdHex: string, offer: ChainOffer | null): void {
    if (offer === null) this.offers.delete(offerIdHex);
    else this.offers.set(offerIdHex, copy(offer));
  }
  /** Without `invocation` the transaction carries no decodable contract call. */
  setTransaction(hash: string, status: 'SUCCESS' | 'FAILED', invocation?: ChainInvocation): void {
    this.txs.set(
      hash,
      invocation === undefined ? { status } : { status, invocation: { ...invocation } },
    );
  }
}

// ---- Auth ------------------------------------------------------------------------

export class InMemoryChallengeStore implements ChallengeStore {
  private readonly rows = new Map<string, { address: string; expiresAt: Date }>();
  constructor(
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async create(address: string, ttlSeconds: number): Promise<{ nonce: string; expiresAt: Date }> {
    const nonce = this.ids.token();
    const expiresAt = new Date(this.clock.now().getTime() + ttlSeconds * 1000);
    this.rows.set(nonce, { address, expiresAt });
    return { nonce, expiresAt };
  }
  /** Single use: the nonce is deleted on the first consume, valid or expired. */
  async consume(nonce: string): Promise<{ address: string } | null> {
    const row = this.rows.get(nonce);
    if (row === undefined) return null;
    this.rows.delete(nonce);
    if (this.clock.now().getTime() >= row.expiresAt.getTime()) return null;
    return { address: row.address };
  }
}

/**
 * Fake signatures: the challenge is `challenge:<address>:<nonce>` and the wallet "signs"
 * it as `signed:<address>:<nonce>`. `FakeSignatureVerifier.sign` builds that string.
 */
export class FakeSignatureVerifier implements SignatureVerifier {
  static sign(address: string, nonce: string): string {
    return `signed:${address}:${nonce}`;
  }
  buildChallenge(address: string, nonce: string): string {
    return `challenge:${address}:${nonce}`;
  }
  async verifyChallenge(signedXdr: string, address: string, nonce: string): Promise<boolean> {
    return signedXdr === FakeSignatureVerifier.sign(address, nonce);
  }
  readNonce(signedXdr: string): string | null {
    const parts = signedXdr.split(':');
    return parts.length === 3 && parts[0] === 'signed' && parts[2] ? parts[2] : null;
  }
}

export class FakeTokenService implements TokenService {
  private readonly tokens = new Map<string, { claims: TokenClaims; expiresAt: Date }>();
  constructor(
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async issue(
    claims: TokenClaims,
    ttlSeconds: number,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = this.ids.token();
    const expiresAt = new Date(this.clock.now().getTime() + ttlSeconds * 1000);
    this.tokens.set(token, { claims: { ...claims }, expiresAt });
    return { token, expiresAt };
  }
  async verify(token: string): Promise<TokenClaims | null> {
    const row = this.tokens.get(token);
    if (row === undefined || this.clock.now().getTime() >= row.expiresAt.getTime()) return null;
    return { ...row.claims };
  }
}

// ---- Others ----------------------------------------------------------------------

export class FakeInvoiceExtractor implements InvoiceExtractor {
  constructor(private result: ExtractedInvoice = { source: 'xml' }) {}
  setResult(result: ExtractedInvoice): void {
    this.result = result;
  }
  async extract(_file: { bytes: Uint8Array; mime: string }): Promise<ExtractedInvoice> {
    return { ...this.result };
  }
}

/** Fixed window counter per key. */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();
  constructor(private readonly clock: Clock) {}

  async hit(
    key: string,
    windowSeconds: number,
    max: number,
  ): Promise<{ allowed: boolean; remaining: number }> {
    const now = this.clock.now().getTime();
    let w = this.windows.get(key);
    if (w === undefined || now - w.start >= windowSeconds * 1000) {
      w = { start: now, count: 0 };
      this.windows.set(key, w);
    }
    w.count++;
    return { allowed: w.count <= max, remaining: Math.max(0, max - w.count) };
  }
}

export class InMemoryAuditLog implements AuditLog {
  readonly events: AuditEvent[] = [];
  async record(event: AuditEvent): Promise<void> {
    this.events.push({ ...event });
  }
  kinds(): string[] {
    return this.events.map((e) => e.kind);
  }
}

// ---- Wiring ------------------------------------------------------------------------

export interface MemoryAdapters {
  clock: MutableClock;
  ids: ScriptedIdGenerator;
  companies: InMemoryCompanyRepository;
  invoices: InMemoryInvoiceRepository;
  offers: InMemoryOfferRepository;
  attachments: InMemoryAttachmentRepository;
  storage: FakeFileStorage;
  chain: FakeChainReader;
  challenges: InMemoryChallengeStore;
  signatures: FakeSignatureVerifier;
  tokens: FakeTokenService;
  extractor: FakeInvoiceExtractor;
  rateLimiter: InMemoryRateLimiter;
  audit: InMemoryAuditLog;
}

export function createMemoryAdapters(start?: Date): MemoryAdapters {
  const clock = new MutableClock(start);
  const ids = new ScriptedIdGenerator();
  const invoices = new InMemoryInvoiceRepository(clock);
  return {
    clock,
    ids,
    companies: new InMemoryCompanyRepository(),
    invoices,
    offers: new InMemoryOfferRepository(clock, invoices),
    attachments: new InMemoryAttachmentRepository(),
    storage: new FakeFileStorage(clock),
    chain: new FakeChainReader(),
    challenges: new InMemoryChallengeStore(clock, ids),
    signatures: new FakeSignatureVerifier(),
    tokens: new FakeTokenService(clock, ids),
    extractor: new FakeInvoiceExtractor(),
    rateLimiter: new InMemoryRateLimiter(clock),
    audit: new InMemoryAuditLog(),
  };
}
