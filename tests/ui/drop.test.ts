import { describe, expect, it } from 'vitest';
import { dropTarget } from '../../src/ui/drop';

describe('dropTarget', () => {
  it('cells place items', () => {
    expect(dropTarget('cell:3:1')).toEqual({ kind: 'cell', step: 3, wire: 1 });
  });
  it('the grid container (step header, In/Out columns) is a no-op', () => {
    expect(dropTarget('grid')).toEqual({ kind: 'grid' });
  });
  it('the palette trash or nothing deletes', () => {
    expect(dropTarget('trash')).toEqual({ kind: 'outside' });
    expect(dropTarget(undefined)).toEqual({ kind: 'outside' });
    expect(dropTarget(null)).toEqual({ kind: 'outside' });
  });
});
