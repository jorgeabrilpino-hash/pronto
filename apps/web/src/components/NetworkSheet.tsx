import { useEffect, useState } from 'react';
import { STEPS } from '@/chain/operation';
import type { OpState } from '@/chain/useChainOp';
import { shortHash } from '@/lib/format';
import { Button } from './Button';
import { ErrorNotice } from './ErrorNotice';
import { IconCheck, IconCopy, IconExternal, IconSpinner } from './icons';
import { Sheet } from './Sheet';

const TITLES = {
  create: 'Reservando tu pago',
  accept: 'Cobrando',
  reclaim: 'Recuperando tu reserva',
};

export function explorerUrl(txHash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${txHash}`;
}

interface Props {
  state: OpState;
  note?: string | undefined;
  onRetry: () => void;
  onClose: () => void;
}

/** View 9: Preparar, Firmar, Enviar, Confirmado. Locked until it ends. */
export function NetworkSheet({ state, note, onRetry, onClose }: Props) {
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const finished = state.done || state.error !== null;

  useEffect(() => {
    if (!state.open || finished) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [state.open, finished]);

  const idx = state.done ? STEPS.length : STEPS.findIndex((s) => s.id === state.step);
  const seconds = Math.max(0, Math.round((now - state.startedAt) / 1000));

  return (
    <Sheet open={state.open} title={state.kind ? TITLES[state.kind] : ''}>
      {note ? <p className="tabular break-all text-sm text-muted">{note}</p> : null}
      <ol className="flex flex-col gap-3">
        {STEPS.map((s, i) => {
          const done = i < idx;
          const active = i === idx && !finished;
          return (
            <li key={s.id} className="flex items-center gap-3" aria-current={active || undefined}>
              <span
                className={`flex size-7 items-center justify-center rounded-full border ${
                  done
                    ? 'border-green bg-green text-ivory'
                    : active
                      ? 'border-gold text-ink'
                      : 'border-line'
                }`}
              >
                {done ? (
                  <IconCheck size={16} />
                ) : active ? (
                  <IconSpinner size={16} className="text-gold" />
                ) : null}
              </span>
              <span className={done || active ? 'font-semibold' : 'text-muted'}>{s.label}</span>
            </li>
          );
        })}
      </ol>
      <p className="tabular text-sm text-muted" aria-live="polite">
        {state.done ? 'Confirmado' : state.error ? '' : `Enviando… ${seconds} s`}
      </p>
      {state.txHash ? (
        <div className="flex flex-col gap-1 rounded-field border border-line p-3">
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-muted">
            Código de operación
          </span>
          <span className="tabular break-all text-sm">{shortHash(state.txHash)}</span>
          <div className="flex gap-1">
            <button
              type="button"
              className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-medium text-muted active:text-ink"
              onClick={() => {
                void navigator.clipboard?.writeText(state.txHash ?? '');
                setCopied(true);
              }}
            >
              <IconCopy size={16} />
              {copied ? 'Copiado' : 'Copiar'}
            </button>
            <a
              className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-medium text-muted active:text-ink"
              href={explorerUrl(state.txHash)}
              target="_blank"
              rel="noreferrer"
            >
              <IconExternal size={16} />
              Ver en stellar.expert
            </a>
          </div>
        </div>
      ) : null}
      {state.error ? <ErrorNotice error={state.error} onAction={onRetry} /> : null}
      <Button variant="text" disabled={!finished} onClick={onClose}>
        Cerrar
      </Button>
    </Sheet>
  );
}
