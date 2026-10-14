import type { Note } from '../types';

/**
 * Conflict resolution for a single note id.
 *
 * Rules (all timestamps are epoch ms; tombstones are deletedAt):
 * - Both active: the newer `updatedAt` wins (last-write-wins).
 * - Active vs tombstone: the NEWER event wins. A note edited after it was
 *   deleted is preserved (never silently dropped); a stale local edit that is
 *   older than someone else's deletion is discarded (never resurrects).
 * - Both tombstones: the later deletion wins.
 */
export function resolveNoteConflict(local: Note | undefined, server: Note | undefined): Note | null {
  if (!local) return server ?? null;
  if (!server) return local;

  if (local.deletedAt !== null && server.deletedAt !== null) {
    return local.deletedAt >= server.deletedAt ? local : server;
  }
  if (local.deletedAt !== null) {
    return server.updatedAt > local.deletedAt ? server : local;
  }
  if (server.deletedAt !== null) {
    return local.updatedAt > server.deletedAt ? local : server;
  }
  return local.updatedAt >= server.updatedAt ? local : server;
}

/**
 * Merge two note sets by id (order-independent and idempotent). Active notes
 * sort first, then tombstones; within each group, newest first.
 */
export function mergeNotes(local: Note[], server: Note[]): Note[] {
  const byId = new Map<string, Note>();
  for (const note of [...local, ...server]) {
    const existing = byId.get(note.id);
    byId.set(note.id, existing ? (resolveNoteConflict(existing, note) as Note) : note);
  }
  const records = [...byId.values()];
  records.sort((a, b) => {
    if (a.deletedAt !== null && b.deletedAt === null) return 1;
    if (a.deletedAt === null && b.deletedAt !== null) return -1;
    return b.updatedAt - a.updatedAt || a.id.localeCompare(b.id);
  });
  return records;
}

/** Active (non-deleted) notes, newest first. */
export function activeNotes(notes: Note[]): Note[] {
  return notes.filter((n) => n.deletedAt === null);
}