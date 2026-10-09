export type SpotifyKind = 'track' | 'album' | 'playlist' | 'episode' | 'show';

export interface SpotifyTarget {
  kind: SpotifyKind;
  id: string;
}

// Only the resource types that Spotify officially supports as embeds. Artist
// links are intentionally rejected so we never point at an unsupported player.
const KINDS: SpotifyKind[] = ['track', 'album', 'playlist', 'episode', 'show'];

/** Parse an open.spotify.com link or a spotify: URI. Returns null if unrecognised. */
export function parseSpotifyUrl(input: string): SpotifyTarget | null {
  const raw = input.trim();
  if (!raw) return null;

  const uriMatch = raw.match(/^spotify:(track|album|playlist|episode|show):([a-zA-Z0-9]+)$/);
  if (uriMatch) return { kind: uriMatch[1] as SpotifyKind, id: uriMatch[2] };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  // Accept only spotify.com / open.spotify.com — never lookalike hosts.
  const host = url.hostname.replace(/^open\./, '').toLowerCase();
  if (host !== 'spotify.com') return null;

  const parts = url.pathname.split('/').filter(Boolean);
  // Allow locale-prefixed paths like /intl-de/track/...
  const kindIndex = parts.findIndex((p) => (KINDS as string[]).includes(p));
  if (kindIndex === -1) return null;
  const kind = parts[kindIndex] as SpotifyKind;
  const id = parts[kindIndex + 1];
  if (!id || !/^[a-zA-Z0-9]+$/.test(id)) return null;
  return { kind, id };
}

/** Build an official Spotify embed URL from the validated id. */
export function spotifyEmbedUrl(target: SpotifyTarget): string {
  return `https://open.spotify.com/embed/${target.kind}/${encodeURIComponent(target.id)}?utm_source=generator`;
}

export function spotifyOpenUrl(target: SpotifyTarget): string {
  return `https://open.spotify.com/${target.kind}/${encodeURIComponent(target.id)}`;
}
