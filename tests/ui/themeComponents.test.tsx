import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import css from '../../src/ui/styles.css?raw';
import BlochStrip from '../../src/ui/BlochStrip';
import KetView from '../../src/ui/KetView';
import OutColumn from '../../src/ui/OutColumn';
import ProbabilityChart from '../../src/ui/ProbabilityChart';
import { themeTokens } from './contrastMath';

afterEach(cleanup);

const sources = import.meta.glob('../../src/ui/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** All CSS rules as [selector, body]. */
function rules(): [string, string][] {
  const out: [string, string][] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) out.push([m[1].trim(), m[2]]);
  return out;
}

const px = (v: string | undefined) => (v === undefined ? NaN : parseFloat(v));

describe('component colours come from tokens', () => {
  it('no colour literals in components', () => {
    const bad: string[] = [];
    for (const [file, src] of Object.entries(sources)) {
      // TEMPORARY until Task 4 of the dark-theme plan moves the 3D colours to tokens; Task 4 deletes this line
      if (file.endsWith('/blochScene.ts')) continue;
      for (const re of [/#[0-9a-fA-F]{3,8}\b/g, /\brgba?\(/g, /\bhsla?\(/g, /0x[0-9a-fA-F]{6}\b/g, /(?:fill|stroke|color)=["'](?:white|black|red|blue|green|gray|grey)["']/g]) {
        for (const hit of src.match(re) ?? []) bad.push(`${file}: ${hit}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('chart marks are classed and their classes use measured tokens', () => {
    const { container } = render(<ProbabilityChart probabilities={[0.5, 0, 0, 0.5]} numQubits={2} />);
    const marks = container.querySelectorAll('svg text, svg line, svg rect');
    expect(marks.length).toBeGreaterThan(0);
    const tokens = themeTokens(css, 'light');
    for (const el of Array.from(marks)) {
      const cls = el.getAttribute('class');
      expect(cls, el.outerHTML).toBeTruthy();
      expect(el.getAttribute('fill'), el.outerHTML).toBeNull();
      expect(el.getAttribute('stroke'), el.outerHTML).toBeNull();
      const rule = rules().find(([sel]) => sel.split(',').some((s) => s.trim().endsWith(`.${cls!.split(' ')[0]}`)));
      expect(rule, `rule for .${cls}`).toBeTruthy();
      const v = /(?:fill|stroke)\s*:\s*var\((--[a-z0-9-]+)\)/.exec(rule![1]);
      expect(v, `.${cls} sets fill/stroke from a token`).toBeTruthy();
      expect(tokens[v![1]], v![1]).toBeTruthy();
    }
  });
});

describe('non-colour state cues', () => {
  it('out box names its probability', () => {
    render(<OutColumn numQubits={1} qubitP1={[0.6]} />);
    expect(screen.getByRole('img', { name: 'q[0] output: 1, P(1) = 60.0 %' })).toBeTruthy();
    cleanup();
    render(<OutColumn numQubits={1} qubitP1={null} />);
    expect(screen.getByRole('img', { name: 'q[0] output: computing' })).toBeTruthy();
  });

  it('stale panels keep full content and show Updating', () => {
    const one = [[{ x: 0, y: 0, z: 1, r: 1, probs: { zero: 1, one: 0, plus: 0.5, minus: 0.5, plusI: 0.5, minusI: 0.5 } }]];
    const views = [
      <KetView key="k" amplitudes={[1, 0, 0, 0]} purity={1} numQubits={1} stale />,
      <ProbabilityChart key="p" probabilities={[1, 0]} numQubits={1} stale />,
      <BlochStrip key="b" bloch={one as never} numQubits={1} numSteps={0} inW={40} outW={40} selected={null} onSelect={() => {}} stale />,
    ];
    for (const v of views) {
      const { container, unmount } = render(v);
      const badge = container.querySelector('.updating-badge');
      expect(badge?.textContent).toBe('Updating…');
      expect(badge?.getAttribute('aria-hidden')).toBe('true');
      expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
      unmount();
    }
    const { container } = render(<KetView amplitudes={[1, 0, 0, 0]} purity={1} numQubits={1} />);
    expect(container.querySelector('.updating-badge')).toBeNull();
  });

  it('styles have no opacity states', () => {
    const bad = rules().filter(([sel, body]) => /\.stale|\.orphan|\.dragging|thead/.test(sel) && /(^|[\s;])opacity\s*:/.test(body));
    expect(bad.map(([s]) => s)).toEqual([]);
  });

  it('invalid gate has a non-colour badge', () => {
    const r = rules().find(([sel]) => sel.includes('.gate.invalid::after'));
    expect(r?.[1]).toMatch(/content:\s*'!'/);
  });

  it('orphan control keeps its fill and gets a dashed ring', () => {
    const r = rules().find(([sel]) => sel.includes('.ctl-ball.orphan'));
    expect(r?.[1]).toMatch(/outline:\s*2px dashed var\(--muted\)/);
    expect(r?.[1]).toMatch(/outline-offset:\s*2px/);
    expect(r?.[1]).not.toMatch(/background/);
  });

  it('ring rules', () => {
    const bad: string[] = [];
    for (const [sel, body] of rules()) {
      if (!/:focus|\.selected|\.selection/.test(sel) || !/outline|box-shadow/.test(body)) continue;
      if (/box-shadow/.test(body)) bad.push(`${sel}: box-shadow`);
      if (/outline\s*:\s*(none|0)\b/.test(body)) bad.push(`${sel}: outline none`);
      const w = /outline\s*:\s*([\d.]+)px/.exec(body);
      if (w && px(w[1]) < 2) bad.push(`${sel}: width ${w[1]}`);
      const off = /outline-offset\s*:\s*([\d.]+)px/.exec(body);
      const want = /:focus/.test(sel) ? 5 : 2;
      if (/outline\s*:/.test(body) && (!off || px(off[1]) !== want)) bad.push(`${sel}: offset ${off?.[1]} (want ${want})`);
    }
    expect(bad).toEqual([]);
    expect(rules().some(([sel, body]) => sel === ':focus-visible' && /outline:\s*2px solid var\(--focus\)/.test(body))).toBe(true);
  });

  it('buttons use the button tokens', () => {
    const r = rules().find(([sel]) => sel === 'button');
    expect(r?.[1]).toMatch(/background:\s*var\(--button-bg\)/);
    expect(r?.[1]).toMatch(/color:\s*var\(--button-text\)/);
    expect(r?.[1]).toMatch(/border:\s*1px solid var\(--button-border\)/);
  });
});
