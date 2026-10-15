import { parseYouTubeUrl, youtubeEmbedUrl, youtubeWatchUrl } from '../../music/youtube';
import type { YouTubeTarget } from '../../music/youtube';
import { useMusicLink } from '../../music/useMusicLink';
import { Button } from '../ui/Button';
import { MusicUrlField } from './MusicUrlField';

const STORAGE_KEY = 'focustime.music.youtube.v1';
const INVALID = 'That does not look like a YouTube video or playlist link.';

export function YouTubePanel() {
  const yt = useMusicLink<YouTubeTarget>(STORAGE_KEY, parseYouTubeUrl, INVALID);
  const embed = yt.target ? youtubeEmbedUrl(yt.target) : null;
  const open = yt.target ? youtubeWatchUrl(yt.target) : null;

  return (
    <div className="space-y-4">
      <MusicUrlField
        label="YouTube video or playlist URL"
        placeholder="https://www.youtube.com/watch?v=… or /playlist?list=…"
        example="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        value={yt.input}
        onChange={yt.setInput}
        onSubmit={yt.load}
        error={yt.urlError}
        externalHref={open ?? undefined}
        externalLabel="Open in YouTube"
      />

      <div className="flex flex-wrap gap-2">
        {[
          { name: '🎧 Lofi Girl', url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk' },
          { name: '🌧️ Rain & Thunder', url: 'https://www.youtube.com/watch?v=mPZkdNFkNps' },
          { name: '🌃 Synthwave', url: 'https://www.youtube.com/watch?v=4xDzrJKXOOY' },
          { name: '☕ Coffee Shop Ambience', url: 'https://www.youtube.com/watch?v=hBGbt2CRDpA' },
        ].map((preset) => (
          <button
            key={preset.name}
            type="button"
            onClick={() => yt.loadUrl(preset.url)}
            className="focus-ring rounded-full border subtle-border px-3 py-1.5 text-xs font-medium hover:bg-stone-100 dark:hover:bg-stone-800/60"
          >
            {preset.name}
          </button>
        ))}
      </div>

      {embed ? (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-xl border subtle-border">
            <iframe
              key={embed}
              title="YouTube player"
              src={embed}
              className="aspect-video w-full"
              style={{ minHeight: 200, minWidth: 200 }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] leading-relaxed muted">
              If the owner disabled embedding, YouTube will show a message in the player — use
              &ldquo;Open in YouTube&rdquo; instead.
            </p>
            <Button size="sm" variant="ghost" onClick={yt.clear}>
              Clear
            </Button>
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed subtle-border px-3 py-6 text-center text-sm muted">
          Paste a video or playlist link and press Load to open the official YouTube player. No
          account is needed and playback never starts automatically.
        </p>
      )}
    </div>
  );
}
