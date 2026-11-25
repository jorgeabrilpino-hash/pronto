import type { Amount } from './types';

/**
 * Finance functions on scaled integers (7 decimals). Fixed rounding rules:
 *  - discount from bps: face * bps / 10_000 rounded half up to whole cents (2 decimals),
 *    so money reads like money; the net is face minus that discount;
 *  - annualized cost: simple interest, (discount / net) * (365 / days) in bps,
 *    computed from the rounded discount and net, rounded half up to the nearest bps.
 * Canonical case: face 1000, 150 bps, 30 days -> net 985.00, annualized 1853 bps (18.5 %).
 * Example: face 2400.50 at 150 bps -> exact 36.0075 -> discount 36.01, net 2364.49.
 */

export const BPS_DENOMINATOR = 10_000n;
export const DAYS_PER_YEAR = 365n;
/** One cent (0.01) in 1e-7 units. */
export const CENT = 100_000n;

/** Discount for a rate in bps, rounded half up to whole cents. */
export function discountFromBps(face: Amount, bps: number): Amount {
  if (face <= 0n) throw new RangeError('face must be positive');
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new RangeError('bps out of range');
  const num = face * BigInt(bps);
  const den = BPS_DENOMINATOR * CENT;
  const cents = (2n * num + den) / (2n * den);
  return cents * CENT;
}

/** Net amount the buyer reserves for a discount in bps: face minus the rounded discount. */
export function netFromDiscount(face: Amount, bps: number): Amount {
  return face - discountFromBps(face, bps);
}

/** Discount amount = face - net. */
export function discount(face: Amount, net: Amount): Amount {
  return face - net;
}

/** Simple annualized cost in bps, rounded half up. Requires net > 0 and days > 0. */
export function annualizedBps(discountAmount: Amount, net: Amount, days: number): number {
  if (net <= 0n) throw new RangeError('net must be positive');
  if (!Number.isInteger(days) || days <= 0) throw new RangeError('days must be a positive integer');
  if (discountAmount < 0n) throw new RangeError('discount must be non-negative');
  const num = discountAmount * DAYS_PER_YEAR * BPS_DENOMINATOR;
  const den = net * BigInt(days);
  return Number((2n * num + den) / (2n * den));
}
