import type { ReactNode } from 'react';

/** Receipt ticket: notches and a dashed perforation between body and stub (DESIGN.md 5.1). */
export function ReceiptCard({ body, stub }: { body: ReactNode; stub?: ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-card border border-line bg-ivory">
      <div className="flex flex-col gap-2 px-5 pb-5 pt-5">{body}</div>
      {stub ? (
        <>
          <div className="relative h-0">
            <span className="absolute -left-3 -top-3 size-6 rounded-full border border-line bg-paper" />
            <span className="absolute -right-3 -top-3 size-6 rounded-full border border-line bg-paper" />
            <div className="mx-4 border-t-[1.5px] border-dashed border-line" />
          </div>
          <div className="flex flex-col gap-2 px-5 pb-5 pt-5">{stub}</div>
        </>
      ) : null}
    </section>
  );
}

export function Stamp({
  children = 'Pagado',
  tilt = false,
}: {
  children?: string;
  tilt?: boolean;
}) {
  return (
    <span
      className={`inline-block rounded-[4px] border-[1.5px] border-green bg-green-tint px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-green ${
        tilt ? '-rotate-4 [animation:stamp-in_200ms_ease-out]' : ''
      }`}
    >
      {children}
    </span>
  );
}
