// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../src/App';
import { AppProvider } from '../src/context/AppContext';

function stubMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

function renderApp() {
  return render(
    <AppProvider>
      <App />
    </AppProvider>,
  );
}

function goToTime(iso: string, advanceMs = 0) {
  act(() => {
    vi.setSystemTime(new Date(iso));
    if (advanceMs) vi.advanceTimersByTime(advanceMs);
  });
}

beforeEach(() => {
  localStorage.clear();
  stubMatchMedia();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-06T10:00:00'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('FocusTime UI', () => {
  it('starts, pauses, resumes and records time from timestamps', () => {
    renderApp();
    const clock = () => screen.getByRole('timer').textContent?.trim();
    expect(clock()).toBe('25:00');

    fireEvent.click(screen.getByRole('button', { name: /start timer/i }));
    goToTime('2026-01-06T10:01:04', 1000);
    expect(clock()).toBe('23:55');

    fireEvent.click(screen.getByRole('button', { name: /pause timer/i }));
    const paused = clock();
    goToTime('2026-01-06T10:05:00', 3000);
    expect(clock()).toBe(paused);

    fireEvent.click(screen.getByRole('button', { name: /resume timer/i }));
    goToTime('2026-01-06T10:05:32', 1000);
    expect(clock()).toBe('23:25');
  });

  it('skip records a partial session and prevents duplicates on refresh', () => {
    const { unmount } = renderApp();
    fireEvent.click(screen.getByRole('button', { name: /start timer/i }));
    goToTime('2026-01-06T10:00:39', 1000);
    fireEvent.click(screen.getByRole('button', { name: /skip to next session/i }));

    const stored = JSON.parse(localStorage.getItem('akidoro.sessions.v1') || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].durationSec).toBe(40);
    expect(stored[0].completed).toBe(false);

    unmount();
    renderApp();
    const after = JSON.parse(localStorage.getItem('akidoro.sessions.v1') || '[]');
    expect(after).toHaveLength(1);
  });

  it('restores a running timer after remount and finalises only up to the planned end', () => {
    const { unmount } = renderApp();
    fireEvent.click(screen.getByRole('button', { name: /start timer/i }));
    unmount();

    vi.setSystemTime(new Date('2026-01-06T11:00:00'));
    renderApp();
    goToTime('2026-01-06T11:00:01', 1000);

    const stored = JSON.parse(localStorage.getItem('akidoro.sessions.v1') || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].durationSec).toBe(1500);
    expect(stored[0].completed).toBe(true);
  });

  it('renders an empty statistics state without seeding fake data', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Statistics' }));
    expect(screen.getByText(/No sessions recorded yet/i)).toBeTruthy();
  });

  it('validates duration inputs and shows the guest-data explanation', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByText(/stored only in this browser/i)).toBeTruthy();

    const focusInput = screen.getByLabelText('Focus') as HTMLInputElement;
    fireEvent.change(focusInput, { target: { value: '0' } });
    expect(screen.getByText(/Enter 1–180/i)).toBeTruthy();

    fireEvent.change(focusInput, { target: { value: '30' } });
    expect((screen.getByLabelText('Focus') as HTMLInputElement).value).toBe('30');
  });

  it('loads a pasted YouTube link into the official embed without account UI', () => {
    renderApp();
    const input = screen.getByLabelText('YouTube video or playlist URL') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));

    const frame = screen.getByTitle('YouTube player') as HTMLIFrameElement;
    expect(frame.src).toContain('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(screen.queryByRole('button', { name: /connect/i })).toBeNull();
  });

  it('rejects a non-YouTube link with a helpful message', () => {
    renderApp();
    const input = screen.getByLabelText('YouTube video or playlist URL') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'https://example.com/watch?v=abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));
    expect(screen.getByText(/does not look like a YouTube/i)).toBeTruthy();
  });

  it('loads a pasted Spotify link into the official embed on the Spotify tab', () => {
    renderApp();
    fireEvent.click(screen.getByRole('tab', { name: 'spotify' }));
    const input = screen.getByLabelText('Spotify track, album or playlist link') as HTMLInputElement;
    fireEvent.change(input, {
      target: { value: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));
    const frame = screen.getByTitle('Spotify embed') as HTMLIFrameElement;
    expect(frame.src).toContain('https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT');
  });
});
