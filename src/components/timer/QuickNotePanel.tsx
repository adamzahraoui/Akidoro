import { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Button } from '../ui/Button';

export function QuickNotePanel({ onOpenInNotes }: { onOpenInNotes: () => void }) {
  const { notes, createNote, updateNote } = useApp();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [noteId, setNoteId] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved');

  const quickNote = notes.find((note) => note.title.trim() === 'Quick Note') ?? null;

  useEffect(() => {
    if (!open) return;
    let id = quickNote?.id ?? noteId;
    if (!id) {
      id = createNote();
      updateNote(id, { title: 'Quick Note' });
      setNoteId(id);
      setLoadedId(null);
    } else {
      setNoteId(id);
      if (quickNote && loadedId !== quickNote.id) {
        setContent(quickNote.content);
        setLoadedId(quickNote.id);
      }
    }
  }, [open, quickNote, noteId, createNote, updateNote]);

  useEffect(() => {
    // External sync intentionally avoided while typing.
  }, []);

  useEffect(() => {
    if (!noteId || !open) return;
    const timer = window.setTimeout(() => {
      try {
        setStatus('saving');
        updateNote(noteId, { content });
        setStatus('saved');
      } catch {
        setStatus('error');
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [content, noteId, open, updateNote]);

  return (
    <section className="card p-5" aria-labelledby="quick-note-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="quick-note-heading" className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
          Quick note
        </h2>
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? 'Collapse' : 'Expand'}
        </Button>
      </div>
      {open ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Capture an idea without leaving the timer…"
            aria-label="Quick note content"
            className="focus-ring min-h-[120px] w-full resize-y rounded-xl border subtle-border bg-surface-light px-3 py-2 text-sm dark:bg-surface-dark"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className={status === 'error' ? 'text-red-600 dark:text-red-400' : 'muted'}>
              {status === 'saving' ? 'Saving…' : status === 'error' ? 'Save failed — retrying' : 'Saved on this device'}
            </span>
            <Button size="sm" variant="ghost" onClick={onOpenInNotes}>
              Open in Notes
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs muted">Keep the keyboard in this mental space.</p>
      )}
    </section>
  );
}
