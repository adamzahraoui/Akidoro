import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';

const STORAGE_KEY = 'akidoro_github_prompt_seen';

export function GitHubStarButton() {
  const { sessions } = useApp();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => (typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) === 'true' : false));
  const previousSessions = useRef(sessions.length);
  const triggerTimeout = useRef<number | null>(null);

  const markSeen = () => {
    setSeen(true);
    setOpen(false);
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, 'true');
  };

  const showPrompt = () => {
    if (seen) return;
    setOpen(true);
  };

  useEffect(() => {
    if (seen) return;
    triggerTimeout.current = window.setTimeout(showPrompt, 3 * 60 * 1000);
    return () => {
      if (triggerTimeout.current) window.clearTimeout(triggerTimeout.current);
    };
  }, [seen]);

  useEffect(() => {
    if (!seen && sessions.length > previousSessions.current) {
      const timeoutId = window.setTimeout(showPrompt, 800);
      previousSessions.current = sessions.length;
      return () => window.clearTimeout(timeoutId);
    }
    previousSessions.current = sessions.length;
    return undefined;
  }, [sessions.length, seen]);

  // Compatibility of class names used within Tailwind for animation.
  const animateIn = open ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2';

  return (
    <div className="relative">
      <a
        href="https://github.com/adamzahraoui/Akidoro"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Star Akidoro on GitHub"
        title="Star Akidoro on GitHub"
        onClick={(event) => {
          event.preventDefault();
          markSeen();
          window.open('https://github.com/adamzahraoui/Akidoro', '_blank', 'noopener,noreferrer');
        }}
        className="focus-ring inline-flex items-center justify-center rounded-xl border subtle-border p-2 text-stone-600 hover:bg-stone-200/60 dark:text-stone-300 dark:hover:bg-stone-800/60"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 .587l3.668 7.431 8.2 1.193-5.934 5.787 1.401 8.168L12 18.896l-7.335 3.858 1.401-8.168L.132 9.211l8.2-1.193L12 .587z" />
        </svg>
      </a>

      {open ? (
        <div
          className={`absolute right-0 top-full z-50 mt-3 w-64 rounded-xl border subtle-border bg-surface-light p-3 shadow-xl transition-all duration-200 ${animateIn} dark:bg-surface-dark`}
          role="dialog"
          aria-label="Star Akidoro on GitHub"
        >
          <div className="absolute -top-2 right-4 h-4 w-4 rotate-45 border-l subtle-border border-t subtle-border bg-surface-light dark:bg-surface-dark" aria-hidden />
          <p className="text-sm font-medium text-stone-800 dark:text-stone-100">
            Enjoying Akidoro? Leave a ⭐️ on GitHub to support the project!
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                markSeen();
                window.open('https://github.com/adamzahraoui/Akidoro', '_blank', 'noopener,noreferrer');
              }}
              className="focus-ring rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700"
            >
              ⭐ Star on GitHub
            </button>
            <button
              type="button"
              onClick={markSeen}
              className="focus-ring rounded-lg px-2 py-1.5 text-xs text-stone-500 hover:text-stone-700 dark:text-stone-400"
            >
              Maybe later
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
