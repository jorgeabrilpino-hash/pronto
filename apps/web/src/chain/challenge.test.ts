// @vitest-environment node
import { Account, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { env } from '@/lib/env';
import { assertChallenge } from './challenge';

const kp = Keypair.random();
const other = Keypair.random();

function challenge(opts: { source?: string; seq?: string; nonce?: string; maxTime?: number } = {}) {
  const acc = new Account(opts.source ?? kp.publicKey(), opts.seq ?? '-1');
  const tx = new TransactionBuilder(acc, { fee: '100', networkPassphrase: env.networkPassphrase })
    .addOperation(Operation.manageData({ name: 'pronto auth', value: opts.nonce ?? 'abc123' }))
    .setTimeout(opts.maxTime ?? 300)
    .build();
  return tx.toXDR();
}

describe('assertChallenge', () => {
  it('accepts the expected challenge', () => {
    expect(() => assertChallenge(challenge(), 'abc123', kp.publicKey())).not.toThrow();
  });

  it('refuses a different source, nonce, or junk', () => {
    expect(() =>
      assertChallenge(challenge({ source: other.publicKey() }), 'abc123', kp.publicKey()),
    ).toThrow();
    expect(() => assertChallenge(challenge({ nonce: 'zzz' }), 'abc123', kp.publicKey())).toThrow();
    expect(() => assertChallenge('not-xdr', 'abc123', kp.publicKey())).toThrow();
  });

  it('refuses a real sequence number (a spendable transaction)', () => {
    expect(() => assertChallenge(challenge({ seq: '100' }), 'abc123', kp.publicKey())).toThrow();
  });

  it('refuses an expired challenge', () => {
    const xdr = challenge();
    expect(() =>
      assertChallenge(xdr, 'abc123', kp.publicKey(), new Date(Date.now() + 3600_000)),
    ).toThrow();
  });
});
