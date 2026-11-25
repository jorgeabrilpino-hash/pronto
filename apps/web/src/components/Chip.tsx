import type { ReactNode } from 'react';

type Tone = 'neutral' | 'green' | 'gold' | 'danger' | 'muted-outline';

const tones: Record<Tone, string> = {
  neutral: 'border-ink bg-card text-ink',
  green: 'border-green bg-card text-green',
  gold: 'border-ink bg-signal text-ink',
  danger: 'border-danger bg-card text-danger',
  'muted-outline': 'border-ink bg-transparent text-ink',
};

/** Outlined status pill: always icon + text, never color alone. */
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
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border-2 px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}
