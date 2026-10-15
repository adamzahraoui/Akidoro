import { useApp } from '../../context/AppContext';
import { Button } from '../ui/Button';
import { NumberField } from '../ui/NumberField';
import { Toggle } from '../ui/Toggle';

const DAILY_GOAL_PRESETS = [30, 60, 120, 240];

export function DailyGoalControl({ compact = false }: { compact?: boolean }) {
  const { settings, updateSettings } = useApp();
  const minutes = settings.dailyGoalMin > 0 ? settings.dailyGoalMin : 0;

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <label htmlFor="daily-goal" className="text-sm font-medium">Daily focus goal</label>
      <div className="flex flex-wrap gap-2">
        {DAILY_GOAL_PRESETS.map((preset) => (
          <Button
            key={preset}
            size="sm"
            variant={minutes === preset ? 'primary' : 'secondary'}
            onClick={() => updateSettings({ dailyGoalMin: preset })}
          >
            {preset === 60 ? '1 hour' : preset === 120 ? '2 hours' : preset === 240 ? '4 hours' : `${preset} min`}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Toggle
          label="Enable daily goal"
          checked={minutes > 0}
          onChange={(value) => updateSettings({ dailyGoalMin: value ? 120 : 0 })}
        />
        <span className="text-xs muted">{minutes > 0 ? `${minutes} minute total target` : 'Disabled'}</span>
      </div>
      <NumberField
        label="Custom goal"
        value={minutes}
        min={0}
        max={1440}
        suffix="minutes"
        onChange={(v) => updateSettings({ dailyGoalMin: Math.max(0, Number.isFinite(v) ? v : 0) })}
      />
    </div>
  );
}
