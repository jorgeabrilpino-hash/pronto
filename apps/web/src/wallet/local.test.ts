// @vitest-environment node
import { Account, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import type { KeyStore, StoredKey } from './keyStore';
import { createLocalWallet, PinError } from './local';

function memoryStore() {
  let value: StoredKey | null = null;
  const store: KeyStore = {
    get: async () => value,
    put: async (v) => {
      value = v;
    },
    clear: async () => {
      value = null;
    },
  };
  return { store, peek: () => value };
}

const PIN = '123456';

describe('local test wallet', () => {
  it('stores only ciphertext and refuses other PIN shapes', async () => {
    const mem = memoryStore();
    const w = createLocalWallet(mem.store, async () => PIN);
    await expect(w.create('12345')).rejects.toBeInstanceOf(PinError);
    const address = await w.create(PIN);
    expect(address).toMatch(/^G[A-Z2-7]{55}$/);
    const secret = await w.recoveryKey(PIN);
    const stored = Buffer.from(mem.peek()?.cipher ?? new ArrayBuffer(0)).toString('latin1');
    expect(stored.includes(secret)).toBe(false);
  });

  it('unlocks with the right PIN only, also after a reload', async () => {
    const mem = memoryStore();
    const address = await createLocalWallet(mem.store, async () => PIN).create(PIN);
    const reloaded = createLocalWallet(mem.store, async () => PIN);
    await expect(reloaded.unlock('000000')).rejects.toBeInstanceOf(PinError);
    await expect(reloaded.unlock(PIN)).resolves.toBe(address);
  });

  it('signs a testnet transaction with the account key only', async () => {
    const mem = memoryStore();
    const w = createLocalWallet(mem.store, async () => PIN);
    const address = await w.create(PIN);
    const xdr = new TransactionBuilder(new Account(address, '-1'), {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.manageData({ name: 'pronto auth', value: 'nonce' }))
      .setTimeout(300)
      .build()
      .toXDR();
    const signed = TransactionBuilder.fromXDR(await w.port.sign(xdr, address), Networks.TESTNET);
    expect(signed.signatures).toHaveLength(1);
    const sig = signed.signatures[0]?.signature;
    expect(sig && Keypair.fromPublicKey(address).verify(signed.hash(), sig)).toBe(true);
    await expect(w.port.sign(xdr, Keypair.random().publicKey())).rejects.toThrow();
  });
});
