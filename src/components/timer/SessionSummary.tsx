import { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { formatDuration } from '../../lib/format';

export function SessionSummary() {
  const { sessionSummary, dismissSessionSummary, toggleTask, tasks, projects, createNote, selectTask, selectProject } = useApp();
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionSummary) setDismissed(null);
  }, [sessionSummary]);

  if (!sessionSummary || dismissed === sessionSummary.sessionId) return null;
  const task = sessionSummary.taskId ? tasks.find((t) => t.id === sessionSummary.taskId) : null;
  const project = sessionSummary.projectId ? projects.find((p) => p.id === sessionSummary.projectId) : null;

  const handleCompleteTask = () => {
    if (task && !task.completed) toggleTask(task.id);
    dismissSessionSummary();
  };
  const handleAddNote = () => {
    createNote(sessionSummary.projectId ?? null);
    selectTask(null);
    selectProject(sessionSummary.projectId ?? null);
    window.dispatchEvent(new CustomEvent('akidoro:navigate', { detail: 'notes' }));
    dismissSessionSummary();
    // Let NotesView mount before selecting; nothing else is guaranteed.
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pt-4 sm:px-6" role="status" aria-live="polite">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">Session complete</p>
            <p className="text-sm muted">
              {formatDuration(sessionSummary.durationSec)} of {sessionSummary.mode === 'focus' ? 'focus' : 'break'} time
              {task ? ` · ${task.title}` : ''}
              {project ? ` · ${project.name}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {task && !task.completed ? (
              <Button size="sm" variant="primary" onClick={handleCompleteTask}>
                Complete task
              </Button>
            ) : null}
            <Button size="sm" onClick={handleAddNote}>Add note</Button>
            <Button size="sm" onClick={() => dismissSessionSummary()}>Dismiss</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
