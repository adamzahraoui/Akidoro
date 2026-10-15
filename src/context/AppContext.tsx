import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_SETTINGS } from '../types';
import type { Note, Project, SavedMusicLink, Session, Settings, Task } from '../types';
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
  readCurrentTaskId,
  readProjects,
  writeProjects,
  readSavedMusic,
  readStoredSettings,
  hydrateFromIndexedDB,
  readTasks,
  detectIndexedDbRecovery,
  recoverFromIndexedDb,
  replaceSessions,
  setStorageScope,
  writeNotes,
  writeCurrentTaskId,
  writeSavedMusic,
  writeSettingsMeta,
  writeTasks,
  writeStoredSettings,
  writeJSON,
} from '../lib/storage';
import { mergeSessions } from '../lib/merge';
import { activeNotes, mergeNotes } from '../lib/notesMerge';
import { uid } from '../lib/id';
import { useTimer } from '../timer/useTimer';
import type { SessionEndEvent, UseTimerResult } from '../timer/useTimer';
import { playCompletionChime } from '../lib/sound';
import { showNotification } from '../lib/notifications';
import { formatDuration } from '../lib/format';
import { getAllWhiteboards, putWhiteboard } from '../lib/whiteboardStorage';

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
  exportBackup: () => Promise<string>;
  importBackup: (json: string) => Promise<{ ok: boolean; message: string }>;
  timer: UseTimerResult;
  notes: Note[];
  sessionSummary: {
    sessionId: string;
    mode: import('../types').Mode;
    durationSec: number;
    label: string | null;
    taskId: string | null;
    projectId: string | null;
    at: number;
  } | null;
  dismissSessionSummary: () => void;
  projects: Project[];
  createProject: (name: string, description?: string, color?: string) => string;
  updateProject: (id: string, patch: Partial<Omit<Project,'id'|'createdAt'>>) => void;
  archiveProject: (id: string) => void;
  restoreProject: (id: string) => void;
  deleteProject: (id: string) => void;
  currentProjectId: string | null;
  selectProject: (id: string | null) => void;
  createNote: (projectId?: string | null) => string;
  updateNote: (id: string, patch: { title?: string; content?: string; pinned?: boolean; projectId?: string | null }) => void;
  deleteNote: (id: string) => void;
  restoreNote: (id: string) => void;
  tasks: import('../types').Task[];
  createTask: (title: string, projectId?: string | null, estimatedPomodoros?: number) => string;
  renameTask: (id: string, title: string) => void;
  toggleTask: (id: string) => void;
  setTaskProject: (id: string, projectId: string | null) => void;
  deleteTask: (id: string) => void;
  currentTaskId: string | null;
  selectTask: (id: string | null) => void;
  savedMusic: import('../types').SavedMusicLink[];
  addSavedMusic: (link: Omit<import('../types').SavedMusicLink,'id'|'createdAt'>) => string;
  renameSavedMusic: (id: string, name: string) => void;
  deleteSavedMusic: (id: string) => void;
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
  indexedDbRecoveryOffers: import('../lib/storage').StorageRecoveryOffer[];
  recoverIndexedDb: (keys?: string[]) => Promise<number>;
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
  const [sessionSummary, setSessionSummary] = useState<{
    sessionId: string;
    mode: import('../types').Mode;
    durationSec: number;
    label: string | null;
    taskId: string | null;
    projectId: string | null;
    at: number;
  } | null>
  (null);
  const [tasks, setTasks] = useState<Task[]>(readTasks);
  const [projects, setProjects] = useState<Project[]>(readProjects);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(
    () => (typeof localStorage !== 'undefined' ? localStorage.getItem('akidoro.currentProject.v1') : null),
  );
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(readCurrentTaskId());
  const [savedMusic, setSavedMusic] = useState<SavedMusicLink[]>(readSavedMusic());
  const notesAllRef = useRef(notesAll);
  notesAllRef.current = notesAll;
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const currentProjectIdRef = useRef(currentProjectId);
  currentProjectIdRef.current = currentProjectId;
  const currentTaskIdRef = useRef(currentTaskId);
  currentTaskIdRef.current = currentTaskId;
  const savedMusicRef = useRef(savedMusic);
  savedMusicRef.current = savedMusic;

  const [accountScopeIds, setAccountScopeIds] = useState<string[]>(findAccountScopes());
  const [accountImportPending, setAccountImportPending] = useState(accountScopeIds.length > 0);
  const [guestMergePending, setGuestMergePending] = useState(hasGuestData());
  const [indexedDbRecoveryOffers, setIndexedDbRecoveryOffers] = useState<import('../lib/storage').StorageRecoveryOffer[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await hydrateFromIndexedDB();
      const offers = await detectIndexedDbRecovery().catch(() => []);
      if (cancelled) return;
      setIndexedDbRecoveryOffers(offers);
      setSessions(readSessions());
      setNotesAll(readNotes());
      setSettings(loadSettings());
      setTasks(readTasks());
      setSavedMusic(readSavedMusic());
      setCurrentTaskId(readCurrentTaskId());
      setProjects(readProjects());
    })();
    return () => { cancelled = true; };
  }, []);

  const commitNotes = useCallback((next: Note[]) => {
    writeNotes(next);
    setNotesAll(next);
    notesAllRef.current = next;
  }, []);

  const commitTasks = useCallback((next: Task[]) => {
    writeTasks(next);
    setTasks(next);
    tasksRef.current = next;
  }, []);

  const commitProjects = useCallback((next: Project[]) => {
    writeProjects(next);
    setProjects(next);
    projectsRef.current = next;
  }, []);

  const commitSavedMusic = useCallback((next: SavedMusicLink[]) => {
    writeSavedMusic(next);
    setSavedMusic(next);
    savedMusicRef.current = next;
  }, []);

  const handleSessionEnd = useCallback(
    (event: SessionEndEvent) => {
      const sessionWithTask = {
        ...event.session,
        taskId: event.session.taskId ?? currentTaskIdRef.current,
        projectId: event.session.projectId ?? currentProjectIdRef.current,
      };
      setSessions(appendSession(sessionWithTask));
      if (event.session.completed) {
        setSessionSummary({
          sessionId: event.session.id,
          mode: event.session.mode,
          durationSec: event.session.durationSec,
          label: event.session.label || null,
          taskId: sessionWithTask.taskId ?? null,
          projectId: sessionWithTask.projectId ?? null,
          at: Date.now(),
        });
      }
      const config = settingsRef.current;
      if (!event.recovered && event.session.completed) {
        const isFocus = event.session.mode === 'focus';
        if (config.soundEnabled) playCompletionChime(config.volume, isFocus ? 'focus' : 'break', config.chime);
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

  const timer = useTimer(settings, { onSessionEnd: handleSessionEnd, getProjectId: () => currentProjectIdRef.current });

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

  const exportBackup = useCallback(async (): Promise<string> => {
    let whiteboards: unknown[] = [];
    try {
      whiteboards = await getAllWhiteboards();
    } catch {
      whiteboards = [];
    }
    return JSON.stringify(
      {
        version: 1,
        app: 'Akidoro',
        exportedAt: new Date().toISOString(),
        settings: settingsRef.current,
        settingsUpdatedAt: settingsUpdatedAtRef.current,
        sessions: sessionsRef.current,
        notes: notesAllRef.current,
        tasks: tasksRef.current,
        projects: projectsRef.current,
        savedMusic: savedMusicRef.current,
        whiteboards,
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
    if (body.app !== 'Akidoro' || (body.version !== 1 && body.version !== 2)) {
      return { ok: false, message: 'Unsupported backup format or version.' };
    }
    const importedSettings =
      body.settings && typeof body.settings === 'object' ? (body.settings as Record<string, unknown>) : null;
    const importedSessions = Array.isArray(body.sessions) ? body.sessions : null;
    const importedNotes = Array.isArray(body.notes) ? body.notes : null;
    const importedProjects = Array.isArray(body.projects) ? body.projects : [];
    const importedTasks = Array.isArray(body.tasks) ? body.tasks : [];
    const importedMusic = Array.isArray(body.savedMusic) ? body.savedMusic : [];
    const importedWhiteboards = Array.isArray(body.whiteboards) ? body.whiteboards : [];
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
      const projectRaw = row.projectId;
      const projectId = typeof projectRaw === 'string' ? projectRaw : null;
      const pinned = Boolean(row.pinned);
      notesToImport.push({ id, title, content, pinned, projectId, createdAt, updatedAt, deletedAt });
    }

    const hasExisting = sessionsRef.current.length > 0 || notesAllRef.current.length > 0 || readStoredSettings() !== null;
    if (hasExisting) {
      const ok = window.confirm(
        'This backup will be merged into the current local data by id (duplicates are skipped). Continue?',
      );
      if (!ok) return { ok: false, message: 'Import cancelled.' };
    }

    const existingProjectIds = new Set(projectsRef.current.map((p) => p.id));
    const projectIdMap = new Map<string, string>();
    const sanitizedProjects: Project[] = [];
    for (const item of importedProjects) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const originalId = String(row.id ?? '').slice(0, 200);
      if (!originalId) continue;
      let id = originalId;
      if (existingProjectIds.has(id)) {
        id = crypto.randomUUID();
      }
      existingProjectIds.add(id);
      projectIdMap.set(originalId, id);
      const createdAt = Math.round(Number(row.createdAt) || Date.now());
      const updatedAt = Math.round(Number(row.updatedAt) || Date.now());
      sanitizedProjects.push({
        id,
        name: String(row.name ?? 'Imported project').slice(0, 200),
        description: String(row.description ?? '').slice(0, 2000),
        color: String(row.color ?? '#dc2626'),
        archived: Boolean(row.archived),
        createdAt,
        updatedAt,
      });
    }
    if (sanitizedProjects.length) {
      const projectMap = new Map(projectsRef.current.map((p) => [p.id, p]));
      for (const p of sanitizedProjects) if (!projectMap.has(p.id)) projectMap.set(p.id, p);
      commitProjects([...projectMap.values()]);
    }

    for (const session of sessionsToImport) {
      if (typeof session.projectId === 'string') {
        session.projectId = projectIdMap.get(session.projectId) ?? session.projectId;
      }
    }
    for (const note of notesToImport) {
      if (typeof note.projectId === 'string') {
        note.projectId = projectIdMap.get(note.projectId) ?? note.projectId;
      }
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

    // Whiteboards: remap IDs to avoid collisions and preserve scene/image data.
    const existingBoards = await getAllWhiteboards().catch(() => []);
    const existingIds = new Set(existingBoards.map((b: any) => b?.id));
    for (const item of importedWhiteboards) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      let id = String(row.id ?? '').trim();
      if (!id || existingIds.has(id)) id = crypto.randomUUID();
      existingIds.add(id);
      const scene = row.scene && typeof row.scene === 'object' ? row.scene : { elements: [], appState: {}, files: {} };
      const boardProjectRaw = row.projectId;
      const boardProjectId = typeof boardProjectRaw === 'string' ? (projectIdMap.get(boardProjectRaw) ?? boardProjectRaw) : null;
      const board = {
        id,
        name: String(row.name ?? 'Imported board').slice(0, 200),
        createdAt: Math.round(Number(row.createdAt) || Date.now()),
        updatedAt: Math.round(Number(row.updatedAt) || Date.now()),
        scene,
        projectId: boardProjectId,
      };
      try {
        await putWhiteboard(board as any);
      } catch {
        /* keep importing other records */
      }
    }

    const sanitizedTasks: Task[] = [];
    for (const item of importedTasks) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const id = String(row.id ?? '').slice(0, 200);
      if (!id) continue;
      const title = String(row.title ?? '').slice(0, 200);
      const createdAt = Math.round(Number(row.createdAt) || 0);
      const updatedAt = Math.round(Number(row.updatedAt) || 0);
      if (createdAt <= 0 || updatedAt <= 0) continue;
      const taskProjectRaw = row.projectId;
      const taskProjectId = typeof taskProjectRaw === 'string' ? (projectIdMap.get(taskProjectRaw) ?? taskProjectRaw) : null;
      sanitizedTasks.push({ id, title, completed: Boolean(row.completed), projectId: taskProjectId, createdAt, updatedAt });
    }
    const taskMap = new Map(tasksRef.current.map((t) => [t.id, t]));
    for (const task of sanitizedTasks) if (!taskMap.has(task.id)) taskMap.set(task.id, task);
    commitTasks([...taskMap.values()]);

    const sanitizedMusic: SavedMusicLink[] = [];
    for (const item of importedMusic) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const id = String(row.id ?? '').slice(0, 200);
      const provider = row.provider === 'youtube' || row.provider === 'spotify' ? row.provider : null;
      if (!id || !provider) continue;
      const name = String(row.name ?? '').slice(0, 200);
      const input = String(row.input ?? '').slice(0, 2000);
      sanitizedMusic.push({ id, provider, name, input, normalizedId: row.normalizedId == null ? null : String(row.normalizedId), createdAt: Math.round(Number(row.createdAt) || Date.now()) });
    }
    const musicMap = new Map(savedMusicRef.current.map((m) => [m.id, m]));
    for (const item of sanitizedMusic) if (!musicMap.has(item.id)) musicMap.set(item.id, item);
    commitSavedMusic([...musicMap.values()]);
    return { ok: true, message: 'Backup imported and saved locally.' };
  }, []);

  const createNote = useCallback((projectId = currentProjectIdRef.current): string => {
    const now = Date.now();
    const note: Note = {
      id: uid('note'),
      title: '',
      content: '',
      pinned: false,
      projectId: projectId ?? currentProjectIdRef.current,
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

  const createTask = useCallback((title: string, projectId?: string | null, estimatedPomodoros?: number): string => {
    const now = Date.now();
    const task: Task = {
      id: uid('task'),
      title: title.trim(),
      completed: false,
      projectId: projectId ?? currentProjectIdRef.current,
      estimatedPomodoros: estimatedPomodoros && estimatedPomodoros > 0 ? estimatedPomodoros : undefined,
      createdAt: now,
      updatedAt: now,
    };
    commitTasks([...tasksRef.current, task]);
    return task.id;
  }, [commitTasks]);

  const renameTask = useCallback((id: string, title: string) => {
    const next = tasksRef.current.map((t) => (t.id === id ? { ...t, title, updatedAt: Date.now() } : t));
    commitTasks(next);
  }, [commitTasks]);

  const toggleTask = useCallback((id: string) => {
    const next = tasksRef.current.map((t) => (t.id === id ? { ...t, completed: !t.completed, updatedAt: Date.now() } : t));
    commitTasks(next);
  }, [commitTasks]);

  const setTaskProject = useCallback((id: string, projectId: string | null) => {
    const next = tasksRef.current.map((t) => (t.id === id ? { ...t, projectId, updatedAt: Date.now() } : t));
    commitTasks(next);
  }, [commitTasks]);

  const deleteTask = useCallback((id: string) => {
    commitTasks(tasksRef.current.filter((t) => t.id !== id));
    if (currentTaskIdRef.current === id) {
      setCurrentTaskId(null);
      writeCurrentTaskId(null);
    }
  }, [commitTasks]);

  const selectTask = useCallback((id: string | null) => {
    setCurrentTaskId(id);
    writeCurrentTaskId(id);
    if (id) {
      const task = tasksRef.current.find((t) => t.id === id);
      if (task) {
        const s = timer.state;
        if (s.status === 'idle' && s.segments.length === 0) timer.controls.setLabel(task.title);
        if (task.projectId && task.projectId !== currentProjectIdRef.current) selectProject(task.projectId);
      }
    }
  }, [timer]);

  const addSavedMusic = useCallback((link: Omit<SavedMusicLink, 'id' | 'createdAt'>): string => {
    const id = uid('music');
    const item: SavedMusicLink = { ...link, id, createdAt: Date.now() };
    commitSavedMusic([...savedMusicRef.current, item]);
    return id;
  }, [commitSavedMusic]);

  const renameSavedMusic = useCallback((id: string, name: string) => {
    commitSavedMusic(savedMusicRef.current.map((m) => (m.id === id ? { ...m, name } : m)));
  }, [commitSavedMusic]);

  const deleteSavedMusic = useCallback((id: string) => {
    commitSavedMusic(savedMusicRef.current.filter((m) => m.id !== id));
  }, [commitSavedMusic]);

  const selectProject = useCallback((id: string | null) => {
    setCurrentProjectId(id);
    try {
      if (typeof localStorage !== 'undefined') {
        if (id) localStorage.setItem('akidoro.currentProject.v1', id);
        else localStorage.removeItem('akidoro.currentProject.v1');
      }
    } catch {
      /* ignore */
    }
    const s = timer.state;
    if (id && s.status === 'idle' && s.segments.length === 0) {
      commitProjects(projectsRef.current);
    }
  }, [timer]);

  const createProject = useCallback((name: string, description = '', color = '#dc2626'): string => {
    const now = Date.now();
    const project: Project = {
      id: uid('project'),
      name: name.trim() || 'Untitled project',
      description: description.trim(),
      color,
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    commitProjects([...projectsRef.current, project]);
    return project.id;
  }, []);

  const updateProject = useCallback((id: string, patch: Partial<Omit<Project, 'id' | 'createdAt'>>) => {
    const next = projectsRef.current.map((p) =>
      p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p,
    );
    commitProjects(next);
  }, []);

  const archiveProject = useCallback((id: string) => {
    updateProject(id, { archived: true });
  }, [updateProject]);

  const restoreProject = useCallback((id: string) => {
    updateProject(id, { archived: false });
  }, [updateProject]);

  const deleteProject = useCallback((id: string) => {
    const project = projectsRef.current.find((p) => p.id === id);
    if (!project) return;
    const confirmed = window.confirm(
      `Delete project “${project.name}”? Notes, tasks, whiteboards, and historical focus records stay available. They will become unassigned.`,
    );
    if (!confirmed) return;
    commitProjects(projectsRef.current.filter((p) => p.id !== id));
    commitTasks(tasksRef.current.map((t) => (t.projectId === id ? { ...t, projectId: null, updatedAt: Date.now() } : t)));
    commitNotes(notesAllRef.current.map((n) => (n.projectId === id ? { ...n, projectId: null, updatedAt: Date.now() } : n)));
    // whiteboards load asynchronously and preserve scene data.
    void (async () => {
      const boards = await getAllWhiteboards().catch(() => []);
      for (const board of boards as any[]) {
        if (board?.projectId === id) {
          await putWhiteboard({ ...board, projectId: null, updatedAt: Date.now() });
        }
      }
    })();
    if (currentProjectIdRef.current === id) selectProject(null);
  }, [commitProjects, commitTasks, commitNotes, selectProject]);

  const dismissSessionSummary = useCallback(() => setSessionSummary(null), []);

  const recoverIndexedDb = useCallback(async (keys?: string[]): Promise<number> => {
    const recovered = await recoverFromIndexedDb(keys);
    const offers = await detectIndexedDbRecovery().catch(() => []);
    setIndexedDbRecoveryOffers(offers);
    setSessions(readSessions());
    setNotesAll(readNotes());
    setSettings(loadSettings());
    setTasks(readTasks());
    setSavedMusic(readSavedMusic());
    setCurrentTaskId(readCurrentTaskId());
    return recovered;
  }, []);

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

    // Remove the now-merged account-scoped keys so the recovery banner cannot reappear.
    try {
      const scopedKeys = [
        `${STORAGE_KEYS.settings}.${scopeId}`,
        `${STORAGE_KEYS.sessions}.${scopeId}`,
        `${STORAGE_KEYS.notes}.${scopeId}`,
      ];
      for (const key of scopedKeys) {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
        // Mirror the deletion into the durable local store.
        void import('../lib/idb').then(({ idbRemove }) => idbRemove(key));
      }
    } catch {
      /* best effort */
    }

    setAccountScopeIds((scopes) => scopes.filter((scope) => scope !== scopeId));
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

  // Apply the theme to <html> and mirror it for the pre-paint script.
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark =
        settings.theme === 'dark' ||
        (settings.theme === 'system' && media.matches);
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
      sessionSummary,
      dismissSessionSummary,
      projects,
      createProject,
      updateProject,
      archiveProject,
      restoreProject,
      deleteProject,
      currentProjectId,
      selectProject,
      tasks,
      createTask,
      renameTask,
      toggleTask,
      setTaskProject,
      deleteTask,
      currentTaskId,
      selectTask,
      savedMusic,
      addSavedMusic,
      renameSavedMusic,
      deleteSavedMusic,
      createNote,
      updateNote,
      deleteNote,
      restoreNote,
      indexedDbRecoveryOffers,
      recoverIndexedDb,
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
      projects,
      createProject,
      updateProject,
      archiveProject,
      restoreProject,
      deleteProject,
      currentProjectId,
      selectProject,
      notes,
      tasks,
      createTask,
      renameTask,
      toggleTask,
      setTaskProject,
      deleteTask,
      currentTaskId,
      selectTask,
      savedMusic,
      addSavedMusic,
      renameSavedMusic,
      deleteSavedMusic,
      createNote,
      updateNote,
      deleteNote,
      restoreNote,
      indexedDbRecoveryOffers,
      recoverIndexedDb,
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
