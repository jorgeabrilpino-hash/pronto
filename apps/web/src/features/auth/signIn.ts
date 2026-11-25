import { api } from '@/api/endpoints';
import { type Session, sessionStore } from '@/api/session';
import { assertChallenge } from '@/chain/challenge';
import { env } from '@/lib/env';
import { wallet } from '@/wallet';

/** Wallet connect, signed challenge, session (kept in sessionStorage until it expires). */
export async function signIn(): Promise<Session> {
  const address = await wallet.connect();
  const challenge = await api.challenge(address);
  if (!env.useMocks) assertChallenge(challenge.challengeXdr, challenge.nonce, address);
  const signed = await wallet.sign(challenge.challengeXdr, address);
  const res = await api.verify(address, signed);
  const session: Session = {
    address,
    token: res.token,
    expiresAt: res.expiresAt,
    company: res.company,
  };
  sessionStore.set(session);
  return session;
}

export async function signOut(): Promise<void> {
  sessionStore.set(null);
  await wallet.disconnect();
}

// ---- Onboarding and demo flags ---------------------------------------------------

const ONBOARDED = 'pronto.onboarded';
const DEMO = 'pronto.demo';

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export const isOnboarded = () => safe(() => localStorage.getItem(ONBOARDED) === '1', false);
export const markOnboarded = () => safe(() => localStorage.setItem(ONBOARDED, '1'), undefined);
export const isDemo = () => safe(() => sessionStorage.getItem(DEMO) === '1', false);

/** The demo is a separate mode: mock API and mock wallet, loaded fresh. */
export function enterDemo(): void {
  safe(() => sessionStorage.setItem(DEMO, '1'), undefined);
  window.location.assign('/');
}

export function exitDemo(): void {
  safe(() => sessionStorage.removeItem(DEMO), undefined);
  sessionStore.set(null);
  window.location.assign('/');
}

/** Where a signed-in visitor goes next. */
export function nextRoute(session: Session): string {
  if (!session.company) return '/registro';
  return isOnboarded() ? '/app' : '/bienvenida';
}
