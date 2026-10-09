/** Format a number of seconds as MM:SS (or H:MM:SS when an hour or more). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Format seconds as a compact, readable duration, e.g. "2h 05m" or "45m" or "30s". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

/** Local-time midnight for the day containing the given timestamp. */
export function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Add days in local time, returning a new timestamp. Handles DST correctly. */
export function addDays(ts: number, days: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Monday 00:00 local time for the week containing `ts`. */
export function startOfLocalWeek(ts: number): number {
  const start = startOfLocalDay(ts);
  const day = new Date(start).getDay(); // 0 = Sunday
  const diff = (day + 6) % 7; // days since Monday
  return addDays(start, -diff);
}

const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});
const DATE_FULL_FMT = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});
const WEEKDAY_FMT = new Intl.DateTimeFormat(undefined, { weekday: 'short' });

export const formatShortDate = (ts: number) => DATE_FMT.format(new Date(ts));
export const formatFullDate = (ts: number) => DATE_FULL_FMT.format(new Date(ts));
export const formatWeekday = (ts: number) => WEEKDAY_FMT.format(new Date(ts));

export function formatDateRange(startTs: number, endTs: number): string {
  return `${formatFullDate(startTs)} – ${formatFullDate(endTs)}`;
}

export function modeLabel(mode: string): string {
  switch (mode) {
    case 'focus':
      return 'Focus';
    case 'short':
      return 'Short break';
    case 'long':
      return 'Long break';
    default:
      return mode;
  }
}
