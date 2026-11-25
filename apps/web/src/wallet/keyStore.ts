/** Where the encrypted test key lives. Only ciphertext is ever written. */
export interface StoredKey {
  address: string;
  salt: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
  cipher: ArrayBuffer;
}

export interface KeyStore {
  get(): Promise<StoredKey | null>;
  put(value: StoredKey): Promise<void>;
  clear(): Promise<void>;
}

const DB = 'pronto-wallet';
const STORE = 'keys';
const ID = 'test-account';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = op(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result as T);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export const idbKeyStore: KeyStore = {
  get: async () => (await run<StoredKey | undefined>('readonly', (s) => s.get(ID))) ?? null,
  put: async (value) => {
    await run('readwrite', (s) => s.put(value, ID));
  },
  clear: async () => {
    await run('readwrite', (s) => s.delete(ID));
  },
};
