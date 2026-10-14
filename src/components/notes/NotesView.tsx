import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Button } from '../ui/Button';
import { Card, CardTitle } from '../ui/Card';
import { cx } from '../../lib/classNames';

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const seconds = Math.round(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Autosave indicator: guests persist locally; signed-in users get cloud sync states. */
function SaveStatus() {
  return <span className="text-xs muted">Saved on this device</span>;
}

export function NotesView() {
  const { notes, createNote, updateNote, deleteNote, restoreNote } = useApp();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletedId, setDeletedId] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => notes.find((n) => n.id === selectedId) ?? null, [notes, selectedId]);

  // Keep the selection valid as notes are added/deleted and default to the first
  // note, and autofocus the title of a freshly created note.
  useEffect(() => {
    if (!selectedId && notes.length) {
      setSelectedId(notes[0].id);
      return;
    }
    if (selectedId && !notes.some((n) => n.id === selectedId)) {
      setSelectedId(notes[0]?.id ?? null);
    }
  }, [notes, selectedId]);

  const handleNew = () => {
    const id = createNote();
    setSelectedId(id);
    requestAnimationFrame(() => titleRef.current?.focus());
  };

  const handleDelete = () => {
    if (!selected) return;
    deleteNote(selected.id);
    setDeletedId(selected.id);
    setSelectedId(notes.find((n) => n.id !== selected.id)?.id ?? null);
  };

  const handleUndo = () => {
    if (!deletedId) return;
    restoreNote(deletedId);
    setDeletedId(null);
    setSelectedId(deletedId);
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle hint="Local to this browser">Notes</CardTitle>
        <div className="flex items-center gap-3">
          <SaveStatus />
          <Button size="sm" variant="primary" onClick={handleNew}>
            New note
          </Button>
        </div>
      </div>

      {deletedId ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm dark:border-stone-700 dark:bg-stone-800/60">
          <p className="muted">Note deleted.</p>
          <Button size="sm" variant="secondary" onClick={handleUndo}>
            Undo
          </Button>
        </div>
      ) : null}

      {notes.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed subtle-border p-8 text-center">
          <p className="text-sm font-medium">No notes yet</p>
          <p className="mt-1 text-sm muted">
            Notes are kept on this device and never leave your machine.
          </p>
          <div className="mt-4">
            <Button variant="primary" onClick={handleNew}>
              Create your first note
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-[280px_1fr]">
          <ul role="list" aria-label="Notes list" className="space-y-2">
            {notes.map((note) => {
              const active = selected?.id === note.id;
              const preview = note.content.trim() || 'Empty note';
              return (
                <li key={note.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(note.id)}
                    aria-current={active ? 'true' : undefined}
                    className={cx(
                      'focus-ring w-full rounded-xl border p-3 text-left transition-colors',
                      active
                        ? 'border-accent-600 bg-accent-50 dark:border-accent-600 dark:bg-accent-900/20'
                        : 'subtle-border hover:bg-stone-100 dark:hover:bg-stone-800/60',
                    )}
                  >
                    <p className="truncate text-sm font-medium">
                      {note.title.trim() || 'Untitled'}
                    </p>
                    <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-xs muted">
                      {preview}
                    </p>
                    <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">
                      Edited {relativeTime(note.updatedAt)}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>

          {selected ? (
            <div className="flex min-w-0 flex-col gap-3">
              <input
                ref={titleRef}
                value={selected.title}
                onChange={(e) => updateNote(selected.id, { title: e.target.value })}
                placeholder="Note title (optional)"
                aria-label="Note title"
                className="focus-ring w-full rounded-xl border subtle-border bg-surface-light px-4 py-2.5 text-base font-medium dark:bg-surface-dark"
              />
              <textarea
                value={selected.content}
                onChange={(e) => updateNote(selected.id, { content: e.target.value })}
                placeholder="Write anything…"
                aria-label="Note content"
                className="focus-ring min-h-[200px] w-full resize-y whitespace-pre-wrap rounded-xl border subtle-border bg-surface-light px-4 py-3 text-sm leading-relaxed dark:bg-surface-dark"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs muted">Plain text · edited {relativeTime(selected.updatedAt)}</span>
                <Button size="sm" variant="danger" onClick={handleDelete}>
                  Delete
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid min-h-[200px] place-items-center rounded-xl border border-dashed subtle-border">
              <p className="text-sm muted">Select a note or create a new one.</p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}