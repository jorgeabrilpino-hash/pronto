import type { ReactNode } from 'react';

interface Props {
  body: ReactNode;
  stub?: ReactNode;
  /** `dark` is the black hero ticket with a paper-colored figure. */
  tone?: 'light' | 'dark';
}

/** Ticket: 2 px border, hard shadow, notches and a dashed perforation between body and stub. */
export function ReceiptCard({ body, stub, tone = 'light' }: Props) {
  const dark = tone === 'dark';
  return (
    <section
      className={`relative border-2 border-ink shadow-hard ${
        dark ? 'bg-ink text-paper' : 'bg-card text-ink'
      }`}
    >
      <div className="flex flex-col gap-2 px-5 pb-5 pt-5">{body}</div>
      {stub ? (
        <>
          <div className="relative h-0">
            <span className="absolute -left-3.5 -top-3 size-6 rounded-full border-2 border-ink bg-paper" />
            <span className="absolute -right-3.5 -top-3 size-6 rounded-full border-2 border-ink bg-paper" />
            <div
              className={`mx-4 border-t-2 border-dashed ${dark ? 'border-paper/50' : 'border-ink/40'}`}
            />
          </div>
          <div className="flex flex-col gap-2 px-5 pb-5 pt-5">{stub}</div>
        </>
      ) : null}
    </section>
  );
}

type StampTone = 'paid' | 'reserved' | 'chain';

const STAMP: Record<StampTone, string> = {
  paid: 'border-green text-green bg-card',
  reserved: 'border-ink text-ink bg-signal',
  chain: 'border-ink text-ink bg-stellar',
};

/** Rotated mono stamp: PAGADO, RESERVADO, EN LA RED. */
export function Stamp({
  children = 'Pagado',
  tone = 'paid',
  tilt = false,
}: {
  children?: string;
  tone?: StampTone;
  tilt?: boolean;
}) {
  return (
    <span
      className={`label inline-block border-2 px-2 py-0.5 ${STAMP[tone]} ${
        tilt ? '-rotate-4 [animation:stamp-in_200ms_ease-out]' : ''
      }`}
    >
      {children}
    </span>
  );
}
