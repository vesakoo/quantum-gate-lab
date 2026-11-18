import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GATE_INFO, gateMatrix, type GateId } from '../../src/sim/gates';
import { GATE_DOCS, type DocKey } from '../../src/ui/gateDocs';
import MatrixView from '../../src/ui/MatrixView';

afterEach(cleanup);

const GATES = Object.keys(GATE_INFO) as GateId[];
const KEYS: DocKey[] = [...GATES, 'ctl:on1', 'ctl:on0'];

type C = [number, number];
const S2 = Math.SQRT1_2;

/** Test-local evaluator for the entry grammar of fixed gates. */
function evalEntry(s: string): C {
  const half = /^\((.*)\)\/2$/.exec(s.replace(/\s+/g, ''));
  if (half) {
    const [re, im] = evalEntry(half[1]);
    return [re / 2, im / 2];
  }
  let t = s.replace(/\s+/g, '');
  let sign = 1;
  if (t.startsWith('−')) {
    sign = -1;
    t = t.slice(1);
  }
  let v: C;
  const ph = /^e\^\{(−?)iπ\/4\}$/.exec(t);
  if (ph) {
    const a = (ph[1] ? -1 : 1) * (Math.PI / 4);
    v = [Math.cos(a), Math.sin(a)];
  } else if (t === 'i') v = [0, 1];
  else if (/^\d+$/.test(t)) v = [Number(t), 0];
  else {
    const m = /^(\d+)([+−])(\d*)i$/.exec(t);
    if (!m) throw new Error(`unparsed entry ${s}`);
    v = [Number(m[1]), (m[2] === '−' ? -1 : 1) * (m[3] === '' ? 1 : Number(m[3]))];
  }
  return [sign * v[0], sign * v[1]];
}

const scalarValue = (s?: string) => (s === undefined ? 1 : s === '1/√2' ? S2 : s === '½' ? 0.5 : NaN);

describe('GATE_DOCS', () => {
  it('every gate and control has a doc', () => {
    for (const k of KEYS) {
      const d = GATE_DOCS[k];
      expect(d, k).toBeTruthy();
      expect(d.name.length, k).toBeGreaterThan(0);
      expect(d.description.length, k).toBeGreaterThan(0);
      expect(d.description.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length, k).toBeLessThanOrEqual(2);
    }
  });

  it('unitaries have matrices of the right size', () => {
    for (const g of GATES) {
      const info = GATE_INFO[g];
      const m = GATE_DOCS[g].matrix;
      if (info.kind !== 'unitary') {
        expect(m, g).toBeUndefined();
        continue;
      }
      expect(m, g).toBeTruthy();
      const n = 2 ** info.arity;
      expect(m!.rows.length, g).toBe(n);
      for (const r of m!.rows) expect(r.length, g).toBe(n);
    }
    expect(GATE_DOCS['ctl:on1'].matrix).toBeUndefined();
    expect(GATE_DOCS['ctl:on0'].matrix).toBeUndefined();
  });

  it('fixed matrices agree with gateMatrix', () => {
    for (const g of GATES) {
      const info = GATE_INFO[g];
      if (info.kind !== 'unitary' || info.params.length) continue;
      const doc = GATE_DOCS[g].matrix!;
      const k = scalarValue(doc.scalar);
      const ref = gateMatrix(g);
      const n = doc.rows.length;
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++) {
          const [re, im] = evalEntry(doc.rows[r][c]);
          const idx = 2 * (r * n + c);
          expect(k * re, `${g}[${r}][${c}] re`).toBeCloseTo(ref.data[idx], 9);
          expect(k * im, `${g}[${r}][${c}] im`).toBeCloseTo(ref.data[idx + 1], 9);
        }
    }
  });

  it('two-qubit gates label their rows', () => {
    for (const g of GATES)
      if (GATE_INFO[g].kind === 'unitary' && GATE_INFO[g].arity === 2)
        expect(GATE_DOCS[g].matrix!.rowLabels).toEqual(['|00⟩', '|01⟩', '|10⟩', '|11⟩']);
  });
});

describe('MatrixView', () => {
  it('renders scalar, label and cells', () => {
    render(<MatrixView m={GATE_DOCS.H.matrix!} label="H =" />);
    expect(screen.getByText('H =')).toBeTruthy();
    expect(screen.getByText('1/√2')).toBeTruthy();
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getAllByRole('cell')).toHaveLength(4);
  });
});
