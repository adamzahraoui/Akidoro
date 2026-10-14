import { useState } from 'react';
import type { MusicProvider } from '../../types';
import { cx } from '../../lib/classNames';
import { YouTubePanel } from './YouTubePanel';
import { SpotifyPanel } from './SpotifyPanel';

export function MusicPanel() {
  const [provider, setProvider] = useState<MusicProvider>('youtube');

  return (
    <aside className="card p-5" aria-labelledby="music-heading">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="music-heading" className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
          Music
        </h2>
        <div
          role="tablist"
          aria-label="Music provider"
          className="inline-flex rounded-lg bg-stone-200/60 p-0.5 dark:bg-stone-800/60"
        >
          {(['youtube', 'spotify'] as MusicProvider[]).map((p) => (
            <button
              key={p}
              role="tab"
              type="button"
              aria-selected={provider === p}
              onClick={() => setProvider(p)}
              className={cx(
                'focus-ring rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors',
                provider === p
                  ? 'bg-surface-light text-stone-900 shadow-sm dark:bg-surface-dark dark:text-white'
                  : 'text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white',
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div>
        {provider === 'youtube' ? <YouTubePanel /> : <SpotifyPanel />}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed muted">
        Paste a link to load the official {provider === 'youtube' ? 'YouTube' : 'Spotify'} player.
        Music is independent of the timer, works without signing in, and only one provider plays at
        a time.
      </p>
    </aside>
  );
}
