import { parseSpotifyUrl, spotifyEmbedUrl, spotifyOpenUrl } from '../../music/spotify';
import type { SpotifyTarget } from '../../music/spotify';
import { useMusicLink } from '../../music/useMusicLink';
import { Button } from '../ui/Button';
import { MusicUrlField } from './MusicUrlField';

const STORAGE_KEY = 'focustime.music.spotify.v1';
const INVALID = 'Enter an open.spotify.com link to a track, album, playlist, show or episode.';

function embedHeight(target: SpotifyTarget): number {
  return target.kind === 'track' ? 152 : 380;
}

export function SpotifyPanel() {
  const sp = useMusicLink<SpotifyTarget>(STORAGE_KEY, parseSpotifyUrl, INVALID);
  const embed = sp.target ? spotifyEmbedUrl(sp.target) : null;
  const open = sp.target ? spotifyOpenUrl(sp.target) : null;

  return (
    <div className="space-y-4">
      <MusicUrlField
        label="Spotify track, album or playlist link"
        placeholder="https://open.spotify.com/track/…"
        example="https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT"
        value={sp.input}
        onChange={sp.setInput}
        onSubmit={sp.load}
        error={sp.urlError}
        externalHref={open ?? undefined}
        externalLabel="Open in Spotify"
      />

      {embed && sp.target ? (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-xl border subtle-border">
            <iframe
              key={embed}
              title="Spotify embed"
              src={embed}
              className="w-full"
              style={{ height: embedHeight(sp.target), border: 0 }}
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
            />
          </div>
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] leading-relaxed muted">
              Spotify controls playback and requires no account here. Some tracks or regions may be
              unavailable in the embed — use &ldquo;Open in Spotify&rdquo; instead.
            </p>
            <Button size="sm" variant="ghost" onClick={sp.clear}>
              Clear
            </Button>
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed subtle-border px-3 py-6 text-center text-sm muted">
          Paste a Spotify link and press Load to open the official embed. Playback is controlled by
          Spotify and never starts automatically.
        </p>
      )}
    </div>
  );
}
