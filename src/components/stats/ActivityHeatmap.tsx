import { useMemo } from 'react';
import { Card, CardTitle } from '../ui/Card';

const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

function heatLevel(minutes: number): number {
  if (minutes === 0) return 0;
  if (minutes <= 25) return 1;
  if (minutes <= 60) return 2;
  if (minutes <= 120) return 3;
  return 4;
}

const heatColor: Record<number, string> = {
  0: 'bg-stone-200 dark:bg-stone-800',
  1: 'bg-green-200 dark:bg-green-950/60',
  2: 'bg-green-400 dark:bg-green-800',
  3: 'bg-green-500 dark:bg-green-600',
  4: 'bg-green-600 dark:bg-green-500',
};

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours > 0 && mins > 0) return `${hours} hr ${mins} mins`;
  if (hours > 0) return `${hours} hr`;
  return `${mins} mins`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ActivityHeatmap({ sessions }: { sessions: any[] }) {
  const { grid, stats } = useMemo(() => {
    const days = 365;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const values = new Map<string, number>();
    let totalMinutes = 0;
    for (const session of sessions ?? []) {
      if (session?.mode !== 'focus') continue;
      for (const segment of session.segments ?? []) {
        const date = new Date(segment.start);
        date.setHours(0, 0, 0, 0);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const minutes = (segment.end - segment.start) / 60000;
        values.set(key, (values.get(key) ?? 0) + minutes);
        totalMinutes += minutes;
      }
    }

    // Build each calendar day, row 0..6, column 0..52.
    const cells: Array<{ col: number; row: number; date: Date; minutes: number }> = [];
    for (let index = 0; index < days; index += 1) {
      const day = new Date(today);
      day.setDate(day.getDate() - (days - 1 - index));
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      const minutes = Math.max(0, Number(values.get(key) ?? 0));
      // Sunday = 0 ... Saturday = 6; transpose to Mon-Sun row order.
      const row = (day.getDay() + 6) % 7;
      const col = Math.floor(index / 7);
      cells.push({ col, row, date: day, minutes });
    }

    // Month labels.
    const monthLabels: Array<{ label: string; col: number }> = [];
    let lastMonth = -1;
    for (const cell of cells.filter((cell) => cell.row === 0).sort((a, b) => a.col - b.col)) {
      const month = cell.date.getMonth();
      if (month !== lastMonth) {
        monthLabels.push({ label: cell.date.toLocaleDateString(undefined, { month: 'short' }), col: cell.col });
        lastMonth = month;
      }
    }

    const actualActiveDays = new Set([...values.entries()].filter(([, m]) => m > 0).map(([key]) => key)).size;

    // Current streak.
    let currentStreak = 0;
    const cursor = new Date(today);
    cursor.setHours(0, 0, 0, 0);
    while (true) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      const active = Number(values.get(key) ?? 0) > 0;
      if (!active && currentStreak === 0 && cursor.getTime() === today.getTime()) {
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      if (!active) break;
      currentStreak += 1;
      cursor.setDate(cursor.getDate() - 1);
      if (currentStreak > days) break;
    }

    // Longest streak historically.
    let longestStreak = 0;
    let streak = 0;
    const allDays = Array.from({ length: days }, (_, index) => {
      const day = new Date(today);
      day.setDate(day.getDate() - (days - 1 - index));
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      return Number(values.get(key) ?? 0) > 0;
    });
    for (const active of allDays) {
      if (active) {
        streak += 1;
        longestStreak = Math.max(longestStreak, streak);
      } else {
        streak = 0;
      }
    }

    return {
      grid: cells,
      stats: {
        activeDays: actualActiveDays,
        currentStreak,
        longestStreak,
        totalMinutes,
        monthLabels,
      },
    };
  }, [sessions]);

  // Build columns.
  const byColumn = new Map<number, typeof grid>();
  for (const cell of grid) {
    if (!byColumn.has(cell.col)) byColumn.set(cell.col, []);
    byColumn.get(cell.col)!.push(cell);
  }
  const columns = [...byColumn.keys()].sort((a, b) => a - b);

  return (
    <Card>
      <CardTitle hint="Past 365 days">Focus activity heatmap</CardTitle>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs muted">Active days</p>
          <p className="text-lg font-semibold tabular-nums">{stats.activeDays}</p>
        </div>
        <div>
          <p className="text-xs muted">Current streak</p>
          <p className="text-lg font-semibold tabular-nums">{stats.currentStreak}</p>
        </div>
        <div>
          <p className="text-xs muted">Longest streak</p>
          <p className="text-lg font-semibold tabular-nums">{stats.longestStreak}</p>
        </div>
        <div>
          <p className="text-xs muted">Total hours</p>
          <p className="text-lg font-semibold tabular-nums">{(stats.totalMinutes / 60).toFixed(stats.totalMinutes >= 3600 ? 0 : 1)}</p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="inline-flex min-w-max">
          <div className="mr-2 flex flex-col justify-start gap-0.5 pt-5 text-[10px] muted">
            {DAY_LABELS.map((label, index) => (
              <div key={index} className="h-3 leading-3">{label}</div>
            ))}
          </div>
          <div>
            <div className="relative mb-1 h-4 text-[10px] muted">
              {stats.monthLabels.map((entry) => (
                <span key={`${entry.label}-${entry.col}`} className="absolute" style={{ left: `${entry.col * 14}px` }}>
                  {entry.label}
                </span>
              ))}
            </div>
            <div className="flex gap-0.5">
              {columns.map((column) => (
                <div key={column} className="flex flex-col gap-0.5">
                  {Array.from({ length: 7 }, (_, row) => {
                    const cell = byColumn.get(column)?.find((item) => item.row === row);
                    if (!cell) return <div key={row} className="h-3 w-3 rounded-sm bg-transparent" />;
                    const minutes = cell.minutes;
                    const level = heatLevel(minutes);
                    return (
                      <div
                        key={row}
                        className={`h-3 w-3 rounded-sm ${heatColor[level]}`}
                        title={
                          minutes > 0
                            ? `${formatMinutes(minutes)} of focus on ${formatDate(cell.date)}`
                            : `No focus time recorded on ${formatDate(cell.date)}`
                        }
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] muted">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span key={level} className={`h-3 w-3 rounded-sm ${heatColor[level]}`} />
        ))}
        <span>More</span>
      </div>
    </Card>
  );
}
