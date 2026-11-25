import type { Profile } from '@pronto/shared';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '@/api/endpoints';
import { sessionStore, useSession } from '@/api/session';
import { Button, LinkButton } from '@/components/Button';
import { ErrorNotice } from '@/components/ErrorNotice';
import { IconChevron } from '@/components/icons';
import { Screen } from '@/components/Screen';
import { ProfileCards } from '@/features/auth/ProfileCards';
import { signOut } from '@/features/auth/signIn';
import { shortWallet } from '@/lib/format';

const LINKS: Array<[string, string]> = [
  ['/mi-codigo', 'Mi código'],
  ['/contactos', 'Contactos'],
  ['/red', 'Pronto en la red'],
  ['/como-funciona', 'Cómo funciona'],
];

/** Perfil: company data, public profile, links and sign out. */
export function Settings() {
  const session = useSession();
  const navigate = useNavigate();
  const company = session?.company;
  const changeProfile = useMutation({
    mutationFn: (profile: Profile) => api.updateSettings({ profile }),
    onSuccess: (c) => sessionStore.setCompany(c),
  });
  const toggle = useMutation({
    mutationFn: (fichaPublica: boolean) => api.updateSettings({ fichaPublica }),
    onSuccess: (c) => sessionStore.setCompany(c),
  });
  if (!company || !session) return null;

  return (
    <Screen title="Perfil" back={false}>
      <dl className="flex flex-col gap-3 rounded-card border border-line bg-ivory p-4 text-[15px]">
        {[
          ['Empresa', company.legalName],
          ['RUC', company.ruc],
          ['Rubro', company.sector],
          ['Código', company.code],
          ['Billetera', shortWallet(session.address)],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-muted">{k}</dt>
            <dd className="tabular text-right">{v}</dd>
          </div>
        ))}
      </dl>
      <label className="flex min-h-14 items-center justify-between gap-3 rounded-card border border-line bg-ivory px-4">
        <span>
          <span className="block font-semibold">Ficha pública</span>
          <span className="text-sm text-muted">Quien escanee tu QR verá tu empresa.</span>
        </span>
        <input
          type="checkbox"
          checked={company.fichaPublica}
          disabled={toggle.isPending}
          onChange={(e) => toggle.mutate(e.target.checked)}
          className="size-6 accent-ink"
        />
      </label>
      {toggle.isError ? <ErrorNotice error={toggle.error} /> : null}
      <ProfileCards
        value={company.profile}
        onChange={(p) => changeProfile.mutate(p)}
        disabled={changeProfile.isPending}
      />
      {changeProfile.isError ? <ErrorNotice error={changeProfile.error} /> : null}
      <nav aria-label="Tu cuenta" className="flex flex-col gap-3">
        {LINKS.map(([to, label]) => (
          <LinkButton key={to} to={to} variant="secondary" className="justify-between">
            {label}
            <IconChevron size={18} />
          </LinkButton>
        ))}
      </nav>
      <Button
        variant="secondary"
        onClick={async () => {
          await signOut();
          navigate('/', { replace: true });
        }}
      >
        Cerrar sesión
      </Button>
    </Screen>
  );
}
