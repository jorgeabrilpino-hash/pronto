import { useCallback, useRef, useState } from 'react';
import type { OpKind, OpParams, StepId } from './operation';
import { runOperation } from './operation';

export interface OpState {
  open: boolean;
  kind: OpKind | null;
  step: StepId | null;
  txHash: string | null;
  error: unknown;
  done: boolean;
  startedAt: number;
}

const IDLE: OpState = {
  open: false,
  kind: null,
  step: null,
  txHash: null,
  error: null,
  done: false,
  startedAt: 0,
};

/**
 * Runs one network operation at a time (never two from the same account) and exposes the
 * state the "Operación en la red" sheet shows. `after` runs with the hash once SUCCESS is
 * confirmed (the reconcile call that lets the server read the network).
 */
export function useChainOp() {
  const [state, setState] = useState<OpState>(IDLE);
  const busy = useRef(false);
  const last = useRef<{ p: OpParams; after?: (hash: string) => Promise<void> } | null>(null);

  const run = useCallback(async (p: OpParams, after?: (hash: string) => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    last.current = after ? { p, after } : { p };
    setState({ ...IDLE, open: true, kind: p.kind, step: 'prepare', startedAt: Date.now() });
    try {
      const hash = await runOperation(p, (step, txHash) =>
        setState((s) => ({ ...s, step, txHash: txHash ?? s.txHash })),
      );
      setState((s) => ({ ...s, txHash: hash }));
      await after?.(hash);
      setState((s) => ({ ...s, done: true }));
    } catch (error) {
      setState((s) => ({ ...s, error }));
    } finally {
      busy.current = false;
    }
  }, []);

  const retry = useCallback(() => {
    if (last.current) void run(last.current.p, last.current.after);
  }, [run]);

  const close = useCallback(() => setState(IDLE), []);
  return { state, run, retry, close };
}
