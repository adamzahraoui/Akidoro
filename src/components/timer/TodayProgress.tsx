import { useApp } from '../../context/AppContext';

function localDayStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function localDayEnd(ms: number): number {
  const d = new Date(ms);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

function overlapSeconds(start: number, end: number, dayStart: number, dayEnd: number): number {
  return Math.max(0, Math.min(end, dayEnd) - Math.max(start, dayStart)) / 1000;
}

export function TodayProgress() {
  const { sessions, settings, timer } = useApp();
  const now = Date.now();
  const dayStart = localDayStart(now);
  const dayEnd = localDayEnd(now);

  let focusSeconds = 0;
  let completedFocus = 0;
  for (const session of sessions) {
    if (session.mode !== 'focus') continue;
    if (session.completed && session.endedAt >= dayStart && session.endedAt < dayEnd) completedFocus += 1;
    for (const segment of session.segments) {
      focusSeconds += overlapSeconds(segment.start, segment.end, dayStart, dayEnd);
    }
  }

  // Add active-session focus time without double-counting saved sessions.
  const activeElapsed = timer.state.mode === 'focus' && timer.state.status === 'running' ? timer.elapsed : 0;
  // The active session is not yet in session history, so adding it prevents undercounting.
  focusSeconds += activeElapsed;

  const minutes = Math.floor(focusSeconds / 60);
  const hoursText = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`.trim();
  const goalMinutes = settings.dailyGoalMin ?? 0;

  const goalProgress = goalMinutes > 0 ? Math.min(1, minutes / goalMinutes) : 0;
  const goalMessage =
    goalMinutes > 0
      ? `${hoursText(minutes)} of ${Math.floor(goalMinutes / 60)}h ${goalMinutes % 60}m`.replace('0h ', '')
      : 'Set a daily goal in Settings.';

  const cards = [
    { title: 'Focus today', value: hoursText(minutes) },
    { title: 'Focus sessions', value: String(completedFocus) },
    { title: 'Daily goal', value: goalMinutes > 0 ? `${Math.round(goalProgress * 100)}%` : 'Off' },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-3" aria-labelledby="today-progress-heading">
      <h2 id="today-progress-heading" className="sr-only">
        Today&apos;s progress
      </h2>
      {cards.map((card) => (
        <div key={card.title} className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide muted">{card.title}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{card.value}</p>
        </div>
      ))}
      <div className="card col-span-full p-4 sm:col-span-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium">Daily focus goal</span>
          <span className="muted">{goalMessage}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
          <div
            className="h-full rounded-full bg-accent-600 transition-[width]"
            style={{ width: `${goalProgress * 100}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] muted">
          Actual focus time is {hoursText(minutes)}. The progress bar caps at 100%.
        </p>
      </div>
    </section>
  );
}
