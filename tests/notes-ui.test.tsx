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

function createNote(title: string, content: string) {
  fireEvent.click(screen.getByRole('button', { name: /new note/i }));
  fireEvent.change(screen.getByLabelText('Note title'), { target: { value: title } });
  fireEvent.change(screen.getByLabelText('Note content'), { target: { value: content } });
}

function previewItem(): HTMLElement {
  return screen.getByRole('listitem');
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

describe('Notes', () => {
  it('creates, previews and persists a note across a refresh', () => {
    const { unmount } = renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Notes' }));

    expect(screen.getByText(/no notes yet/i)).toBeTruthy();
    createNote('Shopping', 'Milk, eggs, and bread');

    expect(previewItem().textContent).toContain('Shopping');
    expect(previewItem().textContent).toContain('Milk, eggs, and bread');
    expect((screen.getByLabelText('Note content') as HTMLTextAreaElement).value).toBe(
      'Milk, eggs, and bread',
    );
    expect(screen.getByText(/saved on this device/i)).toBeTruthy();

    const stored = JSON.parse(localStorage.getItem('akidoro.notes.v1') || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe('Shopping');
    expect(stored[0].content).toBe('Milk, eggs, and bread');

    unmount();
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
    expect(previewItem().textContent).toContain('Shopping');
    expect((screen.getByLabelText('Note content') as HTMLTextAreaElement).value).toBe(
      'Milk, eggs, and bread',
    );
  });

  it('edits an existing note in place and updates the preview', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
    createNote('Draft', 'First draft');

    fireEvent.change(screen.getByLabelText('Note title'), { target: { value: 'Final' } });
    fireEvent.change(screen.getByLabelText('Note content'), { target: { value: 'Polished text' } });

    expect(previewItem().textContent).toContain('Final');
    expect(previewItem().textContent).toContain('Polished text');
    const stored = JSON.parse(localStorage.getItem('akidoro.notes.v1') || '[]');
    expect(stored[0].title).toBe('Final');
    expect(stored[0].content).toBe('Polished text');
  });

  it('deletes softly and offers an undo', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
    createNote('Temp', 'Nothing important');

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(screen.getByText(/note deleted/i)).toBeTruthy();
    expect(screen.getByText(/no notes yet/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /undo/i }));
    expect(previewItem().textContent).toContain('Temp');
  });

  it('does not interrupt or reset the timer while taking notes', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: /start timer/i }));
    goToTime('2026-01-06T10:01:04', 1000);
    expect(screen.getByRole('timer').textContent?.trim()).toBe('23:55');

    fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
    createNote('During focus', 'Captured mid-session');
    goToTime('2026-01-06T10:02:00', 0);

    fireEvent.click(screen.getByRole('button', { name: 'Timer' }));
    expect(screen.getByRole('timer').textContent?.trim()).toBe('23:55');

    // No premature session record: the timer is still running its first focus.
    const sessions = JSON.parse(localStorage.getItem('akidoro.sessions.v1') || '[]');
    expect(sessions).toHaveLength(0);
  });
});