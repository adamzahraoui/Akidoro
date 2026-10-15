import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Button } from '../ui/Button';
import { Card, CardTitle } from '../ui/Card';
import { cx } from '../../lib/classNames';
import { MarkdownView } from './MarkdownView';
import type { Project } from '../../types';

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

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function NotesView() {
  const { notes, projects, createNote, updateNote, deleteNote, restoreNote } = useApp();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [deletedId, setDeletedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const selected = useMemo(() => notes.find((n) => n.id === selectedId) ?? null, [notes, selectedId]);

  const visibleNotes = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = notes;
    if (term) {
      list = list.filter((note) => (note.title + ' ' + note.content).toLowerCase().includes(term));
    }
    return [...list].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt - a.updatedAt);
  }, [notes, search]);

  useEffect(() => {
    if (!selectedId && visibleNotes.length) {
      setSelectedId(visibleNotes[0].id);
      return;
    }
    if (selectedId && !notes.some((n) => n.id === selectedId)) {
      setSelectedId(visibleNotes[0]?.id ?? null);
    }
  }, [selectedId, visibleNotes, notes]);

  const handleNew = (projectId: string | null = null) => {
    const id = createNote(projectId);
    setSelectedId(id);
    requestAnimationFrame(() => titleRef.current?.focus());
  };

  const handleDelete = () => {
    if (!selected) return;
    deleteNote(selected.id);
    setDeletedId(selected.id);
    setSelectedId(visibleNotes.find((n) => n.id !== selected.id)?.id ?? null);
  };

  const handleUndo = () => {
    if (!deletedId) return;
    restoreNote(deletedId);
    setDeletedId(null);
    setSelectedId(deletedId);
  };

  const safeUpdate = (id: string, patch: { title?: string; content?: string; pinned?: boolean; projectId?: string | null }) => {
    try {
      updateNote(id, patch);
      setSaveError(null);
    } catch {
      setSaveError('This note could not be saved on this device.');
    }
  };

  const insertAtCursor = (before: string, after = '', placeholder = '') => {
    const el = contentRef.current;
    if (!el || !selected) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const value = selected.content;
    const next = `${value.slice(0, start)}${before}${placeholder}${after}${value.slice(end)}`;
    safeUpdate(selected.id, { content: next });
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + before.length + placeholder.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle hint="Local to this browser">Notes</CardTitle>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs muted">Saved on this device</span>
          <Button size="sm" variant="primary" onClick={() => handleNew(null)}>
            New note
          </Button>
        </div>
      </div>

      {saveError ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {saveError}
        </div>
      ) : null}

      {deletedId ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border subtle-border bg-surface-light p-3 text-sm dark:bg-surface-dark">
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
            Notes stay on this device. Use # headings, **bold**, *italic*, lists, checkboxes, and optional code blocks.
          </p>
          <div className="mt-4">
            <Button variant="primary" onClick={() => handleNew(null)}>
              Create your first note
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[300px_1fr]">
          <div className="space-y-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes"
              aria-label="Search notes"
              className="focus-ring w-full rounded-xl border subtle-border bg-surface-light px-3 py-2 text-sm dark:bg-surface-dark"
            />
            <ul role="list" aria-label="Notes list" className="space-y-2">
              {visibleNotes.map((note) => {
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
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{note.title.trim() || 'Untitled'}</p>
                        {note.pinned ? <span className="text-xs text-red-600">Pinned</span> : null}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs muted">{preview.slice(0, 140)}</p>
                      <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">
                        Edited {relativeTime(note.updatedAt)} · {wordCount(note.content)} words
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {selected ? (
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={titleRef}
                  value={selected.title}
                  onChange={(e) => safeUpdate(selected.id, { title: e.target.value })}
                  placeholder="Note title"
                  aria-label="Note title"
                  className="focus-ring flex-1 min-w-0 rounded-xl border subtle-border bg-surface-light px-4 py-2.5 text-base font-medium dark:bg-surface-dark"
                />
                <select
                  value={selected.projectId ?? ''}
                  onChange={(e) => safeUpdate(selected.id, { projectId: e.target.value || null })}
                  aria-label="Project"
                  className="focus-ring rounded-xl border subtle-border bg-surface-light px-3 py-2.5 text-sm dark:bg-surface-dark"
                >
                  <option value="">Unassigned</option>
                  {projects.map((project: Project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
                <Button size="sm" variant={selected.pinned ? 'secondary' : 'primary'} onClick={() => safeUpdate(selected.id, { pinned: !selected.pinned })}>
                  {selected.pinned ? 'Unpin' : 'Pin'}
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-1 border subtle-border rounded-xl bg-surface-light/60 p-2 dark:bg-surface-dark/60">
                <Button size="sm" onClick={() => insertAtCursor('# ', '', 'Heading')}>#</Button>
                <Button size="sm" onClick={() => insertAtCursor('## ', '', 'Heading')}>##</Button>
                <Button size="sm" onClick={() => insertAtCursor('**', '**', 'bold')}>B</Button>
                <Button size="sm" onClick={() => insertAtCursor('*', '*', 'italic')}>I</Button>
                <Button size="sm" onClick={() => insertAtCursor('- ', '', 'item')}>•</Button>
                <Button size="sm" onClick={() => insertAtCursor('1. ', '', 'item')}>1.</Button>
                <Button size="sm" onClick={() => insertAtCursor('- [ ] ', '', '')}>☐</Button>
                <Button size="sm" onClick={() => insertAtCursor('```\n', '\n```', 'code')}>{} code</Button>
              </div>

              <textarea
                ref={contentRef}
                value={selected.content}
                onChange={(e) => safeUpdate(selected.id, { content: e.target.value })}
                placeholder="Write anything. Use markdown shortcuts for headings, emphasis, lists, checklists, and code blocks."
                aria-label="Note content"
                className="focus-ring min-h-[280px] w-full resize-y rounded-xl border subtle-border bg-surface-light px-4 py-3 font-mono text-sm leading-relaxed dark:bg-surface-dark"
              />

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs muted">
                  Markdown · edited {relativeTime(selected.updatedAt)} · {wordCount(selected.content)} words
                </span>
                <Button size="sm" variant="danger" onClick={handleDelete}>Delete</Button>
              </div>

              {selected.content.trim() ? (
                <Card>
                  <CardTitle hint="Live rendering">Preview</CardTitle>
                  <div className="mt-2">
                    <MarkdownView text={selected.content} />
                  </div>
                </Card>
              ) : null}
            </div>
          ) : (
            <div className="grid min-h-[280px] place-items-center rounded-xl border border-dashed subtle-border">
              <p className="text-sm muted">Select a note or create a new one.</p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
