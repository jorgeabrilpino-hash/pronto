import {
  Account,
  Keypair,
  Networks,
  Operation,
  type Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { MutableClock } from '../memory';
import { TESTNET_PASSPHRASE } from '../stellar/network';
import { CHALLENGE_DATA_KEY, StellarSignatureVerifier } from './stellar-signature-verifier';

const NONCE = 'a1b2c3d4e5f60718293a4b5c6d7e8f901122334455667788';

function sign(xdrB64: string, kp: Keypair, passphrase = TESTNET_PASSPHRASE): string {
  const tx = TransactionBuilder.fromXDR(xdrB64, passphrase) as Transaction;
  tx.sign(kp);
  return tx.toXDR();
}

/** Builds a challenge-like transaction with custom pieces, for the negative cases. */
function craft(
  kp: Keypair,
  opts: {
    sequence?: string;
    ops?: ReturnType<typeof Operation.manageData>[];
    bounds?: { minTime: number; maxTime: number };
    passphrase?: string;
  },
  now: number,
): string {
  const tx = new TransactionBuilder(new Account(kp.publicKey(), opts.sequence ?? '-1'), {
    fee: '100',
    networkPassphrase: opts.passphrase ?? TESTNET_PASSPHRASE,
    timebounds: opts.bounds ?? { minTime: now, maxTime: now + 300 },
  });
  for (const op of opts.ops ?? [Operation.manageData({ name: CHALLENGE_DATA_KEY, value: NONCE })]) {
    tx.addOperation(op);
  }
  const built = tx.build();
  built.sign(kp);
  return built.toXDR();
}

describe('StellarSignatureVerifier', () => {
  let clock: MutableClock;
  let verifier: StellarSignatureVerifier;
  let kp: Keypair;
  let now: number;

  beforeEach(() => {
    clock = new MutableClock(new Date('2026-11-23T15:00:00Z'));
    verifier = new StellarSignatureVerifier({ clock });
    kp = Keypair.random();
    now = Math.floor(clock.now().getTime() / 1000);
  });

  it('builds an unsigned sequence 0 challenge with one manageData op and a 5 minute window', () => {
    const xdrB64 = verifier.buildChallenge(kp.publicKey(), NONCE);
    const tx = TransactionBuilder.fromXDR(xdrB64, TESTNET_PASSPHRASE) as Transaction;
    expect(tx.source).toBe(kp.publicKey());
    expect(tx.sequence).toBe('0');
    expect(tx.signatures).toHaveLength(0);
    expect(tx.operations).toHaveLength(1);
    expect(tx.operations[0]).toMatchObject({ type: 'manageData', name: CHALLENGE_DATA_KEY });
    expect(tx.timeBounds).toEqual({ minTime: String(now), maxTime: String(now + 300) });
    expect(verifier.readNonce(xdrB64)).toBe(NONCE);
  });

  it('round trip: build, sign with a random keypair, verify OK', async () => {
    const signed = sign(verifier.buildChallenge(kp.publicKey(), NONCE), kp);
    expect(verifier.readNonce(signed)).toBe(NONCE);
    expect(await verifier.verifyChallenge(signed, kp.publicKey(), NONCE)).toBe(true);
    clock.advanceSeconds(299);
    expect(await verifier.verifyChallenge(signed, kp.publicKey(), NONCE)).toBe(true);
  });

  it('rejects a wrong address (another valid key, and a malformed one)', async () => {
    const signed = sign(verifier.buildChallenge(kp.publicKey(), NONCE), kp);
    expect(await verifier.verifyChallenge(signed, Keypair.random().publicKey(), NONCE)).toBe(false);
    expect(await verifier.verifyChallenge(signed, 'GNOTANADDRESS', NONCE)).toBe(false);
  });

  it('rejects a signature by a key other than the source', async () => {
    const signed = sign(verifier.buildChallenge(kp.publicKey(), NONCE), Keypair.random());
    expect(await verifier.verifyChallenge(signed, kp.publicKey(), NONCE)).toBe(false);
    const unsigned = verifier.buildChallenge(kp.publicKey(), NONCE);
    expect(await verifier.verifyChallenge(unsigned, kp.publicKey(), NONCE)).toBe(false);
  });

  it('rejects a wrong nonce', async () => {
    const signed = sign(verifier.buildChallenge(kp.publicKey(), NONCE), kp);
    expect(await verifier.verifyChallenge(signed, kp.publicKey(), 'other-nonce')).toBe(false);
  });

  it('rejects tampered XDR', async () => {
    const signed = sign(verifier.buildChallenge(kp.publicKey(), NONCE), kp);
    const bytes = Buffer.from(signed, 'base64');
    // Flip a byte inside the nonce value: the envelope still parses but the hash changes.
    const at = bytes.indexOf(Buffer.from(NONCE.slice(0, 8)));
    expect(at).toBeGreaterThan(0);
    bytes[at] = 'b'.charCodeAt(0) === bytes[at] ? 'c'.charCodeAt(0) : 'b'.charCodeAt(0);
    const tampered = bytes.toString('base64');
    expect(await verifier.verifyChallenge(tampered, kp.publicKey(), NONCE)).toBe(false);
    expect(await verifier.verifyChallenge('AAAA-garbage', kp.publicKey(), NONCE)).toBe(false);
    expect(verifier.readNonce('AAAA-garbage')).toBeNull();
  });

  it('rejects an expired time bound and one that is not yet valid', async () => {
    const signed = sign(verifier.buildChallenge(kp.publicKey(), NONCE), kp);
    clock.advanceSeconds(301);
    expect(await verifier.verifyChallenge(signed, kp.publicKey(), NONCE)).toBe(false);
    const future = craft(kp, { bounds: { minTime: now + 120, maxTime: now + 300 } }, now);
    clock.set(new Date(now * 1000));
    expect(await verifier.verifyChallenge(future, kp.publicKey(), NONCE)).toBe(false);
  });

  it('rejects windows that are unbounded or longer than 5 minutes', async () => {
    const unbounded = craft(kp, { bounds: { minTime: 0, maxTime: 0 } }, now);
    expect(await verifier.verifyChallenge(unbounded, kp.publicKey(), NONCE)).toBe(false);
    const long = craft(kp, { bounds: { minTime: now, maxTime: now + 3600 } }, now);
    expect(await verifier.verifyChallenge(long, kp.publicKey(), NONCE)).toBe(false);
  });

  it('rejects a sequence other than 0', async () => {
    const seq = craft(kp, { sequence: '41' }, now);
    expect(await verifier.verifyChallenge(seq, kp.publicKey(), NONCE)).toBe(false);
  });

  it('rejects extra operations and a different data key', async () => {
    const extra = craft(
      kp,
      {
        ops: [
          Operation.manageData({ name: CHALLENGE_DATA_KEY, value: NONCE }),
          Operation.manageData({ name: 'other', value: 'x' }),
        ],
      },
      now,
    );
    expect(await verifier.verifyChallenge(extra, kp.publicKey(), NONCE)).toBe(false);
    expect(verifier.readNonce(extra)).toBeNull();
    const otherKey = craft(
      kp,
      { ops: [Operation.manageData({ name: 'login', value: NONCE })] },
      now,
    );
    expect(await verifier.verifyChallenge(otherKey, kp.publicKey(), NONCE)).toBe(false);
    const otherSource = craft(
      kp,
      {
        ops: [
          Operation.manageData({
            name: CHALLENGE_DATA_KEY,
            value: NONCE,
            source: Keypair.random().publicKey(),
          }),
        ],
      },
      now,
    );
    expect(await verifier.verifyChallenge(otherSource, kp.publicKey(), NONCE)).toBe(false);
  });

  it('rejects a challenge signed for another network passphrase', async () => {
    const mainnetLike = craft(kp, { passphrase: Networks.PUBLIC }, now);
    expect(await verifier.verifyChallenge(mainnetLike, kp.publicKey(), NONCE)).toBe(false);
    // Same bytes re-signed under the testnet passphrase would pass: the passphrase is the cause.
    const testnet = craft(kp, {}, now);
    expect(await verifier.verifyChallenge(testnet, kp.publicKey(), NONCE)).toBe(true);
  });

  it('rejects a fee bump envelope and refuses to build for a non account address', async () => {
    const inner = TransactionBuilder.fromXDR(craft(kp, {}, now), TESTNET_PASSPHRASE) as Transaction;
    const bump = TransactionBuilder.buildFeeBumpTransaction(kp, '200', inner, TESTNET_PASSPHRASE);
    bump.sign(kp);
    expect(await verifier.verifyChallenge(bump.toXDR(), kp.publicKey(), NONCE)).toBe(false);
    expect(() =>
      verifier.buildChallenge('CDJLAF3FBQCMU35CPTAF3ICL5W3XSTMDOOLWKJU3K4GGC5WOWIRBY52S', NONCE),
    ).toThrow(TypeError);
  });

  it('readNonce returns null for a data op without value or with non UTF-8 bytes', () => {
    const deleted = craft(
      kp,
      { ops: [Operation.manageData({ name: CHALLENGE_DATA_KEY, value: null })] },
      now,
    );
    expect(verifier.readNonce(deleted)).toBeNull();
    const binary = craft(
      kp,
      {
        ops: [Operation.manageData({ name: CHALLENGE_DATA_KEY, value: Buffer.from([0xff, 0xfe]) })],
      },
      now,
    );
    expect(verifier.readNonce(binary)).toBeNull();
  });
});
