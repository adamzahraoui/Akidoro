// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../src/App';
import { AppProvider } from '../src/context/AppContext';

vi.mock('../src/components/whiteboard/WhiteboardView', () => ({
  WhiteboardView: () => null,
}));

function renderApp() {
  return render(
    <AppProvider>
      <App />
    </AppProvider>,
  );
}

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

function useShortTimerSettings() {
  localStorage.setItem(
    'akidoro.settings.v1',
    JSON.stringify({
      focusMin: 1,
      shortMin: 1,
      longMin: 1,
      sessionsBeforeLong: 4,
      autoStartBreaks: false,
      autoStartFocus: false,
      theme: 'system',
      notifications: false,
      soundEnabled: false,
      volume: 0,
      dailyGoalMin: 120,
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  stubMatchMedia();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-06T10:00:00'));
  useShortTimerSettings();
});

afterEach(() => {
  cleanup();
});

describe('session recording integration', () => {
  it('records and persists a naturally completed focus session', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: /start timer/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(62000);
    });
    const raw = localStorage.getItem('akidoro.sessions.v1');
    const sessions = JSON.parse(raw || '[]');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].mode).toBe('focus');
    expect(sessions[0].completed).toBe(true);
    expect(sessions[0].durationSec).toBe(60);
  });

  it('excludes paused time and records only once after resuming', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: /start timer/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    fireEvent.click(screen.getByRole('button', { name: /pause timer/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    fireEvent.click(screen.getByRole('button', { name: /resume timer/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    const sessions = JSON.parse(localStorage.getItem('akidoro.sessions.v1') || '[]');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].durationSec).toBe(60);
  });

  it('records an incomplete partial session on reset only once', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: /start timer/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40000);
    });
    fireEvent.click(screen.getByRole('button', { name: /reset timer/i }));

    let sessions = JSON.parse(localStorage.getItem('akidoro.sessions.v1') || '[]');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].completed).toBe(false);
    expect(sessions[0].durationSec).toBe(40);
  });
});
