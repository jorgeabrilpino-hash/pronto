/**
 * Calendar helpers. Business dates are ISO dates (YYYY-MM-DD) in Peru time
 * (America/Lima, UTC-5 all year, no daylight saving time).
 */

export const LIMA_OFFSET_MINUTES = -300;
const MS_PER_DAY = 86_400_000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function epochDay(iso: string): number {
  if (!ISO_DATE_RE.test(iso)) throw new RangeError(`Invalid ISO date: ${iso}`);
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new RangeError(`Invalid ISO date: ${iso}`);
  return Math.round(ms / MS_PER_DAY);
}

/** Today's date in Lima for the given instant. */
export function todayIso(now: Date): string {
  return new Date(now.getTime() + LIMA_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(fromIso: string, toIso: string): number {
  return epochDay(toIso) - epochDay(fromIso);
}

/** Instant when the given Lima calendar day starts (00:00 in Lima). */
export function startOfDayLima(iso: string): Date {
  return new Date(epochDay(iso) * MS_PER_DAY - LIMA_OFFSET_MINUTES * 60_000);
}

/** Drops milliseconds: contract timestamps have second precision. */
export function truncateToSeconds(d: Date): Date {
  return new Date(Math.floor(d.getTime() / 1000) * 1000);
}

export function addSeconds(d: Date, seconds: number): Date {
  return new Date(d.getTime() + seconds * 1000);
}
