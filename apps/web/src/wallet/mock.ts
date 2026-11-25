import { SUPPLIER_ADDRESS } from '@/mocks/addresses';
import type { WalletPort } from './types';

let selected: string = SUPPLIER_ADDRESS;

/** Demo only: choose which test account the mock wallet "holds". */
export function selectMockAccount(address: string): void {
  selected = address;
}

export function currentMockAccount(): string {
  return selected;
}

export const mockWallet: WalletPort = {
  async connect() {
    return selected;
  },
  async sign(xdr) {
    return `signed:${xdr}`;
  },
  async disconnect() {},
};
