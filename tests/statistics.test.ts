import { beforeEach, describe, expect, it } from 'vitest';
import { computeWeek, splitSegmentByDay, weekStartFor } from '../src/stats/statistics';
import { appendSession, readSessions } from '../src/lib/storage';
import type { Session } from '../src/types';

function local(y: number, m: number, d: number, h = 0, min = 0, sec = 0): number {
  return new Date(y, m, d, h, min, sec, 0).getTime();
}

function segment(start: number, end: number) {
  return { start, end };
}

describe('statistics', () => {
  it('splits a segment across a local midnight boundary', () => {
    const parts = splitSegmentByDay(
      segment(local(2026, 0, 5, 23, 30), local(2026, 0, 6, 0, 30)),
    );
    expect(parts).toHaveLength(2);
    expect(parts[0].seconds).toBe(1800);
    expect(parts[1].seconds).toBe(1800);
  });

  it('splits a segment across a week boundary (Sunday -> Monday)', () => {
    const parts = splitSegmentByDay(
      segment(local(2026, 0, 4, 23, 45), local(2026, 0, 5, 0, 15)),
    );
    expect(parts).toHaveLength(2);
    expect(parts[0].seconds).toBe(900);
    expect(parts[1].seconds).toBe(900);
  });

  it('computes weekly totals, combining short and long breaks', () => {
    const day = local(2026, 0, 6, 10, 0); // Tuesday
    const weekStart = weekStartFor(day);
    const sessions: Session[] = [
      {
        id: 'a',
        mode: 'focus',
        label: '',
        startedAt: day,
        endedAt: day + 1500 * 1000,
        durationSec: 1500,
        segments: [segment(day, day + 1500 * 1000)],
        completed: true,
      },
      {
        id: 'b',
        mode: 'short',
        label: '',
        startedAt: day + 1500 * 1000,
        endedAt: day + 1800 * 1000,
        durationSec: 300,
        segments: [segment(day + 1500 * 1000, day + 1800 * 1000)],
        completed: true,
      },
      {
        id: 'c',
        mode: 'long',
        label: '',
        startedAt: day + 1800 * 1000,
        endedAt: day + 2700 * 1000,
        durationSec: 900,
        segments: [segment(day + 1800 * 1000, day + 2700 * 1000)],
        completed: true,
      },
    ];
    const week = computeWeek(sessions, weekStart);
    expect(week.totalFocusSec).toBeCloseTo(1500);
    expect(week.totalShortBreakSec).toBeCloseTo(300);
    expect(week.totalLongBreakSec).toBeCloseTo(900);
    expect(week.totalBreakSec).toBeCloseTo(1200);
    expect(week.completedFocusSessions).toBe(1);
    expect(week.days[1].focusSec).toBeCloseTo(1500);
  });

  it('attributes midnight-straddling focus time to both days', () => {
    const start = local(2026, 0, 5, 23, 30); // Monday 23:30
    const weekStart = weekStartFor(start);
    const sessions: Session[] = [
      {
        id: 'x',
        mode: 'focus',
        label: '',
        startedAt: start,
        endedAt: local(2026, 0, 6, 0, 30),
        durationSec: 3600,
        segments: [segment(start, local(2026, 0, 6, 0, 30))],
        completed: true,
      },
    ];
    const week = computeWeek(sessions, weekStart);
    expect(week.days[0].focusSec).toBeCloseTo(1800); // Monday
    expect(week.days[1].focusSec).toBeCloseTo(1800); // Tuesday
    expect(week.totalFocusSec).toBeCloseTo(3600);
  });

  it('excludes paused time because only active segments are stored', () => {
    const day = local(2026, 0, 6, 9, 0);
    const weekStart = weekStartFor(day);
    const sessions: Session[] = [
      {
        id: 'p',
        mode: 'focus',
        label: '',
        startedAt: day,
        endedAt: day + 3600 * 1000, // wall-clock span 1h
        durationSec: 600,
        segments: [segment(day, day + 300 * 1000), segment(day + 3300 * 1000, day + 3600 * 1000)],
        completed: false,
      },
    ];
    const week = computeWeek(sessions, weekStart);
    expect(week.totalFocusSec).toBeCloseTo(600);
  });
});

describe('session storage dedupe', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => void store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    } as Storage;
  });

  it('does not record the same session id twice', () => {
    const base: Session = {
      id: 'dup',
      mode: 'focus',
      label: '',
      startedAt: 1,
      endedAt: 2,
      durationSec: 1,
      segments: [{ start: 1, end: 2 }],
      completed: true,
    };
    appendSession(base);
    appendSession(base);
    expect(readSessions()).toHaveLength(1);
  });

  it('upgrades a partial record to a completed one with the longer duration', () => {
    const partial: Session = {
      id: 'up',
      mode: 'focus',
      label: '',
      startedAt: 0,
      endedAt: 30_000,
      durationSec: 30,
      segments: [{ start: 0, end: 30_000 }],
      completed: false,
    };
    const complete: Session = {
      ...partial,
      endedAt: 60_000,
      durationSec: 60,
      segments: [{ start: 0, end: 60_000 }],
      completed: true,
    };
    appendSession(partial);
    appendSession(complete);
    const stored = readSessions();
    expect(stored).toHaveLength(1);
    expect(stored[0].durationSec).toBe(60);
    expect(stored[0].completed).toBe(true);
  });
});
