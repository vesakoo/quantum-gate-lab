import { describe, expect, it } from 'vitest';
import css from '../../src/ui/styles.css?raw';

/** CSS rules as [selector, body], top level and inside @media blocks. */
function rules(): [string, string][] {
  const out: [string, string][] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) out.push([m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/^@media[^{]*\{\s*/, ''), m[2]]);
  return out;
}
const rule = (sel: string) => rules().find(([s]) => s.split(',').map((x) => x.trim()).includes(sel))?.[1] ?? '';
const forced = () => css.slice(css.indexOf('@media (forced-colors: active)'));

/** Specificity [ids, classes+attrs+pseudo-classes, elements] of a simple selector list item. */
function spec(sel: string): [number, number, number] {
  const s = sel.replace(/:not\(([^)]*)\)/g, ' $1');
  const ids = (s.match(/#[\w-]+/g) ?? []).length;
  const cls = (s.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) ?? []).length;
  const el = (s.match(/(^|[\s>+~])[a-z][\w-]*/g) ?? []).length + (s.match(/::[\w-]+/g) ?? []).length;
  return [ids, cls, el];
}
const beats = (a: string, b: string) => {
  const [x, y] = [spec(a), spec(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return css.lastIndexOf(a) > css.lastIndexOf(b);
};

describe('final review findings', () => {
  it('C1: the B target-end ring is drawn in a token measured on the gate fill', () => {
    expect(rule('.b-grip::before')).toMatch(/border:\s*2px solid var\(--wire\)/);
  });

  it('I1: disabled buttons look disabled without opacity', () => {
    const r = rule('button:disabled');
    expect(r).toMatch(/border-style:\s*dashed/);
    expect(r).toMatch(/color:\s*var\(--muted\)/);
    expect(r).toMatch(/cursor:\s*not-allowed/);
    expect(r).not.toMatch(/opacity/);
  });

  it('I3: the Out digit uses its own token', () => {
    expect(rule('.out-digit')).toMatch(/color:\s*var\(--out-digit\)/);
  });

  it('I3: the init box hover background wins over the generic button hover', () => {
    const sel = rules().find(([s, b]) => /init-box:hover/.test(s) && /var\(--hover-bg\)/.test(b))?.[0];
    expect(sel).toBeTruthy();
    expect(beats(sel!, 'button:hover:not(:disabled)')).toBe(true);
  });

  it('I3: mini Blochs keep a transparent background on hover', () => {
    const sel = rules().find(([s, b]) => /mini-bloch:hover/.test(s) && /background:\s*transparent/.test(b))?.[0];
    expect(sel).toBeTruthy();
    expect(beats(sel!, 'button:hover:not(:disabled)')).toBe(true);
  });

  it('I4: the angle input uses tokens, not browser defaults', () => {
    const r = rule('.angle-field input');
    expect(r).toMatch(/background:\s*var\(--panel\)/);
    expect(r).toMatch(/color:\s*var\(--text\)/);
    expect(r).toMatch(/border:\s*1px solid var\(--border\)/);
  });

  it('M1 (re-graded): forced colours recolour the selected and orphan control rings', () => {
    expect(forced()).toMatch(/\.step-column \.ctl-ball\.selected[^{]*\{[^}]*outline-color:\s*Highlight/);
    expect(forced()).toMatch(/\.step-column \.ctl-ball\.orphan[^{]*\{[^}]*outline-color:\s*CanvasText/);
  });
});
