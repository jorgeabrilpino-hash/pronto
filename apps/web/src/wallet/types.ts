export interface WalletPort {
  /** Asks the wallet for the active address (opens the extension prompt if needed). */
  connect(): Promise<string>;
  /** Signs a transaction XDR (never sent by the wallet itself). Returns the signed XDR. */
  sign(xdr: string, address: string): Promise<string>;
  disconnect(): Promise<void>;
}

/** The wallet is missing, locked, or the user rejected the prompt. */
export class WalletError extends Error {
  readonly kind: 'missing' | 'rejected';
  constructor(kind: 'missing' | 'rejected', cause?: unknown) {
    super(kind, { cause });
    this.name = 'WalletError';
    this.kind = kind;
  }
}
