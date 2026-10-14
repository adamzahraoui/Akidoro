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
  removeKey,
  replaceSessions,
  setStorageScope,
  writeJSON,
  writeNotes,
  writeSettingsMeta,
  writeStoredSettings,
} from '../lib/storage';
import { ApiError, api } from '../lib/api';
import type { AuthUser, ServerNote, ServerSession } from '../lib/api';
import { authErrorMessage, hasAuthRedirect, parseAuthRedirect } from '../lib/authRedirect';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { mergeSessions } from '../lib/merge';
import { activeNotes, mergeNotes } from '../lib/notesMerge';
import { uid } from '../lib/id';
import { useTimer } from '../timer/useTimer';
import type { SessionEndEvent, UseTimerResult } from '../timer/useTimer';
import { playCompletionChime } from '../lib/sound';
import { showNotification } from '../lib/notifications';
import { formatClock, formatDuration, modeLabel } from '../lib/format';

/** Sync is disabled under test and when Supabase is not configured. */
const SYNC_ENABLED = import.meta.env.MODE !== 'test' && supabaseConfigured;

export type SyncPhase = 'disabled' | 'offline' | 'syncing' | 'synced' | 'error';

export interface SyncInfo {
  phase: SyncPhase;
  pending: number;
  lastSyncedAt: number | null;
  error: string | null;
}

interface AppContextValue {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  resetSettings: () => void;
  sessions: Session[];
  clearHistory: () => void;
  exportHistory: () => string;
  timer: UseTimerResult;
  // Notes
  notes: Note[];
  createNote: () => string;
  updateNote: (id: string, patch: { title?: string; content?: string }) => void;
  deleteNote: (id: string) => void;
  restoreNote: (id: string) => void;
  // Accounts & cloud sync
  user: AuthUser | null;
  authReady: boolean;
  googleLoginConfigured: boolean;
  login: () => void;
  logout: () => Promise<void>;
  authError: string | null;
  dismissAuthError: () => void;
  sync: SyncInfo;
  syncNow: () => Promise<void>;
  guestMergePending: boolean;
  mergeGuestData: () => Promise<void>;
  dismissGuestMerge: () => void;
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

function initialSync(): SyncInfo {
  return {
    phase: SYNC_ENABLED ? 'offline' : 'disabled',
    pending: 0,
    lastSyncedAt: null,
    error: null,
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const settingsUpdatedAtRef = useRef<string | null>(SYNC_ENABLED ? readSettingsMeta() : null);

  const [sessions, setSessions] = useState<Session[]>(readSessions);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  // All note records including soft-delete tombstones; the UI sees activeNotes().
  const [notesAll, setNotesAll] = useState<Note[]>(readNotes);
  const notesAllRef = useRef(notesAll);
  notesAllRef.current = notesAll;

  const [user, setUser] = useState<AuthUser | null>(null);
  const userRef = useRef<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(!SYNC_ENABLED);
  const [googleLoginConfigured] = useState(supabaseConfigured);
  const [sync, setSync] = useState<SyncInfo>(initialSync);
  const [guestMergePending, setGuestMergePending] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const pushTimer = useRef<number | null>(null);
  const clearingRef = useRef(false);
  // Bumped whenever the identity changes so a late response from a previous
  // account can never mutate state belonging to the next one.
  const epochRef = useRef(0);

  /** Persist + publish the full note set (incl. tombstones). */
  const commitNotes = useCallback((next: Note[]) => {
    writeNotes(next);
    setNotesAll(next);
    notesAllRef.current = next;
  }, []);

  /** Drop the signed-in identity and fall back to guest-scoped local data. */
  const resetToGuest = useCallback((message: string | null = null) => {
    epochRef.current += 1;
    setStorageScope(null);
    removeKey(STORAGE_KEYS.authUser);
    userRef.current = null;
    setUser(null);
    setGuestMergePending(false);
    const nextSessions = readSessions();
    setSessions(nextSessions);
    sessionsRef.current = nextSessions;
    commitNotes(readNotes());
    const nextSettings = loadSettings();
    setSettings(nextSettings);
    settingsRef.current = nextSettings;
    settingsUpdatedAtRef.current = readSettingsMeta();
    setSync(initialSync());
    if (message) setAuthError(message);
  }, [commitNotes]);

  const pushPending = useCallback(async () => {
    if (!SYNC_ENABLED || !userRef.current || clearingRef.current) return;
    const epoch = epochRef.current;
    try {
      setSync((s) => ({ ...s, phase: 'syncing' }));
      await api.bulkSessions(sessionsRef.current as ServerSession[]);
      if (epoch !== epochRef.current) return;
      const iso = settingsUpdatedAtRef.current ?? new Date().toISOString();
      const result = await api.putSettings(
        settingsRef.current as unknown as Record<string, unknown>,
        iso,
      );
      if (epoch !== epochRef.current) return;
      if (result?.updatedAt) {
        settingsUpdatedAtRef.current = result.updatedAt;
        writeSettingsMeta(result.updatedAt);
      }
      // The server rejected a stale write: adopt its newer copy so both sides converge
      // instead of reporting "Synced" while holding divergent settings.
      if (result && !result.applied && result.settings) {
        const next = pickSettings(result.settings);
        writeStoredSettings(next);
        setSettings(next);
        settingsRef.current = next;
      }
      const notesForPush = notesAllRef.current as ServerNote[];
      await api.putNotes(notesForPush);
      if (epoch !== epochRef.current) return;
      setSync({ phase: 'synced', pending: 0, lastSyncedAt: Date.now(), error: null });
    } catch (err) {
      if (epoch !== epochRef.current) return;
      if (err instanceof ApiError && err.status === 401) {
        resetToGuest('Your session expired. Please sign in again.');
        return;
      }
      setSync((s) => ({
        phase: navigator.onLine ? 'error' : 'offline',
        pending: s.pending + 1,
        lastSyncedAt: s.lastSyncedAt,
        error: err instanceof Error ? err.message : 'Sync failed',
      }));
    }
  }, [resetToGuest]);

  const schedulePush = useCallback(() => {
    if (!SYNC_ENABLED || !userRef.current) return;
    setSync((s) => ({ ...s, phase: 'syncing', pending: s.pending + 1 }));
    if (pushTimer.current) window.clearTimeout(pushTimer.current);
    pushTimer.current = window.setTimeout(() => {
      void pushPending();
    }, 800);
  }, [pushPending]);

  const syncNow = useCallback(async () => {
    if (!SYNC_ENABLED || !userRef.current || clearingRef.current) return;
    const epoch = epochRef.current;
    try {
      setSync((s) => ({ ...s, phase: 'syncing' }));
      const server = await api.getState();
      if (epoch !== epochRef.current) return;
      const merged = mergeSessions(sessionsRef.current, server.sessions);
      replaceSessions(merged);
      setSessions(merged);
      sessionsRef.current = merged;

      if (
        server.settings &&
        server.settingsUpdatedAt &&
        (!settingsUpdatedAtRef.current || server.settingsUpdatedAt > settingsUpdatedAtRef.current)
      ) {
        const next = pickSettings(server.settings);
        writeStoredSettings(next);
        settingsUpdatedAtRef.current = server.settingsUpdatedAt;
        writeSettingsMeta(server.settingsUpdatedAt);
        setSettings(next);
        settingsRef.current = next;
      }
      // Pull notes from the server and reconcile with local (tombstone-aware LWW).
      const serverNotes = await api.getNotes();
      if (epoch !== epochRef.current) return;
      commitNotes(mergeNotes(notesAllRef.current, serverNotes));
      await pushPending();
    } catch (err) {
      if (epoch !== epochRef.current) return;
      if (err instanceof ApiError && err.status === 401) {
        resetToGuest('Your session expired. Please sign in again.');
        return;
      }
      setSync((s) => ({
        ...s,
        phase: navigator.onLine ? 'error' : 'offline',
        error: err instanceof Error ? err.message : 'Sync failed',
      }));
    }
  }, [pushPending, resetToGuest]);

  const adoptUser = useCallback(
    async (nextUser: AuthUser) => {
      epochRef.current += 1;
      setStorageScope(nextUser.id);
      writeJSON(STORAGE_KEYS.authUser, nextUser.id);
      setAuthError(null);
      const scopedSessions = readSessions();
      const scopedSettings = readStoredSettings();
      const initialSessions = scopedSessions.length ? scopedSessions : [];
      const initialSettings = scopedSettings
        ? { ...DEFAULT_SETTINGS, ...scopedSettings }
        : DEFAULT_SETTINGS;

      setSessions(initialSessions);
      sessionsRef.current = initialSessions;
      const scopedNotes = readNotes();
      commitNotes(scopedNotes);
      setSettings(initialSettings);
      settingsRef.current = initialSettings;
      settingsUpdatedAtRef.current = readSettingsMeta();
      userRef.current = nextUser;
      setUser(nextUser);
      setGuestMergePending(hasGuestData());
      await syncNow();
    },
    [syncNow],
  );

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
      schedulePush();
    },
    [schedulePush],
  );

  const timer = useTimer(settings, handleSessionEnd);

  const notes = useMemo(() => activeNotes(notesAll), [notesAll]);

  const login = useCallback(() => {
    void api.signInWithGoogle().catch((err) => {
      setAuthError(err instanceof Error ? err.message : 'Could not start sign-in.');
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.signOut();
    } catch {
      /* ignore — reset locally regardless */
    }
    setAuthError(null);
    resetToGuest();
  }, [resetToGuest]);

  const dismissAuthError = useCallback(() => setAuthError(null), []);

  const mergeGuestData = useCallback(async () => {
    const guestSessions = readGuestSessions();
    const guestSettings = readGuestSettings();
    const guestNotes = readGuestNotes();
    const merged = mergeSessions(sessionsRef.current, guestSessions);
    replaceSessions(merged);
    setSessions(merged);
    sessionsRef.current = merged;

    // Idempotent: merging guest notes is a union by id (LWW + tombstones), then
    // the guest copy is cleared so a second import cannot duplicate anything.
    if (guestNotes.length) commitNotes(mergeNotes(notesAllRef.current, guestNotes));

    if (guestSettings && !settingsUpdatedAtRef.current) {
      const next = { ...DEFAULT_SETTINGS, ...guestSettings };
      writeStoredSettings(next);
      setSettings(next);
      settingsRef.current = next;
    }
    clearGuestData();
    setGuestMergePending(false);
    await pushPending();
  }, [commitNotes, pushPending]);

  const dismissGuestMerge = useCallback(() => {
    clearGuestData();
    setGuestMergePending(false);
  }, []);

  // --- Notes ---------------------------------------------------------------
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
    schedulePush();
    return note.id;
  }, [commitNotes, schedulePush]);

  const updateNote = useCallback((id: string, patch: { title?: string; content?: string }) => {
    const now = Date.now();
    const next = notesAllRef.current.map((n) =>
      n.id === id ? { ...n, ...patch, updatedAt: now } : n,
    );
    commitNotes(next);
    schedulePush();
  }, [commitNotes, schedulePush]);

  const deleteNote = useCallback((id: string) => {
    const now = Date.now();
    const next = notesAllRef.current.map((n) =>
      n.id === id && n.deletedAt === null ? { ...n, deletedAt: now, updatedAt: now } : n,
    );
    commitNotes(next);
    schedulePush();
  }, [commitNotes, schedulePush]);

  const restoreNote = useCallback((id: string) => {
    const now = Date.now();
    const next = notesAllRef.current.map((n) =>
      n.id === id ? { ...n, deletedAt: null, updatedAt: now } : n,
    );
    commitNotes(next);
    schedulePush();
  }, [commitNotes, schedulePush]);

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
    schedulePush();
  }, [schedulePush]);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    writeStoredSettings(DEFAULT_SETTINGS);
    const iso = new Date().toISOString();
    settingsUpdatedAtRef.current = iso;
    writeSettingsMeta(iso);
    settingsRef.current = DEFAULT_SETTINGS;
    schedulePush();
  }, [schedulePush]);

  const removeAllSessions = useCallback(() => {
    if (pushTimer.current) window.clearTimeout(pushTimer.current);
    const clearLocal = () => {
      clearSessions();
      setSessions([]);
      sessionsRef.current = [];
      clearingRef.current = false;
    };
    if (!(SYNC_ENABLED && userRef.current)) {
      clearLocal();
      return;
    }
    // Wait for the server delete before dropping local data. Blocking push/pull while
    // clearing stops a concurrent sync from re-uploading (resurrecting) the deleted rows.
    clearingRef.current = true;
    void (async () => {
      try {
        await api.deleteSessions();
        clearLocal();
      } catch (err) {
        clearingRef.current = false;
        if (err instanceof ApiError && err.status === 401) {
          resetToGuest('Your session expired. Please sign in again.');
          return;
        }
        setSync((s) => ({
          ...s,
          phase: navigator.onLine ? 'error' : 'offline',
          error: 'Could not clear cloud history. Please try again.',
        }));
      }
    })();
  }, [resetToGuest]);

  const exportHistory = useCallback(() => exportSessions(), []);

  // Bootstrap Supabase Auth: restore the session, react to sign-in/out and
  // surface any OAuth error left in the URL.
  useEffect(() => {
    if (!SYNC_ENABLED || !supabase) return;
    const sb = supabase;
    let cancelled = false;

    (async () => {
      try {
        const { data } = await sb.auth.getSession();
        if (!cancelled && data.session?.user) {
          const me = await api.getMe();
          if (!cancelled && me.user) await adoptUser(me.user);
        }
      } catch {
        if (!cancelled) {
          setSync((s) => ({ ...s, phase: 'error', error: 'Could not check sign-in status' }));
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();

    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      // Defer so we never call other Supabase methods inside the callback.
      setTimeout(() => {
        void (async () => {
          if (event === 'SIGNED_OUT') {
            if (userRef.current) resetToGuest();
            return;
          }
          if (!session?.user) return;
          if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') {
            try {
              const me = await api.getMe();
              if (me.user && me.user.id !== userRef.current?.id) await adoptUser(me.user);
            } catch {
              /* transient; the periodic sync will retry */
            }
          }
        })();
      }, 0);
    });

    const redirect = parseAuthRedirect(window.location.search, window.location.hash);
    if (redirect.status === 'error') setAuthError(authErrorMessage(redirect.reason));
    if (hasAuthRedirect(window.location.search, window.location.hash)) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [adoptUser, resetToGuest]);

  // Retry when connectivity returns and reconcile periodically.
  useEffect(() => {
    if (!SYNC_ENABLED) return;
    const onOnline = () => void syncNow();
    const onOffline = () => setSync((s) => ({ ...s, phase: 'offline' }));
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && userRef.current) void syncNow();
    }, 60000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.clearInterval(interval);
      if (pushTimer.current) window.clearTimeout(pushTimer.current);
    };
  }, [syncNow]);

  // React to changes made in other tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      // A different tab signed in as another account (or signed out). Re-bootstrap so
      // this tab can never keep pushing the previous account's local data.
      if (e.key === STORAGE_KEYS.authUser) {
        if (!SYNC_ENABLED) return;
        let nextId: string | null = null;
        try {
          nextId = e.newValue ? (JSON.parse(e.newValue) as string) : null;
        } catch {
          nextId = null;
        }
        if (nextId !== (userRef.current?.id ?? null)) window.location.reload();
        return;
      }
      if (userRef.current) return; // scoped keys are per-user; ignore while signed in
      if (e.key === STORAGE_KEYS.sessions) setSessions(readSessions());
      if (e.key === STORAGE_KEYS.settings) setSettings(loadSettings());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Apply the theme to <html> and mirror it for the pre-paint script.
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && media.matches);
      root.classList.toggle('dark', dark);
      root.style.colorScheme = dark ? 'dark' : 'light';
    };
    apply();
    writeJSON(STORAGE_KEYS.theme, settings.theme);
    if (settings.theme === 'system') {
      media.addEventListener('change', apply);
      return () => media.removeEventListener('change', apply);
    }
    return undefined;
  }, [settings.theme]);

  // Remaining time in the browser tab title.
  useEffect(() => {
    document.title = `${formatClock(timer.remaining)} • ${modeLabel(timer.state.mode)} — Akidoro`;
  }, [timer.remaining, timer.state.mode]);

  const value = useMemo<AppContextValue>(
    () => ({
      settings,
      updateSettings,
      resetSettings,
      sessions,
      clearHistory: removeAllSessions,
      exportHistory,
      timer,
      notes,
      createNote,
      updateNote,
      deleteNote,
      restoreNote,
      user,
      authReady,
      googleLoginConfigured,
      login,
      logout,
      authError,
      dismissAuthError,
      sync,
      syncNow,
      guestMergePending,
      mergeGuestData,
      dismissGuestMerge,
    }),
    [
      settings,
      updateSettings,
      resetSettings,
      sessions,
      removeAllSessions,
      exportHistory,
      timer,
      notes,
      createNote,
      updateNote,
      deleteNote,
      restoreNote,
      user,
      authReady,
      googleLoginConfigured,
      login,
      logout,
      authError,
      dismissAuthError,
      sync,
      syncNow,
      guestMergePending,
      mergeGuestData,
      dismissGuestMerge,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within an AppProvider');
  return ctx;
}
