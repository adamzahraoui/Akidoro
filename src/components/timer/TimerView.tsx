import { useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { cyclePosition } from '../../timer/timerEngine';
import { formatClock, modeLabel } from '../../lib/format';
import { primeAudio } from '../../lib/sound';
import type { Mode } from '../../types';
import { Button } from '../ui/Button';
import { CircularProgress } from './CircularProgress';
import { MusicPanel } from '../music/MusicPanel';
import { TaskList } from './TaskList';
import { TodayProgress } from './TodayProgress';
import { QuickNotePanel } from './QuickNotePanel';
import { cx } from '../../lib/classNames';

const MODES: Array<{ id: Mode; label: string }> = [
  { id: 'focus', label: 'Focus' },
  { id: 'short', label: 'Short break' },
  { id: 'long', label: 'Long break' },
];

export function TimerView() {
  const { timer, settings } = useApp();
  const { state, remaining, controls } = timer;

  const isRunning = state.status === 'running';
  const isPaused = state.status === 'paused';
  const hasProgress = state.segments.length > 0 || isRunning || isPaused;
  const cycle = cyclePosition(state, settings);
  const fraction = state.plannedSec > 0 ? remaining / state.plannedSec : 0;

  // Keyboard shortcuts: Space toggles start/pause, R resets, S skips.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (isRunning) controls.pause();
        else controls.start();
      } else if (e.key.toLowerCase() === 'r') {
        controls.reset();
      } else if (e.key.toLowerCase() === 's') {
        controls.skip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isRunning, controls]);

  const statusText = isRunning ? 'Running' : isPaused ? 'Paused' : 'Ready';
  const cycleText =
    state.mode === 'focus'
      ? `Focus ${cycle.index} of ${cycle.total}`
      : `${modeLabel(state.mode)}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
      <section className="card flex flex-col items-center px-5 py-8 sm:px-8" aria-labelledby="timer-heading">
        <h1 id="timer-heading" className="sr-only">
          Pomodoro timer
        </h1>

        <div
          role="tablist"
          aria-label="Timer mode"
          className="mb-6 inline-flex rounded-xl bg-stone-200/60 p-1 dark:bg-stone-800/60"
        >
          {MODES.map((mode) => (
            <button
              key={mode.id}
              role="tab"
              type="button"
              aria-selected={state.mode === mode.id}
              onClick={() => controls.setMode(mode.id)}
              className={cx(
                'focus-ring rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                state.mode === mode.id
                  ? 'bg-surface-light text-stone-900 shadow-sm dark:bg-surface-dark dark:text-white'
                  : 'text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white',
              )}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <CircularProgress remainingFraction={fraction}>
          <div className="text-center">
            <div
              className="font-mono text-6xl font-semibold tabular-nums tracking-tight sm:text-7xl"
              role="timer"
              aria-live="off"
              aria-label={`${formatClock(remaining)} remaining`}
            >
              {formatClock(remaining)}
            </div>
            <p className="mt-2 text-sm font-medium uppercase tracking-wide text-accent-600 dark:text-accent-300">
              {modeLabel(state.mode)}
            </p>
            <p className="mt-1 text-xs muted" aria-live="polite">
              {cycleText} · {statusText}
            </p>
          </div>
        </CircularProgress>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {isRunning ? (
            <Button variant="primary" size="lg" onClick={controls.pause} aria-label="Pause timer">
              Pause
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                primeAudio();
                controls.start();
              }}
              aria-label={isPaused ? 'Resume timer' : 'Start timer'}
            >
              {isPaused ? 'Resume' : 'Start'}
            </Button>
          )}
          <Button onClick={controls.reset} disabled={!hasProgress} aria-label="Reset timer">
            Reset
          </Button>
          <Button onClick={controls.skip} aria-label="Skip to next session">
            Skip
          </Button>
        </div>

        <div className="mt-6 w-full max-w-sm">
          <label htmlFor="session-label" className="block text-xs font-medium uppercase tracking-wide muted">
            Session label (optional)
          </label>
          <input
            id="session-label"
            type="text"
            value={state.label}
            maxLength={80}
            placeholder="e.g. What are you working on ?"
            onChange={(e) => controls.setLabel(e.target.value)}
            className="focus-ring mt-1.5 w-full rounded-xl border subtle-border bg-surface-light px-3 py-2 text-sm dark:bg-surface-dark"
          />
        </div>

        <p className="mt-5 text-center text-xs muted" aria-hidden="true">
          Shortcuts: Space to start/pause · R to reset · S to skip
        </p>
      </section>

        <TodayProgress />
        <QuickNotePanel onOpenInNotes={() => window.dispatchEvent(new CustomEvent('akidoro:navigate', { detail: 'notes' }))} />
      </div>

      <div className="space-y-6">
        <MusicPanel />
        <TaskList />
      </div>
    </div>
  );
}
