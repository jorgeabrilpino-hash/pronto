import { api } from '@/api/endpoints';
import { type Session, sessionStore } from '@/api/session';
import { assertChallenge } from '@/chain/challenge';
import { env } from '@/lib/env';
import { wallet } from '@/wallet';

/** Wallet connect, signed challenge, JWT in memory. Returns the new session. */
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
