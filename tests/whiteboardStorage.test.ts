// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteWhiteboardFromDb,
  getAllWhiteboards,
  putWhiteboard,
} from '../src/lib/whiteboardStorage';

describe('whiteboard storage', () => {
  beforeEach(async () => {
    const boards = await getAllWhiteboards().catch(() => []);
    for (const board of boards) await deleteWhiteboardFromDb(board.id);
  });

  afterEach(async () => {
    const boards = await getAllWhiteboards().catch(() => []);
    for (const board of boards) await deleteWhiteboardFromDb(board.id);
  });

  it('persists and restores board scenes including image files', async () => {
    const scene = {
      elements: [{ id: 'a', type: 'rectangle' }],
      appState: { zoom: 1.5 },
      files: { 'img-1': { id: 'img-1', dataURL: 'data:image/png;base64,AAAA', mimeType: 'image/png' } },
    };
    await putWhiteboard({ id: 'board-1', name: 'Demo', createdAt: 1, updatedAt: 2, scene });
    const loaded = await getAllWhiteboards();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('Demo');
    expect((loaded[0].scene as any).elements[0].id).toBe('a');
    expect((loaded[0].scene as any).files['img-1'].dataURL).toContain('AAAA');
  });

  it('deletes boards independently', async () => {
    await putWhiteboard({ id: 'b1', name: 'One', createdAt: 1, updatedAt: 1, scene: { elements: [] } });
    await putWhiteboard({ id: 'b2', name: 'Two', createdAt: 2, updatedAt: 2, scene: { elements: [] } });
    await deleteWhiteboardFromDb('b1');
    const loaded = await getAllWhiteboards();
    expect(loaded.map((b) => b.id)).toEqual(['b2']);
  });
});
