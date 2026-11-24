import type { ChainStatus, DisplayStatus, InvoiceStatus, Role } from '@pronto/shared';
import { DomainError } from '@pronto/shared';
import { addSeconds, daysBetween, startOfDayLima, todayIso, truncateToSeconds } from './dates';
import type { Invoice, Offer } from './types';

// ---- State machine (BACKEND_PLAN section 4) --------------------------------

export type InvoiceAction = 'confirm' | 'reject' | 'cancel' | 'resend';

interface TransitionRule {
  from: InvoiceStatus;
  action: InvoiceAction;
  to: InvoiceStatus;
  actor: Role;
  /** Only allowed when the invoice has no pending, open or accepted offer. */
  requiresNoActiveOffer: boolean;
}

/**
 * | From      | To                              | Who                          |
 * | sent      | confirmed · rejected · cancelled | buyer · buyer · supplier     |
 * | rejected  | sent · cancelled                 | supplier                     |
 * | confirmed | cancelled                        | supplier, only with no active offer |
 */
export const TRANSITIONS: readonly TransitionRule[] = [
  {
    from: 'sent',
    action: 'confirm',
    to: 'confirmed',
    actor: 'buyer',
    requiresNoActiveOffer: false,
  },
  { from: 'sent', action: 'reject', to: 'rejected', actor: 'buyer', requiresNoActiveOffer: false },
  {
    from: 'sent',
    action: 'cancel',
    to: 'cancelled',
    actor: 'supplier',
    requiresNoActiveOffer: true,
  },
  {
    from: 'rejected',
    action: 'resend',
    to: 'sent',
    actor: 'supplier',
    requiresNoActiveOffer: true,
  },
  {
    from: 'rejected',
    action: 'cancel',
    to: 'cancelled',
    actor: 'supplier',
    requiresNoActiveOffer: true,
  },
  {
    from: 'confirmed',
    action: 'cancel',
    to: 'cancelled',
    actor: 'supplier',
    requiresNoActiveOffer: true,
  },
];

/** Role that performs each action, whatever the current state. */
export const ACTION_ACTOR: Record<InvoiceAction, Role> = {
  confirm: 'buyer',
  reject: 'buyer',
  cancel: 'supplier',
  resend: 'supplier',
};

/**
 * Returns the next status or throws:
 * FORBIDDEN when the actor has the wrong role, OFFER_EXISTS when an active offer blocks
 * the change, INVALID_STATE when the transition does not exist from the current status.
 */
export function nextStatus(
  from: InvoiceStatus,
  action: InvoiceAction,
  actor: Role,
  hasActiveOffer: boolean,
): InvoiceStatus {
  if (ACTION_ACTOR[action] !== actor) {
    throw new DomainError('FORBIDDEN', `Only the ${ACTION_ACTOR[action]} can ${action}`);
  }
  const rule = TRANSITIONS.find((t) => t.from === from && t.action === action);
  if (rule === undefined) {
    throw new DomainError('INVALID_STATE', `Cannot ${action} from ${from}`, { from, action });
  }
  if (rule.requiresNoActiveOffer && hasActiveOffer) {
    throw new DomainError('OFFER_EXISTS', 'The invoice has an active offer');
  }
  return rule.to;
}

// ---- Offers ------------------------------------------------------------------

const ACTIVE_CHAIN_STATUSES: readonly ChainStatus[] = ['pending', 'open', 'accepted'];

export function isActiveOffer(offer: Pick<Offer, 'chainStatus'>): boolean {
  return ACTIVE_CHAIN_STATUSES.includes(offer.chainStatus);
}

/** The offer that represents the invoice: the active one, else the most recent. */
export function currentOffer(offers: readonly Offer[]): Offer | null {
  const active = offers.find(isActiveOffer);
  if (active !== undefined) return active;
  let latest: Offer | null = null;
  for (const o of offers) {
    if (latest === null || o.createdAt.getTime() > latest.createdAt.getTime()) latest = o;
  }
  return latest;
}

// ---- Business rules ----------------------------------------------------------

/** Days after issue beyond which the supplier must declare `longerTermAgreed` (Ley 31362). */
export const LEGAL_TERM_DAYS = 30;
export const OFFER_VALIDITY_DAYS = [3, 7, 15] as const;
export type OfferValidityDays = (typeof OFFER_VALIDITY_DAYS)[number];

export interface InvoiceDates {
  issueDate: string;
  dueDate: string;
  longerTermAgreed: boolean;
}

/**
 * Invoice rules: due date after issue date, issue date not in the future, not overdue,
 * and `longerTermAgreed` when the term exceeds 30 days.
 */
export function assertInvoiceDates(d: InvoiceDates, now: Date): void {
  const today = todayIso(now);
  if (daysBetween(d.issueDate, d.dueDate) <= 0) {
    throw new DomainError('VALIDATION_ERROR', 'dueDate must be after issueDate', {
      field: 'dueDate',
    });
  }
  if (daysBetween(today, d.issueDate) > 0) {
    throw new DomainError('VALIDATION_ERROR', 'issueDate cannot be in the future', {
      field: 'issueDate',
    });
  }
  if (isOverdue(d.dueDate, now)) {
    throw new DomainError('INVOICE_OVERDUE', 'The invoice is overdue', { dueDate: d.dueDate });
  }
  if (daysBetween(d.issueDate, d.dueDate) > LEGAL_TERM_DAYS && !d.longerTermAgreed) {
    throw new DomainError('VALIDATION_ERROR', 'A term above 30 days must be agreed in writing', {
      field: 'longerTermAgreed',
    });
  }
}

/** Overdue when the due date is earlier than today (Lima). Due today is not overdue. */
export function isOverdue(dueDate: string, now: Date): boolean {
  return daysBetween(todayIso(now), dueDate) < 0;
}

export function assertDifferentParties(supplierId: string, buyerId: string): void {
  if (supplierId === buyerId) {
    throw new DomainError('SELF_INVOICE', 'Supplier and buyer must be different companies');
  }
}

/**
 * Offer expiry: now + 3, 7 or 15 days (second precision), and it must end before the
 * original due date starts (00:00 Lima). Throws INVOICE_OVERDUE when the due date passed,
 * VALIDATION_ERROR when the chosen validity does not fit before the due date.
 */
export function offerExpiry(validityDays: number, dueDate: string, now: Date): Date {
  if (!(OFFER_VALIDITY_DAYS as readonly number[]).includes(validityDays)) {
    throw new DomainError('VALIDATION_ERROR', 'Validity must be 3, 7 or 15 days', {
      field: 'validityDays',
    });
  }
  if (daysBetween(todayIso(now), dueDate) <= 0) {
    throw new DomainError('INVOICE_OVERDUE', 'The due date has been reached', { dueDate });
  }
  const expiresAt = truncateToSeconds(addSeconds(now, validityDays * 86_400));
  if (expiresAt.getTime() >= startOfDayLima(dueDate).getTime()) {
    throw new DomainError('VALIDATION_ERROR', 'The offer must end before the due date', {
      field: 'validityDays',
    });
  }
  return expiresAt;
}

/** Discount above the supplier's maximum is a warning, never an error. */
export function offerWarnings(
  discountBps: number,
  maxDiscountBps: number | null,
): Array<'DISCOUNT_ABOVE_SUPPLIER_MAX'> {
  return maxDiscountBps !== null && discountBps > maxDiscountBps
    ? ['DISCOUNT_ABOVE_SUPPLIER_MAX']
    : [];
}

// ---- Display status ------------------------------------------------------------

/**
 * Status the user sees, computed from the invoice and its current offer (never stored).
 * confirmed + open offer -> offer_open (offer_expired once now >= expiresAt);
 * confirmed + accepted -> collected; pending, reclaimed or failed offers -> confirmed.
 */
export function displayStatus(
  invoice: Pick<Invoice, 'status'>,
  offer: Pick<Offer, 'chainStatus' | 'expiresAt'> | null,
  now: Date,
): DisplayStatus {
  if (invoice.status !== 'confirmed' || offer === null) return invoice.status;
  switch (offer.chainStatus) {
    case 'accepted':
      return 'collected';
    case 'open':
      return now.getTime() >= offer.expiresAt.getTime() ? 'offer_expired' : 'offer_open';
    default:
      return 'confirmed';
  }
}
