import type { Profile, Role, z } from '@pronto/shared';
import {
  type AttachmentSchema,
  CompanySchema,
  DomainError,
  InvoiceSchema,
  type OfferSchema,
  type PublicCompanySchema,
} from '@pronto/shared';
import { currentOffer, displayStatus } from '../../domain/invoice';
import type { Attachment, Company, Invoice, Offer } from '../../domain/types';
import { formatMoney } from '../../domain/values';
import type {
  AttachmentRepository,
  ChainReader,
  Clock,
  CompanyRepository,
  InvoiceRepository,
  OfferRepository,
  RateLimiter,
  TokenClaims,
} from '../ports';

/** Authenticated caller as decoded from the access token. */
export type Actor = TokenClaims;

/** Parses input with a shared zod schema; failures become VALIDATION_ERROR. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new DomainError('VALIDATION_ERROR', 'Invalid input', {
      issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return r.data;
}

/** Validates output against its shared schema so a contract drift fails loudly. */
export function parseOutput<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const r = schema.safeParse(value);
  if (!r.success) throw new DomainError('INTERNAL', 'Output does not match the contract');
  return r.data;
}

/**
 * Resolves the caller's company: by the token's company id, or by wallet when the token
 * was issued before registration. The wallet must match the company. No company -> FORBIDDEN.
 */
export async function requireCompany(
  companies: CompanyRepository,
  actor: Actor | null,
): Promise<Company> {
  if (actor === null) throw new DomainError('UNAUTHENTICATED');
  const company =
    actor.companyId !== null
      ? await companies.byId(actor.companyId)
      : await companies.byWallet(actor.address);
  if (company === null || company.wallet !== actor.address) {
    throw new DomainError('FORBIDDEN', 'A registered company is required');
  }
  return company;
}

/** True when a company with `profile` may act on the `side` of an invoice. */
export function profileAllows(profile: Profile, side: Role): boolean {
  return profile === 'both' || profile === side;
}

/**
 * Gates an action by the company profile chosen at registration: supplier actions need
 * supplier or both, buyer actions need buyer or both. Otherwise FORBIDDEN.
 */
export function requireProfile(company: Company, side: Role): void {
  if (!profileAllows(company.profile, side)) {
    throw new DomainError('FORBIDDEN', `The company profile does not allow ${side} actions`, {
      profile: company.profile,
      required: side,
    });
  }
}

export function requireActor(actor: Actor | null): Actor {
  if (actor === null) throw new DomainError('UNAUTHENTICATED');
  return actor;
}

export async function enforceRateLimit(
  limiter: RateLimiter,
  key: string,
  windowSeconds: number,
  max: number,
): Promise<void> {
  const r = await limiter.hit(key, windowSeconds, max);
  if (!r.allowed) throw new DomainError('RATE_LIMITED', 'Too many requests', { windowSeconds });
}

/** Role of the company on the invoice; non-parties get FORBIDDEN. */
export function roleOn(invoice: Invoice, companyId: string): Role {
  if (invoice.supplierId === companyId) return 'supplier';
  if (invoice.buyerId === companyId) return 'buyer';
  throw new DomainError('FORBIDDEN', 'Only the supplier and the buyer can access this invoice');
}

export async function loadInvoice(invoices: InvoiceRepository, id: string): Promise<Invoice> {
  const invoice = await invoices.byId(id);
  if (invoice === null) throw new DomainError('INVOICE_NOT_FOUND');
  return invoice;
}

export async function loadCompany(companies: CompanyRepository, id: string): Promise<Company> {
  const c = await companies.byId(id);
  if (c === null) throw new DomainError('COMPANY_NOT_FOUND');
  return c;
}

// ---- Mappers to the shared contract -------------------------------------------------

export function toPublicCompany(c: Company): z.output<typeof PublicCompanySchema> {
  return { id: c.id, code: c.code, legalName: c.legalName, ruc: c.ruc };
}

export function toCompanyDto(c: Company): z.output<typeof CompanySchema> {
  return parseOutput(CompanySchema, {
    ...toPublicCompany(c),
    sector: c.sector,
    wallet: c.wallet,
    fichaPublica: c.fichaPublica,
    profile: c.profile,
    createdAt: c.createdAt.toISOString(),
  });
}

export function toOfferDto(o: Offer): z.output<typeof OfferSchema> {
  return {
    offerIdHex: o.offerIdHex,
    invoiceId: o.invoiceId,
    netAmount: formatMoney(o.netAmount),
    discountAmount: formatMoney(o.discountAmount),
    discountBps: o.discountBps,
    expiresAt: o.expiresAt.toISOString(),
    chainStatus: o.chainStatus,
    txCreate: o.txCreate,
    txAccept: o.txAccept,
    txReclaim: o.txReclaim,
    contractId: o.contractId,
    createdAt: o.createdAt.toISOString(),
    acceptedAt: o.acceptedAt === null ? null : o.acceptedAt.toISOString(),
  };
}

export function toAttachmentDto(a: Attachment): z.output<typeof AttachmentSchema> {
  return { id: a.id, kind: a.kind, mime: a.mime, sizeBytes: a.sizeBytes };
}

export interface InvoiceViewDeps {
  companies: CompanyRepository;
  offers: OfferRepository;
  attachments: AttachmentRepository;
  clock: Clock;
}

/** Builds the full invoice view (parties, documents, current offer, display status). */
export async function toInvoiceDto(
  deps: InvoiceViewDeps,
  invoice: Invoice,
): Promise<z.output<typeof InvoiceSchema>> {
  const [supplier, buyer, offers, attachments] = await Promise.all([
    loadCompany(deps.companies, invoice.supplierId),
    loadCompany(deps.companies, invoice.buyerId),
    deps.offers.byInvoice(invoice.id),
    deps.attachments.listByInvoice(invoice.id),
  ]);
  const offer = currentOffer(offers);
  return parseOutput(InvoiceSchema, {
    id: invoice.id,
    supplier: toPublicCompany(supplier),
    buyer: toPublicCompany(buyer),
    series: invoice.series,
    number: invoice.number,
    faceAmount: formatMoney(invoice.faceAmount),
    currency: invoice.currency,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    longerTermAgreed: invoice.longerTermAgreed,
    maxDiscountBps: invoice.maxDiscountBps,
    status: invoice.status,
    displayStatus: displayStatus(invoice, offer, deps.clock.now()),
    rejectionReason: invoice.rejectionReason,
    attachments: attachments.map(toAttachmentDto),
    offer: offer === null ? null : toOfferDto(offer),
    createdAt: invoice.createdAt.toISOString(),
  });
}

/**
 * True when one of the invoice's `failed` offers is open or accepted on chain: it still
 * holds or has paid funds, so it counts as active. Fails closed: an unreadable chain gives
 * CHAIN_UNAVAILABLE instead of allowing a second offer or a cancellation.
 */
export async function failedOfferLiveOnChain(
  chain: ChainReader,
  offers: readonly Offer[],
): Promise<boolean> {
  for (const o of offers) {
    if (o.chainStatus !== 'failed') continue;
    let onChain: Awaited<ReturnType<ChainReader['getOffer']>>;
    try {
      onChain = await chain.getOffer(o.offerIdHex);
    } catch {
      throw new DomainError('CHAIN_UNAVAILABLE');
    }
    if (onChain !== null && (onChain.status === 'open' || onChain.status === 'accepted')) {
      return true;
    }
  }
  return false;
}
