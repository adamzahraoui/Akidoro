// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setStorageScope as clearStorageScopeShim } from '../src/lib/storage';
import {
  detectIndexedDbRecovery,
  hydrateFromIndexedDB,
  recoverFromIndexedDb,
  writeJSON,
  writeNotes,
  readNotes,
} from '../src/lib/storage';
import { putWhiteboard } from '../src/lib/whiteboardStorage';
import { readSessions } from '../src/lib/storage';
import type { Session } from '../src/types';
import { idbPut } from '../src/lib/idb';

const session = (id: string): Session => ({
  id,
  mode: 'focus',
  label: '',
  startedAt: 1000,
  endedAt: 1600,
  durationSec: 600,
  completed: true,
  segments: [{ start: 1000, end: 1600 }],
});

async function clearAkidoroDb() {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('akidoro', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (db.objectStoreNames.contains('kv')) {
      await new Promise<void>((resolve) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
    }
    db.close();
  } catch {
    /* ignore */
  }
}

beforeEach(async () => {
  localStorage.clear();
  (await clearAkidoroDb());
  clearStorageScopeShim(null);
});

afterEach(async () => {
  localStorage.clear();
  await clearAkidoroDb();
  clearStorageScopeShim(null);
});

describe('storage recovery hydration', () => {
  it('hydrates a missing localStorage key from IndexedDB', async () => {
    idbPut('akidoro.sessions.v1', [session('idb-1')]);
    // Simulate the mirror written by an earlier build.
    expect(localStorage.getItem('akidoro.sessions.v1')).toBeNull();
    await hydrateFromIndexedDB();
    expect(readSessions().map((s) => s.id)).toEqual(['idb-1']);
  });

  it('does not overwrite an empty localStorage array with IndexedDB data automatically', async () => {
    writeJSON('akidoro.sessions.v1', []);
    idbPut('akidoro.sessions.v1', [session('idb-2')]);
    await hydrateFromIndexedDB();
    expect(readSessions()).toEqual([]);
    const offers = await detectIndexedDbRecovery();
    expect(offers.map((o) => o.key)).toContain('akidoro.sessions.v1');
    expect(offers[0].populatedIndexedDb).toBe(true);
  });

  it('does not replace a non-empty local edit with IndexedDB data', async () => {
    writeJSON('akidoro.sessions.v1', [session('local-1')]);
    idbPut('akidoro.sessions.v1', [session('idb-2')]);
    await hydrateFromIndexedDB();
    expect(readSessions().map((s) => s.id)).toEqual(['local-1']);
  });

  it('offers and recovers missing records without duplicating local ones', async () => {
    writeJSON('akidoro.sessions.v1', []);
    idbPut('akidoro.sessions.v1', [session('idb-3')]);
    const recovered = await recoverFromIndexedDb(['akidoro.sessions.v1']);
    expect(recovered).toBe(1);
    expect(readSessions().map((s) => s.id)).toEqual(['idb-3']);
  });
});
