import { Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { sessionStore } from '@/api/session';
import { idbKeyStore, type KeyStore } from './keyStore';
import { cancelPin, requestPin } from './pin';
import { PIN_PATTERN } from './pinPattern';
import { WalletError, type WalletPort } from './types';

/**
 * TESTNET-only test account. The key is generated in the browser, encrypted with the PIN
 * (PBKDF2-SHA256 + AES-GCM) and stored in IndexedDB; the decrypted key lives only in
 * memory. It never leaves the device. A 6 digit PIN is NOT strong protection against
 * someone who already has the device data: this account holds no real value.
 */
const ITERATIONS = 310_000;
/** The decrypted key is dropped after this long without signing. */
export const IDLE_LOCK_MS = 10 * 60_000;

export class PinError extends Error {
  constructor() {
    super('WRONG_PIN');
    this.name = 'PinError';
  }
}

async function deriveKey(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function createLocalWallet(
  store: KeyStore,
  askPin: () => Promise<string>,
  opts: { cancelPin?: () => void; now?: () => number } = {},
) {
  const now = opts.now ?? Date.now;
  let unlocked: Keypair | null = null;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let deadline = 0;
  /** Bumped by every lock: work started before a lock may never unlock afterwards. */
  let generation = 0;

  function lock(): void {
    generation++;
    unlocked = null;
    clearTimeout(idle);
    opts.cancelPin?.();
  }

  function hold(kp: Keypair, since: number): Keypair {
    if (since !== generation) throw new WalletError('rejected');
    unlocked = kp;
    deadline = now() + IDLE_LOCK_MS;
    clearTimeout(idle);
    idle = setTimeout(lock, IDLE_LOCK_MS);
    return kp;
  }

  /** Timers are throttled in background tabs, so the deadline is checked on every use. */
  function lockIfIdle(): void {
    if (unlocked && now() >= deadline) lock();
  }

  async function unlock(pin: string, since: number = generation): Promise<Keypair> {
    const saved = await store.get();
    if (!saved) throw new WalletError('missing');
    let secret: string;
    try {
      const key = await deriveKey(pin, saved.salt);
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: saved.iv },
        key,
        saved.cipher,
      );
      secret = new TextDecoder().decode(plain);
    } catch {
      throw new PinError();
    }
    return hold(Keypair.fromSecret(secret), since);
  }

  async function keypair(): Promise<Keypair> {
    lockIfIdle();
    const since = generation;
    if (unlocked) return hold(unlocked, since);
    const pin = await askPin();
    if (since !== generation) throw new WalletError('rejected');
    return unlock(pin, since);
  }

  const port: WalletPort = {
    async connect() {
      return (await keypair()).publicKey();
    },
    async sign(xdr, address) {
      const kp = await keypair();
      if (kp.publicKey() !== address) throw new WalletError('rejected');
      // Testnet passphrase is fixed here: this wallet can never sign for mainnet.
      const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
      tx.sign(kp);
      return tx.toXDR();
    },
    async disconnect() {
      lock();
    },
  };

  return {
    port,
    lock,
    lockIfIdle,
    unlock: async (pin: string) => (await unlock(pin)).publicKey(),
    address: async () => (await store.get())?.address ?? null,
    async create(pin: string): Promise<string> {
      if (!PIN_PATTERN.test(pin)) throw new PinError();
      if (await store.get()) throw new WalletError('rejected');
      const since = generation;
      const kp = Keypair.random();
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const cipher = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        await deriveKey(pin, salt),
        new TextEncoder().encode(kp.secret()),
      );
      await store.put({ address: kp.publicKey(), salt, iv, cipher });
      hold(kp, since);
      return kp.publicKey();
    },
    /** Shown to the owner so they can recover the account. Needs the PIN again. */
    recoveryKey: async (pin: string) => (await unlock(pin)).secret(),
    forget: async () => {
      lock();
      await store.clear();
    },
  };
}

export const localWallet = createLocalWallet(idbKeyStore, requestPin, { cancelPin });

// Every way a session ends (sign out, expired token, 401) also locks the key.
sessionStore.subscribe(() => {
  if (sessionStore.get() === null) localWallet.lock();
});

if (typeof document !== 'undefined') {
  const check = () => localWallet.lockIfIdle();
  document.addEventListener('visibilitychange', check);
  window.addEventListener('pageshow', check);
}
