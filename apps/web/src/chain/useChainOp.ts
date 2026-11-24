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
  const sentHash = useRef<string | null>(null);
  const last = useRef<{ p: OpParams; after?: (hash: string) => Promise<void> } | null>(null);

  const run = useCallback(async (p: OpParams, after?: (hash: string) => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    sentHash.current = null;
    last.current = after ? { p, after } : { p };
    setState({ ...IDLE, open: true, kind: p.kind, step: 'prepare', startedAt: Date.now() });
    try {
      const hash = await runOperation(p, (step, txHash) => {
        if (txHash) sentHash.current = txHash;
        setState((s) => ({ ...s, step, txHash: txHash ?? s.txHash }));
      });
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
    const l = last.current;
    if (!l) return;
    // A transaction that already confirmed, or was sent and not yet resolved, is never
    // submitted twice: only the reconcile runs, and the server reads the network.
    const sent = sentHash.current;
    if (sent && l.after) {
      setState((s) => ({ ...s, error: null, done: false }));
      l.after(sent)
        .then(() => setState((s) => ({ ...s, done: true })))
        .catch((error) => setState((s) => ({ ...s, error })));
      return;
    }
    void run(l.p, l.after);
  }, [run]);

  const close = useCallback(() => setState(IDLE), []);
  return { state, run, retry, close };
}
