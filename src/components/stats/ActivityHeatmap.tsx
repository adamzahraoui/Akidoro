import { Card, CardTitle } from '../ui/Card';

export function ActivityHeatmap({ sessions }: { sessions: any[] }) {
  const days = 365;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const values = new Map<string, number>();

  for (const session of sessions ?? []) {
    if (session.mode !== 'focus') continue;
    for (const segment of session.segments ?? []) {
      const start = new Date(segment.start);
      start.setHours(0, 0, 0, 0);
      const key = start.toISOString().slice(0, 10);
      const minutes = (segment.end - segment.start) / 60000;
      values.set(key, (values.get(key) ?? 0) + minutes);
    }
  }

  const data = Array.from({ length: days }, (_, index) => {
    const day = new Date(today);
    day.setDate(day.getDate() - (days - 1 - index));
    const key = day.toISOString().slice(0, 10);
    return { key, minutes: values.get(key) ?? 0 };
  });

  const colorFor = (minutes: number) => {
    if (minutes === 0) return 'bg-stone-200 dark:bg-stone-800';
    if (minutes < 30) return 'bg-red-200 dark:bg-red-900/40';
    if (minutes < 90) return 'bg-red-400 dark:bg-red-700';
    if (minutes < 180) return 'bg-red-500 dark:bg-red-600';
    return 'bg-red-600 dark:bg-red-500';
  };

  return (
    <Card>
      <CardTitle hint="Past 365 days">Focus activity heatmap</CardTitle>
      <div className="mt-3 flex flex-wrap gap-1">
        {data.map((day) => (
          <div
            key={day.key}
            className={`h-2.5 w-2.5 rounded-sm ${colorFor(day.minutes)}`}
            title={`${day.key}: ${Math.round(day.minutes)} min`}
          />
        ))}
      </div>
    </Card>
  );
}
