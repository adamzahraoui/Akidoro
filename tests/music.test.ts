import { describe, expect, it } from 'vitest';
import { parseYouTubeUrl, youtubeEmbedUrl, youtubeWatchUrl } from '../src/music/youtube';
import { parseSpotifyUrl, spotifyEmbedUrl, spotifyOpenUrl } from '../src/music/spotify';

describe('YouTube link parsing', () => {
  it('parses standard watch, short and alternate video URLs', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      kind: 'video',
      videoId: 'dQw4w9WgXcQ',
      listId: undefined,
    });
    expect(parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toEqual({
      kind: 'video',
      videoId: 'dQw4w9WgXcQ',
      listId: undefined,
    });
    expect(parseYouTubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toEqual({
      kind: 'video',
      videoId: 'dQw4w9WgXcQ',
      listId: undefined,
    });
    expect(parseYouTubeUrl('https://www.youtube.com/live/dQw4w9WgXcQ')).toEqual({
      kind: 'video',
      videoId: 'dQw4w9WgXcQ',
      listId: undefined,
    });
    expect(parseYouTubeUrl('dQw4w9WgXcQ')).toEqual({
      kind: 'video',
      videoId: 'dQw4w9WgXcQ',
      listId: undefined,
    });
  });

  it('parses playlist URLs and music.youtube.com', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/playlist?list=PL1234567890abcdef')).toEqual({
      kind: 'playlist',
      listId: 'PL1234567890abcdef',
    });
    expect(parseYouTubeUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      kind: 'video',
      videoId: 'dQw4w9WgXcQ',
      listId: undefined,
    });
  });

  it('rejects empty, malformed and lookalike hosts', () => {
    expect(parseYouTubeUrl('')).toBeNull();
    expect(parseYouTubeUrl('   ')).toBeNull();
    expect(parseYouTubeUrl('not a url')).toBeNull();
    expect(parseYouTubeUrl('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseYouTubeUrl('https://evilyoutube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseYouTubeUrl('https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseYouTubeUrl('https://www.youtube.com/watch')).toBeNull();
  });

  it('builds official embed and watch URLs from validated ids', () => {
    const video = parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')!;
    expect(youtubeEmbedUrl(video)).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(youtubeWatchUrl(video)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    const playlist = parseYouTubeUrl('https://www.youtube.com/playlist?list=PL1234567890abcdef')!;
    expect(youtubeEmbedUrl(playlist)).toBe(
      'https://www.youtube.com/embed/videoseries?list=PL1234567890abcdef',
    );
    expect(youtubeWatchUrl(playlist)).toBe(
      'https://www.youtube.com/playlist?list=PL1234567890abcdef',
    );
  });
});

describe('Spotify link parsing', () => {
  it('parses supported resource types from web links', () => {
    expect(parseSpotifyUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT')).toEqual({
      kind: 'track',
      id: '4cOdK2wGLETKBW3PvgPWqT',
    });
    expect(parseSpotifyUrl('https://open.spotify.com/album/1ATL5GLyefJaxhQzSPVrLX')).toEqual({
      kind: 'album',
      id: '1ATL5GLyefJaxhQzSPVrLX',
    });
    expect(parseSpotifyUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')).toEqual({
      kind: 'playlist',
      id: '37i9dQZF1DXcBWIGoYBM5M',
    });
    expect(parseSpotifyUrl('https://open.spotify.com/episode/512ojhOuo1ktJprKbVcKyQ')).toEqual({
      kind: 'episode',
      id: '512ojhOuo1ktJprKbVcKyQ',
    });
    expect(parseSpotifyUrl('https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk')).toEqual({
      kind: 'show',
      id: '4rOoJ6Egrf8K2IrywzwOMk',
    });
  });

  it('handles locale prefixes, bare host and spotify: URIs', () => {
    expect(parseSpotifyUrl('https://open.spotify.com/intl-de/track/4cOdK2wGLETKBW3PvgPWqT')).toEqual({
      kind: 'track',
      id: '4cOdK2wGLETKBW3PvgPWqT',
    });
    expect(parseSpotifyUrl('https://spotify.com/track/4cOdK2wGLETKBW3PvgPWqT')).toEqual({
      kind: 'track',
      id: '4cOdK2wGLETKBW3PvgPWqT',
    });
    expect(parseSpotifyUrl('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M')).toEqual({
      kind: 'playlist',
      id: '37i9dQZF1DXcBWIGoYBM5M',
    });
  });

  it('rejects unsupported resources, lookalike hosts and malformed input', () => {
    expect(parseSpotifyUrl('')).toBeNull();
    expect(parseSpotifyUrl('https://open.spotify.com/artist/0OdUWJ0sBjDrqHygGUXeCF')).toBeNull();
    expect(parseSpotifyUrl('https://evilspotify.com/track/4cOdK2wGLETKBW3PvgPWqT')).toBeNull();
    expect(parseSpotifyUrl('https://open.spotify.com.evil.com/track/4cOdK2wGLETKBW3PvgPWqT')).toBeNull();
    expect(parseSpotifyUrl('https://open.spotify.com/track/')).toBeNull();
    expect(parseSpotifyUrl('spotify:track:not!!valid')).toBeNull();
  });

  it('builds official embed and open URLs', () => {
    const track = parseSpotifyUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT')!;
    expect(spotifyEmbedUrl(track)).toBe(
      'https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT?utm_source=generator',
    );
    expect(spotifyOpenUrl(track)).toBe('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
  });
});
