import { env } from '@/lib/env';
import { mockWallet } from './mock';
import type { WalletPort } from './types';

/** Mock in demo mode; otherwise Varial through the kit, loaded on first use (large bundle). */
async function impl(): Promise<WalletPort> {
  if (env.useMocks) return mockWallet;
  return (await import('./kit')).kitWallet;
}

export const wallet: WalletPort = {
  connect: async () => (await impl()).connect(),
  sign: async (xdr, address) => (await impl()).sign(xdr, address),
  disconnect: async () => (await impl()).disconnect(),
};
export { WalletError } from './types';
