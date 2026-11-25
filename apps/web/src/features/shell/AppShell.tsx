import type { ComponentType } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useCompany, useSession } from '@/api/session';
import {
  IconCalendar,
  IconGlobe,
  IconHome,
  IconInfo,
  IconList,
  IconLogout,
  IconPlus,
  IconQr,
  IconScan,
  IconUser,
  IconUsers,
} from '@/components/icons';
import { Logo } from '@/components/Logo';
import { ShellContext } from '@/components/Screen';
import { signOut } from '@/features/auth/signIn';
import { shortWallet } from '@/lib/format';

type Icon = ComponentType<{ size?: number }>;
interface Item {
  to: string;
  label: string;
  icon: Icon;
  end?: boolean;
}

const GROUPS: Array<{ label: string; items: Item[] }> = [
  {
    label: 'Explorar',
    items: [
      { to: '/app', label: 'Resumen', icon: IconHome, end: true },
      { to: '/facturas', label: 'Facturas', icon: IconList, end: true },
      { to: '/calendario', label: 'Calendario', icon: IconCalendar },
    ],
  },
  {
    label: 'Actuar',
    items: [
      { to: '/facturas/nueva', label: 'Nueva factura', icon: IconPlus },
      { to: '/mi-codigo', label: 'Mi código', icon: IconQr },
      { to: '/mi-codigo?scan=1', label: 'Escanear', icon: IconScan },
    ],
  },
  {
    label: 'Confianza',
    items: [
      { to: '/contactos', label: 'Contactos', icon: IconUsers },
      { to: '/red', label: 'Red', icon: IconGlobe },
      { to: '/como-funciona', label: 'Cómo funciona', icon: IconInfo },
      { to: '/ajustes', label: 'Ajustes', icon: IconUser },
    ],
  },
];

const TABS: Item[] = [
  { to: '/app', label: 'Inicio', icon: IconHome, end: true },
  { to: '/facturas', label: 'Facturas', icon: IconList },
  { to: '/mi-codigo', label: 'Código', icon: IconQr },
  { to: '/ajustes', label: 'Perfil', icon: IconUser },
];

function Sidebar() {
  const company = useCompany();
  const session = useSession();
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col gap-6 overflow-y-auto bg-ink px-4 py-6 text-paper lg:flex">
      <Logo inverted />
      <nav aria-label="Principal" className="flex flex-1 flex-col gap-6">
        {GROUPS.map((g) => (
          <div key={g.label} className="flex flex-col gap-1">
            <span className="label px-2 pb-1 text-paper/50">{g.label}</span>
            {g.items.map(({ to, label, icon: I, end }) => (
              <NavLink
                key={label}
                to={to}
                end={end ?? false}
                className={({ isActive }) =>
                  `flex min-h-11 items-center gap-3 border-2 px-2 text-[15px] font-medium ${
                    isActive && !to.includes('?')
                      ? 'border-paper bg-paper text-ink'
                      : 'border-transparent text-paper hover:border-paper/40'
                  }`
                }
              >
                <I size={18} />
                {label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="flex flex-col gap-3 border-t-2 border-paper/30 pt-4">
        <p className="truncate text-sm font-medium">{company?.legalName}</p>
        <p className="tabular text-xs text-paper/60">{shortWallet(session?.address ?? '')}</p>
        <button
          type="button"
          onClick={() => void signOut().then(() => window.location.assign('/'))}
          className="flex min-h-11 items-center gap-3 border-2 border-paper/40 px-2 text-[15px] font-medium text-paper"
        >
          <IconLogout size={18} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}

function BottomNav() {
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-4 border-t-2 border-ink bg-paper pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {TABS.map(({ to, label, icon: I, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end ?? false}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-0.5 ${
              isActive ? 'bg-ink text-paper' : 'text-ink'
            }`
          }
        >
          <I size={22} />
          <span className="label text-[10px]">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

/** Signed-in frame: black sidebar on desktop, bottom navigation on phones. */
export function AppShell() {
  return (
    <ShellContext.Provider value={true}>
      <div className="min-h-dvh pb-16 lg:pb-0 lg:pl-60">
        <Sidebar />
        <Outlet />
        <BottomNav />
      </div>
    </ShellContext.Provider>
  );
}
