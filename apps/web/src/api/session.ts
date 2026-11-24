import type { Company } from '@pronto/shared';
import { useSyncExternalStore } from 'react';

/**
 * Session lives in memory only (never localStorage): JWT of 1 hour. A reload asks
 * the wallet to sign again.
 */
export interface Session {
  address: string;
  token: string;
  expiresAt: string;
  company: Company | null;
}

let current: Session | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export const sessionStore = {
  get: (): Session | null => current,
  set(next: Session | null) {
    current = next;
    emit();
  },
  setCompany(company: Company | null) {
    if (current) {
      current = { ...current, company };
      emit();
    }
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useSession(): Session | null {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.get, sessionStore.get);
}

export function useCompany(): Company | null {
  return useSession()?.company ?? null;
}
