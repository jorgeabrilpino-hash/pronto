/**
 * Money helpers. Amounts are decimal strings with up to 7 decimals (the API contract)
 * and scaled bigint (1.0000000 = 10_000_000n) for arithmetic. Never `Number`.
 */
export const SCALE = 7;
const UNIT = 10n ** BigInt(SCALE);
const NNBSP = '\u202f';

/** "985.5" -> 9855000000n. Throws on malformed input. */
export function parseMoney(value: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,7}))?$/.exec(value.trim());
  if (!m) throw new RangeError(`Invalid amount: ${value}`);
  const whole = m[1] ?? '0';
  const frac = (m[2] ?? '').padEnd(SCALE, '0');
  return BigInt(whole) * UNIT + BigInt(frac);
}

/** 9855000000n -> "985.5" (canonical API string, trailing zeros trimmed). */
export function toMoneyString(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / UNIT;
  const frac = (abs % UNIT).toString().padStart(SCALE, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

function groupThousands(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
}

/**
 * Display format (es-PE): thin space for thousands, comma decimal.
 * Whole amounts have no decimals ("1 000"); otherwise 2 to 7 decimals ("985,50").
 */
export function formatAmount(value: string | bigint): string {
  const s = typeof value === 'bigint' ? toMoneyString(value) : toMoneyString(parseMoney(value));
  const [whole = '0', frac] = s.split('.');
  const grouped = groupThousands(whole);
  if (!frac) return grouped;
  return `${grouped},${frac.padEnd(2, '0')}`;
}

/** "985 USDC" for visible text. */
export function formatUsdc(value: string | bigint): string {
  return `${formatAmount(value)} USDC`;
}

/** Plain text for aria-label so screen readers read the full amount. */
export function ariaAmount(value: string | bigint): string {
  return `${formatAmount(value).replaceAll(NNBSP, '')} USDC`;
}

/** floor(face * bps / 10_000) in 1e-7 units: same rounding as the API (favours the supplier). */
export function discountFromBps(face: bigint, bps: number): bigint {
  return (face * BigInt(bps)) / 10_000n;
}

export function netFromBps(face: bigint, bps: number): bigint {
  return face - discountFromBps(face, bps);
}

/** Simple annualized cost in bps, half-up. Mirrors the API's `annualizedBps`. */
export function annualizedBps(discount: bigint, net: bigint, days: number): number {
  if (net <= 0n || days <= 0) return 0;
  const num = discount * 365n * 10_000n;
  const den = net * BigInt(days);
  return Number((2n * num + den) / (2n * den));
}
