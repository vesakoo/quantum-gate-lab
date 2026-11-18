/** WCAG 2.x contrast helpers shared by the contrast tests (and mirrored in scripts/a11y-audit.mjs). */
export type RGBA = [number, number, number, number];

const NAMED: Record<string, RGBA> = { white: [255, 255, 255, 1], black: [0, 0, 0, 1], transparent: [0, 0, 0, 0] };

/** #rgb, #rrggbb, #rrggbbaa, rgb(), rgba(). */
export function parseColor(v: string): RGBA {
  const s = v.trim().toLowerCase();
  if (NAMED[s]) return NAMED[s];
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return [...m[1].split('').map((c) => parseInt(c + c, 16)), 1] as RGBA;
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s);
  if (m) {
    const h = m[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), m[2] ? parseInt(m[2], 16) / 255 : 1];
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), a];
  }
  throw new Error(`unparsed colour: ${v}`);
}

/** `fg` with its alpha painted over an opaque `bg`. */
export function composite(fg: RGBA, bg: RGBA): RGBA {
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
}

function luminance([r, g, b]: RGBA): number {
  const f = (c: number) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio of two opaque colours. */
export function contrast(a: RGBA, b: RGBA): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const BLOCK_START = { light: ':root {', dark: ":root[data-theme='dark'] {" } as const;

/** Raw block text of one theme's token block in styles.css. */
export function themeBlock(css: string, theme: 'light' | 'dark'): string {
  const start = css.indexOf(BLOCK_START[theme]);
  if (start < 0) return '';
  const end = css.indexOf('\n}', start);
  return css.slice(start, end + 2);
}

/** `--name: value` declarations of a theme block (light = `:root {`, dark = `:root[data-theme='dark'] {`). */
export function themeTokens(css: string, theme: 'light' | 'dark'): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/g;
  const block = themeBlock(css, theme);
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) out[m[1]] = m[2].trim();
  return out;
}
