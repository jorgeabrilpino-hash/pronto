import type { Amount } from './types';
import { mulBpsFloor } from './values';

/**
 * Finance functions on scaled integers (7 decimals). Fixed rounding rules:
 *  - discount from bps: floor(face * bps / 10_000) in 1e-7 units, so the net is never
 *    below the exact value (rounding always favours the supplier);
 *  - annualized cost: simple interest, (discount / net) * (365 / days) in bps,
 *    rounded half up to the nearest integer bps.
 * Canonical case: face 1000, 150 bps, 30 days -> net 985, annualized 1853 bps (18.5 %).
 */

export const BPS_DENOMINATOR = 10_000n;
export const DAYS_PER_YEAR = 365n;

/** Net amount the buyer reserves for a discount in bps. */
export function netFromDiscount(face: Amount, bps: number): Amount {
  if (face <= 0n) throw new RangeError('face must be positive');
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new RangeError('bps out of range');
  return face - mulBpsFloor(face, bps);
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
