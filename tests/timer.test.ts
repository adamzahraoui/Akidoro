import { describe, expect, it } from 'vitest';
import {
  buildSession,
  closeActiveSegment,
  completionTime,
  createTimerState,
  cyclePosition,
  elapsedSeconds,
  isExpired,
  nextAfterCompletion,
  nextAfterSkip,
  remainingSeconds,
} from '../src/timer/timerEngine';
import { DEFAULT_SETTINGS } from '../src/types';
import type { Settings, TimerState } from '../src/types';

const settings: Settings = {
  ...DEFAULT_SETTINGS,
  focusMin: 25,
  shortMin: 5,
  longMin: 15,
  sessionsBeforeLong: 4,
};

function running(activeStart: number, base?: Partial<TimerState>): TimerState {
  return { ...createTimerState('focus', settings), status: 'running', activeStart, ...base };
}

describe('timer engine', () => {
  it('derives remaining time from timestamps (no counter drift)', () => {
    const s = running(1_000);
    expect(remainingSeconds(s, 1_000)).toBe(1500);
    expect(remainingSeconds(s, 61_000)).toBe(1440);
    // Simulate a background tab that was suspended for 10 minutes.
    expect(remainingSeconds(s, 1_000 + 600_000)).toBe(900);
  });

  it('pause stops time accumulation', () => {
    let s = running(0);
    s = { ...closeActiveSegment(s, 120_000), status: 'paused' };
    expect(elapsedSeconds(s, 999_999_999)).toBeCloseTo(120);
    expect(remainingSeconds(s, 999_999_999)).toBe(1500 - 120);
    expect(isExpired(s, 999_999_999)).toBe(false);
  });

  it('resume continues from the paused position without crediting paused time', () => {
    let s = running(0);
    s = { ...closeActiveSegment(s, 60_000), status: 'paused' }; // 60s done
    const resumeAt = 500_000; // paused for a long time
    s = { ...s, status: 'running', activeStart: resumeAt };
    expect(elapsedSeconds(s, resumeAt + 30_000)).toBeCloseTo(90);
  });

  it('caps a recovered/suspended session at its scheduled end (no invented time)', () => {
    const s = running(0);
    const end = completionTime(s);
    expect(end).toBe(1_500_000);
    // Browser was closed for an hour after completion.
    const session = buildSession(s, end as number, true);
    expect(session.durationSec).toBe(1500);
    expect(session.completed).toBe(true);
  });

  it('skip/reset preserve actual elapsed time, never the full plan', () => {
    const s = running(0);
    const partial = buildSession(s, 30_000, false);
    expect(partial.durationSec).toBe(30);
    expect(partial.completed).toBe(false);
  });

  it('only completed focus sessions advance the long-break cycle', () => {
    let state = createTimerState('focus', settings);
    const sequence: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      sequence.push(state.mode);
      const advance = nextAfterCompletion(state, settings);
      state = { ...createTimerState(advance.mode, settings), focusCount: advance.focusCount };
    }
    sequence.push(state.mode);
    expect(sequence).toEqual([
      'focus',
      'short',
      'focus',
      'short',
      'focus',
      'short',
      'focus',
      'long',
      'focus',
    ]);
  });

  it('skipping a focus session does not advance the cycle', () => {
    const s: TimerState = { ...createTimerState('focus', settings), focusCount: 1 };
    const advance = nextAfterSkip(s);
    expect(advance.mode).toBe('short');
    expect(advance.focusCount).toBe(1);
  });

  it('reports the current focus position within the cycle', () => {
    const s: TimerState = { ...createTimerState('focus', settings), focusCount: 1 };
    expect(cyclePosition(s, settings)).toEqual({ index: 2, total: 4 });
  });
});
