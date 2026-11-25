import { FeeBumpTransaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { env } from '@/lib/env';

/**
 * The login challenge must be exactly what the docs promise (BACKEND_PLAN section 9):
 * a plain transaction, sequence 0, one manageData operation carrying the nonce, with
 * our account as source. Anything else is refused before the wallet is asked to sign,
 * so a hostile server cannot get a real transaction signed.
 */
export class ChallengeError extends Error {
  constructor() {
    super('CHALLENGE_REJECTED');
    this.name = 'ChallengeError';
  }
}

export function assertChallenge(
  challengeXdr: string,
  nonce: string,
  address: string,
  now: Date = new Date(),
): void {
  let tx: ReturnType<typeof TransactionBuilder.fromXDR>;
  try {
    tx = TransactionBuilder.fromXDR(challengeXdr, env.networkPassphrase);
  } catch {
    throw new ChallengeError();
  }
  if (tx instanceof FeeBumpTransaction) throw new ChallengeError();
  const op = tx.operations[0];
  const value = op?.type === 'manageData' ? op.value : null;
  const bytes = value == null ? null : Uint8Array.from(value);
  const matches =
    bytes !== null &&
    (new TextDecoder().decode(bytes) === nonce ||
      Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') === nonce);
  const max = Number(tx.timeBounds?.maxTime ?? 0);
  const expired = max !== 0 && max * 1000 < now.getTime();
  if (
    tx.sequence !== '0' ||
    tx.source !== address ||
    tx.operations.length !== 1 ||
    !matches ||
    expired
  ) {
    throw new ChallengeError();
  }
}
