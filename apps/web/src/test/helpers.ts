import { api } from '@/api/endpoints';
import { sessionStore } from '@/api/session';
import { BUYER_ADDRESS, NEW_ADDRESS, SUPPLIER_ADDRESS } from '@/mocks/addresses';

export const ADDR = { supplier: SUPPLIER_ADDRESS, buyer: BUYER_ADDRESS, fresh: NEW_ADDRESS };

/** Runs the real challenge/verify handshake against the mock API and stores the session. */
export async function loginAs(address: string) {
  const challenge = await api.challenge(address);
  const res = await api.verify(address, `signed:${challenge.challengeXdr}`);
  sessionStore.set({
    address,
    token: res.token,
    expiresAt: res.expiresAt,
    company: res.company,
  });
  return res;
}

export function logout() {
  sessionStore.set(null);
}
