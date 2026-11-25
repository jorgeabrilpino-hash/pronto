import { env } from '@/lib/env';
import { mockWallet } from './mock';
import type { WalletPort } from './types';

export type WalletKind = 'kit' | 'local';

const KIND = 'pronto.wallet';

export function walletKind(): WalletKind {
  try {
    return localStorage.getItem(KIND) === 'local' ? 'local' : 'kit';
  } catch {
    return 'kit';
  }
}

/** Drops the decrypted test key, whatever wallet is selected right now. */
export async function lockTestAccount(): Promise<void> {
  (await import('./local')).localWallet.lock();
}

export function setWalletKind(kind: WalletKind): void {
  if (kind !== 'local') void lockTestAccount();
  try {
    localStorage.setItem(KIND, kind);
  } catch {
    // Storage blocked: the choice lasts only for this load.
  }
}

/** One interface for both: the local test account, or Varial/Freighter through the kit. */
async function impl(): Promise<WalletPort> {
  if (walletKind() === 'local') return (await import('./local')).localWallet.port;
  if (env.useMocks) return mockWallet;
  return (await import('./kit')).kitWallet;
}

export const wallet: WalletPort = {
  connect: async () => (await impl()).connect(),
  async sign(xdr, address) {
    const w = await impl();
    // The mock API issues placeholder challenges that are not real transactions.
    if (env.useMocks && xdr.startsWith('mock-')) {
      await w.connect();
      return `signed:${xdr}`;
    }
    return w.sign(xdr, address);
  },
  async disconnect() {
    // Independent of the stored choice: the test key is always locked.
    await lockTestAccount();
    await (await impl()).disconnect();
  },
};
export { WalletError } from './types';
