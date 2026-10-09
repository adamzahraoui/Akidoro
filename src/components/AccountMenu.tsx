import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Button } from './ui/Button';
import { cx } from '../lib/classNames';

function SyncBadge() {
  const { sync, user } = useApp();
  if (!user) return null;
  const labels = {
    syncing: ['Syncing…', 'text-amber-600 dark:text-amber-400'],
    synced: ['Synced', 'text-accent-700 dark:text-accent-300'],
    offline: ['Offline', 'text-stone-500 dark:text-stone-400'],
    error: ['Sync issue', 'text-red-600 dark:text-red-400'],
    disabled: ['', ''],
  } as const;
  const [text, className] = labels[sync.phase];
  if (!text) return null;
  return (
    <span
      className={cx('hidden text-xs font-medium sm:inline', className)}
      title={sync.error ?? undefined}
    >
      {text}
      {sync.pending > 0 && sync.phase !== 'synced' ? ` (${sync.pending})` : ''}
    </span>
  );
}

export function AccountMenu() {
  const { user, login, logout, googleLoginConfigured, authReady } = useApp();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  if (!user) {
    if (!googleLoginConfigured) {
      return (
        <Button 
          size="sm" 
          variant="primary" 
          disabled 
          title="Supabase configuration is missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, and enable Google in Supabase Auth to use this feature."
        >
          Sign in with Google (Disabled)
        </Button>
      );
    }
    return (
      <Button size="sm" variant="primary" onClick={login}>
        {authReady ? 'Sign in with Google' : 'Sign in'}
      </Button>
    );
  }

  const initial = (user.name ?? user.email).trim().charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-2">
      <SyncBadge />
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Account menu"
          className="focus-ring flex items-center gap-2 rounded-full border subtle-border p-1 pr-2 hover:bg-stone-200/60 dark:hover:bg-stone-800/60"
        >
          {user.picture ? (
            <img src={user.picture} alt="" className="h-7 w-7 rounded-full" referrerPolicy="no-referrer" />
          ) : (
            <span className="grid h-7 w-7 place-items-center rounded-full bg-accent-600 text-xs font-semibold text-white">
              {initial}
            </span>
          )}
          <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:inline">
            {user.name ?? user.email}
          </span>
        </button>

        {open ? (
          <div
            role="menu"
            className="absolute right-0 z-20 mt-2 w-56 rounded-xl border subtle-border bg-surface-light p-1.5 shadow-lg dark:bg-surface-dark"
          >
            <div className="px-3 py-2">
              <p className="truncate text-sm font-medium">{user.name ?? 'Signed in'}</p>
              <p className="truncate text-xs muted">{user.email}</p>
            </div>
            <div className="my-1 h-px bg-stone-200 dark:bg-stone-700" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void logout();
              }}
              className="focus-ring w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-stone-200/70 dark:hover:bg-stone-700/50"
            >
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
