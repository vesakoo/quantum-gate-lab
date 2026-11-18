import { describe, expect, it } from 'vitest';
import css from '../../src/ui/styles.css?raw';
import * as script from '../../scripts/contrast.mjs';
import { composite, contrast, parseColor } from './contrastMath';

function forcedBlock(): string {
  const i = css.indexOf('@media (forced-colors: active)');
  if (i < 0) return '';
  // the block ends at the first line that is just "}" at column 0
  return css.slice(i, css.indexOf('\n}\n', i) + 2);
}

describe('forced colours (Windows High Contrast)', () => {
  it.each(['.gate', '.ctl-ball', '.connector', '.selection', ':focus-visible', '.out-fill', '.control-line', '.chart-bar'])(
    'keeps %s visible with system colours',
    (sel) => {
      const block = forcedBlock();
      const rule = new RegExp(`(^|[\\s,}])${sel.replace(/[.:]/g, (c) => `\\${c}`)}[^{]*\\{([^}]*)\\}`).exec(block);
      expect(rule, sel).not.toBeNull();
      expect(rule![2]).toMatch(/CanvasText|Highlight|ButtonText|Canvas\b|forced-color-adjust/);
    },
  );

  it('a filled control stays distinguishable from an open one', () => {
    const block = forcedBlock();
    expect(block).toMatch(/\.ctl-ball\.on1[^{]*\{[^}]*background:\s*CanvasText/);
    expect(block).toMatch(/\.ctl-ball\.on0[^{]*\{[^}]*background:\s*Canvas\b/);
  });
});

describe('audit script contrast maths agrees with the tests', () => {
  it.each([
    ['#000000', '#ffffff'],
    ['#777777', '#ffffff'],
    ['#1f4d86', '#ffffff'],
    ['#ffb562', '#181d24'],
    ['rgba(20, 24, 30, 0.35)', '#ffffff'],
  ])('%s on %s', (fg, bg) => {
    const ours = contrast(composite(parseColor(fg), parseColor(bg)), parseColor(bg));
    const theirs = script.contrast(script.composite(script.parseColor(fg), script.parseColor(bg)), script.parseColor(bg));
    expect(theirs).toBeCloseTo(ours, 10);
  });
});

describe('forced colours: findings from the screenshot review', () => {
  it('the B gate control end stays filled', () => {
    expect(forcedBlock()).toMatch(/\.b-grip\.role::before[^{]*\{[^}]*background:\s*CanvasText/);
  });

  it('active controls use system colours at the same specificity as the themed rule', () => {
    expect(forcedBlock()).toMatch(/\.step-column \.ctl-ball\.active[^{]*\{[^}]*border-color:\s*CanvasText/);
  });
});
