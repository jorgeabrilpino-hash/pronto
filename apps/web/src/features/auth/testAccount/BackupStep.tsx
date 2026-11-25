import { useState } from 'react';
import { Button } from '@/components/Button';
import { IconCopy } from '@/components/icons';
import { Screen } from '@/components/Screen';
import { localWallet } from '@/wallet/local';
import { TestNotice } from './Notice';

/** One-time step: the key stays hidden until the owner asks to see it. */
export function BackupStep({ pin, onDone }: { pin: string; onDone: () => void }) {
  const [shown, setShown] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  async function copy() {
    await navigator.clipboard?.writeText(await localWallet.recoveryKey(pin));
    setCopied(true);
  }

  return (
    <Screen
      title="Tu clave"
      back={false}
      footer={
        <Button onClick={onDone} disabled={!saved}>
          Continuar
        </Button>
      }
    >
      <TestNotice />
      <p className="text-[15px]">
        Copia tu clave de recuperación y guárdala. Si borras los datos del navegador o cambias de
        celular, es la única forma de recuperar esta cuenta. No la compartas.
      </p>
      <p className="code break-all rounded-card border-2 border-ink bg-card p-3 text-sm">
        {shown ?? '•••• •••• •••• •••• •••• ••••'}
      </p>
      <div className="flex gap-3">
        <Button
          variant="secondary"
          onClick={async () => setShown(shown ? null : await localWallet.recoveryKey(pin))}
        >
          {shown ? 'Ocultar' : 'Mostrar clave'}
        </Button>
        <Button variant="secondary" onClick={copy}>
          <IconCopy size={18} />
          {copied ? 'Copiada' : 'Copiar'}
        </Button>
      </div>
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="size-6 accent-ink"
        />
        <span className="font-semibold">Ya guardé mi clave de recuperación</span>
      </label>
    </Screen>
  );
}
