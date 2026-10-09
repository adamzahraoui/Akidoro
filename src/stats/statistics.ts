import type { Session, TimeSegment } from '../types';
import { addDays, startOfLocalDay, startOfLocalWeek } from '../lib/format';

export interface DayStats {
  date: number; // local day start (epoch ms)
  focusSec: number;
  shortBreakSec: number;
  longBreakSec: number;
  breakSec: number;
  focusSessions: number;
}

export interface WeekStats {
  weekStart: number;
  weekEnd: number; // inclusive end (last ms of Sunday)
  days: DayStats[]; // Monday .. Sunday
  totalFocusSec: number;
  totalShortBreakSec: number;
  totalLongBreakSec: number;
  totalBreakSec: number;
  completedFocusSessions: number;
}

/**
 * Split one active segment into per-local-day slices. Because a segment carries the
 * real wall-clock interval, sessions that cross midnight (or DST changes) are split
 * accurately at the boundary.
 */
export function splitSegmentByDay(segment: TimeSegment): Array<{ day: number; seconds: number }> {
  const out: Array<{ day: number; seconds: number }> = [];
  let cursor = segment.start;
  const end = segment.end;
  let guard = 0;
  while (cursor < end && guard < 10_000) {
    guard += 1;
    const dayStart = startOfLocalDay(cursor);
    const nextDay = addDays(dayStart, 1);
    const sliceEnd = Math.min(end, nextDay);
    out.push({ day: dayStart, seconds: (sliceEnd - cursor) / 1000 });
    cursor = sliceEnd;
  }
  return out;
}

export function weekStartFor(ts: number): number {
  return startOfLocalWeek(ts);
}

export function computeWeek(sessions: Session[], weekStart: number): WeekStats {
  const weekEndExclusive = addDays(weekStart, 7);

  const days: DayStats[] = [];
  for (let i = 0; i < 7; i += 1) {
    days.push({
      date: addDays(weekStart, i),
      focusSec: 0,
      shortBreakSec: 0,
      longBreakSec: 0,
      breakSec: 0,
      focusSessions: 0,
    });
  }
  const indexByDay = new Map<number, number>();
  days.forEach((d, i) => indexByDay.set(d.date, i));

  let completedFocusSessions = 0;

  for (const session of sessions) {
    const startedDay = startOfLocalDay(session.startedAt);
    const startedInWeek = startedDay >= weekStart && startedDay < weekEndExclusive;
    if (session.mode === 'focus' && session.completed && startedInWeek) {
      completedFocusSessions += 1;
      const idx = indexByDay.get(startedDay);
      if (idx !== undefined) days[idx].focusSessions += 1;
    }

    for (const segment of session.segments) {
      for (const { day, seconds } of splitSegmentByDay(segment)) {
        const idx = indexByDay.get(day);
        if (idx === undefined) continue;
        const d = days[idx];
        if (session.mode === 'focus') d.focusSec += seconds;
        else if (session.mode === 'short') d.shortBreakSec += seconds;
        else d.longBreakSec += seconds;
      }
    }
  }

  let totalFocusSec = 0;
  let totalShortBreakSec = 0;
  let totalLongBreakSec = 0;
  for (const d of days) {
    d.breakSec = d.shortBreakSec + d.longBreakSec;
    totalFocusSec += d.focusSec;
    totalShortBreakSec += d.shortBreakSec;
    totalLongBreakSec += d.longBreakSec;
  }

  return {
    weekStart,
    weekEnd: weekEndExclusive - 1,
    days,
    totalFocusSec,
    totalShortBreakSec,
    totalLongBreakSec,
    totalBreakSec: totalShortBreakSec + totalLongBreakSec,
    completedFocusSessions,
  };
}

export function hasAnySessions(sessions: Session[]): boolean {
  return sessions.some((s) => s.segments.some((seg) => seg.end > seg.start));
}
