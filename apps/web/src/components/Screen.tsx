import { createContext, type ReactNode, useContext } from 'react';
import { Link, useNavigate } from 'react-router';
import { IconBack } from './icons';
import { Logo } from './Logo';

/** True when the bottom navigation is on screen (footers and padding leave room for it). */
export const ShellContext = createContext(false);

/** The app is one phone column, centered on wide screens. */
export const COLUMN = 'mx-auto w-full max-w-[480px] bg-paper sm:border-x-2 sm:border-ink';

export function TestnetChip() {
  return (
    <Link
      to="/red"
      className="inline-flex min-h-8 items-center rounded-full border-2 border-ink bg-stellar px-3 text-xs font-bold text-ink"
    >
      Testnet
    </Link>
  );
}

interface TopBarProps {
  title: string;
  /** `true` goes back in history, a string goes to that path, a function runs. */
  back?: boolean | string | (() => void);
  right?: ReactNode;
}

export function TopBar({ title, back = true, right }: TopBarProps) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-10 flex min-h-16 items-center gap-3 bg-paper px-4 py-2">
      {back ? (
        <button
          type="button"
          aria-label="Volver"
          onClick={() => {
            if (typeof back === 'function') back();
            else if (typeof back === 'string') navigate(back);
            else navigate(-1);
          }}
          className="hard flex size-11 shrink-0 items-center justify-center rounded-card border-2 border-ink bg-card"
        >
          <IconBack />
        </button>
      ) : null}
      <h1 className="display min-w-0 flex-1 text-[22px]">{title}</h1>
      <div className="flex shrink-0 items-center gap-2">{right ?? <TestnetChip />}</div>
    </header>
  );
}

interface ScreenProps {
  title: string;
  back?: boolean | string | (() => void);
  right?: ReactNode;
  /** Fixed bottom area: the single primary action of the screen. */
  footer?: ReactNode;
  children: ReactNode;
}

export function Screen({ title, back = true, right, footer, children }: ScreenProps) {
  const nav = useContext(ShellContext);
  return (
    <div className={`${COLUMN} flex flex-col ${nav ? 'min-h-[calc(100dvh-6rem)]' : 'min-h-dvh'}`}>
      <TopBar title={title} back={back} right={right} />
      <main className="flex flex-1 flex-col gap-4 px-4 pb-6 pt-2">{children}</main>
      {footer ? <Footer>{footer}</Footer> : null}
    </div>
  );
}

export function Footer({ children }: { children: ReactNode }) {
  const nav = useContext(ShellContext);
  return (
    <div
      className={`sticky z-10 flex flex-col gap-3 bg-paper px-4 pt-3 ${
        nav ? 'bottom-24 pb-3' : 'bottom-0 pb-[max(16px,env(safe-area-inset-bottom))]'
      }`}
    >
      {children}
    </div>
  );
}

/** Public screen without a title bar (welcome, onboarding). */
export function Plain({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className={`${COLUMN} flex min-h-dvh flex-col`}>
      <div className="flex items-center justify-between px-4 pt-5">
        <Logo />
        <TestnetChip />
      </div>
      <main className="flex flex-1 flex-col gap-4 px-4 pb-6 pt-8">{children}</main>
      {footer ? <Footer>{footer}</Footer> : null}
    </div>
  );
}
