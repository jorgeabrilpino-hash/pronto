/** Pronto mark (a black block with an orange P) plus the serif wordmark. */
export function Logo({ inverted = false, size = 32 }: { inverted?: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Pronto">
        <title>Pronto</title>
        <rect width="32" height="32" fill={inverted ? '#F2EEE3' : '#0E0E0C'} />
        <path
          d="M11 24V8h6.2a4.6 4.6 0 0 1 0 9.2H11"
          fill="none"
          stroke="#FF5A1F"
          strokeWidth="3.4"
          strokeLinecap="square"
        />
      </svg>
      <span
        className={`display text-[28px] ${inverted ? 'text-paper' : 'text-ink'}`}
        aria-hidden="true"
      >
        Pronto
      </span>
    </span>
  );
}
