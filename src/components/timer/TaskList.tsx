import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Button } from '../ui/Button';
import { cx } from '../../lib/classNames';

export function TaskList() {
  const { tasks, createTask, renameTask, toggleTask, deleteTask, currentTaskId, selectTask } = useApp();
  const [draft, setDraft] = useState('');
  const [completedOpen, setCompletedOpen] = useState(false);

  const active = tasks.filter((t) => !t.completed);
  const completed = tasks.filter((t) => t.completed);

  const create = () => {
    const title = draft.trim();
    if (!title) return;
    createTask(title);
    setDraft('');
  };

  const remove = (id: string, title: string) => {
    if (!window.confirm(`Delete “${title || 'Untitled task'}”?`)) return;
    deleteTask(id);
  };

  return (
    <section className="card p-5" aria-labelledby="tasks-heading">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="tasks-heading" className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
          Tasks
        </h2>
        <p className="text-xs muted">{active.length} open</p>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') create();
          }}
          placeholder="Add a task…"
          aria-label="New task title"
          className="focus-ring min-w-0 flex-1 rounded-xl border subtle-border bg-surface-light px-3 py-2 text-sm dark:bg-surface-dark"
        />
        <Button size="sm" variant="primary" onClick={create}>
          Add
        </Button>
      </div>

      {tasks.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed subtle-border px-3 py-6 text-center text-sm muted">
          No tasks yet. Add one to stay focused.
        </p>
      ) : (
        <ul className="mt-4 space-y-2" aria-label="Task list">
          {active.map((task) => (
            <li
              key={task.id}
              className={cx(
                'rounded-xl border p-3 transition-colors',
                currentTaskId === task.id
                  ? 'border-accent-600 bg-accent-50 dark:border-accent-600 dark:bg-accent-900/20'
                  : 'subtle-border',
              )}
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={task.completed}
                  onChange={() => toggleTask(task.id)}
                  aria-label={`Mark ${task.title || 'task'} complete`}
                  className="mt-1"
                />
                <input
                  type="text"
                  value={task.title}
                  onChange={(e) => renameTask(task.id, e.target.value)}
                  aria-label="Task title"
                  className="focus-ring min-w-0 flex-1 border-0 bg-transparent px-1 py-0.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => selectTask(currentTaskId === task.id ? null : task.id)}
                  aria-pressed={currentTaskId === task.id}
                  className={cx(
                    'focus-ring rounded-lg px-2 py-1 text-xs font-medium',
                    currentTaskId === task.id ? 'bg-accent-600 text-white' : 'text-accent-700',
                  )}
                >
                  {currentTaskId === task.id ? 'Current' : 'Focus'}
                </button>
                <Button size="sm" variant="ghost" onClick={() => remove(task.id, task.title)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {completed.length > 0 ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setCompletedOpen((v) => !v)}
            className="focus-ring text-xs font-medium text-stone-500 hover:text-stone-700 dark:text-stone-400"
          >
            {completedOpen ? 'Hide' : 'Show'} completed ({completed.length})
          </button>
          {completedOpen ? (
            <ul className="mt-2 space-y-2">
              {completed.map((task) => (
                <li key={task.id} className="flex items-center gap-2 rounded-xl border subtle-border p-3 opacity-70">
                  <input type="checkbox" checked onChange={() => toggleTask(task.id)} aria-label={`Mark ${task.title} incomplete`} />
                  <span className="flex-1 text-sm line-through">{task.title}</span>
                  <Button size="sm" variant="ghost" onClick={() => deleteTask(task.id)}>
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
