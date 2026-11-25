import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useSession } from '@/api/session';
import { Button } from '@/components/Button';
import { ErrorNotice } from '@/components/ErrorNotice';
import { ReceiptCard, Stamp } from '@/components/ReceiptCard';
import { Plain } from '@/components/Screen';
import { env } from '@/lib/env';
import { DEMO_ACCOUNTS } from '@/mocks/addresses';
import { currentMockAccount, selectMockAccount } from '@/wallet/mock';
import { enterDemo, exitDemo, isDemo, nextRoute, signIn } from './signIn';

/** Welcome: who it is for, an example ticket, and three clear ways in. */
export function Welcome() {
  const navigate = useNavigate();
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [demo, setDemo] = useState(currentMockAccount());
  const demoOn = isDemo();

  if (session) return <Navigate to={nextRoute(session)} replace />;

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      navigate(nextRoute(await signIn()), { replace: true });
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  return (
    <Plain
      footer={
        <>
          <Button onClick={connect} loading={busy} loadingLabel="Conectando…">
            {demoOn ? 'Entrar a la demostración' : 'Conectar mi billetera'}
          </Button>
          {demoOn ? (
            <Button variant="secondary" onClick={exitDemo}>
              Salir de la demostración
            </Button>
          ) : (
            <>
              <Link
                to="/billetera"
                className="hard inline-flex min-h-11 items-center justify-center border-2 border-ink bg-card px-5 text-[15px] font-semibold"
              >
                No tengo billetera
              </Link>
              {env.useMocks ? null : (
                <Button variant="text" onClick={enterDemo}>
                  Probar demostración
                </Button>
              )}
            </>
          )}
        </>
      }
    >
      <p className="label text-muted">Facturas pagadas antes de tiempo</p>
      <h1 className="display text-[56px] sm:text-[72px]">
        Cobra hoy lo que te pagan en 30&nbsp;días.
      </h1>
      <p className="max-w-[44ch] text-lg">
        Si vendes, cobras antes con un descuento claro. Si compras, ahorras pagando antes. El pago
        se hace en una sola operación, en la red Stellar.
      </p>
      <ReceiptCard
        tone="dark"
        body={
          <>
            <div className="flex items-start justify-between">
              <span className="label text-paper/60">Pago total de F001-123</span>
              <Stamp tilt>Pagado</Stamp>
            </div>
            <p className="display text-[64px]">985,00</p>
            <p className="tabular text-sm text-paper/70">USDC · descuento 1,5 %</p>
          </>
        }
      />
      {demoOn ? (
        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="label mb-2 text-muted">Cuenta de prueba</legend>
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
                className={`min-h-11 border-2 border-ink px-4 text-[15px] font-semibold ${
                  demo === a.address ? 'bg-ink text-paper' : 'bg-card'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
      {error ? <ErrorNotice error={error} onAction={connect} /> : null}
    </Plain>
  );
}
