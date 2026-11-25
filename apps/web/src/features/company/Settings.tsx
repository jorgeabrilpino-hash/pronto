import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '@/api/endpoints';
import { sessionStore, useSession } from '@/api/session';
import { Button } from '@/components/Button';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Screen } from '@/components/Screen';
import { signOut } from '@/features/auth/signIn';
import { shortWallet } from '@/lib/format';

/** View 16: company data, public profile on/off, disconnect. */
export function Settings() {
  const session = useSession();
  const navigate = useNavigate();
  const company = session?.company;
  const toggle = useMutation({
    mutationFn: (next: boolean) => api.updateSettings(next),
    onSuccess: (c) => sessionStore.setCompany(c),
  });
  if (!company || !session) return null;

  return (
    <Screen
      title="Ajustes"
      footer={
        <Button
          variant="secondary"
          onClick={async () => {
            await signOut();
            navigate('/', { replace: true });
          }}
        >
          Desconectar
        </Button>
      }
    >
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
    </Screen>
  );
}
