import { useApp } from '../context/AppContext';
import { cx } from '../lib/classNames';

export type View = 'timer' | 'stats' | 'notes' | 'settings';

const BASE_TABS: Array<{ id: View; label: string }> = [
  { id: 'timer', label: 'Timer' },
  { id: 'stats', label: 'Statistics' },
  { id: 'notes', label: 'Notes' },
  { id: 'settings', label: 'Settings' },
];

export function Nav({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  const { settings, updateSettings } = useApp();
  const tabs = BASE_TABS;
  const isDark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <header className="border-b subtle-border">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-accent-600 text-sm font-bold text-white">
            A
          </span>
          <span className="text-base font-semibold tracking-tight">Akidoro</span>
        </div>

        <nav
          aria-label="Primary"
          className="order-3 flex w-full items-center gap-1 rounded-xl bg-stone-200/60 p-1 sm:order-none sm:w-auto dark:bg-stone-800/60"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              aria-current={view === tab.id ? 'page' : undefined}
              className={cx(
                'focus-ring rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                view === tab.id
                  ? 'bg-surface-light text-stone-900 shadow-sm dark:bg-surface-dark dark:text-white'
                  : 'text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white',
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => updateSettings({ theme: isDark ? 'light' : 'dark' })}
            aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            className="focus-ring rounded-xl border subtle-border p-2 text-stone-600 hover:bg-stone-200/60 dark:text-stone-300 dark:hover:bg-stone-800/60"
          >
            {isDark ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
