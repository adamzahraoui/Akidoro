import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_SETTINGS } from '../types';
import type { Note, Session, Settings } from '../types';
import {
  STORAGE_KEYS,
  appendSession,
  clearGuestData,
  clearSessions,
  exportSessions,
  hasGuestData,
  readGuestNotes,
  readGuestSessions,
  readGuestSettings,
  readNotes,
  readSessions,
  readSettingsMeta,
  readStoredSettings,
  replaceSessions,
  setStorageScope,
  writeNotes,
  writeSettingsMeta,
  writeStoredSettings,
} from '../lib/storage';
import { mergeSessions } from '../lib/merge';
import { activeNotes, mergeNotes } from '../lib/notesMerge';
import { uid } from '../lib/id';
import { useTimer } from '../timer/useTimer';
import type { SessionEndEvent, UseTimerResult } from '../timer/useTimer';
import { playCompletionChime } from '../lib/sound';
import { showNotification } from '../lib/notifications';
import { formatDuration } from '../lib/format';

export interface SyncInfo {
  phase: 'local';
  pending: number;
  lastSyncedAt: null;
  error: string | null;
}

interface AppContextValue {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  resetSettings: () => void;
  sessions: Session[];
  clearHistory: () => void;
  exportHistory: () => string;
  exportBackup: () => string;
  importBackup: (json: string) => Promise<{ ok: boolean; message: string }>;
  timer: UseTimerResult;
  notes: Note[];
  createNote: () => string;
  updateNote: (id: string, patch: { title?: string; content?: string }) => void;
  deleteNote: (id: string) => void;
  restoreNote: (id: string) => void;
  accountImportPending: boolean;
  accountScopeIds: string[];
  importAccountData: (scopeId: string) => Promise<void>;
  dismissAccountImport: () => void;
  guestMergePending: boolean;
  mergeGuestData: () => Promise<void>;
  dismissGuestMerge: () => void;
  user: null;
  authReady: boolean;
  googleLoginConfigured: boolean;
  login: () => void;
  logout: () => Promise<void>;
  authError: string | null;
  dismissAuthError: () => void;
  sync: SyncInfo;
  syncNow: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

function loadSettings(): Settings {
  const stored = readStoredSettings();
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>;

function pickSettings(raw: Record<string, unknown> | null): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (raw) {
    for (const key of SETTINGS_KEYS) {
      if (key in raw) (out as unknown as Record<string, unknown>)[key] = raw[key];
    }
  }
  return out;
}

function findAccountScopes(): string[] {
  if (typeof localStorage === 'undefined') return [];
  const scopes = new Set<string>();
  const bases = [STORAGE_KEYS.notes, STORAGE_KEYS.sessions, STORAGE_KEYS.settings];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    for (const base of bases) {
      if (key === base) continue;
      const prefix = `${base}.`;
      if (key.startsWith(prefix)) {
        const scope = key.slice(prefix.length);
        if (scope && scope !== STORAGE_KEYS.notes && !scope.endsWith('.meta')) {
          scopes.add(scope);
        }
      }
    }
  }
  return [...scopes].sort();
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const settingsUpdatedAtRef = useRef<string | null>(readSettingsMeta());

  const [sessions, setSessions] = useState<Session[]>(readSessions);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  const [notesAll, setNotesAll] = useState<Note[]>(readNotes);
  const notesAllRef = useRef(notesAll);
  notesAllRef.current = notesAll;

  const [accountScopeIds, setAccountScopeIds] = useState<string[]>(findAccountScopes());
  const [accountImportPending, setAccountImportPending] = useState(accountScopeIds.length > 0);
  const [guestMergePending, setGuestMergePending] = useState(hasGuestData());

  const commitNotes = useCallback((next: Note[]) => {
    writeNotes(next);
    setNotesAll(next);
    notesAllRef.current = next;
  }, []);

  const handleSessionEnd = useCallback(
    (event: SessionEndEvent) => {
      setSessions(appendSession(event.session));
      const config = settingsRef.current;
      if (!event.recovered && event.session.completed) {
        const isFocus = event.session.mode === 'focus';
        if (config.soundEnabled) playCompletionChime(config.volume, isFocus ? 'focus' : 'break');
        if (config.notifications) {
          const label = event.session.label ? `“${event.session.label}” ` : '';
          showNotification(
            isFocus ? 'Focus session complete' : 'Break complete',
            isFocus
              ? `${label}${formatDuration(event.session.durationSec)} done. Time for a break.`
              : `${label}Break over. Ready to focus?`,
          );
        }
      }
    },
    [],
  );

  const timer = useTimer(settings, handleSessionEnd);

  const notes = useMemo(() => activeNotes(notesAll), [notesAll]);

  const login = useCallback(() => undefined, []);
  const logout = useCallback(async () => undefined, []);
  const authError = null;
  const dismissAuthError = useCallback(() => undefined, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      writeStoredSettings(next);
      const iso = new Date().toISOString();
      settingsUpdatedAtRef.current = iso;
      writeSettingsMeta(iso);
      settingsRef.current = next;
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    writeStoredSettings(DEFAULT_SETTINGS);
    const iso = new Date().toISOString();
    settingsUpdatedAtRef.current = iso;
    writeSettingsMeta(iso);
    settingsRef.current = DEFAULT_SETTINGS;
  }, []);

  const clearHistory = useCallback(() => {
    clearSessions();
    setSessions([]);
    sessionsRef.current = [];
  }, []);

  const exportHistory = useCallback(() => exportSessions(), []);

  const exportBackup = useCallback((): string => {
    return JSON.stringify(
      {
        version: 1,
        app: 'Akidoro',
        exportedAt: new Date().toISOString(),
        settings: settingsRef.current,
        settingsUpdatedAt: settingsUpdatedAtRef.current,
        sessions: sessionsRef.current,
        notes: notesAllRef.current,
      },
      null,
      2,
    );
  }, []);

  const importBackup = useCallback(async (json: string): Promise<{ ok: boolean; message: string }> => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return { ok: false, message: 'Backup file is not valid JSON.' };
    }
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, message: 'Backup file is invalid.' };
    }
    const body = parsed as Record<string, unknown>;
    if (body.app !== 'Akidoro' || body.version !== 1) {
      return { ok: false, message: 'Unsupported backup format or version.' };
    }
    const importedSettings =
      body.settings && typeof body.settings === 'object' ? (body.settings as Record<string, unknown>) : null;
    const importedSessions = Array.isArray(body.sessions) ? body.sessions : null;
    const importedNotes = Array.isArray(body.notes) ? body.notes : null;
    if (!importedSessions || !importedNotes) {
      return { ok: false, message: 'Backup is missing sessions or notes.' };
    }

    type SanitizedSession = Session;
    const sessionsToImport: SanitizedSession[] = [];
    for (const item of importedSessions) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      if (typeof record.id !== 'string' || typeof record.mode !== 'string') continue;
      sessionsToImport.push(record as unknown as Session);
    }

    const notesToImport: Note[] = [];
    for (const item of importedNotes) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const id = String(row.id ?? '').slice(0, 200);
      if (!id) continue;
      const title = String(row.title ?? '').slice(0, 300);
      const content = String(row.content ?? '').slice(0, 100000);
      const createdAt = Math.round(Number(row.createdAt) || 0);
      const updatedAt = Math.round(Number(row.updatedAt) || 0);
      if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt) || createdAt <= 0 || updatedAt <= 0) {
        continue;
      }
      const rawDeleted = row.deletedAt == null ? null : Math.round(Number(row.deletedAt) || 0);
      const deletedAt = rawDeleted == null || rawDeleted <= 0 ? null : rawDeleted;
      if (deletedAt !== null && deletedAt < createdAt) continue;
      notesToImport.push({ id, title, content, createdAt, updatedAt, deletedAt });
    }

    const hasExisting = sessionsRef.current.length > 0 || notesAllRef.current.length > 0 || readStoredSettings() !== null;
    if (hasExisting) {
      const ok = window.confirm(
        'This backup will be merged into the current local data by id (duplicates are skipped). Continue?',
      );
      if (!ok) return { ok: false, message: 'Import cancelled.' };
    }

    if (importedSettings) {
      const next = pickSettings(importedSettings);
      writeStoredSettings(next);
      const iso = new Date().toISOString();
      settingsUpdatedAtRef.current = iso;
      writeSettingsMeta(iso);
      setSettings(next);
      settingsRef.current = next;
    }

    const mergedSessions = mergeSessions(sessionsRef.current, sessionsToImport);
    replaceSessions(mergedSessions);
    setSessions(mergedSessions);
    sessionsRef.current = mergedSessions;

    commitNotes(mergeNotes(notesAllRef.current, notesToImport));
    return { ok: true, message: 'Backup imported and saved locally.' };
  }, []);

  const createNote = useCallback((): string => {
    const now = Date.now();
    const note: Note = {
      id: uid('note'),
      title: '',
      content: '',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    commitNotes([...notesAllRef.current, note]);
    return note.id;
  }, [commitNotes]);

  const updateNote = useCallback((id: string, patch: { title?: string; content?: string }) => {
    const now = Date.now();
    const next = notesAllRef.current.map((n) =>
      n.id === id ? { ...n, ...patch, updatedAt: now } : n,
    );
    commitNotes(next);
  }, [commitNotes]);

  const deleteNote = useCallback((id: string) => {
    const now = Date.now();
    const next = notesAllRef.current.map((n) =>
      n.id === id && n.deletedAt === null ? { ...n, deletedAt: now, updatedAt: now } : n,
    );
    commitNotes(next);
  }, [commitNotes]);

  const restoreNote = useCallback((id: string) => {
    const now = Date.now();
    const next = notesAllRef.current.map((n) =>
      n.id === id ? { ...n, deletedAt: null, updatedAt: now } : n,
    );
    commitNotes(next);
  }, [commitNotes]);

  const mergeGuestData = useCallback(async () => {
    const guestSessions = readGuestSessions();
    const guestSettings = readGuestSettings();
    const guestNotes = readGuestNotes();
    const merged = mergeSessions(sessionsRef.current, guestSessions);
    replaceSessions(merged);
    setSessions(merged);
    sessionsRef.current = merged;

    if (guestNotes.length) commitNotes(mergeNotes(notesAllRef.current, guestNotes));

    if (guestSettings && !settingsUpdatedAtRef.current) {
      const next = { ...DEFAULT_SETTINGS, ...guestSettings };
      writeStoredSettings(next);
      setSettings(next);
      settingsRef.current = next;
    }
    clearGuestData();
    setGuestMergePending(false);
  }, [commitNotes]);

  const dismissGuestMerge = useCallback(() => {
    clearGuestData();
    setGuestMergePending(false);
  }, []);

  const importAccountData = useCallback(async (scopeId: string) => {
    setStorageScope(scopeId);
    const scopedSessions = readSessions();
    const scopedSettings = readStoredSettings();
    const scopedNotes = readNotes();
    setStorageScope(null);

    const mergedSessions = mergeSessions(sessionsRef.current, scopedSessions);
    replaceSessions(mergedSessions);
    setSessions(mergedSessions);
    sessionsRef.current = mergedSessions;

    commitNotes(mergeNotes(notesAllRef.current, scopedNotes));

    if (scopedSettings && !readStoredSettings()) {
      const next = { ...DEFAULT_SETTINGS, ...scopedSettings };
      writeStoredSettings(next);
      setSettings(next);
      settingsRef.current = next;
    }

    setAccountImportPending(false);
  }, [commitNotes]);

  const dismissAccountImport = useCallback(() => {
    setAccountImportPending(false);
  }, []);

  const syncNow = useCallback(async () => undefined, []);

  useEffect(() => {
    // Unused account import is only prompted if scoped data exists. Keep scopes in state.
    setAccountScopeIds(findAccountScopes());
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      settings,
      updateSettings,
      resetSettings,
      sessions,
      clearHistory,
      exportHistory,
      exportBackup,
      importBackup,
      timer,
      notes,
      createNote,
      updateNote,
      deleteNote,
      restoreNote,
      accountImportPending,
      accountScopeIds,
      importAccountData,
      dismissAccountImport,
      guestMergePending,
      mergeGuestData,
      dismissGuestMerge,
      user: null,
      authReady: true,
      googleLoginConfigured: false,
      login,
      logout,
      authError,
      dismissAuthError,
      sync: { phase: 'local', pending: 0, lastSyncedAt: null, error: null },
      syncNow,
    }),
    [
      settings,
      updateSettings,
      resetSettings,
      sessions,
      clearHistory,
      exportHistory,
      exportBackup,
      importBackup,
      timer,
      notes,
      createNote,
      updateNote,
      deleteNote,
      restoreNote,
      accountImportPending,
      accountScopeIds,
      importAccountData,
      dismissAccountImport,
      guestMergePending,
      mergeGuestData,
      dismissGuestMerge,
      authError,
      syncNow,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be within AppProvider');
  return ctx;
}
