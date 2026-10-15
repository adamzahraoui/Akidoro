import { lazy, Suspense, useEffect, useState } from 'react';
import { Nav } from './components/Nav';
import type { View } from './components/Nav';
import { TimerView } from './components/timer/TimerView';
import { StatisticsView } from './components/stats/StatisticsView';
import { NotesView } from './components/notes/NotesView';
import { SettingsView } from './components/settings/SettingsView';
const WhiteboardView = lazy(() => import('./components/whiteboard/WhiteboardView').then((m) => ({ default: m.WhiteboardView })));
import { useApp } from './context/AppContext';

function GuestMergeBanner() {
  const { guestMergePending, mergeGuestData, dismissGuestMerge } = useApp();
  if (!guestMergePending) return null;
  return (
    <div className="mx-auto max-w-5xl px-4 pt-4 sm:px-6">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm">
          You have guest session history and notes saved in this browser. Merge them into your
          account so they sync across devices?
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void mergeGuestData()}
            className="focus-ring rounded-xl bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700"
          >
            Merge
          </button>
          <button
            type="button"
            onClick={dismissGuestMerge}
            className="focus-ring rounded-xl px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-200/70 dark:text-stone-300 dark:hover:bg-stone-700/50"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>('timer');
  const { accountImportPending, accountScopeIds, importAccountData, dismissAccountImport } = useApp();
  useEffect(() => {
    const onNavigate = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail === 'notes' || detail === 'timer' || detail === 'stats' || detail === 'settings') {
        setView(detail as View);
      }
    };
    window.addEventListener('akidoro:navigate', onNavigate);
    return () => window.removeEventListener('akidoro:navigate', onNavigate);
  }, []);

  return (
    <div className="min-h-full">
      <Nav view={view} onChange={setView} />
      <GuestMergeBanner />
      {accountImportPending ? (
        <div className="mx-auto max-w-5xl px-4 pt-4 sm:px-6">
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm">
              Found locally stored account data ({accountScopeIds.join(', ')}). Import one set into this browser?
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {accountScopeIds.map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => void importAccountData(scope)}
                  className="focus-ring rounded-xl bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700"
                >
                  Import {scope}
                </button>
              ))}
              <button
                type="button"
                onClick={dismissAccountImport}
                className="focus-ring rounded-xl px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-200/70 dark:text-stone-300 dark:hover:bg-stone-700/50"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {/* All views stay mounted so background music and timer state are never interrupted. */}
        <div hidden={view !== 'timer'}>
          <TimerView />
        </div>
        <div hidden={view !== 'stats'}>
          <StatisticsView />
        </div>
        <div hidden={view !== 'notes'}>
          <NotesView />
        </div>
        <div hidden={view !== 'settings'}>
          <SettingsView />
        </div>
        <div hidden={view !== 'whiteboard'}>
          <Suspense fallback={<div className="card p-6 text-sm muted">Loading whiteboard…</div>}>
            <WhiteboardView />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
