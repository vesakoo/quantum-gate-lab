import { describe, expect, it } from 'vitest';
import { emptyCircuit, type Control, type Op } from '../../src/model/circuit';
import { circuitMatrices, stepMatrix } from '../../src/model/matrices';
import type { Mat } from '../../src/sim/complex';
import type { GateId } from '../../src/sim/gates';
import { simulate } from '../../src/sim/simulate';

let uid = 0;
const op = (gate: GateId, wires: number[], params: string[] = []): Op => ({ id: `m${uid++}`, gate, wires, params });
const on1 = (wire: number): Control => ({ wire, kind: 'on1' });

function circ(n: number, steps: [Op[], Control[]?][], initial?: (0 | 1)[]) {
  const c = emptyCircuit(n, steps.length);
  steps.forEach(([ops, controls = []], s) => (c.steps[s] = { ops, controls }));
  if (initial) c.initial = initial;
  return c;
}

const round = (v: number) => Math.round(v * 1e9) / 1e9 + 0;
/** Real rows (fails if any entry has an imaginary part). */
function real(m: Mat): number[][] {
  const rows: number[][] = [];
  for (let r = 0; r < m.dim; r++) {
    const row: number[] = [];
    for (let c = 0; c < m.dim; c++) {
      const i = 2 * (r * m.dim + c);
      expect(Math.abs(m.data[i + 1])).toBeLessThan(1e-12);
      row.push(round(m.data[i]));
    }
    rows.push(row);
  }
  return rows;
}

function mul(a: Mat, b: Mat): Mat {
  const d = a.dim;
  const out = new Float64Array(2 * d * d);
  for (let r = 0; r < d; r++)
    for (let c = 0; c < d; c++)
      for (let k = 0; k < d; k++) {
        const ar = a.data[2 * (r * d + k)], ai = a.data[2 * (r * d + k) + 1];
        const br = b.data[2 * (k * d + c)], bi = b.data[2 * (k * d + c) + 1];
        out[2 * (r * d + c)] += ar * br - ai * bi;
        out[2 * (r * d + c) + 1] += ar * bi + ai * br;
      }
  return { dim: d, data: out };
}

const close = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(1e-12);
};

const r = Math.SQRT1_2;
const identity = (d: number) => Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => (i === j ? 1 : 0)));

describe('circuitMatrices', () => {
  it('CX control q[1] → target q[0] is the screenshot matrix', () => {
    expect(real(stepMatrix(2, { ops: [op('X', [0])], controls: [on1(1)] }))).toEqual([
      [1, 0, 0, 0],
      [0, 0, 0, 1],
      [0, 0, 1, 0],
      [0, 1, 0, 0],
    ]);
  });

  it('H on q[0] of 2 qubits is H ⊗ I', () => {
    const h = round(r);
    expect(real(stepMatrix(2, { ops: [op('H', [0])], controls: [] }))).toEqual([
      [h, 0, h, 0],
      [0, h, 0, h],
      [h, 0, -h, 0],
      [0, h, 0, -h],
    ]);
  });

  it('product is last step on the left', () => {
    const m = circuitMatrices(circ(2, [[[op('H', [0])]], [[op('X', [1])], [on1(0)]]]))!;
    expect(m.factors).toHaveLength(2);
    close(m.product.data, mul(m.factors[1].m, m.factors[0].m).data);
    close(m.output, [r, 0, 0, 0, 0, 0, r, 0]);
  });

  it('output matches simulate', () => {
    const cases = [
      circ(3, [[[op('H', [2])]], [[op('X', [0])], [on1(2)]], [[op('SWAP', [2, 0])]]]),
      circ(2, [[[op('B', [1, 0])]]], [0, 1]),
      circ(2, [[[op('H', [0])]], [[op('RY', [1], ['pi/3'])], [{ wire: 0, kind: 'on0' }]]]),
    ];
    for (const c of cases) close(circuitMatrices(c)!.output, simulate(c).amplitudes!);
  });

  it('empty and barrier-only steps are skipped', () => {
    const m = circuitMatrices(circ(1, [[[]], [[op('H', [0])]], [[op('BARRIER', [0])]], [[op('X', [0])]]]))!;
    expect(m.factors.map((f) => f.step)).toEqual([1, 3]);
    const e = circuitMatrices(circ(2, []))!;
    expect(e.factors).toEqual([]);
    expect(real(e.product)).toEqual(identity(4));
    close(e.output, e.input);
  });

  it('measure stops before its step', () => {
    const m = circuitMatrices(circ(2, [[[op('H', [0])]], [[op('MEASURE', [0]), op('H', [1])]], [[op('X', [1])]]]))!;
    expect(m.factors).toHaveLength(1);
    expect(m.stoppedAt).toEqual({ step: 1, kind: 'measure' });
  });

  it('invalid angle acts as I and is flagged', () => {
    const m = circuitMatrices(circ(1, [[[op('RX', [0], ['abc'])]]]))!;
    expect(real(m.factors[0].m)).toEqual(identity(2));
    expect(m.invalidAngles).toBe(true);
  });

  it('4 qubits works, 5 gives null', () => {
    expect(circuitMatrices(circ(4, [[[op('H', [3])]]]))!.product.dim).toBe(16);
    expect(circuitMatrices(circ(5, [[[op('H', [0])]]]))).toBeNull();
  });
});
