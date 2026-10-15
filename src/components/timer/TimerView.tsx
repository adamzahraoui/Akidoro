import { useEffect, useRef, useState } from 'react';
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
  const floatingRef = useRef<Window | null>(null);
  const [floatingMessage, setFloatingMessage] = useState<string | null>(null);
  const pipIntervalRef = useRef<number | null>(null);

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
      if (target && typeof target.closest === 'function' && target.closest('.excalidraw')) return;
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

  const isPipSupported =
    typeof window !== 'undefined' && 'documentPictureInPicture' in window;

  const buildFloatingDocument = (pipWindow: Window) => {
    const doc = pipWindow.document;
    const dark = document.documentElement.classList.contains('dark');
    doc.head.innerHTML = `<style>
      * { box-sizing: border-box; }
      body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: ${dark ? '#1c1d1b' : '#f7f4ee'}; color: ${dark ? '#f7f4ee' : '#1c1d1b'}; }
      .wrap { min-height: 100vh; display: grid; place-items: center; padding: 12px; }
      .card { background: ${dark ? '#242623' : '#fffdf8'}; border: 1px solid ${dark ? '#3a3d38' : '#e7e2d6'}; border-radius: 18px; padding: 12px; width: 100%; text-align: center; }
      .logo { width: 24px; height: 24px; margin: 0 auto 8px; }
      .time { font-family: ui-monospace, monospace; font-size: 2rem; font-weight: 700; letter-spacing: -0.02em; }
      .mode { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.12em; color: ${dark ? '#f87171' : '#dc2626'}; margin-top: 4px; font-weight: 600; }
      .btn { margin-top: 10px; border: 0; border-radius: 12px; background: #dc2626; color: white; padding: 8px 14px; font-weight: 600; cursor: pointer; }
      .btn:hover { background: #b91c1c; }
    </style>`;
    const root = doc.createElement('div');
    root.className = 'wrap';
    root.innerHTML = `
      <div class="card">
        <svg class="logo" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="28" fill="#dc2626"></circle>
          <circle cx="32" cy="32" r="19" fill="none" stroke="#fffdf8" stroke-width="4"></circle>
          <path d="M24 43 L32 22 L40 43 M27 34 H37" fill="none" stroke="#fffdf8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
          <line x1="32" y1="31" x2="32" y2="21" stroke="#fffdf8" stroke-width="4" stroke-linecap="round"></line>
        </svg>
        <div class="time" id="pip-time">--:--</div>
        <div class="mode" id="pip-mode">Focus</div>
        <button class="btn" id="pip-toggle">Start</button>
      </div>
    `;
    doc.body.appendChild(root);

    const timeEl = doc.getElementById('pip-time');
    const modeEl = doc.getElementById('pip-mode');
    const toggleBtn = doc.getElementById('pip-toggle');
    const update = () => {
      const s = timer.state;
      const remainingLabel = state.status === 'running' ? timer.remaining : timer.remaining;
      if (timeEl) timeEl.textContent = formatClock(remainingLabel);
      if (modeEl) modeEl.textContent = modeLabel(s.mode);
      if (toggleBtn) toggleBtn.textContent = s.status === 'running' ? 'Pause' : 'Start';
    };
    update();
    toggleBtn?.addEventListener('click', () => {
      if (timer.state.status === 'running') controls.pause();
      else {
        primeAudio();
        controls.start();
      }
    });
    pipIntervalRef.current = window.setInterval(update, 250);

    pipWindow.addEventListener('pagehide', () => {
      if (pipIntervalRef.current) window.clearInterval(pipIntervalRef.current);
      pipIntervalRef.current = null;
      floatingRef.current = null;
    });
  };

  const openFloatingTimer = async () => {
    if (floatingRef.current && !floatingRef.current.closed) {
      floatingRef.current.focus();
      return;
    }
    setFloatingMessage(null);
    try {
      if (isPipSupported) {
        const pipWindow = await (window as any).documentPictureInPicture.requestWindow({
          width: 260,
          height: 220,
        });
        floatingRef.current = pipWindow;
        buildFloatingDocument(pipWindow);
      } else {
        const popup = window.open('', 'akidoro-floating', 'width=320,height=220');
        if (!popup) {
          setFloatingMessage('Popup blocked. Allow popups for this site to open the floating timer.');
          return;
        }
        floatingRef.current = popup;
        buildFloatingDocument(popup);
        popup.focus();
      }
    } catch (error) {
      floatingRef.current = null;
      setFloatingMessage('Could not open the floating timer. Try again after user interaction.');
    }
  };

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

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => void openFloatingTimer()}>
            Open floating timer
          </Button>
          {isPipSupported ? null : (
            <span className="text-xs muted">Uses a compact browser popup; it may not stay on top of other apps.</span>
          )}
        </div>
        {floatingMessage ? <p className="mt-2 text-center text-xs text-red-600 dark:text-red-400">{floatingMessage}</p> : null}
        <p className="mt-5 text-center text-xs muted" aria-hidden="true">
          Shortcuts: Space to start/pause · R to reset · S to skip. Keep the Akidoro tab open while using the floating timer.
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
