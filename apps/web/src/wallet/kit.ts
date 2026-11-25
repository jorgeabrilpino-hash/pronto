import { Networks, StellarWalletsKit } from '@creit.tech/stellar-wallets-kit';
import { VARIAL_ID, VarialModule } from '@creit.tech/stellar-wallets-kit/modules/varial';
import { env } from '@/lib/env';
import { WalletError, type WalletPort } from './types';

let ready = false;

function init(): void {
  if (ready) return;
  StellarWalletsKit.init({ network: Networks.TESTNET, modules: [new VarialModule()] });
  StellarWalletsKit.setWallet(VARIAL_ID);
  ready = true;
}

/** Varial (Freighter renamed) through Stellar Wallets Kit, TESTNET only. */
export const kitWallet: WalletPort = {
  async connect() {
    init();
    try {
      const { address } = await StellarWalletsKit.fetchAddress();
      return address;
    } catch (cause) {
      throw new WalletError(isMissing(cause) ? 'missing' : 'rejected', cause);
    }
  },
  async sign(xdr, address) {
    init();
    try {
      const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
        networkPassphrase: env.networkPassphrase,
        address,
      });
      return signedTxXdr;
    } catch (cause) {
      throw new WalletError('rejected', cause);
    }
  },
  async disconnect() {
    if (!ready) return;
    await StellarWalletsKit.disconnect().catch(() => undefined);
  },
};

function isMissing(e: unknown): boolean {
  return /not (installed|available|found)|no wallet|unavailable/i.test(String(e));
}
