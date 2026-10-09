import { describe, expect, it } from 'vitest';
import { mergeSessions, strongerSession } from '../src/lib/merge';
import type { Session } from '../src/types';

function session(partial: Partial<Session> & { id: string }): Session {
  return {
    mode: 'focus',
    label: '',
    startedAt: 0,
    endedAt: 0,
    durationSec: 0,
    segments: [],
    completed: false,
    ...partial,
  };
}

describe('mergeSessions', () => {
  it('unions by id and keeps the longer record', () => {
    const local = [session({ id: 'a', durationSec: 100, endedAt: 100 })];
    const remote = [session({ id: 'a', durationSec: 200, endedAt: 200 })];
    const merged = mergeSessions(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].durationSec).toBe(200);
  });

  it('prefers a completed record on equal duration', () => {
    const partial = session({ id: 'a', durationSec: 300, completed: false });
    const complete = session({ id: 'a', durationSec: 300, completed: true });
    expect(strongerSession(partial, complete).completed).toBe(true);
    expect(mergeSessions([partial], [complete])[0].completed).toBe(true);
  });

  it('is order-independent and sorts by start time', () => {
    const a = session({ id: 'a', durationSec: 10, startedAt: 200 });
    const b = session({ id: 'b', durationSec: 10, startedAt: 100 });
    const forward = mergeSessions([a], [b]);
    const backward = mergeSessions([b], [a]);
    expect(forward.map((s) => s.id)).toEqual(['b', 'a']);
    expect(backward.map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('never downgrades across repeated merges (idempotent)', () => {
    const strong = session({ id: 'a', durationSec: 500, completed: true });
    const weak = session({ id: 'a', durationSec: 5, completed: false });
    const once = mergeSessions([strong], [weak]);
    const twice = mergeSessions(once, [weak]);
    expect(twice[0].durationSec).toBe(500);
    expect(twice[0].completed).toBe(true);
  });
});
