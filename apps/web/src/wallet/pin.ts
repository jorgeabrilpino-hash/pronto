import { WalletError } from './types';

/** Bridge between the wallet (which needs a PIN to sign) and the sheet that asks for it. */
export interface PinRequest {
  resolve(pin: string): void;
  reject(): void;
}

let pending: PinRequest | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

export const pinStore = {
  get: () => pending,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function requestPin(): Promise<string> {
  pending?.reject();
  return new Promise<string>((resolve, reject) => {
    const done = () => {
      pending = null;
      emit();
    };
    pending = {
      resolve: (pin) => {
        done();
        resolve(pin);
      },
      reject: () => {
        done();
        reject(new WalletError('rejected'));
      },
    };
    emit();
  });
}
