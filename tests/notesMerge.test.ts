import { describe, expect, it } from 'vitest';
import { activeNotes, mergeNotes, resolveNoteConflict } from '../src/lib/notesMerge';
import type { Note } from '../src/types';

function note(partial: Partial<Note> & { id: string }): Note {
  return {
    title: '',
    content: '',
    createdAt: 0,
    updatedAt: 1000,
    deletedAt: null,
    ...partial,
  };
}

const a = 2000;
const b = 3000;

describe('resolveNoteConflict', () => {
  it('keeps the newer active note (last write wins)', () => {
    const older = note({ id: 'x', content: 'old', updatedAt: a });
    const newer = note({ id: 'x', content: 'new', updatedAt: b });
    expect(resolveNoteConflict(older, newer)?.content).toBe('new');
    expect(resolveNoteConflict(newer, older)?.content).toBe('new');
  });

  it('preserves an unsynced edit made after another device deleted the note', () => {
    const localEdit = note({ id: 'x', content: 'edited offline', updatedAt: b });
    const serverDelete = note({ id: 'x', deletedAt: a, updatedAt: a });
    const resolved = resolveNoteConflict(localEdit, serverDelete);
    expect(resolved?.deletedAt).toBeNull();
    expect(resolved?.content).toBe('edited offline');
  });

  it('does not resurrect a deleted note with a stale offline edit', () => {
    const staleLocal = note({ id: 'x', content: 'old draft', updatedAt: a });
    const serverDelete = note({ id: 'x', deletedAt: b, updatedAt: b });
    const resolved = resolveNoteConflict(staleLocal, serverDelete);
    expect(resolved?.deletedAt).toBe(b);
  });

  it('resurrects when the server edited a note after this device deleted it', () => {
    const localDelete = note({ id: 'x', deletedAt: a, updatedAt: a });
    const serverEdit = note({ id: 'x', content: 'edited elsewhere', updatedAt: b });
    const resolved = resolveNoteConflict(localDelete, serverEdit);
    expect(resolved?.deletedAt).toBeNull();
    expect(resolved?.content).toBe('edited elsewhere');
  });

  it('keeps a deletion over an older server edit', () => {
    const localDelete = note({ id: 'x', deletedAt: b, updatedAt: b });
    const serverActive = note({ id: 'x', content: 'older', updatedAt: a });
    const resolved = resolveNoteConflict(localDelete, serverActive);
    expect(resolved?.deletedAt).toBe(b);
  });

  it('keeps the later tombstone when both sides deleted', () => {
    expect(resolveNoteConflict(note({ id: 'x', deletedAt: b }), note({ id: 'x', deletedAt: a }))?.deletedAt).toBe(b);
  });
});

describe('mergeNotes', () => {
  it('unions by id, is order-independent and does not duplicate', () => {
    const local = [note({ id: 'a', content: 'A' }), note({ id: 'b', content: 'B' })];
    const server = [note({ id: 'b', content: 'B2', updatedAt: b }), note({ id: 'c', content: 'C' })];
    const forward = mergeNotes(local, server);
    const backward = mergeNotes(server, local);
    expect(forward.map((n) => n.id).sort()).toEqual(['a', 'b', 'c']);
    expect(forward).toEqual(backward);
    expect(forward.find((n) => n.id === 'b')?.content).toBe('B2');
  });

  it('sorts active notes before tombstones, newest first', () => {
    const merged = mergeNotes(
      [
        note({ id: 'del', deletedAt: b, updatedAt: b }),
        note({ id: 'old', content: 'old', updatedAt: a }),
        note({ id: 'new', content: 'new', updatedAt: b }),
      ],
      [],
    );
    expect(merged.map((n) => n.id)).toEqual(['new', 'old', 'del']);
  });

  it('tracks tombstones so deletions survive a later reconciliation', () => {
    const once = mergeNotes([note({ id: 'x', deletedAt: a })], [note({ id: 'x', content: 'older', updatedAt: -1 })]);
    expect(activeNotes(once)).toEqual([]);
  });

  it('is idempotent across repeated merges', () => {
    const local = [note({ id: 'x', content: 'v2', updatedAt: b })];
    const server = [note({ id: 'x', content: 'v1', updatedAt: a }), note({ id: 'x', deletedAt: -5 })];
    const once = mergeNotes(local, server);
    const twice = mergeNotes(once, server);
    expect(twice).toEqual(once);
    expect(activeNotes(once)[0].content).toBe('v2');
  });

  it('activeNotes returns only non-deleted notes', () => {
    const all = mergeNotes(
      [note({ id: 'keep' }), note({ id: 'gone', deletedAt: a })],
      [],
    );
    expect(activeNotes(all).map((n) => n.id)).toEqual(['keep']);
  });
});