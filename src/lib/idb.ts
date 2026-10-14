// Best-effort IndexedDB mirror for the existing synchronous storage layer.
// The public storage API remains synchronous so timer/session flows and tests do
// not need to await a round-trip; IndexedDB here provides an additional durable
// local copy and tracks the migration from older localStorage data.
const DB_NAME = 'akidoro';
const STORE = 'kv';
const VERSION = 1;

function openDb(): IDBOpenDBRequest | null {
  if (typeof indexedDB === 'undefined') return null;
  try {
    return indexedDB.open(DB_NAME, VERSION);
  } catch {
    return null;
  }
}

export function idbPut(key: string, value: unknown): void {
  const request = openDb();
  if (!request) return;
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
  };
  request.onsuccess = () => {
    try {
      const db = request.result;
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ key, value: JSON.stringify(value) });
    } catch {
      /* best effort only */
    }
  };
}

export function idbRemove(key: string): void {
  const request = openDb();
  if (!request) return;
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
  };
  request.onsuccess = () => {
    try {
      const db = request.result;
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
    } catch {
      /* best effort only */
    }
  };
}
