import { pointerWithin, type CollisionDetection, type UniqueIdentifier } from '@dnd-kit/core';

/** Droppable id of the whole circuit area (headers, In/Out columns, cells, Bloch strip). */
export const GRID_ID = 'grid';
/** Droppable id of the palette, which deletes grid items dropped on it. */
export const TRASH_ID = 'trash';

export type DropTarget = { kind: 'cell'; step: number; wire: number } | { kind: 'grid' } | { kind: 'outside' };

/**
 * Classifies the droppable under the pointer at drag end. A cell places/moves; anywhere else
 * on the grid (step header, In/Out column, Bloch strip) is a no-op; the palette (`trash`) or
 * nothing at all means outside the grid, which deletes grid items.
 */
export function dropTarget(id: UniqueIdentifier | null | undefined): DropTarget {
  if (typeof id === 'string') {
    const m = /^cell:(\d+):(\d+)$/.exec(id);
    if (m) return { kind: 'cell', step: Number(m[1]), wire: Number(m[2]) };
    if (id === GRID_ID) return { kind: 'grid' };
  }
  return { kind: 'outside' };
}

/** pointerWithin, but a cell (or the trash) under the pointer wins over the grid container. */
export const gridCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const specific = hits.find((h) => h.id !== GRID_ID);
  return specific ? [specific] : hits;
};
