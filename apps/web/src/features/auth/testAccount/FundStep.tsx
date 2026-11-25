import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { prepareTestAccount } from '@/chain/testAccount';
import { Button } from '@/components/Button';
import { ErrorNotice } from '@/components/ErrorNotice';
import { IconCheck, IconCopy, IconExternal, IconSpinner } from '@/components/icons';
import { Screen } from '@/components/Screen';
import { nextRoute, signIn } from '../signIn';
import { TestNotice } from './Notice';

const STATUS = {
  working: 'Preparando tu cuenta…',
  ready: 'Cuenta lista: XLM para comisiones y USDC activado',
  failed: 'No pudimos preparar la cuenta',
};

export function FundStep({ address }: { address: string }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<keyof typeof STATUS>('working');
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt re-runs the preparation
  useEffect(() => {
    setStatus('working');
    setError(null);
    prepareTestAccount(address)
      .then(() => setStatus('ready'))
      .catch((e) => {
        setError(e);
        setStatus('failed');
      });
  }, [address, attempt]);

  async function enter() {
    setBusy(true);
    try {
      navigate(nextRoute(await signIn()), { replace: true });
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Fondos de prueba"
      back={false}
      footer={
        <Button
          onClick={enter}
          loading={busy}
          loadingLabel="Entrando…"
          disabled={status === 'working'}
        >
          Entrar
        </Button>
      }
    >
      <TestNotice />
      <p className="flex items-center gap-2 font-semibold" aria-live="polite">
        {status === 'working' ? <IconSpinner /> : status === 'ready' ? <IconCheck /> : null}
        {STATUS[status]}
      </p>
      {error ? <ErrorNotice error={error} onAction={() => setAttempt((n) => n + 1)} /> : null}
      <section className="flex flex-col gap-3 rounded-card border-2 border-ink bg-card p-4">
        <h2 className="font-bold">Pide USDC de prueba</h2>
        <p className="code break-all text-sm">{address}</p>
        <Button
          variant="secondary"
          onClick={() => {
            void navigator.clipboard?.writeText(address);
            setCopied(true);
          }}
        >
          <IconCopy size={18} />
          {copied ? 'Dirección copiada' : 'Copiar mi dirección'}
        </Button>
        <a
          href="https://faucet.circle.com"
          target="_blank"
          rel="noreferrer"
          className="hard inline-flex min-h-11 items-center justify-center gap-2 rounded-card border-2 border-ink bg-card px-5 text-[15px] font-semibold"
        >
          Ir al grifo de Circle
          <IconExternal size={16} />
        </a>
      </section>
    </Screen>
  );
}
