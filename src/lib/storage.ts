import type { Note, Session, Settings } from '../types';
import { idbPut, idbRemove } from './idb';

export const STORAGE_KEYS = {
  settings: 'akidoro.settings.v1',
  sessions: 'akidoro.sessions.v1',
  notes: 'akidoro.notes.v1',
  timer: 'akidoro.timer.v1',
  // Mirror of just the theme, read by the inline pre-paint script in index.html.
  theme: 'akidoro.theme.v1',
  // Device-wide marker of the signed-in account id, used to detect account
  // switches across tabs so a stale tab can never upload the previous account.
  authUser: 'akidoro.authUser.v1',
} as const;

const LEGACY_PREFIX = 'focustime.';
const CURRENT_PREFIX = 'akidoro.';

/**
 * One-time rename of the pre-Akidoro (`focustime.*`) browser keys so existing
 * guests keep their history and settings. Existing Akidoro keys always win.
 */
export function migrateLegacyStorage(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const moves: Array<[string, string]> = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LEGACY_PREFIX)) {
        const next = `${CURRENT_PREFIX}${key.slice(LEGACY_PREFIX.length)}`;
        if (localStorage.getItem(next) === null) moves.push([key, next]);
      }
    }
    for (const [oldKey, newKey] of moves) {
      const value = localStorage.getItem(oldKey);
      if (value !== null) localStorage.setItem(newKey, value);
    }
  } catch {
    /* storage unavailable — nothing to migrate */
  }
}

migrateLegacyStorage();

// Mirror whatever local data already exists to IndexedDB once, without deleting it.
void (function mirrorToIndexedDb() {
  if (typeof localStorage === 'undefined' || typeof indexedDB === 'undefined') return;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key) idbPut(key, localStorage.getItem(key));
    }
  } catch {
    /* best effort */
  }
})();

/**
 * Signed-in users get their own localStorage namespace so that two accounts on the
 * same device never share history. Guests (scope = null) keep the legacy keys.
 */
let scopeId: string | null = null;

export function setStorageScope(userId: string | null): void {
  scopeId = userId;
}

export function getStorageScope(): string | null {
  return scopeId;
}

function scoped(base: string): string {
  return scopeId ? `${base}.${scopeId}` : base;
}

function settingsKey(): string {
  return scoped(STORAGE_KEYS.settings);
}

function settingsMetaKey(): string {
  return `${scoped(STORAGE_KEYS.settings)}.meta`;
}

function sessionsKey(): string {
  return scoped(STORAGE_KEYS.sessions);
}

export function readJSON<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') {
    idbPut(key, value);
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage can be full or disabled (private mode). Fail visible at call site if needed. */
  }
  // Durable mirror: best-effort, never blocks the synchronous API.
  idbPut(key, value);
}

export function removeKey(key: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  idbRemove(key);
}

// --- Settings -----------------------------------------------------------------
export function readStoredSettings(): Partial<Settings> | null {
  return readJSON<Partial<Settings> | null>(settingsKey(), null);
}

export function writeStoredSettings(settings: Settings): void {
  writeJSON(settingsKey(), settings);
}

/** ISO timestamp of the last local settings edit, used for last-write-wins sync. */
export function readSettingsMeta(): string | null {
  return readJSON<{ updatedAt?: string } | null>(settingsMetaKey(), null)?.updatedAt ?? null;
}

export function writeSettingsMeta(updatedAt: string): void {
  writeJSON(settingsMetaKey(), { updatedAt });
}

// --- Notes --------------------------------------------------------------------
function notesKey(): string {
  return scoped(STORAGE_KEYS.notes);
}

export function readNotes(): Note[] {
  const notes = readJSON<Note[]>(notesKey(), []);
  return Array.isArray(notes) ? notes : [];
}

export function writeNotes(notes: Note[]): void {
  writeJSON(notesKey(), notes);
}

export function readGuestNotes(): Note[] {
  const notes = readJSON<Note[]>(STORAGE_KEYS.notes, []);
  return Array.isArray(notes) ? notes : [];
}

// --- Sessions -----------------------------------------------------------------
export function readSessions(): Session[] {
  const sessions = readJSON<Session[]>(sessionsKey(), []);
  return Array.isArray(sessions) ? sessions : [];
}

interface SessionRecord extends Session {}

/**
 * Append a session, deduplicating by id. Reads the latest value from storage first
 * so that two tabs writing concurrently do not clobber each other.
 */
export function appendSession(session: Session): Session[] {
  const current = readSessions();
  const existingIndex = current.findIndex((s) => s.id === session.id);
  let next: Session[];
  if (existingIndex >= 0) {
    // Keep the record with the greater actual duration (a partial record can be
    // upgraded to a completed one if both tabs finalise the same session).
    if (current[existingIndex].durationSec >= session.durationSec) return current;
    next = current.slice();
    next[existingIndex] = session;
  } else {
    next = [...current, session];
  }
  next.sort((a, b) => a.startedAt - b.startedAt);
  writeJSON(sessionsKey(), next);
  return next;
}

export function replaceSessions(sessions: Session[]): void {
  writeJSON(sessionsKey(), sessions);
}

export function clearSessions(): void {
  writeJSON(sessionsKey(), []);
}

export function hasGuestData(): boolean {
  if (typeof localStorage === 'undefined') return false;
  const hasSessions = readJSON<Session[]>(STORAGE_KEYS.sessions, []).length > 0;
  const hasNotes = readJSON<Note[]>(STORAGE_KEYS.notes, []).length > 0;
  const hasSettings = localStorage.getItem(STORAGE_KEYS.settings) != null;
  return hasSessions || hasSettings || hasNotes;
}

/** Remove the guest-scoped keys after migration (or dismissal). */
export function clearGuestData(): void {
  removeKey(STORAGE_KEYS.sessions);
  removeKey(STORAGE_KEYS.settings);
  removeKey(`${STORAGE_KEYS.settings}.meta`);
  removeKey(STORAGE_KEYS.notes);
}

export function readGuestSessions(): Session[] {
  const sessions = readJSON<Session[]>(STORAGE_KEYS.sessions, []);
  return Array.isArray(sessions) ? sessions : [];
}

export function readGuestSettings(): Partial<Settings> | null {
  return readJSON<Partial<Settings> | null>(STORAGE_KEYS.settings, null);
}

export function exportSessions(): string {
  const payload: SessionRecord[] = readSessions();
  return JSON.stringify(
    { app: 'Akidoro', exportedAt: new Date().toISOString(), sessions: payload },
    null,
    2,
  );
}
