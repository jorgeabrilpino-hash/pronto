import { createContext, type ReactNode, useContext } from 'react';
import { Link, useNavigate } from 'react-router';
import { IconBack } from './icons';
import { Logo } from './Logo';

/** True inside the signed-in shell (sidebar or bottom nav provides the frame). */
export const ShellContext = createContext(false);

export function TestnetChip() {
  return (
    <Link
      to="/red"
      className="label inline-flex min-h-8 items-center border-2 border-ink bg-stellar px-2.5 text-ink"
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
          className="hard flex size-11 shrink-0 items-center justify-center border-2 border-ink bg-card"
        >
          <IconBack />
        </button>
      ) : null}
      <h1 className="display min-w-0 flex-1 text-[30px]">{title}</h1>
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
  /** Use the full content width (dashboards, tables). */
  wide?: boolean;
  children: ReactNode;
}

/** Page frame. Inside the shell it only adds the header; alone it brings its own column. */
export function Screen({ title, back = true, right, footer, wide = false, children }: ScreenProps) {
  const inShell = useContext(ShellContext);
  const width = wide ? 'max-w-[1080px]' : 'max-w-[720px]';
  return (
    <div className={`mx-auto flex w-full flex-col ${width} ${inShell ? '' : 'min-h-dvh'}`}>
      <TopBar title={title} back={back} right={right} />
      <main className="flex flex-1 flex-col gap-5 px-4 pb-8 pt-2">{children}</main>
      {footer ? <Footer>{footer}</Footer> : null}
    </div>
  );
}

export function Footer({ children }: { children: ReactNode }) {
  const inShell = useContext(ShellContext);
  return (
    <div
      className={`sticky z-10 flex flex-col gap-1 border-t-2 border-ink bg-paper px-4 pb-3 pt-3 lg:bottom-0 lg:border-t-0 lg:pb-6 ${
        inShell
          ? 'bottom-[calc(64px+env(safe-area-inset-bottom))]'
          : 'bottom-0 pb-[max(16px,env(safe-area-inset-bottom))]'
      }`}
    >
      {children}
    </div>
  );
}

/** Public screen without a title bar (welcome, onboarding). */
export function Plain({
  children,
  footer,
  inverted = false,
}: {
  children: ReactNode;
  footer?: ReactNode;
  inverted?: boolean;
}) {
  return (
    <div className={`min-h-dvh ${inverted ? 'bg-ink text-paper' : ''}`}>
      <div className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col">
        <div className="flex items-center justify-between px-4 pt-5">
          <Logo inverted={inverted} />
          <TestnetChip />
        </div>
        <main className="flex flex-1 flex-col gap-5 px-4 pb-6 pt-8">{children}</main>
        {footer ? <Footer>{footer}</Footer> : null}
      </div>
    </div>
  );
}
