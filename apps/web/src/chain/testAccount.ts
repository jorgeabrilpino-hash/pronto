import { NetworkError } from '@/api/errors';
import { env } from '@/lib/env';
import { activateUsdc, getFunds } from './funds';

const FRIENDBOT = 'https://friendbot.stellar.org';

/** XLM for fees from the testnet faucet. Only the public address is sent. */
export async function fundWithFriendbot(address: string): Promise<void> {
  if (env.useMocks) return;
  let res: Response;
  try {
    res = await fetch(`${FRIENDBOT}/?addr=${encodeURIComponent(address)}`);
  } catch {
    throw new NetworkError();
  }
  // 400 is what Friendbot answers for an account that already exists.
  if (!res.ok && res.status !== 400) throw new NetworkError();
}

/** Funds the new account and adds the USDC trustline (signed locally). Safe to retry. */
export async function prepareTestAccount(address: string): Promise<void> {
  await fundWithFriendbot(address);
  const funds = await getFunds(address);
  if (funds.usdc === null) await activateUsdc(address);
}
