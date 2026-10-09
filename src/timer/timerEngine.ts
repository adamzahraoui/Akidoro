import type { Mode, Session, Settings, TimeSegment, TimerState } from '../types';
import { uid } from '../lib/id';

export function plannedSecondsForMode(mode: Mode, settings: Settings): number {
  switch (mode) {
    case 'focus':
      return Math.max(1, Math.round(settings.focusMin * 60));
    case 'short':
      return Math.max(1, Math.round(settings.shortMin * 60));
    case 'long':
      return Math.max(1, Math.round(settings.longMin * 60));
  }
}

export function createTimerState(
  mode: Mode,
  settings: Settings,
  label = '',
  focusCount = 0,
): TimerState {
  return {
    mode,
    status: 'idle',
    plannedSec: plannedSecondsForMode(mode, settings),
    segments: [],
    activeStart: null,
    sessionId: uid('session'),
    label,
    focusCount,
  };
}

export function segmentsDuration(segments: TimeSegment[]): number {
  return segments.reduce((total, s) => total + Math.max(0, s.end - s.start) / 1000, 0);
}

export function elapsedSeconds(state: TimerState, now: number): number {
  const base = segmentsDuration(state.segments);
  if (state.activeStart == null) return base;
  return base + Math.max(0, now - state.activeStart) / 1000;
}

export function remainingSeconds(state: TimerState, now: number): number {
  return Math.max(0, state.plannedSec - elapsedSeconds(state, now));
}

/**
 * Epoch ms at which the running session reaches its planned end.
 * Because it is derived from the segment start and the planned duration, it is
 * immune to interval throttling in background tabs.
 */
export function completionTime(state: TimerState): number | null {
  if (state.activeStart == null) return null;
  const remainingBeforeActive = Math.max(0, state.plannedSec - segmentsDuration(state.segments));
  return state.activeStart + remainingBeforeActive * 1000;
}

export function isExpired(state: TimerState, now: number): boolean {
  return state.status === 'running' && elapsedSeconds(state, now) >= state.plannedSec;
}

/** Close the open active segment at `endAt`, producing a state with no active segment. */
export function closeActiveSegment(state: TimerState, endAt: number): TimerState {
  if (state.activeStart == null) return state;
  const start = state.activeStart;
  const end = Math.max(start, endAt);
  return {
    ...state,
    segments: [...state.segments, { start, end }],
    activeStart: null,
  };
}

/** Build a persistable session record from the timer state, closing the active segment. */
export function buildSession(state: TimerState, endAt: number, completed: boolean): Session {
  const closed = closeActiveSegment(state, endAt);
  const segments = closed.segments;
  const durationSec = Math.round(segmentsDuration(segments));
  const startedAt = segments.length > 0 ? segments[0].start : endAt;
  return {
    id: state.sessionId,
    mode: state.mode,
    label: state.label.trim(),
    startedAt,
    endedAt: endAt,
    durationSec,
    segments,
    completed,
  };
}

export interface AdvanceResult {
  mode: Mode;
  focusCount: number;
}

/** Next mode and cycle counter after a *completed* session. */
export function nextAfterCompletion(state: TimerState, settings: Settings): AdvanceResult {
  if (state.mode === 'focus') {
    const focusCount = state.focusCount + 1;
    if (focusCount >= settings.sessionsBeforeLong) return { mode: 'long', focusCount };
    return { mode: 'short', focusCount };
  }
  if (state.mode === 'long') return { mode: 'focus', focusCount: 0 };
  return { mode: 'focus', focusCount: state.focusCount };
}

/** Next mode after a skip/reset. A partial focus session does not advance the cycle. */
export function nextAfterSkip(state: TimerState): AdvanceResult {
  if (state.mode === 'long') return { mode: 'focus', focusCount: 0 };
  if (state.mode === 'short') return { mode: 'focus', focusCount: state.focusCount };
  return { mode: 'short', focusCount: state.focusCount };
}

/** Human-readable cycle position for focus sessions, e.g. { index: 2, total: 4 }. */
export function cyclePosition(state: TimerState, settings: Settings): { index: number; total: number } {
  const total = Math.max(1, settings.sessionsBeforeLong);
  const index = (state.focusCount % total) + 1;
  return { index, total };
}
