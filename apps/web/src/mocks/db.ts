import {
  type Company,
  type DisplayStatus,
  DomainError,
  type Invoice,
  type InvoiceStatus,
  type Offer,
  type PublicCompany,
  type Role,
} from '@pronto/shared';
import { annualizedBps, netFromBps, parseMoney, toMoneyString } from '@/lib/money';
import { isValidRuc, rucFrom } from '@/lib/ruc';
import { BUYER_ADDRESS, SUPPLIER_ADDRESS } from './addresses';

/**
 * In-memory stand-in for the Pronto API. It mirrors the business rules of
 * BACKEND_PLAN section 4 so the front can be built and tested before B4 deploys.
 * Every response built from here is validated with the schemas of `@pronto/shared`.
 */

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const DAY = 86_400_000;
export const MOCK_CONTRACT_ID = 'CCEP3RMDUYCFD3GJPDTMH2OQGX3KTV4NX7VRCXLUIIU2ZZOSKL4M5BE4';

type ChainStatus = Offer['chainStatus'];
type CompanyRow = Company;

interface AttachmentRow {
  id: string;
  ownerId: string;
  kind: 'pdf' | 'image' | 'xml';
  mime: string;
  sizeBytes: number;
  ready: boolean;
}

interface InvoiceRow {
  id: string;
  supplierId: string;
  buyerId: string;
  series: string;
  number: string;
  faceAmount: string;
  issueDate: string;
  dueDate: string;
  longerTermAgreed: boolean;
  maxDiscountBps: number | null;
  status: InvoiceStatus;
  rejectionReason: string | null;
  attachmentIds: string[];
  createdAt: string;
}

interface OfferRow {
  offerIdHex: string;
  invoiceId: string;
  netAmount: string;
  discountAmount: string;
  discountBps: number;
  expiresAt: string;
  chainStatus: ChainStatus;
  txCreate: string | null;
  txAccept: string | null;
  txReclaim: string | null;
}

/** What the "network" holds for an offer. The mock chain writes here; reconcile reads it. */
interface ChainEntry {
  state: 'Open' | 'Accepted' | 'Reclaimed';
  txCreate?: string;
  txAccept?: string;
  txReclaim?: string;
}

interface State {
  companies: CompanyRow[];
  invoices: InvoiceRow[];
  offers: OfferRow[];
  attachments: AttachmentRow[];
  chain: Map<string, ChainEntry>;
  ops: Array<{ kind: 'create' | 'accept' | 'reclaim'; txHash: string; at: string }>;
  challenges: Map<string, string>;
}

export const clock = { now: () => new Date() };

function hex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

function iso(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY);
}

function genCode(existing: Set<string>): string {
  for (;;) {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const chars = Array.from(bytes, (b) => CODE_ALPHABET.charAt(b % CODE_ALPHABET.length));
    const code = `PR-${chars.join('')}`;
    if (!existing.has(code)) return code;
  }
}

function emptyState(): State {
  return {
    companies: [],
    invoices: [],
    offers: [],
    attachments: [],
    chain: new Map(),
    ops: [],
    challenges: new Map(),
  };
}

let state: State = emptyState();

export function resetDb(opts: { seed?: boolean } = {}): void {
  state = emptyState();
  if (opts.seed !== false) seed();
}

// ---- Seed ---------------------------------------------------------------------

function seed(): void {
  const now = clock.now();
  const supplier: CompanyRow = {
    id: crypto.randomUUID(),
    code: 'PR-7K4Q2M',
    legalName: 'Imprenta Gráfica Andina SAC',
    ruc: rucFrom('2060123456'),
    sector: 'Imprenta y gráfica',
    wallet: SUPPLIER_ADDRESS,
    fichaPublica: true,
    createdAt: iso(addDays(now, -40)),
  };
  const buyer: CompanyRow = {
    id: crypto.randomUUID(),
    code: 'PR-4N8WTD',
    legalName: 'Distribuidora Yanahuara SAC',
    ruc: rucFrom('2051234567'),
    sector: 'Distribución mayorista',
    wallet: BUYER_ADDRESS,
    fichaPublica: true,
    createdAt: iso(addDays(now, -35)),
  };
  state.companies.push(supplier, buyer);

  const doc = (owner: CompanyRow): string => {
    const id = crypto.randomUUID();
    state.attachments.push({
      id,
      ownerId: owner.id,
      kind: 'pdf',
      mime: 'application/pdf',
      sizeBytes: 182_400,
      ready: true,
    });
    return id;
  };

  const inv = (
    n: string,
    face: string,
    status: InvoiceStatus,
    dueIn: number,
    extra: Partial<InvoiceRow> = {},
    from: CompanyRow = supplier,
    to: CompanyRow = buyer,
    series = 'F001',
  ): InvoiceRow => {
    const row: InvoiceRow = {
      id: crypto.randomUUID(),
      supplierId: from.id,
      buyerId: to.id,
      series,
      number: n,
      faceAmount: face,
      issueDate: isoDate(addDays(now, dueIn - 30)),
      dueDate: isoDate(addDays(now, dueIn)),
      longerTermAgreed: false,
      maxDiscountBps: 200,
      status,
      rejectionReason: null,
      attachmentIds: [doc(from)],
      createdAt: iso(addDays(now, dueIn - 29)),
      ...extra,
    };
    state.invoices.push(row);
    return row;
  };

  const offer = (
    invoice: InvoiceRow,
    bps: number,
    expiresInDays: number,
    chainStatus: ChainStatus,
  ): void => {
    const face = parseMoney(invoice.faceAmount);
    const net = netFromBps(face, bps);
    const row: OfferRow = {
      offerIdHex: hex(32),
      invoiceId: invoice.id,
      netAmount: toMoneyString(net),
      discountAmount: toMoneyString(face - net),
      discountBps: bps,
      expiresAt: iso(addDays(now, expiresInDays)),
      chainStatus,
      txCreate: hex(32),
      txAccept: chainStatus === 'accepted' ? hex(32) : null,
      txReclaim: chainStatus === 'reclaimed' ? hex(32) : null,
    };
    state.offers.push(row);
    const chainState =
      chainStatus === 'accepted' ? 'Accepted' : chainStatus === 'reclaimed' ? 'Reclaimed' : 'Open';
    state.chain.set(row.offerIdHex, {
      state: chainState,
      ...(row.txCreate ? { txCreate: row.txCreate } : {}),
      ...(row.txAccept ? { txAccept: row.txAccept } : {}),
    });
    state.ops.push({ kind: 'create', txHash: row.txCreate ?? hex(32), at: iso(addDays(now, -2)) });
    if (row.txAccept) {
      state.ops.push({ kind: 'accept', txHash: row.txAccept, at: iso(addDays(now, -1)) });
    }
  };

  inv('123', '1000', 'confirmed', 30);
  inv('124', '2400.5', 'sent', 25, { maxDiscountBps: null });
  offer(inv('120', '3500', 'confirmed', 20), 150, 6, 'open');
  offer(inv('118', '1800', 'confirmed', 14), 100, 5, 'accepted');
  offer(inv('115', '960', 'confirmed', 9), 150, -1, 'open');
  inv('130', '780', 'rejected', 22, {
    rejectionReason: 'El importe no coincide con la orden de compra',
  });
  inv('45', '3200', 'sent', 28, { maxDiscountBps: 150 }, buyer, supplier, 'E001');
}

// ---- Helpers -------------------------------------------------------------------

function companyById(id: string): CompanyRow {
  const c = state.companies.find((x) => x.id === id);
  if (!c) throw new DomainError('COMPANY_NOT_FOUND');
  return c;
}

function publicOf(c: CompanyRow): PublicCompany {
  return { id: c.id, code: c.code, legalName: c.legalName, ruc: c.ruc };
}

export function companyByWallet(address: string): CompanyRow | null {
  return state.companies.find((c) => c.wallet === address) ?? null;
}

export function requireCompany(address: string | null): CompanyRow {
  if (!address) throw new DomainError('UNAUTHENTICATED');
  const c = companyByWallet(address);
  if (!c) throw new DomainError('FORBIDDEN');
  return c;
}

function offerFor(invoiceId: string): OfferRow | null {
  const rows = state.offers.filter(
    (o) => o.invoiceId === invoiceId && ['pending', 'open', 'accepted'].includes(o.chainStatus),
  );
  return rows.at(-1) ?? null;
}

function displayStatus(inv: InvoiceRow, offer: OfferRow | null): DisplayStatus {
  if (inv.status !== 'confirmed') return inv.status;
  if (!offer) return 'confirmed';
  if (offer.chainStatus === 'accepted') return 'collected';
  if (offer.chainStatus === 'open') {
    return Date.parse(offer.expiresAt) <= clock.now().getTime() ? 'offer_expired' : 'offer_open';
  }
  return 'confirmed';
}

function offerDto(o: OfferRow): Offer {
  return { ...o, contractId: MOCK_CONTRACT_ID };
}

function invoiceDto(inv: InvoiceRow): Invoice {
  const offer = offerFor(inv.id);
  return {
    id: inv.id,
    supplier: publicOf(companyById(inv.supplierId)),
    buyer: publicOf(companyById(inv.buyerId)),
    series: inv.series,
    number: inv.number,
    faceAmount: inv.faceAmount,
    currency: 'USDC',
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    longerTermAgreed: inv.longerTermAgreed,
    maxDiscountBps: inv.maxDiscountBps,
    status: inv.status,
    displayStatus: displayStatus(inv, offer),
    rejectionReason: inv.rejectionReason,
    attachments: inv.attachmentIds.flatMap((id) => {
      const a = state.attachments.find((x) => x.id === id);
      return a ? [{ id: a.id, kind: a.kind, mime: a.mime, sizeBytes: a.sizeBytes }] : [];
    }),
    offer: offer ? offerDto(offer) : null,
    createdAt: inv.createdAt,
  };
}

function loadInvoiceFor(me: CompanyRow, id: string): { row: InvoiceRow; role: Role } {
  const row = state.invoices.find((i) => i.id === id);
  if (!row) throw new DomainError('INVOICE_NOT_FOUND');
  if (row.supplierId === me.id) return { row, role: 'supplier' };
  if (row.buyerId === me.id) {
    if (row.status === 'rejected' || row.status === 'cancelled') {
      throw new DomainError('INVOICE_NOT_FOUND');
    }
    return { row, role: 'buyer' };
  }
  throw new DomainError('INVOICE_NOT_FOUND');
}

function hasActiveOffer(invoiceId: string): boolean {
  return state.offers.some(
    (o) => o.invoiceId === invoiceId && ['open', 'accepted'].includes(o.chainStatus),
  );
}

// ---- Auth ----------------------------------------------------------------------

export function requestChallenge(address: string) {
  const nonce = hex(16);
  state.challenges.set(nonce, address);
  return {
    challengeXdr: `mock-challenge:${nonce}`,
    nonce,
    expiresAt: iso(new Date(clock.now().getTime() + 5 * 60_000)),
  };
}

export function verifyChallenge(address: string, signedXdr: string) {
  const nonce = /^signed:mock-challenge:([0-9a-f]+)$/.exec(signedXdr)?.[1];
  if (!nonce) throw new DomainError('SIGNATURE_INVALID');
  const owner = state.challenges.get(nonce);
  if (owner === undefined) throw new DomainError('CHALLENGE_EXPIRED');
  state.challenges.delete(nonce);
  if (owner !== address) throw new DomainError('SIGNATURE_INVALID');
  return {
    token: `mock.${address}.${hex(8)}`,
    expiresAt: iso(new Date(clock.now().getTime() + 60 * 60_000)),
    company: companyByWallet(address),
  };
}

// ---- Companies -------------------------------------------------------------------

export function registerCompany(
  address: string | null,
  input: { ruc: string; legalName: string; sector: string },
): Company {
  if (!address) throw new DomainError('UNAUTHENTICATED');
  if (!isValidRuc(input.ruc)) throw new DomainError('RUC_INVALID');
  if (companyByWallet(address)) throw new DomainError('WALLET_TAKEN');
  if (state.companies.some((c) => c.ruc === input.ruc)) throw new DomainError('RUC_TAKEN');
  const row: CompanyRow = {
    id: crypto.randomUUID(),
    code: genCode(new Set(state.companies.map((c) => c.code))),
    legalName: input.legalName,
    ruc: input.ruc,
    sector: input.sector,
    wallet: address,
    fichaPublica: true,
    createdAt: iso(clock.now()),
  };
  state.companies.push(row);
  return row;
}

export function updateSettings(address: string | null, fichaPublica: boolean): Company {
  const me = requireCompany(address);
  me.fichaPublica = fichaPublica;
  return me;
}

export function lookup(
  address: string | null,
  q: { code?: string | undefined; ruc?: string | undefined },
): PublicCompany {
  requireCompany(address);
  if (q.ruc !== undefined && !isValidRuc(q.ruc)) throw new DomainError('RUC_INVALID');
  const found = state.companies.find((c) => (q.code ? c.code === q.code : c.ruc === q.ruc));
  if (!found) throw new DomainError('COMPANY_NOT_FOUND');
  return publicOf(found);
}

export function companyPage(code: string) {
  const c = state.companies.find((x) => x.code === code);
  if (!c?.fichaPublica) throw new DomainError('COMPANY_NOT_FOUND');
  return { code: c.code, legalName: c.legalName, ruc: c.ruc, sector: c.sector };
}

export function contacts(address: string | null, role: Role): PublicCompany[] {
  const me = requireCompany(address);
  const mine = state.invoices.filter(
    (i) => (role === 'supplier' ? i.supplierId : i.buyerId) === me.id,
  );
  const ids = [...new Set(mine.map((i) => (role === 'supplier' ? i.buyerId : i.supplierId)))];
  return ids
    .map((id) => publicOf(companyById(id)))
    .sort((a, b) => a.legalName.localeCompare(b.legalName));
}

// ---- Attachments -------------------------------------------------------------------

export function requestUpload(
  address: string | null,
  input: { kind: 'pdf' | 'image' | 'xml'; mime: string; sizeBytes: number },
) {
  const me = requireCompany(address);
  const id = crypto.randomUUID();
  state.attachments.push({ id, ownerId: me.id, ...input, ready: false });
  return {
    attachmentId: id,
    uploadUrl: `https://mock-storage.pronto.test/upload/${id}`,
    expiresAt: iso(new Date(clock.now().getTime() + 10 * 60_000)),
  };
}

export function completeUpload(address: string | null, id: string) {
  const me = requireCompany(address);
  const a = state.attachments.find((x) => x.id === id && x.ownerId === me.id);
  if (!a) throw new DomainError('ATTACHMENT_INVALID');
  a.ready = true;
  return { id: a.id, kind: a.kind, mime: a.mime, sizeBytes: a.sizeBytes };
}

export function attachmentUrl(address: string | null, id: string, origin: string) {
  const me = requireCompany(address);
  const a = state.attachments.find((x) => x.id === id && x.ready);
  const visible =
    a &&
    (a.ownerId === me.id ||
      state.invoices.some(
        (i) => i.attachmentIds.includes(id) && (i.supplierId === me.id || i.buyerId === me.id),
      ));
  if (!a || !visible) throw new DomainError('ATTACHMENT_INVALID');
  return { url: `${origin}/mock/${a.kind === 'image' ? 'factura-demo.png' : 'factura-demo.pdf'}` };
}

// ---- Invoices ------------------------------------------------------------------------

export interface SendInvoiceInput {
  buyerCompanyId: string;
  series: string;
  number: string;
  faceAmount: string;
  issueDate: string;
  dueDate: string;
  longerTermAgreed: boolean;
  maxDiscountBps?: number | undefined;
  attachmentIds: string[];
}

export function sendInvoice(address: string | null, input: SendInvoiceInput): Invoice {
  const me = requireCompany(address);
  if (input.buyerCompanyId === me.id) throw new DomainError('SELF_INVOICE');
  companyById(input.buyerCompanyId);
  const today = isoDate(clock.now());
  if (input.dueDate < today) throw new DomainError('INVOICE_OVERDUE');
  if (input.issueDate > today) {
    throw new DomainError('VALIDATION_ERROR', undefined, { field: 'issueDate' });
  }
  const term = Math.round((Date.parse(input.dueDate) - Date.parse(input.issueDate)) / DAY);
  if (term > 30 && !input.longerTermAgreed) {
    throw new DomainError('VALIDATION_ERROR', undefined, { field: 'longerTermAgreed' });
  }
  const duplicate = state.invoices.some(
    (i) =>
      i.supplierId === me.id &&
      i.series === input.series &&
      i.number === input.number &&
      i.status !== 'cancelled',
  );
  if (duplicate) throw new DomainError('INVOICE_DUPLICATE');
  for (const id of input.attachmentIds) {
    const a = state.attachments.find((x) => x.id === id);
    if (!a || a.ownerId !== me.id || !a.ready) throw new DomainError('ATTACHMENT_INVALID');
  }
  const row: InvoiceRow = {
    id: crypto.randomUUID(),
    supplierId: me.id,
    buyerId: input.buyerCompanyId,
    series: input.series,
    number: input.number,
    faceAmount: input.faceAmount,
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    longerTermAgreed: input.longerTermAgreed,
    maxDiscountBps: input.maxDiscountBps ?? null,
    status: 'sent',
    rejectionReason: null,
    attachmentIds: input.attachmentIds,
    createdAt: iso(clock.now()),
  };
  state.invoices.push(row);
  return invoiceDto(row);
}

export function listInvoices(
  address: string | null,
  role: Role,
  status?: DisplayStatus,
): Invoice[] {
  const me = requireCompany(address);
  const rows = state.invoices.filter((i) =>
    role === 'supplier'
      ? i.supplierId === me.id
      : i.buyerId === me.id && i.status !== 'rejected' && i.status !== 'cancelled',
  );
  return rows
    .map(invoiceDto)
    .filter((d) => status === undefined || d.displayStatus === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getInvoice(address: string | null, id: string): Invoice {
  const me = requireCompany(address);
  return invoiceDto(loadInvoiceFor(me, id).row);
}

type Action = 'confirm' | 'reject' | 'cancel' | 'resend';

export function transition(
  address: string | null,
  id: string,
  action: Action,
  patch: { reason?: string; resend?: Partial<InvoiceRow> } = {},
): Invoice {
  const me = requireCompany(address);
  const { row, role } = loadInvoiceFor(me, id);
  const need = (r: Role) => {
    if (role !== r) throw new DomainError('FORBIDDEN');
  };
  if (action === 'confirm' || action === 'reject') {
    need('buyer');
    if (row.status !== 'sent') throw new DomainError('INVALID_STATE');
    row.status = action === 'confirm' ? 'confirmed' : 'rejected';
    if (action === 'reject') row.rejectionReason = patch.reason ?? null;
  } else if (action === 'cancel') {
    need('supplier');
    if (row.status === 'cancelled' || hasActiveOffer(row.id)) {
      throw new DomainError('INVALID_STATE');
    }
    row.status = 'cancelled';
  } else {
    need('supplier');
    if (row.status !== 'rejected') throw new DomainError('INVALID_STATE');
    Object.assign(row, patch.resend ?? {});
    row.status = 'sent';
    row.rejectionReason = null;
  }
  return invoiceDto(row);
}

// ---- Offers ---------------------------------------------------------------------------

export function draftOffer(
  address: string | null,
  invoiceId: string,
  input: { discountBps: number; validityDays: 3 | 7 | 15 },
) {
  const me = requireCompany(address);
  const { row, role } = loadInvoiceFor(me, invoiceId);
  if (role !== 'buyer') throw new DomainError('FORBIDDEN');
  if (row.status !== 'confirmed') throw new DomainError('INVALID_STATE');
  if (hasActiveOffer(row.id)) throw new DomainError('OFFER_EXISTS');
  const now = clock.now();
  const expires = addDays(now, input.validityDays);
  if (isoDate(expires) >= row.dueDate) {
    throw new DomainError('VALIDATION_ERROR', undefined, { field: 'validityDays' });
  }
  const face = parseMoney(row.faceAmount);
  const net = netFromBps(face, input.discountBps);
  const days = Math.max(1, Math.round((Date.parse(row.dueDate) - Date.parse(isoDate(now))) / DAY));
  const offer: OfferRow = {
    offerIdHex: hex(32),
    invoiceId: row.id,
    netAmount: toMoneyString(net),
    discountAmount: toMoneyString(face - net),
    discountBps: input.discountBps,
    expiresAt: iso(expires),
    chainStatus: 'pending',
    txCreate: null,
    txAccept: null,
    txReclaim: null,
  };
  state.offers = state.offers.filter(
    (o) => !(o.invoiceId === row.id && o.chainStatus === 'pending'),
  );
  state.offers.push(offer);
  const overMax = row.maxDiscountBps !== null && input.discountBps > row.maxDiscountBps;
  return {
    ...offerDto(offer),
    annualizedBps: annualizedBps(face - net, net, days),
    supplierWallet: companyById(row.supplierId).wallet,
    warnings: overMax ? (['DISCOUNT_ABOVE_SUPPLIER_MAX'] as const) : ([] as const),
  };
}

function offerForParty(me: CompanyRow, offerIdHex: string): { offer: OfferRow; inv: InvoiceRow } {
  const offer = state.offers.find((o) => o.offerIdHex === offerIdHex);
  const inv = offer ? state.invoices.find((i) => i.id === offer.invoiceId) : undefined;
  if (!offer || !inv || (inv.supplierId !== me.id && inv.buyerId !== me.id)) {
    throw new DomainError('INVOICE_NOT_FOUND');
  }
  return { offer, inv };
}

export function reconcileOffer(address: string | null, offerIdHex: string): Offer {
  const me = requireCompany(address);
  const { offer } = offerForParty(me, offerIdHex);
  const onChain = state.chain.get(offerIdHex);
  if (onChain) {
    offer.chainStatus =
      onChain.state === 'Open' ? 'open' : onChain.state === 'Accepted' ? 'accepted' : 'reclaimed';
    offer.txCreate = onChain.txCreate ?? offer.txCreate;
    offer.txAccept = onChain.txAccept ?? offer.txAccept;
    offer.txReclaim = onChain.txReclaim ?? offer.txReclaim;
  }
  return offerDto(offer);
}

export function offerProof(address: string | null, offerIdHex: string) {
  const me = requireCompany(address);
  const { offer, inv } = offerForParty(me, offerIdHex);
  return {
    ...offerDto(offer),
    network: 'testnet' as const,
    invoiceSeries: inv.series,
    invoiceNumber: inv.number,
    faceAmount: inv.faceAmount,
    supplierWallet: companyById(inv.supplierId).wallet,
    buyerWallet: companyById(inv.buyerId).wallet,
  };
}

export function networkSummary() {
  return {
    network: 'testnet' as const,
    contractId: MOCK_CONTRACT_ID,
    offersCreated: state.ops.filter((o) => o.kind === 'create').length,
    offersAccepted: state.ops.filter((o) => o.kind === 'accept').length,
    lastOperations: [...state.ops].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5),
  };
}

// ---- Mock chain (what the wallet and the contract would do) ---------------------------

/** Simulates a successful contract call and returns the transaction hash. */
export function applyChainOperation(
  kind: 'create' | 'accept' | 'reclaim',
  offerIdHex: string,
): string {
  const txHash = hex(32);
  const entry: ChainEntry = state.chain.get(offerIdHex) ?? { state: 'Open' };
  if (kind === 'create') {
    entry.state = 'Open';
    entry.txCreate = txHash;
  } else if (kind === 'accept') {
    entry.state = 'Accepted';
    entry.txAccept = txHash;
  } else {
    entry.state = 'Reclaimed';
    entry.txReclaim = txHash;
  }
  state.chain.set(offerIdHex, entry);
  state.ops.push({ kind, txHash, at: iso(clock.now()) });
  return txHash;
}
