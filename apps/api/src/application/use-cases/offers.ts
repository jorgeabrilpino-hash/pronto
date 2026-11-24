import {
  DomainError,
  NetworkSummarySchema,
  OfferDraftResponseSchema,
  OfferIdHexSchema,
  OfferProofSchema,
  OfferSchema,
  PrepareOfferRequestSchema,
  ReconcileRequestSchema,
  type z,
} from '@pronto/shared';
import { daysBetween, todayIso } from '../../domain/dates';
import { annualizedBps, discount, netFromDiscount } from '../../domain/finance';
import { isActiveOffer, offerExpiry, offerWarnings } from '../../domain/invoice';
import type { ChainOffer, Company, Invoice, Offer } from '../../domain/types';
import { formatMoney } from '../../domain/values';
import type {
  AuditLog,
  ChainReader,
  Clock,
  CompanyRepository,
  IdGenerator,
  InvoiceRepository,
  OfferPatch,
  OfferRepository,
  RateLimiter,
} from '../ports';
import type { OfferRefresher } from './invoices';
import {
  type Actor,
  enforceRateLimit,
  loadCompany,
  loadInvoice,
  parseInput,
  parseOutput,
  requireCompany,
  roleOn,
  toOfferDto,
} from './shared';

type OfferDto = z.output<typeof OfferSchema>;

/** A pending offer not seen on chain after this long becomes `failed` (section 8). */
export const PENDING_TIMEOUT_SECONDS = 600;
/** The chain is read at most once per this interval per offer (section 8). */
export const RECONCILE_MIN_INTERVAL_SECONDS = 15;
/** Explicit reconcile calls per company (section 12). */
export const RECONCILE_RATE = { windowSeconds: 60, max: 60 } as const;

export interface OfferDeps {
  companies: CompanyRepository;
  invoices: InvoiceRepository;
  offers: OfferRepository;
  chain: ChainReader;
  clock: Clock;
  audit: AuditLog;
}

async function loadOffer(offers: OfferRepository, offerIdHex: string): Promise<Offer> {
  const id = parseInput(OfferIdHexSchema, offerIdHex);
  const offer = await offers.byOfferId(id);
  if (offer === null) throw new DomainError('INVOICE_NOT_FOUND', 'Offer not found', { offerIdHex });
  return offer;
}

/**
 * 11 PrepareOffer: buyer only, on a confirmed invoice without an active offer.
 * Computes net and expiry, draws a random 32-byte offer id and stores it `pending`.
 */
export class PrepareOffer {
  constructor(private readonly deps: OfferDeps & { ids: IdGenerator }) {}

  async execute(
    actor: Actor | null,
    invoiceId: string,
    input: unknown,
  ): Promise<z.output<typeof OfferDraftResponseSchema>> {
    const me = await requireCompany(this.deps.companies, actor);
    const req = parseInput(PrepareOfferRequestSchema, input);
    const invoice = await loadInvoice(this.deps.invoices, invoiceId);
    if (roleOn(invoice, me.id) !== 'buyer') {
      throw new DomainError('FORBIDDEN', 'Only the buyer can prepare an offer');
    }
    if (invoice.status !== 'confirmed') {
      throw new DomainError('INVALID_STATE', 'The invoice must be confirmed', {
        status: invoice.status,
      });
    }
    if ((await this.deps.offers.byInvoice(invoice.id)).some(isActiveOffer)) {
      throw new DomainError('OFFER_EXISTS');
    }
    const now = this.deps.clock.now();
    const expiresAt = offerExpiry(req.validityDays, invoice.dueDate, now);
    const net = netFromDiscount(invoice.faceAmount, req.discountBps);
    const discountAmount = discount(invoice.faceAmount, net);
    if (discountAmount <= 0n || net <= 0n) {
      throw new DomainError('VALIDATION_ERROR', 'The discount rounds to zero', {
        field: 'discountBps',
      });
    }
    const days = daysBetween(todayIso(now), invoice.dueDate);
    const supplier = await loadCompany(this.deps.companies, invoice.supplierId);

    const offer: Offer = {
      id: this.deps.ids.uuid(),
      invoiceId: invoice.id,
      offerIdHex: this.deps.ids.offerId(),
      netAmount: net,
      discountAmount,
      discountBps: req.discountBps,
      expiresAt,
      chainStatus: 'pending',
      txCreate: null,
      txAccept: null,
      txReclaim: null,
      contractId: this.deps.chain.contractId(),
      lastCheckedAt: null,
      createdAt: now,
    };
    await this.deps.offers.insertPending(offer);
    await this.deps.audit.record({
      kind: 'offer.prepared',
      actorCompanyId: me.id,
      subject: offer.offerIdHex,
      data: { invoiceId: invoice.id, discountBps: req.discountBps },
    });
    return parseOutput(OfferDraftResponseSchema, {
      ...toOfferDto(offer),
      annualizedBps: annualizedBps(discountAmount, net, days),
      supplierWallet: supplier.wallet,
      warnings: offerWarnings(req.discountBps, invoice.maxDiscountBps),
    });
  }
}

/**
 * 12 ReconcileOffer (section 8). Reads the current contract state first, verifies it
 * against the draft and only then writes. The browser's word is never trusted.
 * - Terminal offers (accepted, reclaimed, failed) are returned unchanged: idempotent.
 * - The chain is read at most once per 15 s per offer; inside that window the stored
 *   state is returned without a read.
 * - Mismatch (contract id, wallets, amounts, expiry) -> `failed` + audit + CHAIN_MISMATCH.
 * - `pending` not on chain after 10 minutes -> `failed`.
 * - The tx hash is evidence: stored only when getTransaction reports SUCCESS.
 */
export class ReconcileOffer implements OfferRefresher {
  constructor(private readonly deps: OfferDeps & { rateLimiter: RateLimiter }) {}

  async execute(actor: Actor | null, offerIdHex: string, input: unknown = {}): Promise<OfferDto> {
    const me = await requireCompany(this.deps.companies, actor);
    const { txHash } = parseInput(ReconcileRequestSchema, input);
    const offer = await loadOffer(this.deps.offers, offerIdHex);
    const invoice = await loadInvoice(this.deps.invoices, offer.invoiceId);
    roleOn(invoice, me.id);
    await enforceRateLimit(
      this.deps.rateLimiter,
      `reconcile:${me.id}`,
      RECONCILE_RATE.windowSeconds,
      RECONCILE_RATE.max,
    );
    return parseOutput(
      OfferSchema,
      toOfferDto(await this.reconcile(offer, invoice, me.id, txHash)),
    );
  }

  /** Used when lists open: same rules, errors are swallowed so a list always renders. */
  async refreshQuietly(offerIdHex: string, actor: Actor): Promise<void> {
    try {
      const offer = await loadOffer(this.deps.offers, offerIdHex);
      const invoice = await loadInvoice(this.deps.invoices, offer.invoiceId);
      await this.reconcile(offer, invoice, actor.companyId, undefined);
    } catch (e) {
      if (!(e instanceof DomainError)) throw e;
    }
  }

  private async reconcile(
    offer: Offer,
    invoice: Invoice,
    actorCompanyId: string | null,
    txHash: string | undefined,
  ): Promise<Offer> {
    if (!isActiveOffer(offer) || offer.chainStatus === 'accepted') return offer;
    const now = this.deps.clock.now();
    if (
      offer.lastCheckedAt !== null &&
      now.getTime() - offer.lastCheckedAt.getTime() < RECONCILE_MIN_INTERVAL_SECONDS * 1000
    ) {
      return offer;
    }
    if (offer.contractId !== this.deps.chain.contractId()) {
      return this.mismatch(offer, actorCompanyId, ['contractId'], now);
    }

    let onChain: ChainOffer | null;
    try {
      onChain = await this.deps.chain.getOffer(offer.offerIdHex);
    } catch {
      throw new DomainError('CHAIN_UNAVAILABLE');
    }

    if (onChain === null) {
      if (offer.chainStatus === 'open') {
        return this.mismatch(offer, actorCompanyId, ['missing'], now);
      }
      const age = now.getTime() - offer.createdAt.getTime();
      if (age >= PENDING_TIMEOUT_SECONDS * 1000) {
        const failed = await this.deps.offers.update(offer.offerIdHex, {
          chainStatus: 'failed',
          lastCheckedAt: now,
        });
        await this.deps.audit.record({
          kind: 'offer.pending_timeout',
          actorCompanyId,
          subject: offer.offerIdHex,
        });
        return failed;
      }
      return this.deps.offers.update(offer.offerIdHex, { lastCheckedAt: now });
    }

    const [supplier, buyer] = await Promise.all([
      loadCompany(this.deps.companies, invoice.supplierId),
      loadCompany(this.deps.companies, invoice.buyerId),
    ]);
    const bad = mismatchedFields(onChain, offer, invoice, supplier, buyer);
    if (bad.length > 0) return this.mismatch(offer, actorCompanyId, bad, now);

    const patch: OfferPatch = { chainStatus: onChain.status, lastCheckedAt: now };
    if (txHash !== undefined && (await this.txSucceeded(txHash))) {
      if (onChain.status === 'open' && offer.txCreate === null) patch.txCreate = txHash;
      if (onChain.status === 'accepted' && offer.txAccept === null) patch.txAccept = txHash;
      if (onChain.status === 'reclaimed' && offer.txReclaim === null) patch.txReclaim = txHash;
    }
    const updated = await this.deps.offers.update(offer.offerIdHex, patch);
    if (updated.chainStatus !== offer.chainStatus) {
      await this.deps.audit.record({
        kind: 'offer.reconciled',
        actorCompanyId,
        subject: offer.offerIdHex,
        data: { from: offer.chainStatus, to: updated.chainStatus },
      });
    }
    return updated;
  }

  private async txSucceeded(hash: string): Promise<boolean> {
    try {
      return (await this.deps.chain.getTransaction(hash)).status === 'SUCCESS';
    } catch {
      return false;
    }
  }

  private async mismatch(
    offer: Offer,
    actorCompanyId: string | null,
    fields: string[],
    now: Date,
  ): Promise<never> {
    await this.deps.offers.update(offer.offerIdHex, { chainStatus: 'failed', lastCheckedAt: now });
    await this.deps.audit.record({
      kind: 'offer.chain_mismatch',
      actorCompanyId,
      subject: offer.offerIdHex,
      data: { fields },
    });
    throw new DomainError('CHAIN_MISMATCH', 'Chain state does not match the offer', { fields });
  }
}

function mismatchedFields(
  onChain: ChainOffer,
  offer: Offer,
  invoice: Invoice,
  supplier: Company,
  buyer: Company,
): string[] {
  const bad: string[] = [];
  if (onChain.buyer !== buyer.wallet) bad.push('buyer');
  if (onChain.supplier !== supplier.wallet) bad.push('supplier');
  if (onChain.amount !== invoice.faceAmount) bad.push('amount');
  if (onChain.net !== offer.netAmount) bad.push('net');
  if (
    Math.floor(onChain.expiresAt.getTime() / 1000) !== Math.floor(offer.expiresAt.getTime() / 1000)
  )
    bad.push('expiresAt');
  return bad;
}

/** 13 GetOfferProof: data for "Ver en la red"; only the two parties. */
export class GetOfferProof {
  constructor(private readonly deps: OfferDeps) {}

  async execute(
    actor: Actor | null,
    offerIdHex: string,
  ): Promise<z.output<typeof OfferProofSchema>> {
    const me = await requireCompany(this.deps.companies, actor);
    const offer = await loadOffer(this.deps.offers, offerIdHex);
    const invoice = await loadInvoice(this.deps.invoices, offer.invoiceId);
    roleOn(invoice, me.id);
    const [supplier, buyer] = await Promise.all([
      loadCompany(this.deps.companies, invoice.supplierId),
      loadCompany(this.deps.companies, invoice.buyerId),
    ]);
    return parseOutput(OfferProofSchema, {
      ...toOfferDto(offer),
      network: 'testnet',
      invoiceSeries: invoice.series,
      invoiceNumber: invoice.number,
      faceAmount: formatMoney(invoice.faceAmount),
      supplierWallet: supplier.wallet,
      buyerWallet: buyer.wallet,
    });
  }
}

/** 18 GetNetworkSummary: public data for `/red`. */
export class GetNetworkSummary {
  static readonly RECENT_LIMIT = 10;
  constructor(private readonly deps: { offers: OfferRepository; chain: ChainReader }) {}

  async execute(): Promise<z.output<typeof NetworkSummarySchema>> {
    const [stats, ops] = await Promise.all([
      this.deps.offers.stats(),
      this.deps.offers.recentOperations(GetNetworkSummary.RECENT_LIMIT),
    ]);
    return parseOutput(NetworkSummarySchema, {
      network: 'testnet',
      contractId: this.deps.chain.contractId(),
      offersCreated: stats.created,
      offersAccepted: stats.accepted,
      lastOperations: ops.map((o) => ({ kind: o.kind, txHash: o.txHash, at: o.at.toISOString() })),
    });
  }
}
