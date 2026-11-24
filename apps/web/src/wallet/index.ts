import { env } from '@/lib/env';
import { kitWallet } from './kit';
import { mockWallet } from './mock';
import type { WalletPort } from './types';

export const wallet: WalletPort = env.useMocks ? mockWallet : kitWallet;
export { WalletError } from './types';
