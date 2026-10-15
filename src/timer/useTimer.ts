import { useCallback, useEffect, useRef, useState } from 'react';
import type { Mode, Session, Settings, TimerState } from '../types';
import { STORAGE_KEYS, readJSON, writeJSON } from '../lib/storage';
import {
  buildSession,
  closeActiveSegment,
  completionTime,
  createTimerState,
  elapsedSeconds,
  isExpired,
  nextAfterCompletion,
  nextAfterSkip,
  plannedSecondsForMode,
  remainingSeconds,
} from './timerEngine';

interface PersistedTimer {
  state: TimerState;
  updatedAt: number;
}

export interface SessionEndEvent {
  session: Session;
  nextMode: Mode;
  recovered: boolean;
}

export interface TimerControls {
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  skip: () => void;
  setMode: (mode: Mode) => void;
  setLabel: (label: string) => void;
}

export interface UseTimerResult {
  state: TimerState;
  remaining: number;
  elapsed: number;
  controls: TimerControls;
}

const RECOVERY_THRESHOLD_MS = 3000;
const TICK_MS = 500;

interface UseTimerOptions {
  onSessionEnd?: (event: SessionEndEvent) => void;
  getProjectId?: () => string | null;
}

export function useTimer(settings: Settings, options: UseTimerOptions | ((event: SessionEndEvent) => void) = {}): UseTimerResult {
  const resolvedOptions = typeof options === 'function' ? { onSessionEnd: options } : options;
  const onSessionEnd = resolvedOptions.onSessionEnd;
  const getProjectId = resolvedOptions.getProjectId;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const onSessionEndRef = useRef(onSessionEnd);
  onSessionEndRef.current = onSessionEnd;
  const getProjectIdRef = useRef(getProjectId);
  getProjectIdRef.current = getProjectId;

  const [state, setState] = useState<TimerState>(() => {
    const persisted = readJSON<PersistedTimer | null>(STORAGE_KEYS.timer, null);
    if (persisted && persisted.state && typeof persisted.state.sessionId === 'string') {
      return persisted.state;
    }
    return createTimerState('focus', settings);
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastUpdatedRef = useRef<number>(Date.now());
  const recordedRef = useRef<Set<string>>(new Set());
  const [now, setNow] = useState<number>(() => Date.now());

  const commit = useCallback((next: TimerState) => {
    const updatedAt = Date.now();
    lastUpdatedRef.current = updatedAt;
    stateRef.current = next;
    setState(next);
    writeJSON(STORAGE_KEYS.timer, { state: next, updatedAt } satisfies PersistedTimer);
  }, []);

  const recordPartial = useCallback((s: TimerState) => {
    const endAt = Date.now();
    const session = buildSession(s, endAt, false);
    if (session.durationSec < 1) return;
    if (recordedRef.current.has(session.id)) return;
    recordedRef.current.add(session.id);
    onSessionEndRef.current?.({ session, nextMode: nextAfterSkip(s).mode, recovered: false });
  }, []);

  const finalizeExpired = useCallback(
    (s: TimerState, tickNow: number) => {
      const endAt = completionTime(s) ?? tickNow;
      const recovered = tickNow - endAt > RECOVERY_THRESHOLD_MS;
      if (recordedRef.current.has(s.sessionId)) return;
      recordedRef.current.add(s.sessionId);

      const session = buildSession(s, endAt, true);
      const config = settingsRef.current;
      const advance = nextAfterCompletion(s, config);
      const autoStart =
        !recovered &&
        (advance.mode === 'focus' ? config.autoStartFocus : config.autoStartBreaks);
      const next = createTimerState(advance.mode, config, s.label, advance.focusCount, autoStart ? (getProjectIdRef.current?.() ?? null) : null);
      if (autoStart) {
        next.status = 'running';
        next.activeStart = Date.now();
      }
      onSessionEndRef.current?.({ session, nextMode: advance.mode, recovered });
      commit(next);
    },
    [commit],
  );

  // Timestamp-driven tick. Remaining time is recomputed from wall-clock timestamps,
  // so throttling in background tabs cannot introduce drift.
  useEffect(() => {
    if (state.status !== 'running') return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      const s = stateRef.current;
      if (isExpired(s, t)) finalizeExpired(s, t);
    };
    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [state.status, finalizeExpired]);

  // Keep an idle session's planned duration in sync with settings changes.
  useEffect(() => {
    const s = stateRef.current;
    if (s.status !== 'idle' || s.segments.length > 0 || s.activeStart != null) return;
    const planned = plannedSecondsForMode(s.mode, settings);
    if (planned !== s.plannedSec) commit({ ...s, plannedSec: planned });
  }, [settings, commit]);

  // Cross-tab synchronisation: adopt newer timer state written by another tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEYS.timer || !e.newValue) return;
      try {
        const incoming = JSON.parse(e.newValue) as PersistedTimer;
        if (!incoming?.state || incoming.updatedAt <= lastUpdatedRef.current) return;
        lastUpdatedRef.current = incoming.updatedAt;
        stateRef.current = incoming.state;
        setState(incoming.state);
        setNow(Date.now());
      } catch {
        /* ignore malformed payloads */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const start = useCallback(() => {
    const s = stateRef.current;
    if (s.status === 'running') return;
    commit({ ...s, status: 'running', activeStart: Date.now(), projectId: s.projectId ?? getProjectIdRef.current?.() ?? null });
  }, [commit]);

  const pause = useCallback(() => {
    const s = stateRef.current;
    if (s.status !== 'running') return;
    commit({ ...closeActiveSegment(s, Date.now()), status: 'paused' });
  }, [commit]);

  const reset = useCallback(() => {
    const s = stateRef.current;
    recordPartial(s);
    commit(createTimerState(s.mode, settingsRef.current, s.label, s.focusCount));
  }, [commit, recordPartial]);

  const skip = useCallback(() => {
    const s = stateRef.current;
    recordPartial(s);
    const config = settingsRef.current;
    const advance = nextAfterSkip(s);
    const next = createTimerState(advance.mode, config, s.label, advance.focusCount);
    const autoStart = advance.mode === 'focus' ? config.autoStartFocus : config.autoStartBreaks;
    if (autoStart) {
      next.status = 'running';
      next.activeStart = Date.now();
    }
    commit(next);
  }, [commit, recordPartial]);

  const setMode = useCallback(
    (mode: Mode) => {
      const s = stateRef.current;
      const isPristine = s.mode === mode && s.status === 'idle' && s.segments.length === 0;
      if (isPristine) return;
      recordPartial(s);
      commit(createTimerState(mode, settingsRef.current, s.label, s.focusCount));
    },
    [commit, recordPartial],
  );

  const setLabel = useCallback(
    (label: string) => {
      commit({ ...stateRef.current, label });
    },
    [commit],
  );

  const controls: TimerControls = { start, pause, resume: start, reset, skip, setMode, setLabel };

  return {
    state,
    remaining: remainingSeconds(state, now),
    elapsed: elapsedSeconds(state, now),
    controls,
  };
}
