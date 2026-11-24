import type { ReactNode } from 'react';

type Tone = 'neutral' | 'green' | 'gold' | 'danger' | 'muted-outline';

const tones: Record<Tone, string> = {
  neutral: 'border-line bg-ivory text-muted',
  green: 'border-green text-green bg-green-tint',
  gold: 'border-gold bg-gold/25 text-ink',
  danger: 'border-danger bg-danger-tint text-danger',
  'muted-outline': 'border-line bg-transparent text-muted',
};

/** Flat status label: always icon + text, never color alone. */
export function Chip({
  tone = 'neutral',
  icon,
  children,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[13px] font-medium ${tones[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}
