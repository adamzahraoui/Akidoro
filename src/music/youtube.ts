export type YouTubeTarget =
  | { kind: 'video'; videoId: string; listId?: string }
  | { kind: 'playlist'; listId: string };

/**
 * Parse a YouTube video or playlist URL (or a bare id). Returns null for anything
 * that is not recognisably a YouTube resource.
 */
export function parseYouTubeUrl(input: string): YouTubeTarget | null {
  const raw = input.trim();
  if (!raw) return null;

  // Bare 11-character video id.
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return { kind: 'video', videoId: raw };

  // Bare playlist id.
  if (/^(PL|UU|OL|FL|LL|RD)[a-zA-Z0-9_-]{10,}$/.test(raw)) return { kind: 'playlist', listId: raw };

  let url: URL;
  try {
    url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\./, '');
  const listId = url.searchParams.get('list') ?? undefined;

  if (host === 'youtu.be') {
    const videoId = url.pathname.slice(1).split('/')[0];
    if (videoId) return { kind: 'video', videoId, listId };
    return null;
  }

  if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/playlist') {
      return listId ? { kind: 'playlist', listId } : null;
    }
    const v = url.searchParams.get('v');
    if (v) return { kind: 'video', videoId: v, listId };
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') {
      const videoId = parts[1];
      if (videoId) return { kind: 'video', videoId, listId };
    }
  }
  return null;
}

/** Build an official YouTube embed URL. The player stays visible and keeps its controls. */
export function youtubeEmbedUrl(target: YouTubeTarget): string {
  if (target.kind === 'playlist') {
    return `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(target.listId)}`;
  }
  const base = `https://www.youtube.com/embed/${encodeURIComponent(target.videoId)}`;
  return target.listId ? `${base}?list=${encodeURIComponent(target.listId)}` : base;
}

export function youtubeWatchUrl(target: YouTubeTarget): string {
  if (target.kind === 'playlist') {
    return `https://www.youtube.com/playlist?list=${encodeURIComponent(target.listId)}`;
  }
  return `https://www.youtube.com/watch?v=${encodeURIComponent(target.videoId)}`;
}
