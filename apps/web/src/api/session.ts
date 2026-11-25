import type { Company } from '@pronto/shared';
import { useSyncExternalStore } from 'react';

/**
 * The session survives a reload or an app switch: it is kept in sessionStorage until
 * the JWT expires (tradeoff documented in DESIGN.md section 10: a script injected in the
 * page could read it, so the token lives 1 hour and carries no sensitive data).
 * When it expires, the wallet signs again silently (see `features/auth/signIn.ts`).
 */
export interface Session {
  address: string;
  token: string;
  expiresAt: string;
  company: Company | null;
}

const KEY = 'pronto.session';

function load(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (!s.token || Date.parse(s.expiresAt) <= Date.now()) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

function save(s: Session | null): void {
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the session just lives in memory.
  }
}

let current: Session | null = load();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export const sessionStore = {
  get: (): Session | null => current,
  set(next: Session | null) {
    current = next;
    save(next);
    emit();
  },
  setCompany(company: Company | null) {
    if (current) {
      current = { ...current, company };
      save(current);
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
