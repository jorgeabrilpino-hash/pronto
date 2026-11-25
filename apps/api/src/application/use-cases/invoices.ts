import {
  CreateInvoiceRequestSchema,
  DomainError,
  type InvoiceSchema,
  ListInvoicesQuerySchema,
  RejectInvoiceRequestSchema,
  ResendInvoiceRequestSchema,
  type Role,
  type z,
} from '@pronto/shared';
import {
  ACTION_ACTOR,
  assertDifferentParties,
  assertInvoiceDates,
  currentOffer,
  displayStatus,
  type InvoiceAction,
  isActiveOffer,
  nextStatus,
} from '../../domain/invoice';
import type { Invoice, Offer } from '../../domain/types';
import { parseInvoiceRef, parseMoney } from '../../domain/values';
import type {
  AttachmentRepository,
  AuditLog,
  ChainReader,
  Clock,
  CompanyRepository,
  IdGenerator,
  InvoicePatch,
  InvoiceRepository,
  OfferRepository,
} from '../ports';
import {
  type Actor,
  failedOfferLiveOnChain,
  loadCompany,
  loadInvoice,
  parseInput,
  requireActor,
  requireCompany,
  requireProfile,
  roleOn,
  toInvoiceDto,
} from './shared';

type InvoiceDto = z.output<typeof InvoiceSchema>;

export interface InvoiceDeps {
  companies: CompanyRepository;
  invoices: InvoiceRepository;
  offers: OfferRepository;
  attachments: AttachmentRepository;
  clock: Clock;
  audit: AuditLog;
}

/** Re-reads chain state of offers shown in lists (ReconcileOffer implements it). */
export interface OfferRefresher {
  refreshQuietly(offerIdHex: string, actor: Actor): Promise<void>;
}

function attachmentInvalid(reason: string): DomainError {
  return new DomainError('ATTACHMENT_INVALID', 'Invalid attachment', { reason });
}

/** 07 SendInvoice: the supplier creates a `sent` invoice for a registered buyer. */
export class SendInvoice {
  constructor(private readonly deps: InvoiceDeps & { ids: IdGenerator }) {}

  async execute(actor: Actor | null, input: unknown): Promise<InvoiceDto> {
    const me = await requireCompany(this.deps.companies, actor);
    requireProfile(me, 'supplier');
    const req = parseInput(CreateInvoiceRequestSchema, input);
    const buyer = await loadCompany(this.deps.companies, req.buyerCompanyId);
    assertDifferentParties(me.id, buyer.id);
    const ref = parseInvoiceRef(req.series, req.number);
    const now = this.deps.clock.now();
    assertInvoiceDates(req, now);
    if (await this.deps.invoices.duplicateExists(me.id, ref.series, ref.number)) {
      throw new DomainError('INVOICE_DUPLICATE', undefined, {
        series: ref.series,
        number: ref.number,
      });
    }
    await this.checkAttachments(me.id, req.attachmentIds);

    const invoice: Invoice = {
      id: this.deps.ids.uuid(),
      supplierId: me.id,
      buyerId: buyer.id,
      series: ref.series,
      number: ref.number,
      faceAmount: parseMoney(req.faceAmount),
      currency: 'USDC',
      issueDate: req.issueDate,
      dueDate: req.dueDate,
      longerTermAgreed: req.longerTermAgreed,
      maxDiscountBps: req.maxDiscountBps ?? null,
      status: 'sent',
      rejectionReason: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.invoices.insert(invoice);
    await this.deps.attachments.linkToInvoice(req.attachmentIds, invoice.id);
    await this.deps.audit.record({
      kind: 'invoice.sent',
      actorCompanyId: me.id,
      subject: invoice.id,
      data: { buyerId: buyer.id },
    });
    return toInvoiceDto(this.deps, invoice);
  }

  /** Ready, owned by the supplier, not used yet; one document plus an optional XML. */
  private async checkAttachments(ownerId: string, ids: string[]): Promise<void> {
    if (new Set(ids).size !== ids.length) throw attachmentInvalid('repeated attachment');
    let documents = 0;
    let xmls = 0;
    for (const id of ids) {
      const a = await this.deps.attachments.byId(id);
      if (a === null || a.ownerCompanyId !== ownerId) throw attachmentInvalid('not found');
      if (a.status !== 'ready') throw attachmentInvalid('upload not completed');
      if (a.invoiceId !== null) throw attachmentInvalid('already used');
      if (a.kind === 'xml') xmls++;
      else documents++;
    }
    if (documents > 1 || xmls > 1) throw attachmentInvalid('one document plus an optional XML');
  }
}

/**
 * 08 ListInvoices: the caller's invoices for one role, with the computed status.
 * Buyers do not see rejected or cancelled invoices (FLUJO_V2 section 4).
 * Offers still pending or open are refreshed from the chain first (throttled per offer).
 */
export class ListInvoices {
  constructor(
    private readonly deps: InvoiceDeps,
    private readonly refresher?: OfferRefresher,
  ) {}

  async execute(actor: Actor | null, input: unknown): Promise<InvoiceDto[]> {
    const me = await requireCompany(this.deps.companies, actor);
    const q = parseInput(ListInvoicesQuerySchema, input);
    const caller = requireActor(actor);
    const invoices = (await this.deps.invoices.listFor(me.id, q.role)).filter(
      (i) => q.role === 'supplier' || (i.status !== 'rejected' && i.status !== 'cancelled'),
    );
    const out: InvoiceDto[] = [];
    for (const invoice of invoices) {
      if (this.refresher !== undefined) {
        for (const o of await this.deps.offers.byInvoice(invoice.id)) {
          if (o.chainStatus === 'pending' || o.chainStatus === 'open') {
            await this.refresher.refreshQuietly(o.offerIdHex, caller);
          }
        }
      }
      const offer = currentOffer(await this.deps.offers.byInvoice(invoice.id));
      const status = displayStatus(invoice, offer, this.deps.clock.now());
      if (q.status === undefined || q.status === status) {
        out.push(await toInvoiceDto(this.deps, invoice));
      }
    }
    return out;
  }
}

/** 08 GetInvoice: only its supplier and its buyer. */
export class GetInvoice {
  constructor(private readonly deps: InvoiceDeps) {}

  async execute(actor: Actor | null, invoiceId: string): Promise<InvoiceDto> {
    const me = await requireCompany(this.deps.companies, actor);
    const invoice = await loadInvoice(this.deps.invoices, invoiceId);
    roleOn(invoice, me.id);
    return toInvoiceDto(this.deps, invoice);
  }
}

const AUDIT_KIND: Record<InvoiceAction, string> = {
  confirm: 'invoice.confirmed',
  reject: 'invoice.rejected',
  cancel: 'invoice.cancelled',
  resend: 'invoice.resent',
};

/**
 * Applies one state machine transition with optimistic locking: the update presents the
 * version that was read, so a concurrent second transition fails with INVALID_STATE.
 */
async function transition(
  deps: InvoiceDeps,
  actor: Actor | null,
  invoiceId: string,
  action: InvoiceAction,
  extra: InvoicePatch = {},
  validate?: (invoice: Invoice, role: Role) => Promise<void>,
  liveOfferCheck?: (offers: Offer[]) => Promise<boolean>,
): Promise<InvoiceDto> {
  const me = await requireCompany(deps.companies, actor);
  requireProfile(me, ACTION_ACTOR[action]);
  const invoice = await loadInvoice(deps.invoices, invoiceId);
  const role = roleOn(invoice, me.id);
  const offers = await deps.offers.byInvoice(invoice.id);
  // The chain is consulted only for the right role, so a wrong role still gets FORBIDDEN.
  const hasActiveOffer =
    offers.some(isActiveOffer) ||
    (liveOfferCheck !== undefined &&
      role === ACTION_ACTOR[action] &&
      (await liveOfferCheck(offers)));
  const to = nextStatus(invoice.status, action, role, hasActiveOffer);
  if (validate !== undefined) await validate(invoice, role);
  const updated = await deps.invoices.update(invoice.id, invoice.version, { ...extra, status: to });
  if (updated === null) {
    throw new DomainError('INVALID_STATE', 'The invoice changed meanwhile', { invoiceId });
  }
  await deps.audit.record({
    kind: AUDIT_KIND[action],
    actorCompanyId: me.id,
    subject: invoice.id,
    data: { from: invoice.status, to },
  });
  return toInvoiceDto(deps, updated);
}

/** 09 ConfirmInvoice: buyer only, from `sent`. */
export class ConfirmInvoice {
  constructor(private readonly deps: InvoiceDeps) {}
  execute(actor: Actor | null, invoiceId: string): Promise<InvoiceDto> {
    return transition(this.deps, actor, invoiceId, 'confirm');
  }
}

/** 09 RejectInvoice ("No coincide"): buyer only, from `sent`, with a reason. */
export class RejectInvoice {
  constructor(private readonly deps: InvoiceDeps) {}
  async execute(actor: Actor | null, invoiceId: string, input: unknown): Promise<InvoiceDto> {
    const { reason } = parseInput(RejectInvoiceRequestSchema, input);
    return transition(this.deps, actor, invoiceId, 'reject', { rejectionReason: reason });
  }
}

/**
 * 10 CancelInvoice: supplier only, never with a pending, open or accepted offer. A `failed`
 * offer that is open or accepted on chain also blocks it (OFFER_EXISTS); if the chain cannot
 * be read for that check the call fails closed with CHAIN_UNAVAILABLE.
 */
export class CancelInvoice {
  constructor(private readonly deps: InvoiceDeps & { chain: ChainReader }) {}
  execute(actor: Actor | null, invoiceId: string): Promise<InvoiceDto> {
    return transition(this.deps, actor, invoiceId, 'cancel', {}, undefined, (offers) =>
      failedOfferLiveOnChain(this.deps.chain, offers),
    );
  }
}

/** 10 EditAndResend: supplier corrects a rejected invoice; it goes back to `sent`. */
export class EditAndResend {
  constructor(private readonly deps: InvoiceDeps) {}

  async execute(actor: Actor | null, invoiceId: string, input: unknown): Promise<InvoiceDto> {
    const req = parseInput(ResendInvoiceRequestSchema, input);
    const patch: InvoicePatch = { rejectionReason: null };
    return transition(this.deps, actor, invoiceId, 'resend', patch, async (invoice) => {
      const ref = parseInvoiceRef(req.series ?? invoice.series, req.number ?? invoice.number);
      const dates = {
        issueDate: req.issueDate ?? invoice.issueDate,
        dueDate: req.dueDate ?? invoice.dueDate,
        longerTermAgreed: req.longerTermAgreed ?? invoice.longerTermAgreed,
      };
      assertInvoiceDates(dates, this.deps.clock.now());
      const refChanged = ref.series !== invoice.series || ref.number !== invoice.number;
      if (
        refChanged &&
        (await this.deps.invoices.duplicateExists(invoice.supplierId, ref.series, ref.number))
      ) {
        throw new DomainError('INVOICE_DUPLICATE', undefined, { ...ref });
      }
      Object.assign(patch, ref, dates);
      if (req.faceAmount !== undefined) patch.faceAmount = parseMoney(req.faceAmount);
      if (req.maxDiscountBps !== undefined) patch.maxDiscountBps = req.maxDiscountBps;
    });
  }
}
