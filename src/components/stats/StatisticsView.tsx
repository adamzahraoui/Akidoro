import { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { computeWeek, hasAnySessions, weekStartFor } from '../../stats/statistics';
import type { WeekStats } from '../../stats/statistics';
import {
  addDays,
  formatDateRange,
  formatDuration,
  formatShortDate,
  formatWeekday,
} from '../../lib/format';
import { Button } from '../ui/Button';
import { Card, CardTitle } from '../ui/Card';

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border subtle-border bg-surface-light/60 p-3 dark:bg-surface-dark/60">
      <p className="text-xs uppercase tracking-wide muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {sub ? <p className="text-xs muted">{sub}</p> : null}
    </div>
  );
}

function DailyChart({ week }: { week: WeekStats }) {
  const max = Math.max(
    1,
    ...week.days.map((d) => Math.max(d.focusSec, d.breakSec)),
  );
  return (
    <div>
      <div className="flex h-48 items-end justify-between gap-2" role="img" aria-label="Focus and break time per day">
        {week.days.map((d) => {
          const focusPct = (d.focusSec / max) * 100;
          const breakPct = (d.breakSec / max) * 100;
          return (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-40 w-full items-end justify-center gap-1">
                <div
                  className="w-3 rounded-t bg-accent-600 sm:w-4"
                  style={{ height: `${focusPct}%` }}
                  title={`Focus ${formatDuration(d.focusSec)}`}
                />
                <div
                  className="w-3 rounded-t bg-stone-400 dark:bg-stone-500"
                  style={{ height: `${breakPct}%` }}
                  title={`Break ${formatDuration(d.breakSec)}`}
                />
              </div>
              <span className="text-[11px] muted">{formatWeekday(d.date).slice(0, 3)}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-center gap-4 text-xs muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-accent-600" /> Focus
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-stone-400 dark:bg-stone-500" /> Break
        </span>
      </div>
    </div>
  );
}

export function StatisticsView() {
  const { sessions, accountScopeIds, importAccountData, projects, tasks } = useApp();
  const [weekStart, setWeekStart] = useState(() => weekStartFor(Date.now()));
  const week = useMemo(() => computeWeek(sessions, weekStart), [sessions, weekStart]);
  const currentWeekStart = weekStartFor(Date.now());
  const isCurrent = weekStart === currentWeekStart;

  const [projectFilter, setProjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [visibleCount, setVisibleCount] = useState(10);

  const projectName = (id: string | null | undefined) => projects.find((p) => p.id === id)?.name ?? 'Unassigned';
  const taskName = (id: string | null | undefined) => tasks.find((t) => t.id === id)?.title ?? '';

  const filteredSessions = useMemo(() => {
    return [...sessions]
      .sort((a, b) => b.startedAt - a.startedAt)
      .filter((session) => {
        const bucketDate = new Date(session.startedAt).toISOString().slice(0, 10);
        if (fromDate && bucketDate < fromDate) return false;
        if (toDate && bucketDate > toDate) return false;
        if (projectFilter === 'none' && session.projectId != null) return false;
        if (projectFilter !== 'all' && projectFilter !== 'none' && session.projectId !== projectFilter) return false;
        if (statusFilter === 'completed' && !session.completed) return false;
        if (statusFilter === 'partial' && session.completed) return false;
        return true;
      });
  }, [sessions, fromDate, toDate, projectFilter, statusFilter]);

  const weekEmpty = !week.days.some((d) => d.focusSec + d.breakSec > 0);

  return (
    <div className="space-y-6">
      {accountScopeIds.length > 0 ? (
        <Card>
          <CardTitle hint="Recovery">Local account data found</CardTitle>
          <p className="text-sm muted">
            {accountScopeIds.length} set{accountScopeIds.length === 1 ? '' : 's'} of previously signed-in data are stored under separate local keys. They are
            not included in guest statistics until you import them.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {accountScopeIds.map((scope, index) => (
              <Button key={scope} size="sm" variant="primary" onClick={() => void importAccountData(scope)}>
                Import data set {index + 1}
              </Button>
            ))}
          </div>
        </Card>
      ) : null}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Weekly statistics</h1>
            <p className="text-sm muted">{formatDateRange(week.weekStart, week.weekEnd)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setWeekStart((w) => addDays(w, -7))} aria-label="Previous week">
              ← Prev
            </Button>
            <Button size="sm" onClick={() => setWeekStart(currentWeekStart)} disabled={isCurrent}>
              This week
            </Button>
            <Button
              size="sm"
              onClick={() => setWeekStart((w) => addDays(w, 7))}
              disabled={isCurrent}
              aria-label="Next week"
            >
              Next →
            </Button>
          </div>
        </div>
      </Card>

      {!hasAnySessions(sessions) ? (
        <Card>
          <p className="py-8 text-center text-sm muted">
            No sessions recorded yet. Start a focus session and it will appear here automatically.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile label="Focus time" value={formatDuration(week.totalFocusSec)} />
            <StatTile label="Break time" value={formatDuration(week.totalBreakSec)} />
            <StatTile label="Short breaks" value={formatDuration(week.totalShortBreakSec)} />
            <StatTile label="Long breaks" value={formatDuration(week.totalLongBreakSec)} />
            <StatTile label="Focus sessions" value={String(week.completedFocusSessions)} sub="completed" />
          </div>

          <Card>
            <CardTitle hint="Focus vs break, Mon–Sun">Daily activity</CardTitle>
            {weekEmpty ? (
              <p className="py-8 text-center text-sm muted">No activity recorded this week.</p>
            ) : (
              <DailyChart week={week} />
            )}
          </Card>

          <Card>
            <CardTitle hint="Times use your local timezone">Daily totals</CardTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Daily focus and break totals for the selected week</caption>
                <thead>
                  <tr className="border-b subtle-border text-left muted">
                    <th scope="col" className="py-2 pr-4 font-medium">Day</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">Focus</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">Short</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">Long</th>
                    <th scope="col" className="py-2 text-right font-medium">Break</th>
                  </tr>
                </thead>
                <tbody>
                  {week.days.map((d) => (
                    <tr key={d.date} className="border-b subtle-border last:border-0">
                      <th scope="row" className="py-2 pr-4 text-left font-normal">
                        {formatWeekday(d.date)} <span className="muted">{formatShortDate(d.date)}</span>
                        {d.focusSessions > 0 ? (
                          <span className="ml-2 rounded bg-accent-100 px-1.5 py-0.5 text-[10px] font-medium text-accent-800 dark:bg-accent-900 dark:text-accent-200">
                            {d.focusSessions} session{d.focusSessions > 1 ? 's' : ''}
                          </span>
                        ) : null}
                      </th>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatDuration(d.focusSec)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatDuration(d.shortBreakSec)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatDuration(d.longBreakSec)}</td>
                      <td className="py-2 text-right tabular-nums">{formatDuration(d.breakSec)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-medium">
                    <th scope="row" className="pt-2 pr-4 text-left">Total</th>
                    <td className="pt-2 pr-4 text-right tabular-nums">{formatDuration(week.totalFocusSec)}</td>
                    <td className="pt-2 pr-4 text-right tabular-nums">{formatDuration(week.totalShortBreakSec)}</td>
                    <td className="pt-2 pr-4 text-right tabular-nums">{formatDuration(week.totalLongBreakSec)}</td>
                    <td className="pt-2 text-right tabular-nums">{formatDuration(week.totalBreakSec)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </>
      )}
      {true ? (
        <Card>
          <CardTitle hint="Actual duration recorded">Session history</CardTitle>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <label className="text-xs">
              From
              <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setVisibleCount(10); }} className="focus-ring mt-1 w-full rounded-xl border subtle-border bg-surface-light px-2 py-1 text-sm dark:bg-surface-dark" />
            </label>
            <label className="text-xs">
              To
              <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setVisibleCount(10); }} className="focus-ring mt-1 w-full rounded-xl border subtle-border bg-surface-light px-2 py-1 text-sm dark:bg-surface-dark" />
            </label>
            <label className="text-xs">
              Project
              <select value={projectFilter} onChange={(e) => { setProjectFilter(e.target.value); setVisibleCount(10); }} className="focus-ring mt-1 w-full rounded-xl border subtle-border bg-surface-light px-2 py-1 text-sm dark:bg-surface-dark">
                <option value="all">All projects</option>
                <option value="none">Unassigned</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </label>
            <label className="text-xs">
              Status
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setVisibleCount(10); }} className="focus-ring mt-1 w-full rounded-xl border subtle-border bg-surface-light px-2 py-1 text-sm dark:bg-surface-dark">
                <option value="all">All statuses</option>
                <option value="completed">Completed</option>
                <option value="partial">Partial</option>
              </select>
            </label>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b subtle-border text-left muted">
                  <th className="py-2 pr-3">Start</th>
                  <th className="py-2 pr-3">Label or task</th>
                  <th className="py-2 pr-3">Project</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3 text-right">Duration</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.slice(0, visibleCount).map((session) => (
                  <tr key={session.id} className="border-b subtle-border last:border-0">
                    <td className="py-2 pr-3 tabular-nums">
                      {new Date(session.startedAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3">{session.label?.trim() || taskName(session.taskId) || 'Untitled focus session'}</td>
                    <td className="py-2 pr-3">{projectName(session.projectId)}</td>
                    <td className="py-2 pr-3">{session.mode === 'focus' ? 'Focus' : session.mode === 'short' ? 'Short break' : 'Long break'}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{Math.round(session.durationSec)} sec</td>
                    <td className="py-2">{session.completed ? 'Completed' : 'Partial'}</td>
                  </tr>
                ))}
                {filteredSessions.length === 0 ? (
                  <tr><td colSpan={6} className="py-6 text-center muted">No sessions match these filters.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {visibleCount < filteredSessions.length ? (
            <div className="mt-3">
              <Button size="sm" onClick={() => setVisibleCount((count) => count + 10)}>Load more</Button>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
