import { describe, expect, it } from 'vitest';
import css from '../../src/ui/styles.css?raw';

const body = (sel: string) => {
  const m = css.match(new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
  return m?.[2] ?? '';
};
const family = (sel: string) => body(sel).match(/font-family:\s*([^;]+);/)?.[1].trim();

describe('Bloch panel angle labels', () => {
  it('θ and φ labels use the same font as the formula, so φ has one glyph shape', () => {
    expect(family('.bloch-euler')).toBeTruthy();
    expect(family('.bloch-coords dt')).toBe(family('.bloch-euler'));
  });
});
