import type { Session } from '../types';

/** Keep the stronger of two records for the same session id (idempotent + monotonic). */
export function strongerSession(a: Session, b: Session): Session {
  if (a.durationSec !== b.durationSec) return a.durationSec > b.durationSec ? a : b;
  if (a.completed !== b.completed) return a.completed ? a : b;
  return a.endedAt >= b.endedAt ? a : b;
}

/** Union two session lists by id, resolving conflicts in favour of the stronger record. */
export function mergeSessions(a: Session[], b: Session[]): Session[] {
  const byId = new Map<string, Session>();
  for (const session of [...a, ...b]) {
    const existing = byId.get(session.id);
    byId.set(session.id, existing ? strongerSession(existing, session) : session);
  }
  return [...byId.values()].sort((x, y) => x.startedAt - y.startedAt);
}
