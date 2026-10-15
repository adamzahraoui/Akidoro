import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Button } from '../ui/Button';
import { Card, CardTitle } from '../ui/Card';
import { getAllWhiteboards } from '../../lib/whiteboardStorage';

const PROJECT_COLOR_PRESETS = ['#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#2563eb', '#7c3aed', '#0891b2', '#4b5563'];

export function ProjectsView() {
  const {
    projects,
    createProject,
    updateProject,
    archiveProject,
    restoreProject,
    deleteProject,
    currentProjectId,
    selectProject,
    tasks,
    setTaskProject,
    toggleTask,
    createTask,
    notes,
    updateNote,
    sessions,
  } = useApp();

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newColor, setNewColor] = useState(PROJECT_COLOR_PRESETS[0]);
  const [boards, setBoards] = useState<any[]>([]);

  useEffect(() => {
    void getAllWhiteboards().then((dbBoards) => setBoards(dbBoards as any[])).catch(() => setBoards([]));
  }, [projects]);

  const visibleProjects = projects.filter((p) => (showArchived ? p.archived : !p.archived));
  const selected = useMemo(() => projects.find((p) => p.id === selectedProjectId) ?? null, [projects, selectedProjectId]);

  const focusTimeByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const session of sessions) {
      const bucket = session.projectId ?? '__unassigned__';
      map.set(bucket, (map.get(bucket) ?? 0) + (session.mode === 'focus' ? session.durationSec : 0));
    }
    return map;
  }, [sessions]);

  useEffect(() => {
    if (!selectedProjectId && visibleProjects.length) setSelectedProjectId(visibleProjects[0].id);
    if (selectedProjectId && !projects.some((p) => p.id === selectedProjectId)) setSelectedProjectId(visibleProjects[0]?.id ?? null);
  }, [visibleProjects, projects, selectedProjectId]);

  const associatedTasks = useMemo(() => tasks.filter((t) => selected?.id && t.projectId === selected.id), [tasks, selected]);
  const unassignedTasks = useMemo(() => tasks.filter((t) => t.projectId == null), [tasks]);
  const associatedNotes = useMemo(() => notes.filter((n) => selected?.id && n.projectId === selected.id), [notes, selected]);
  const unassignedNotes = useMemo(() => notes.filter((n) => n.projectId == null && !n.deletedAt), [notes]);
  const associatedBoards = useMemo(() => boards.filter((b) => selected?.id && b.projectId === selected.id), [boards, selected]);

  const handleCreate = () => {
    if (!newName.trim()) return;
    const id = createProject(newName, newDescription, newColor);
    setSelectedProjectId(id);
    setNewName('');
    setNewDescription('');
    setNewColor(PROJECT_COLOR_PRESETS[0]);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardTitle hint="Optional focus area">Projects</CardTitle>
        <p className="mt-2 text-sm muted">
          Group notes, tasks, whiteboards, and recorded focus time. You can continue using the timer without a project.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1.4fr_0.7fr_auto]">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Exam preparation, Writing, Work project..."
            className="focus-ring rounded-xl border subtle-border bg-surface-light px-3 py-2 text-sm dark:bg-surface-dark"
          />
          <input
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Description (optional)"
            className="focus-ring rounded-xl border subtle-border bg-surface-light px-3 py-2 text-sm dark:bg-surface-dark"
          />
          <div className="flex gap-1">
            {PROJECT_COLOR_PRESETS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setNewColor(color)}
                className={`h-9 w-5 rounded ${newColor === color ? 'ring-2 ring-accent-600' : ''}`}
                style={{ backgroundColor: color }}
                aria-label={`Project color ${color}`}
              />
            ))}
          </div>
          <Button variant="primary" onClick={handleCreate} disabled={!newName.trim()}>Create</Button>
        </div>
        {projects.some((p) => p.archived) ? (
          <button
            type="button"
            className="mt-3 text-sm text-accent-700 dark:text-accent-300"
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? 'Hide archived projects' : 'Show archived projects'}
          </button>
        ) : null}
      </Card>

      {visibleProjects.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm muted">No projects yet. Try broad examples such as “Exam preparation,” “Writing,” “Work project,” or “Personal goals.”</p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <ul className="space-y-2">
            {visibleProjects.map((project) => {
              const timeSec = focusTimeByProject.get(project.id) ?? 0;
              const active = selectedProjectId === project.id;
              return (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedProjectId(project.id)}
                    className={`focus-ring w-full rounded-xl border p-3 text-left ${active ? 'border-accent-600 bg-accent-50 dark:bg-accent-900/20' : 'subtle-border hover:bg-stone-100 dark:hover:bg-stone-800/60'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: project.color }} />
                      <span className="text-sm font-medium">{project.name}</span>
                    </div>
                    <p className="mt-1 text-xs muted">
                      {Math.round(timeSec)} min focus · {tasks.filter((t) => t.projectId === project.id).length} tasks
                    </p>
                  </button>
                </li>
              )
            })}
          </ul>

          {selected ? (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full" style={{ backgroundColor: selected.color }} />
                  <input
                    value={selected.name}
                    onChange={(e) => updateProject(selected.id, { name: e.target.value })}
                    className="focus-ring min-w-0 flex-1 rounded-xl border subtle-border bg-surface-light px-3 py-2 text-base font-medium dark:bg-surface-dark"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={currentProjectId === selected.id ? 'secondary' : 'primary'}
                    onClick={() => selectProject(selected.id)}
                  >
                    {currentProjectId === selected.id ? 'Selected' : 'Select'}
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => {
                    selectProject(selected.id);
                    window.dispatchEvent(new CustomEvent('akidoro:navigate', { detail: 'timer' }));
                  }}>
                    Start focus
                  </Button>
                  {selected.archived ? (
                    <Button size="sm" onClick={() => restoreProject(selected.id)}>Restore</Button>
                  ) : (
                    <Button size="sm" onClick={() => archiveProject(selected.id)}>Archive</Button>
                  )}
                  <Button size="sm" variant="danger" onClick={() => deleteProject(selected.id)}>Delete</Button>
                </div>
              </div>
              <input
                value={selected.description}
                onChange={(e) => updateProject(selected.id, { description: e.target.value })}
                placeholder="Description"
                className="mt-3 focus-ring w-full rounded-xl border subtle-border bg-surface-light px-3 py-2 text-sm dark:bg-surface-dark"
              />
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <section>
                  <h3 className="text-sm font-semibold">Tasks</h3>
                  <ul className="mt-2 space-y-2">
                    {associatedTasks.map((task) => (
                      <li key={task.id} className="flex items-center gap-2">
                        <input type="checkbox" checked={task.completed} onChange={() => toggleTask(task.id)} />
                        <span className={`text-sm ${task.completed ? 'line-through muted' : ''}`}>{task.title}</span>
                      </li>
                    ))}
                    {associatedTasks.length === 0 ? <li className="text-xs muted">No tasks yet.</li> : null}
                  </ul>
                  <div className="mt-3 flex gap-2">
                    <TaskCreator onCreate={(title) => createTask(title, selected.id)} projectLabel={selected.name} />
                  </div>
                  {unassignedTasks.length ? (
                    <div className="mt-3">
                      <select
                        className="focus-ring w-full rounded-xl border subtle-border bg-surface-light px-3 py-2 text-sm dark:bg-surface-dark"
                        defaultValue=""
                        onChange={(e) => {
                          if (!e.target.value) return;
                          setTaskProject(e.target.value, selected.id);
                          e.currentTarget.value = '';
                        }}
                      >
                        <option value="">Assign unassigned task…</option>
                        {unassignedTasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                      </select>
                    </div>
                  ) : null}
                </section>
                <section>
                  <h3 className="text-sm font-semibold">Notes</h3>
                  <ul className="mt-2 space-y-2">
                    {associatedNotes.map((note) => (
                      <li key={note.id} className="text-sm">{note.title || 'Untitled note'}</li>
                    ))}
                    {associatedNotes.length === 0 ? <li className="text-xs muted">No notes yet.</li> : null}
                  </ul>
                  {unassignedNotes.length ? (
                    <select
                      className="mt-3 focus-ring w-full rounded-xl border subtle-border bg-surface-light px-3 py-2 text-sm dark:bg-surface-dark"
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          updateNote(e.target.value, { projectId: selected.id });
                          e.currentTarget.value = '';
                        }
                      }}
                    >
                      <option value="">Assign unassigned note…</option>
                      {unassignedNotes.map((note) => <option key={note.id} value={note.id}>{note.title || 'Untitled'}</option>)}
                    </select>
                  ) : null}
                </section>
                <section>
                  <h3 className="text-sm font-semibold">Whiteboards</h3>
                  <ul className="mt-2 space-y-2">
                    {associatedBoards.map((board) => (
                      <li key={board.id} className="text-sm">{board.name}</li>
                    ))}
                    {associatedBoards.length === 0 ? <li className="text-xs muted">No boards yet.</li> : null}
                  </ul>
                </section>
                <section>
                  <h3 className="text-sm font-semibold">Focus time</h3>
                  <p className="mt-2 text-2xl font-semibold">
                    {Math.round((focusTimeByProject.get(selected.id) ?? 0) / 60)} min
                  </p>
                  <p className="text-xs muted">
                    {sessions.filter((s) => s.projectId === selected.id && s.completed).length} completed focus sessions
                  </p>
                </section>
              </div>
            </Card>
          ) : null}
        </div>
      )}
      <ProjectTimeSummary focusTimeByProject={focusTimeByProject} projects={projects} />
    </div>
  );
}

function TaskCreator({ onCreate }: { onCreate: (title: string) => void; projectLabel: string }) {
  const [title, setTitle] = useState('');
  return (
    <div className="flex gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={`New task`}
        className="focus-ring flex-1 rounded-xl border subtle-border bg-surface-light px-3 py-2 text-sm dark:bg-surface-dark"
      />
      <Button size="sm" variant="primary" disabled={!title.trim()} onClick={() => {
        if (title.trim()) { onCreate(title); setTitle(''); }
      }}>Add</Button>
    </div>
  );
}

function ProjectTimeSummary({ focusTimeByProject, projects }: { focusTimeByProject: Map<string, number>; projects: any }) {
  const total = projects.reduce((sum:any, p:any) => sum + Math.round((focusTimeByProject.get(p.id) ?? 0) / 60), 0);
  return <Card><CardTitle hint="All projects">Total focus time {total} min</CardTitle></Card>;
}
