// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Session } from '../src/types';
import { DEFAULT_SETTINGS } from '../src/types';
import {
  appendSession,
  hasGuestData,
  readSessions,
  readStoredSettings,
  setStorageScope,
  writeStoredSettings,
} from '../src/lib/storage';

const session = (id: string): Session => ({
  id,
  mode: 'focus',
  label: '',
  startedAt: 1000,
  endedAt: 1600,
  durationSec: 600,
  completed: true,
  segments: [{ start: 1000, end: 1600 }],
});

beforeEach(() => {
  localStorage.clear();
  setStorageScope(null);
});

describe('per-account storage isolation', () => {
  it('keeps one account history out of another account and the guest namespace', () => {
    setStorageScope('user-a');
    appendSession(session('a1'));
    appendSession(session('a2'));
    expect(readSessions().map((s) => s.id)).toEqual(['a1', 'a2']);

    setStorageScope('user-b');
    expect(readSessions()).toEqual([]);
    appendSession(session('b1'));
    expect(readSessions().map((s) => s.id)).toEqual(['b1']);

    // Guest scope must be untouched by either account.
    setStorageScope(null);
    expect(readSessions()).toEqual([]);
    expect(hasGuestData()).toBe(false);

    // Returning to account A restores exactly its own history.
    setStorageScope('user-a');
    expect(readSessions().map((s) => s.id)).toEqual(['a1', 'a2']);
  });

  it('scopes settings so a guest edit never leaks into an account', () => {
    writeStoredSettings({ ...DEFAULT_SETTINGS, focusMin: 25 });
    expect(readStoredSettings()?.focusMin).toBe(25);

    setStorageScope('user-a');
    expect(readStoredSettings()).toBeNull();
    writeStoredSettings({ ...DEFAULT_SETTINGS, focusMin: 50 });
    expect(readStoredSettings()?.focusMin).toBe(50);

    setStorageScope(null);
    expect(readStoredSettings()?.focusMin).toBe(25);
  });
});
