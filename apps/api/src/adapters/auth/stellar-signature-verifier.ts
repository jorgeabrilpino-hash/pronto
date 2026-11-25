import {
  Account,
  Keypair,
  Operation,
  StrKey,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import type { Clock, SignatureVerifier } from '../../application/ports';
import { TESTNET_PASSPHRASE } from '../stellar/network';

export const CHALLENGE_DATA_KEY = 'pronto-auth';
export const CHALLENGE_TTL_SECONDS = 300;
/** Tolerated clock skew between the server that built the challenge and the one verifying. */
const SKEW_SECONDS = 30;

export interface StellarSignatureVerifierOptions {
  clock: Clock;
  networkPassphrase?: string;
  ttlSeconds?: number;
}

/**
 * Wallet sign-in (BACKEND_PLAN section 9). The challenge is a transaction with sequence 0 and
 * one manageData operation carrying the nonce. It can never be submitted (sequence 0 is never
 * valid) and the wallet only signs it. The nonce itself is single use (ChallengeStore).
 */
export class StellarSignatureVerifier implements SignatureVerifier {
  private readonly clock: Clock;
  private readonly passphrase: string;
  private readonly ttl: number;

  constructor(options: StellarSignatureVerifierOptions) {
    this.clock = options.clock;
    this.passphrase = options.networkPassphrase ?? TESTNET_PASSPHRASE;
    this.ttl = options.ttlSeconds ?? CHALLENGE_TTL_SECONDS;
  }

  buildChallenge(address: string, nonce: string): string {
    if (!StrKey.isValidEd25519PublicKey(address)) {
      throw new TypeError('address must be a G... account');
    }
    // The builder increments the sequence, so "-1" yields a transaction with sequence 0.
    const source = new Account(address, '-1');
    const now = Math.floor(this.clock.now().getTime() / 1000);
    return new TransactionBuilder(source, {
      fee: '100',
      networkPassphrase: this.passphrase,
      timebounds: { minTime: now, maxTime: now + this.ttl },
    })
      .addOperation(Operation.manageData({ name: CHALLENGE_DATA_KEY, value: nonce }))
      .build()
      .toXDR();
  }

  readNonce(signedXdr: string): string | null {
    const tx = this.parse(signedXdr);
    if (tx === null || tx.operations.length !== 1) return null;
    const op = tx.operations[0];
    if (op === undefined || op.type !== 'manageData' || op.name !== CHALLENGE_DATA_KEY) return null;
    if (op.value === undefined) return null;
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(op.value);
    } catch {
      return null;
    }
  }

  async verifyChallenge(signedXdr: string, address: string, nonce: string): Promise<boolean> {
    if (!StrKey.isValidEd25519PublicKey(address)) return false;
    const tx = this.parse(signedXdr);
    if (tx === null) return false;
    if (tx.source !== address || tx.sequence !== '0') return false;
    if (tx.operations.length !== 1) return false;
    const op = tx.operations[0];
    if (op === undefined || op.type !== 'manageData' || op.name !== CHALLENGE_DATA_KEY) {
      return false;
    }
    if (op.source !== undefined && op.source !== address) return false;
    if (this.readNonce(signedXdr) !== nonce) return false;

    const bounds = tx.timeBounds;
    if (bounds === undefined) return false;
    const min = Number(bounds.minTime);
    const max = Number(bounds.maxTime);
    const now = Math.floor(this.clock.now().getTime() / 1000);
    if (max === 0 || max - min > this.ttl) return false;
    if (now + SKEW_SECONDS < min || now > max) return false;

    // The hash covers the network passphrase: a signature made for another network fails here.
    const signer = Keypair.fromPublicKey(address);
    const hash = tx.hash();
    const hint = signer.signatureHint();
    return tx.signatures.some((sig) => {
      if (!sameBytes(sig.hint.value, hint)) return false;
      try {
        return signer.verify(hash, sig.signature);
      } catch {
        return false;
      }
    });
  }

  /** Only a plain transaction envelope is a challenge; fee bumps and garbage are not. */
  private parse(signedXdr: string): Transaction | null {
    try {
      const tx = TransactionBuilder.fromXDR(signedXdr, this.passphrase);
      return tx instanceof Transaction ? tx : null;
    } catch {
      return null;
    }
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
