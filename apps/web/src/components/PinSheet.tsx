import { useState, useSyncExternalStore } from 'react';
import { pinStore } from '@/wallet/pin';
import { PIN_PATTERN } from '@/wallet/pinPattern';
import { Button } from './Button';
import { Field } from './Field';
import { Sheet } from './Sheet';

/** Asks for the PIN whenever the local test account is locked and has to sign. */
export function PinSheet() {
  const request = useSyncExternalStore(pinStore.subscribe, pinStore.get, pinStore.get);
  const [pin, setPin] = useState('');
  if (!request) return null;
  const close = () => {
    setPin('');
    request.reject();
  };
  const send = () => {
    if (!PIN_PATTERN.test(pin)) return;
    setPin('');
    request.resolve(pin);
  };
  return (
    <Sheet open title="Tu PIN" onClose={close}>
      <Field
        label="PIN de 6 dígitos"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        onKeyDown={(e) => e.key === 'Enter' && send()}
      />
      <Button onClick={send} disabled={!PIN_PATTERN.test(pin)}>
        Desbloquear
      </Button>
      <Button variant="text" onClick={close}>
        Cancelar
      </Button>
    </Sheet>
  );
}
