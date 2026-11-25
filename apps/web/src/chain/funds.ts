import { Asset, BASE_FEE, Horizon, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { env } from '@/lib/env';
import { wallet } from '@/wallet';

/** Circle's USDC issuer on testnet. */
export const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';

export interface Funds {
  xlm: string;
  /** null while the account has no USDC trustline ("Falta activar"). */
  usdc: string | null;
}

const mockFunds = new Map<string, Funds>();

function horizon(): Horizon.Server {
  return new Horizon.Server(HORIZON_URL);
}

export async function getFunds(address: string): Promise<Funds> {
  if (env.useMocks) {
    return mockFunds.get(address) ?? { xlm: '10000', usdc: null };
  }
  const account = await horizon().loadAccount(address);
  let xlm = '0';
  let usdc: string | null = null;
  for (const b of account.balances) {
    if (b.asset_type === 'native') xlm = b.balance;
    else if ('asset_code' in b && b.asset_code === 'USDC' && b.asset_issuer === USDC_ISSUER) {
      usdc = b.balance;
    }
  }
  return { xlm, usdc };
}

/** Adds the USDC trustline (a classic transaction signed by the wallet). */
export async function activateUsdc(address: string): Promise<void> {
  if (env.useMocks) {
    const cur = mockFunds.get(address) ?? { xlm: '10000', usdc: null };
    mockFunds.set(address, { ...cur, usdc: '5000' });
    return;
  }
  const server = horizon();
  const account = await server.loadAccount(address);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: env.networkPassphrase,
  })
    .addOperation(Operation.changeTrust({ asset: new Asset('USDC', USDC_ISSUER) }))
    .setTimeout(180)
    .build();
  const signed = await wallet.sign(tx.toXDR(), address);
  await server.submitTransaction(TransactionBuilder.fromXDR(signed, env.networkPassphrase));
}
