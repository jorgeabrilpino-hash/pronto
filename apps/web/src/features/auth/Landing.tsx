import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useSession } from '@/api/session';
import { Button } from '@/components/Button';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Plain, TestnetChip } from '@/components/Screen';
import { env } from '@/lib/env';
import { DEMO_ACCOUNTS } from '@/mocks/addresses';
import { currentMockAccount, selectMockAccount } from '@/wallet/mock';
import { signIn } from './signIn';

/** View 1: one phrase and Entrar. */
export function Landing() {
  const navigate = useNavigate();
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [demo, setDemo] = useState(currentMockAccount());

  if (session) return <Navigate to={session.company ? '/app' : '/registro'} replace />;

  async function enter() {
    setBusy(true);
    setError(null);
    try {
      const s = await signIn();
      navigate(s.company ? '/app' : '/registro', { replace: true });
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  return (
    <Plain
      footer={
        <Button onClick={enter} loading={busy} loadingLabel="Entrando…">
          Entrar
        </Button>
      }
    >
      <div className="flex justify-end">
        <TestnetChip />
      </div>
      <div className="mt-10 flex flex-1 flex-col gap-4">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-muted">
          Pronto
        </p>
        <h1 className="text-[32px] font-bold leading-tight">
          Cobra tu factura hoy, no en 30 días.
        </h1>
        <p className="text-muted">
          Tu cliente te ofrece pagar antes del vencimiento, con un descuento claro. Tú decides.
        </p>
        {error ? <ErrorNotice error={error} onAction={enter} /> : null}
      </div>
      {env.useMocks ? (
        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-sm text-muted">Demostración: cuenta de prueba</legend>
          <div className="flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.id}
                type="button"
                aria-pressed={demo === a.address}
                onClick={() => {
                  selectMockAccount(a.address);
                  setDemo(a.address);
                }}
                className={`min-h-11 rounded-full border px-4 text-[15px] ${
                  demo === a.address
                    ? 'border-ink bg-ink text-ivory'
                    : 'border-line bg-ivory text-ink active:bg-pressed'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
    </Plain>
  );
}
