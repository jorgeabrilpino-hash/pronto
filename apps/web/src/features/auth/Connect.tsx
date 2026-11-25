import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useSession } from '@/api/session';
import { Button, LinkButton } from '@/components/Button';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Screen } from '@/components/Screen';
import { setWalletKind, type WalletKind } from '@/wallet';
import { nextRoute, signIn } from './signIn';

async function hasTestAccount(): Promise<boolean> {
  try {
    const { localWallet } = await import('@/wallet/local');
    return (await localWallet.address()) !== null;
  } catch {
    return false;
  }
}

function Option({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-card border-2 border-ink bg-card p-4">
      <h2 className="font-bold">{title}</h2>
      <p className="text-[15px] text-muted">{text}</p>
    </div>
  );
}

/** Entrar = connect a wallet: your own one, or a testnet account created here. */
export function Connect() {
  const navigate = useNavigate();
  const session = useSession();
  const [local, setLocal] = useState(false);
  const [busy, setBusy] = useState<WalletKind | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    void hasTestAccount().then(setLocal);
  }, []);

  if (session) return <Navigate to={nextRoute(session)} replace />;

  async function enter(kind: WalletKind) {
    setBusy(kind);
    setError(null);
    setWalletKind(kind);
    try {
      navigate(nextRoute(await signIn()), { replace: true });
    } catch (e) {
      setError(e);
      setBusy(null);
    }
  }

  const own = (
    <Button
      key="kit"
      variant={local ? 'secondary' : 'primary'}
      onClick={() => enter('kit')}
      loading={busy === 'kit'}
      loadingLabel="Conectando…"
    >
      Conectar mi billetera
    </Button>
  );
  const test = local ? (
    <Button
      key="local"
      onClick={() => enter('local')}
      loading={busy === 'local'}
      loadingLabel="Entrando…"
    >
      Entrar con mi cuenta de prueba
    </Button>
  ) : (
    <LinkButton key="new" to="/cuenta-prueba" variant="secondary">
      Crear mi cuenta de prueba
    </LinkButton>
  );

  return (
    <Screen title="Entrar" back="/" footer={local ? [test, own] : [own, test]}>
      <Option
        title="Ya tengo billetera"
        text="Varial o Freighter. Debe estar en la red Testnet. Firmas un mensaje de acceso: no mueve dinero."
      />
      <Option
        title="Aún no tengo"
        text="Creamos una cuenta de prueba en este dispositivo, protegida con un PIN. Sin valor real."
      />
      {error ? <ErrorNotice error={error} onAction={() => enter('kit')} /> : null}
    </Screen>
  );
}
