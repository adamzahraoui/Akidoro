import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { BinaryFiles } from '@excalidraw/excalidraw/types';
import { exportToBlob, exportToSvg } from '@excalidraw/excalidraw';
import { useApp } from '../../context/AppContext';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { cx } from '../../lib/classNames';
import { getAllWhiteboards, putWhiteboard, deleteWhiteboardFromDb } from '../../lib/whiteboardStorage';
import type { WhiteboardBoard } from '../../lib/whiteboardStorage';
import '@excalidraw/excalidraw/index.css';

const Excalidraw = lazy(() =>
  import('@excalidraw/excalidraw').then((module) => ({ default: module.Excalidraw })),
);

interface WhiteboardState {
  elements: any[];
  appState: any;
  files: BinaryFiles;
}

export function WhiteboardView() {
  const { settings } = useApp();
  const [boards, setBoards] = useState<WhiteboardBoard[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [scene, setScene] = useState<WhiteboardState | null>(null);
  const [ready, setReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [fullscreen, setFullscreen] = useState(false);
  const activeIdRef = useRef<string | null>(null);
  const currentSceneRef = useRef<WhiteboardState | null>(null);
  const generationRef = useRef(0);
  const saveTimerRef = useRef<number | null>(null);

  const theme = settings.theme === 'dark' ? 'dark' : settings.theme === 'light' ? 'light' : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

  async function loadBoards(preferredId?: string) {
    const all = await getAllWhiteboards();
    const list = all.sort((a, b) => b.updatedAt - a.updatedAt);
    let current = list.find((board) => board.id === preferredId) ?? list[0];
    if (!current) {
      const now = Date.now();
      current = { id: crypto.randomUUID(), name: 'Untitled board', createdAt: now, updatedAt: now, scene: { elements: [], appState: {}, files: {} } };
      await putWhiteboard(current);
      list.unshift(current);
    }
    setBoards(list);
    activeIdRef.current = current.id;
    setActiveId(current.id);
    setScene({
      elements: Array.isArray((current.scene as any)?.elements) ? (current.scene as any).elements : [],
      appState: (current.scene as any)?.appState ?? {},
      files: (current.scene as any)?.files ?? {},
    });
    currentSceneRef.current = {
      elements: Array.isArray((current.scene as any)?.elements) ? (current.scene as any).elements : [],
      appState: (current.scene as any)?.appState ?? {},
      files: (current.scene as any)?.files ?? {},
    };
    setReady(true);
    return current.id;
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await loadBoards();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  const persistActive = async (generation: number) => {
    const id = activeIdRef.current;
    const snapshot = currentSceneRef.current;
    if (!id || !snapshot || generation !== generationRef.current) return;
    const board = boards.find((item) => item.id === id);
    if (!board) return;
    setSaveStatus('saving');
    try {
      await putWhiteboard({
        ...board,
        updatedAt: Date.now(),
        scene: {
          elements: snapshot.elements,
          appState: snapshot.appState,
          files: snapshot.files,
        },
      });
      if (generation === generationRef.current) {
        setBoards((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, updatedAt: Date.now() } : item,
          ),
        );
        setSaveStatus('saved');
      }
    } catch {
      if (generation === generationRef.current) setSaveStatus('error');
    }
  };

  function scheduleSave() {
    generationRef.current += 1;
    const generation = generationRef.current;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void persistActive(generation);
    }, 800);
  }

  const handleChange = (elements: any, appState: any, files: BinaryFiles) => {
    if (!ready) return;
    currentSceneRef.current = { elements, appState, files };
    scheduleSave();
  };

  async function createBoard() {
    const now = Date.now();
    const board: WhiteboardBoard = {
      id: crypto.randomUUID(),
      name: 'Untitled board',
      createdAt: now,
      updatedAt: now,
      scene: { elements: [], appState: {}, files: {} },
    };
    await putWhiteboard(board);
    const all = await getAllWhiteboards();
    setBoards(all.sort((a, b) => b.updatedAt - a.updatedAt));
    activeIdRef.current = board.id;
    setActiveId(board.id);
    setScene({ elements: [], appState: {}, files: {} });
    currentSceneRef.current = { elements: [], appState: {}, files: {} };
    setReady(true);
  }

  async function selectBoard(id: string) {
    if (id === activeIdRef.current) return;
    generationRef.current += 1;
    const selected = boards.find((board) => board.id === id);
    if (!selected) return;
    activeIdRef.current = id;
    setActiveId(id);
    setScene({
      elements: Array.isArray((selected.scene as any)?.elements) ? (selected.scene as any).elements : [],
      appState: (selected.scene as any)?.appState ?? {},
      files: (selected.scene as any)?.files ?? {},
    });
    currentSceneRef.current = {
      elements: Array.isArray((selected.scene as any)?.elements) ? (selected.scene as any).elements : [],
      appState: (selected.scene as any)?.appState ?? {},
      files: (selected.scene as any)?.files ?? {},
    };
  }

  const renameActive = () => {
    const id = activeIdRef.current;
    if (!id) return;
    const board = boards.find((item) => item.id === id);
    const next = window.prompt('Rename board', board?.name ?? '');
    if (next === null) return;
    const name = next.trim() || 'Untitled board';
    setBoards((prev) => prev.map((item) => (item.id === id ? { ...item, name, updatedAt: Date.now() } : item)));
    void putWhiteboard({ ...(board as WhiteboardBoard), name, updatedAt: Date.now() });
  };

  const duplicateActive = async () => {
    const board = boards.find((item) => item.id === activeIdRef.current);
    if (!board) return;
    const now = Date.now();
    const duplicate: WhiteboardBoard = {
      id: crypto.randomUUID(),
      name: `${board.name} copy`,
      createdAt: now,
      updatedAt: now,
      scene: board.scene,
    };
    await putWhiteboard(duplicate);
    await loadBoards(duplicate.id);
  };

  const deleteActive = async () => {
    const id = activeIdRef.current;
    if (!id || !window.confirm('Delete this board?')) return;
    await deleteWhiteboardFromDb(id);
    const remaining = boards.filter((board) => board.id !== id);
    if (remaining.length === 0) {
      await createBoard();
    } else {
      await loadBoards(remaining[0].id);
    }
  };

  const importBoard = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || !Array.isArray(parsed.elements)) {
        window.alert('Unsupported or malformed Excalidraw file.');
        return;
      }
      const now = Date.now();
      const board: WhiteboardBoard = {
        id: crypto.randomUUID(),
        name: file.name.replace(/\.[^.]+$/, '') || 'Imported board',
        createdAt: now,
        updatedAt: now,
        scene: {
          elements: parsed.elements,
          appState: parsed.appState ?? {},
          files: parsed.files ?? {},
        },
      };
      if (!window.confirm('Import this file as a new board?')) return;
      await putWhiteboard(board);
      await loadBoards(board.id);
    } catch {
      window.alert('Could not import that file.');
    }
  };

  const exportBoard = async (type: 'json' | 'png' | 'svg') => {
    const snapshot = currentSceneRef.current;
    if (!snapshot) return;
    const elements = snapshot.elements ?? [];
    const appState = snapshot.appState ?? {};
    const files = snapshot.files ?? {};
    const baseName = boards.find((board) => board.id === activeIdRef.current)?.name ?? 'board';
    if (type === 'json') {
      const blob = new Blob([JSON.stringify({ type: 'excalidraw', version: 2, source: 'akidoro', elements, appState, files }, null, 2)], {
        type: 'application/json',
      });
      downloadBlob(blob, `${baseName}.excalidraw`);
      return;
    }
    if (type === 'png') {
      const blob = await exportToBlob({
        elements,
        appState,
        files,
        mimeType: 'image/png',
      });
      if (blob) downloadBlob(blob, `${baseName}.png`);
      return;
    }
    const svg = await exportToSvg({ elements, appState, files });
    if (svg) downloadBlob(new Blob([svg.outerHTML], { type: 'image/svg+xml' }), `${baseName}.svg`);
  };

  const currentBoard = boards.find((board) => board.id === activeId);

  return (
    <div className={cx(fullscreen ? 'fixed inset-0 z-50 bg-canvas-light dark:bg-canvas-dark p-2' : 'space-y-4')}>
      <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto pb-1">
        <select
          value={activeId ?? ''}
          onChange={(event) => void selectBoard(event.target.value)}
          aria-label="Select whiteboard"
          className="focus-ring h-9 shrink-0 rounded-xl border subtle-border bg-surface-light px-3 text-sm dark:bg-surface-dark"
        >
          {boards.map((board) => (
            <option key={board.id} value={board.id}>
              {board.name}
            </option>
          ))}
        </select>
        <Button size="sm" variant="primary" className="shrink-0" onClick={() => void createBoard()}>
          New board
        </Button>
        <Button size="sm" variant="ghost" className="shrink-0" onClick={renameActive}>
          Rename
        </Button>
        <Button size="sm" variant="ghost" className="shrink-0" onClick={() => void duplicateActive()}>
          Duplicate
        </Button>
        <Button size="sm" variant="danger" className="shrink-0" onClick={() => void deleteActive()}>
          Delete
        </Button>
        <label className="focus-ring inline-flex h-9 shrink-0 cursor-pointer items-center rounded-xl border subtle-border bg-surface-light px-3 text-sm dark:bg-surface-dark">
          Import
          <input
            type="file"
            accept=".excalidraw,.json,image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importBoard(file);
              event.target.value = '';
            }}
          />
        </label>
        <Button size="sm" variant="ghost" className="shrink-0" onClick={() => void exportBoard('json')}>
          Export .excalidraw
        </Button>
        <Button size="sm" variant="ghost" className="shrink-0" onClick={() => void exportBoard('png')}>
          PNG
        </Button>
        <Button size="sm" variant="ghost" className="shrink-0" onClick={() => void exportBoard('svg')}>
          SVG
        </Button>
        <Button size="sm" variant="secondary" className="shrink-0" onClick={() => setFullscreen((value) => !value)}>
          {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        </Button>
        {saveStatus === 'error' ? (
          <span className="shrink-0 text-xs font-medium text-red-600 dark:text-red-400">Save failed</span>
        ) : null}
      </div>
      {currentBoard ? (
        <p className="text-xs muted">Last edited {new Date(currentBoard.updatedAt).toLocaleString()}</p>
      ) : null}
      <Card className={cx('overflow-hidden p-0', fullscreen ? 'h-[calc(100vh-5rem)]' : 'h-[70vh] min-h-[32rem]')}>
        <Suspense fallback={<div className="grid h-full place-items-center text-sm muted">Loading whiteboard…</div>}>
          <Excalidraw
            key={activeId}
            initialData={scene as any}
            onChange={handleChange}
            theme={theme as any}
            viewModeEnabled={false}
          />
        </Suspense>
      </Card>
      <p className="text-xs muted">
        Boards are stored only in this browser and are not synced across devices. Use backups for transfer.
      </p>
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
