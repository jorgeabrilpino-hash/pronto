import { DomainError } from '@pronto/shared';
import type { Amount } from './types';

/**
 * Value objects of the core. Pure functions: no Node APIs, no adapters, no I/O.
 * Every parser throws a DomainError with a stable code when the input is invalid.
 */

// ---- RUC -------------------------------------------------------------------

const RUC_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

/** Module 11 check digit over the first 10 digits: (11 - sum mod 11) mod 10. */
export function rucCheckDigit(first10: string): number {
  let sum = 0;
  for (let i = 0; i < RUC_WEIGHTS.length; i++) {
    sum += Number(first10.charAt(i)) * (RUC_WEIGHTS[i] ?? 0);
  }
  return (11 - (sum % 11)) % 10;
}

export function isValidRuc(value: string): boolean {
  if (!/^\d{11}$/.test(value)) return false;
  return rucCheckDigit(value.slice(0, 10)) === Number(value.charAt(10));
}

/** Returns the RUC unchanged or throws RUC_INVALID. */
export function parseRuc(value: string): string {
  if (!isValidRuc(value)) throw new DomainError('RUC_INVALID', 'Invalid RUC', { ruc: value });
  return value;
}

// ---- Company code ----------------------------------------------------------

export const COMPANY_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const COMPANY_CODE_LENGTH = 6;
const COMPANY_CODE_RE = /^PR-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

/**
 * Builds `PR-` plus 6 characters. `randomIndex(n)` must return a uniform integer in [0, n);
 * the adapter supplies a cryptographic source so the domain stays free of Node APIs.
 */
export function generateCompanyCode(randomIndex: (n: number) => number): string {
  let out = 'PR-';
  for (let i = 0; i < COMPANY_CODE_LENGTH; i++) {
    const idx = randomIndex(COMPANY_CODE_ALPHABET.length);
    if (!Number.isInteger(idx) || idx < 0 || idx >= COMPANY_CODE_ALPHABET.length) {
      throw new RangeError('randomIndex out of range');
    }
    out += COMPANY_CODE_ALPHABET.charAt(idx);
  }
  return out;
}

/** Accepts lower case and surrounding spaces; returns the canonical form or throws. */
export function parseCompanyCode(value: string): string {
  const v = value.trim().toUpperCase();
  if (!COMPANY_CODE_RE.test(v)) {
    throw new DomainError('VALIDATION_ERROR', 'Invalid company code', { code: value });
  }
  return v;
}

// ---- Money -----------------------------------------------------------------

/** 7 decimals: 1.0000000 = 10_000_000n. */
export const MONEY_DECIMALS = 7;
export const MONEY_SCALE = 10_000_000n;
const MONEY_RE = /^(0|[1-9]\d{0,12})(?:\.(\d{1,7}))?$/;

/** Parses a decimal string (shared MoneySchema format) into scaled bigint. Never uses Number. */
export function parseMoney(value: string): Amount {
  const m = MONEY_RE.exec(value);
  if (m === null) throw new DomainError('VALIDATION_ERROR', 'Invalid amount', { amount: value });
  const whole = m[1] ?? '0';
  const frac = (m[2] ?? '').padEnd(MONEY_DECIMALS, '0');
  return BigInt(whole) * MONEY_SCALE + BigInt(frac);
}

/** Formats scaled bigint as a decimal string with exactly 7 decimals ("985.0000000"). */
export function formatMoney(amount: Amount): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const whole = abs / MONEY_SCALE;
  const frac = (abs % MONEY_SCALE).toString().padStart(MONEY_DECIMALS, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${frac}`;
}

export function addMoney(a: Amount, b: Amount): Amount {
  return a + b;
}

export function subMoney(a: Amount, b: Amount): Amount {
  return a - b;
}

/** amount * bps / 10_000, rounded toward zero (floor for non-negative amounts). */
export function mulBpsFloor(amount: Amount, bps: number): Amount {
  if (!Number.isInteger(bps)) throw new RangeError('bps must be an integer');
  return (amount * BigInt(bps)) / 10_000n;
}

// ---- Invoice reference -----------------------------------------------------

export interface InvoiceRef {
  series: string;
  number: string;
}

/**
 * Canonical invoice number: 1 to 8 digits without leading zeros ("0123" -> "123"), or null
 * when the input is not digits or is all zeros. Matches the DB check `^[1-9][0-9]{0,7}$`.
 */
export function canonicalInvoiceNumber(number: string): string | null {
  const n = number.trim();
  if (!/^\d{1,8}$/.test(n)) return null;
  const canonical = n.replace(/^0+/, '');
  return canonical === '' ? null : canonical;
}

/** Series: 4 characters A-Z/0-9 (e.g. F001). Number: canonical, 1 to 8 digits, not zero. */
export function parseInvoiceRef(series: string, number: string): InvoiceRef {
  const s = series.trim().toUpperCase();
  const n = canonicalInvoiceNumber(number);
  if (!/^[A-Z0-9]{4}$/.test(s) || n === null) {
    throw new DomainError('VALIDATION_ERROR', 'Invalid invoice reference', { series, number });
  }
  return { series: s, number: n };
}

export function formatInvoiceRef(ref: InvoiceRef): string {
  return `${ref.series}-${ref.number}`;
}

// ---- Stellar address -------------------------------------------------------

/** Shape only (G + 55 base32 chars). The checksum is validated by the adapter. */
export function isStellarAddress(value: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(value);
}

export function parseStellarAddress(value: string): string {
  if (!isStellarAddress(value)) {
    throw new DomainError('VALIDATION_ERROR', 'Invalid Stellar address', { address: value });
  }
  return value;
}
