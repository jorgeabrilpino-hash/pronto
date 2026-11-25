import type { ComponentType } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useCompany } from '@/api/session';
import { IconClock, IconHome, IconList, IconPlus, IconUser, IconWallet } from '@/components/icons';
import { ShellContext } from '@/components/Screen';
import { centralAction, profileOf, TAB_ROOTS } from './centralAction';

type Icon = ComponentType<{ size?: number }>;
interface TabItem {
  to: string;
  label: string;
  icon: Icon;
}

const LEFT: TabItem[] = [
  { to: '/app', label: 'Inicio', icon: IconHome },
  { to: '/facturas', label: 'Facturas', icon: IconList },
];
const RIGHT: TabItem[] = [
  { to: '/actividad', label: 'Actividad', icon: IconClock },
  { to: '/perfil', label: 'Perfil', icon: IconUser },
];

function Tab({ to, label, icon: I }: TabItem) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
          isActive ? 'text-ink' : 'text-muted'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`flex h-7 w-12 items-center justify-center rounded-full border-2 ${
              isActive ? 'border-ink bg-ink text-card' : 'border-transparent'
            }`}
          >
            <I size={18} />
          </span>
          {label}
        </>
      )}
    </NavLink>
  );
}

function BottomNav() {
  const company = useCompany();
  const { search } = useLocation();
  const action = centralAction(profileOf(company), search);
  const ActionIcon = action.icon === 'new' ? IconPlus : IconWallet;
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto grid w-full max-w-[480px] grid-cols-5 items-end border-t-2 border-ink bg-card px-1 pb-[max(6px,env(safe-area-inset-bottom))] pt-1.5 sm:border-x-2"
    >
      {LEFT.map((t) => (
        <Tab key={t.to} {...t} />
      ))}
      <Link
        to={action.to}
        className="flex flex-col items-center gap-1 whitespace-nowrap text-[11px] font-bold text-ink"
      >
        <span className="hard -mt-7 flex size-14 items-center justify-center rounded-full border-2 border-ink bg-signal">
          <ActionIcon size={26} />
        </span>
        {action.label}
      </Link>
      {RIGHT.map((t) => (
        <Tab key={t.to} {...t} />
      ))}
    </nav>
  );
}

/** Signed-in frame: one phone column; the bottom bar only on the root tabs. */
export function AppShell() {
  const { pathname } = useLocation();
  const nav = TAB_ROOTS.includes(pathname);
  return (
    <ShellContext.Provider value={nav}>
      <div className={nav ? 'pb-24' : ''}>
        <Outlet />
      </div>
      {nav ? <BottomNav /> : null}
    </ShellContext.Provider>
  );
}
