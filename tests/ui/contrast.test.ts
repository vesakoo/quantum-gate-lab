import { describe, expect, it } from 'vitest';
import css from '../../src/ui/styles.css?raw';
import { composite, contrast, parseColor, themeBlock, themeTokens, type RGBA } from './contrastMath';
type Theme = 'light' | 'dark';
const THEMES: Theme[] = ['light', 'dark'];

/**
 * A measured pair. Translucent tokens are composited over `via` (default --panel).
 * `bgAlpha` paints bg at that alpha over `via` first; `fgAlpha` paints fg at that alpha over the
 * resolved background (used for lines the 3D scene draws translucently).
 */
type Pair = { fg: string; bg: string; min: number; what: string; via?: string; bgAlpha?: number; fgAlpha?: number; theme?: Theme };

const T = 7; // text (WCAG 1.4.6 AAA)
const G = 3; // non-text (WCAG 1.4.11)

const p = (fg: string, bg: string, min: number, what: string, extra: Partial<Pair> = {}): Pair => ({ fg, bg, min, what, ...extra });

/** Foreground tokens drawn on each surface (each combination must be in PAIRS). */
const SURFACES: Record<string, { text: string[]; marks: string[]; via?: string }> = {
  '--panel': {
    text: ['--text', '--muted', '--danger'],
    marks: ['--border', '--wire', '--gate-border', '--ctl', '--chart-bar', '--focus', '--select', '--danger', '--button-border'],
  },
  '--bg': { text: ['--text', '--muted'], marks: ['--focus', '--gate-border', '--border'] },
  '--raised': { text: ['--text', '--muted', '--danger'], marks: ['--border', '--focus'] },
  '--danger-bg': { text: ['--text', '--danger'], marks: ['--focus', '--danger'] },
  '--gate-fill': { text: ['--gate-text'], marks: ['--gate-glyph'] },
  '--drop-target': { text: ['--text'], marks: ['--wire', '--gate-border', '--ctl'], via: '--panel' },
  '--button-bg': { text: ['--button-text'], marks: ['--focus'] },
  '--button-hover-bg': { text: ['--button-text'], marks: [] },
  '--hover-bg': { text: ['--text'], marks: ['--wire'] },
  '--badge-bg': { text: ['--badge-text'], marks: ['--border'] },
  '--barrier-bg': { text: ['--text'], marks: ['--border'] },
  '--mixed-bg': { text: ['--text', '--muted'], marks: [] },
  '--out-fill': { text: ['--out-digit'], marks: [] },
  '--mini-sphere': { text: [], marks: ['--mini-line', '--mini-arrow'] },
  '--mini-sphere-mixed': { text: [], marks: ['--mini-line', '--mini-arrow'] },
  '--bloch-label-bg': { text: ['--bloch-label-state'], marks: [], via: '--panel' },
};

const PAIRS: Pair[] = [
  ...Object.entries(SURFACES).flatMap(([bg, s]) => [
    ...s.text.map((fg) => p(fg, bg, T, `${fg} text on ${bg}`, s.via ? { via: s.via } : {})),
    ...s.marks.map((fg) => p(fg, bg, G, `${fg} mark on ${bg}`, s.via ? { via: s.via } : {})),
  ]),
  p('--out-digit', '--panel', T, 'Out digit on the empty part'),
  p('--bloch-label-axis', '--panel', T, '3D axis label'),
  // dialog / card edge against the dimmed page behind it
  p('--raised-border', '--backdrop', G, 'dialog/card edge vs backdrop over page', { via: '--bg' }),
  p('--raised-border', '--backdrop', G, 'dialog/card edge vs backdrop over panel', { via: '--panel' }),
  p('--raised-border', '--raised', G, 'dialog/card edge vs its own surface'),
  p('--raised-border', '--panel', G, 'card edge vs panel'),
  // dark: flat 3D sphere, fill at alpha 0.55 over the panel
  p('--bloch-outline', '--panel', G, '3D outline', { theme: 'dark' }),
  p('--bloch-circle', '--sphere', G, '3D circles on fill', { theme: 'dark', bgAlpha: 0.55 }),
  p('--bloch-axis', '--sphere', G, '3D axes on fill', { theme: 'dark', bgAlpha: 0.55 }),
  p('--arrow', '--sphere', G, '3D arrow on fill', { theme: 'dark', bgAlpha: 0.55 }),
  p('--arrow', '--panel', G, '3D arrow off the sphere'),
  // light: today's lit sphere — equator at 0.9 and axes pass; the meridians are exception 2
  p('--bloch-circle', '--sphere', G, '3D equator (0.9) on fill', { theme: 'light', bgAlpha: 0.18, fgAlpha: 0.9 }),
  p('--bloch-axis', '--sphere', G, '3D axes on fill', { theme: 'light', bgAlpha: 0.18 }),
  p('--arrow', '--sphere', G, '3D arrow on fill', { theme: 'light', bgAlpha: 0.18 }),
];

/** Documented exceptions (spec 2026-11-19): asserted to be below their minimum so the list stays truthful. */
const EXCEPTIONS: Pair[] = [
  p('--out-fill', '--panel', G, 'Out fill level vs empty part: user choice 2026-11-19; P(1) in the accessible name'),
  p('--bloch-circle', '--sphere', G, "light 3D meridians (0.45): today's sphere kept, user choice 2026-11-19", {
    theme: 'light',
    bgAlpha: 0.18,
    fgAlpha: 0.45,
  }),
];

/** Tokens that carry no information on their own (reason in the comment). */
const DECORATIVE = [
  '--shadow', // depth cue under dialog/card; the --border edge carries the boundary
  '--divider', // separators between rows of the palette
  '--grid-line', // hairlines between grid header cells; wires and gate outlines carry the structure
  '--selection-bg', // tint inside the --select ring
  '--bloch-outline', // light: unused by the lit sphere (measured in dark)
];

function resolve(tokens: Record<string, string>, name: string, over?: RGBA): RGBA {
  const v = tokens[name];
  if (v === undefined) throw new Error(`missing token ${name}`);
  const c = v.startsWith('var(') ? resolve(tokens, v.slice(4, -1).trim(), over) : parseColor(v);
  return c[3] < 1 ? composite(c, over ?? [255, 255, 255, 1]) : c;
}

function ratio(theme: Theme, pr: Pair): number {
  const tk = themeTokens(css, theme);
  const via = resolve(tk, pr.via ?? '--panel');
  let bg = resolve(tk, pr.bg, via);
  if (pr.bgAlpha !== undefined) bg = composite([bg[0], bg[1], bg[2], pr.bgAlpha], via);
  let fg = resolve(tk, pr.fg, bg);
  if (pr.fgAlpha !== undefined) fg = composite([fg[0], fg[1], fg[2], pr.fgAlpha], bg);
  return contrast(fg, bg);
}

const cases = (list: Pair[]) => THEMES.flatMap((t) => list.filter((x) => !x.theme || x.theme === t).map((x) => [t, x] as const));

describe('contrast math', () => {
  it('matches WCAG reference values', () => {
    expect(contrast(parseColor('#000'), parseColor('#fff'))).toBeCloseTo(21, 5);
    expect(contrast(parseColor('#777'), parseColor('#fff'))).toBeCloseTo(4.48, 2);
    const c = composite([0, 0, 0, 0.5], [255, 255, 255, 1]);
    expect(c[0]).toBeCloseTo(127.5, 1);
    expect(c[3]).toBe(1);
  });
});

describe('theme tokens', () => {
  it('both themes define the same tokens', () => {
    const l = Object.keys(themeTokens(css, 'light')).sort();
    const d = Object.keys(themeTokens(css, 'dark')).sort();
    expect(l.length).toBeGreaterThan(20);
    expect(d).toEqual(l);
  });

  it('color-scheme per theme', () => {
    expect(themeBlock(css, 'light')).toMatch(/color-scheme:\s*light;/);
    expect(themeBlock(css, 'dark')).toMatch(/color-scheme:\s*dark;/);
  });

  it.each(cases(PAIRS))('%s: %o meets its minimum', (theme, pr) => {
    const r = ratio(theme, pr);
    expect(r, `${theme} ${pr.what}: ${r.toFixed(2)}`).toBeGreaterThanOrEqual(pr.min);
  });

  it.each(cases(EXCEPTIONS))('%s: documented exception %o is still below its minimum', (theme, pr) => {
    expect(ratio(theme, pr)).toBeLessThan(pr.min);
  });

  it('every token is measured or declared decorative', () => {
    const used = new Set([...PAIRS, ...EXCEPTIONS].flatMap((x) => [x.fg, x.bg, x.via ?? '--panel']).concat(DECORATIVE));
    const missing = Object.keys(themeTokens(css, 'light')).filter((k) => !used.has(k));
    expect(missing).toEqual([]);
  });

  it('no colour literals outside the token blocks', () => {
    let rest = css.replace(themeBlock(css, 'light'), '').replace(themeBlock(css, 'dark'), '');
    const fc = rest.indexOf('@media (forced-colors: active)');
    if (fc >= 0) rest = rest.slice(0, fc) + rest.slice(rest.indexOf('\n}', fc) + 2);
    expect(rest.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(rest.match(/(rgba?|hsla?)\(/g) ?? []).toEqual([]);
    expect(rest.match(/var\(--[a-z0-9-]+\s*,/g) ?? []).toEqual([]);
    const named = /(?:^|[\s;{])(?:color|background(?:-color)?|border(?:-[a-z]+)?-color|fill|stroke|outline-color)\s*:\s*(white|black|red|blue|green|gray|grey|orange)\b/gm;
    expect(rest.match(named) ?? []).toEqual([]);
  });
});
