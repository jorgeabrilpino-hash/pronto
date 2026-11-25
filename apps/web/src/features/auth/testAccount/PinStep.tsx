import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { Button } from '@/components/Button';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { setWalletKind } from '@/wallet';
import { localWallet } from '@/wallet/local';
import { PIN_PATTERN } from '@/wallet/pinPattern';
import { TestNotice } from './Notice';

const digits = (v: string) => v.replace(/\D/g, '');

export function PinStep({ onDone }: { onDone: (address: string, pin: string) => void }) {
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [exists, setExists] = useState(false);

  useEffect(() => {
    localWallet
      .address()
      .then((a) => setExists(a !== null))
      .catch(setError);
  }, []);

  if (exists && !busy) return <Navigate to="/entrar" replace />;
  const valid = PIN_PATTERN.test(pin);

  async function create() {
    setTouched(true);
    if (!valid || pin !== again) return;
    setBusy(true);
    try {
      const address = await localWallet.create(pin);
      setWalletKind('local');
      onDone(address, pin);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Cuenta de prueba"
      back="/entrar"
      footer={
        <Button onClick={create} loading={busy} loadingLabel="Creando…">
          Crear cuenta
        </Button>
      }
    >
      <TestNotice />
      <p className="text-[15px] text-muted">
        Elige un PIN de 6 dígitos. Protege tu clave en este dispositivo.
      </p>
      <Field
        label="PIN de 6 dígitos"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={pin}
        onChange={(e) => setPin(digits(e.target.value))}
        error={touched && !valid ? 'Usa exactamente 6 dígitos' : undefined}
      />
      <Field
        label="Repite tu PIN"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={again}
        onChange={(e) => setAgain(digits(e.target.value))}
        error={touched && pin !== again ? 'Los PIN no coinciden' : undefined}
      />
      {error ? <ErrorNotice error={error} onAction={create} /> : null}
    </Screen>
  );
}
