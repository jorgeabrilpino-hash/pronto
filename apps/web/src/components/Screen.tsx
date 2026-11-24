import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { IconBack } from './icons';

export function TestnetChip() {
  return (
    <Link
      to="/red"
      className="inline-flex min-h-8 items-center rounded-full border border-line bg-ivory px-3 font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-muted"
    >
      Testnet
    </Link>
  );
}

interface TopBarProps {
  title: string;
  /** Show the back arrow: `true` goes back in history, a string goes to that path. */
  back?: boolean | string | (() => void);
  right?: ReactNode;
}

export function TopBar({ title, back = true, right }: TopBarProps) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-1 bg-paper px-2">
      <div className="flex w-11 justify-start">
        {back ? (
          <button
            type="button"
            aria-label="Volver"
            onClick={() => {
              if (typeof back === 'function') back();
              else if (typeof back === 'string') navigate(back);
              else navigate(-1);
            }}
            className="flex size-11 items-center justify-center rounded-full active:bg-pressed"
          >
            <IconBack />
          </button>
        ) : null}
      </div>
      <h1 className="min-w-0 flex-1 truncate text-center text-base font-semibold">{title}</h1>
      <div className="flex min-w-11 justify-end pr-2">{right ?? <TestnetChip />}</div>
    </header>
  );
}

interface ScreenProps {
  title: string;
  back?: boolean | string | (() => void);
  right?: ReactNode;
  /** Fixed bottom area: the single primary button of the screen. */
  footer?: ReactNode;
  children: ReactNode;
}

/** Phone-width column on paper, top bar, scrolling body and a safe-area footer. */
export function Screen({ title, back = true, right, footer, children }: ScreenProps) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-paper">
      <TopBar title={title} back={back} right={right} />
      <main className="flex flex-1 flex-col gap-4 px-4 pb-6 pt-2">{children}</main>
      {footer ? <Footer>{footer}</Footer> : null}
    </div>
  );
}

export function Footer({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 flex flex-col gap-1 bg-paper px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
      {children}
    </div>
  );
}

/** Screen without top bar (landing). */
export function Plain({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-paper">
      <main className="flex flex-1 flex-col gap-4 px-4 pb-6 pt-6">{children}</main>
      {footer ? <Footer>{footer}</Footer> : null}
    </div>
  );
}
