const NBSP = '\u00a0';

/** 150 -> "1,5 %"; 100 -> "1 %". */
export function formatBps(bps: number): string {
  const pct = bps / 100;
  const text = Number.isInteger(pct)
    ? String(pct)
    : pct.toFixed(2).replace(/0$/, '').replace('.', ',');
  return `${text}${NBSP}%`;
}

/** 1853 -> "18,5 %". */
export function formatAnnual(bps: number): string {
  return formatBps(Math.round(bps / 10) * 10);
}

const dateFormat = new Intl.DateTimeFormat('es-PE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "2026-12-01" or ISO datetime -> "1 dic 2026" (UTC calendar day). */
export function formatDate(value: string): string {
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return dateFormat.format(d).replace(/\./g, '');
}

export function formatInvoiceRef(series: string, number: string): string {
  return `${series}-${number.padStart(3, '0')}`;
}

export function shortWallet(address: string): string {
  return `${address.slice(0, 1)}…${address.slice(-4)}`;
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 6)}…${hash.slice(-6)}`;
}

/** Whole days between today and an ISO datetime/date (floor, never negative). */
export function daysUntil(value: string, now: Date = new Date()): number {
  const target = new Date(value.length === 10 ? `${value}T23:59:59Z` : value).getTime();
  return Math.max(0, Math.floor((target - now.getTime()) / 86_400_000));
}

/** Whole days between two ISO dates (date-only). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
