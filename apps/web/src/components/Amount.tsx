import { ariaAmount, formatAmount, formatUsdc } from '@/lib/money';

/** Mono amount that screen readers read in full ("985 USDC"), never loose digits. */
export function Amount({
  value,
  currency = false,
  className = '',
}: {
  value: string | bigint;
  currency?: boolean;
  className?: string;
}) {
  return (
    <span className={`tabular ${className}`}>
      <span className="sr-only">{ariaAmount(value)}</span>
      <span aria-hidden="true">{currency ? formatUsdc(value) : formatAmount(value)}</span>
    </span>
  );
}
