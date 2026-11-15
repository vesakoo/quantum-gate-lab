import { describe, it, expect } from 'vitest';
import { GATE_INFO, gateMatrix, type GateId } from '../../src/sim/gates';
import { approxEqual, dagger, isUnitary, mat, matMul } from '../../src/sim/complex';

const g = (id: GateId, p: number[] = []) => gateMatrix(id, p);
const ids = Object.keys(GATE_INFO) as GateId[];
const sample = (id: GateId) => (id === 'U' ? [0.3, 1.1, -0.4] : GATE_INFO[id].params.length ? [0.7] : []);

type Cx = [number, number];
const re = (x: number): Cx => [x, 0];
const im = (x: number): Cx => [0, x];
const ex = (a: number): Cx => [Math.cos(a), Math.sin(a)]; // e^{ia}
const sc = (k: number, [x, y]: Cx): Cx => [k * x, k * y];
const _0 = re(0);
const _1 = re(1);
const r = Math.SQRT1_2;
const th = 0.7; // sample angle for RX/RY/RZ/P
const [ut, up, ul] = [0.3, 1.1, -0.4]; // sample U(θ, φ, λ)

/** Expected matrices (row-major; for 2-qubit gates local index = 2·b(wires[0]) + b(wires[1])). */
const EXPECTED: Record<string, { params: number[]; rows: Cx[][] }> = {
  I: { params: [], rows: [[_1, _0], [_0, _1]] },
  X: { params: [], rows: [[_0, _1], [_1, _0]] },
  Y: { params: [], rows: [[_0, im(-1)], [im(1), _0]] },
  Z: { params: [], rows: [[_1, _0], [_0, re(-1)]] },
  H: { params: [], rows: [[re(r), re(r)], [re(r), re(-r)]] },
  S: { params: [], rows: [[_1, _0], [_0, im(1)]] },
  Sdg: { params: [], rows: [[_1, _0], [_0, im(-1)]] },
  T: { params: [], rows: [[_1, _0], [_0, [r, r]]] },
  Tdg: { params: [], rows: [[_1, _0], [_0, [r, -r]]] },
  SX: { params: [], rows: [[[0.5, 0.5], [0.5, -0.5]], [[0.5, -0.5], [0.5, 0.5]]] },
  SXdg: { params: [], rows: [[[0.5, -0.5], [0.5, 0.5]], [[0.5, 0.5], [0.5, -0.5]]] },
  RX: { params: [th], rows: [[re(Math.cos(th / 2)), im(-Math.sin(th / 2))], [im(-Math.sin(th / 2)), re(Math.cos(th / 2))]] },
  RY: { params: [th], rows: [[re(Math.cos(th / 2)), re(-Math.sin(th / 2))], [re(Math.sin(th / 2)), re(Math.cos(th / 2))]] },
  RZ: { params: [th], rows: [[ex(-th / 2), _0], [_0, ex(th / 2)]] },
  P: { params: [th], rows: [[_1, _0], [_0, ex(th)]] },
  U: {
    params: [ut, up, ul],
    rows: [
      [re(Math.cos(ut / 2)), sc(-Math.sin(ut / 2), ex(ul))],
      [sc(Math.sin(ut / 2), ex(up)), sc(Math.cos(ut / 2), ex(up + ul))],
    ],
  },
  SWAP: { params: [], rows: [[_1, _0, _0, _0], [_0, _0, _1, _0], [_0, _1, _0, _0], [_0, _0, _0, _1]] },
  ISWAP: { params: [], rows: [[_1, _0, _0, _0], [_0, _0, im(1), _0], [_0, im(1), _0, _0], [_0, _0, _0, _1]] },
  SQSWAP: {
    params: [],
    rows: [[_1, _0, _0, _0], [_0, [0.5, 0.5], [0.5, -0.5], _0], [_0, [0.5, -0.5], [0.5, 0.5], _0], [_0, _0, _0, _1]],
  },
  // CNOT(wires[0] → wires[1]) · (H on wires[0])
  B: {
    params: [],
    rows: [
      [re(r), _0, re(r), _0],
      [_0, re(r), _0, re(r)],
      [_0, re(r), _0, re(-r)],
      [re(r), _0, re(-r), _0],
    ],
  },
};

describe('explicit gate matrices', () => {
  it('covers every unitary gate', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(ids.filter((i) => GATE_INFO[i].kind === 'unitary').sort());
  });
  it.each(Object.entries(EXPECTED))('%s matches its matrix', (id, { params, rows }) => {
    const m = g(id as GateId, params);
    expect(approxEqual(m, mat(rows)), id).toBe(true);
  });
});

describe('gate library', () => {
  it('every unitary gate is unitary', () => {
    for (const id of ids.filter((i) => GATE_INFO[i].kind === 'unitary')) {
      const m = g(id, sample(id));
      expect(m.dim).toBe(1 << GATE_INFO[id].arity);
      expect(isUnitary(m), id).toBe(true);
    }
  });
  it('algebraic identities', () => {
    expect(approxEqual(matMul(g('T'), g('T')), g('S'))).toBe(true);
    expect(approxEqual(matMul(g('S'), g('S')), g('Z'))).toBe(true);
    expect(approxEqual(matMul(g('SX'), g('SX')), g('X'))).toBe(true);
    expect(approxEqual(matMul(g('H'), g('H')), g('I'))).toBe(true);
    expect(approxEqual(g('Sdg'), dagger(g('S')))).toBe(true);
    expect(approxEqual(g('Tdg'), dagger(g('T')))).toBe(true);
    expect(approxEqual(g('SXdg'), dagger(g('SX')))).toBe(true);
    expect(approxEqual(matMul(g('SQSWAP'), g('SQSWAP')), g('SWAP'))).toBe(true);
  });
  it('parametrised equivalences', () => {
    expect(approxEqual(g('U', [Math.PI, 0, Math.PI]), g('X'))).toBe(true);
    expect(approxEqual(g('U', [Math.PI / 2, 0, Math.PI]), g('H'))).toBe(true);
    expect(approxEqual(g('P', [Math.PI / 2]), g('S'))).toBe(true);
    expect(approxEqual(g('RX', [Math.PI]), mat([[[0, 0], [0, -1]], [[0, -1], [0, 0]]]))).toBe(true);
  });
  it('B makes a Bell state from |00>', () => {
    const b = g('B');
    const r = Math.SQRT1_2;
    const col = [0, 1, 2, 3].map((row) => [b.data[2 * (row * 4)], b.data[2 * (row * 4) + 1]]);
    expect(col[0][0]).toBeCloseTo(r);
    expect(col[1][0]).toBeCloseTo(0);
    expect(col[2][0]).toBeCloseTo(0);
    expect(col[3][0]).toBeCloseTo(r);
    col.forEach((c) => expect(c[1]).toBeCloseTo(0));
  });
  it('ISWAP maps |01> to i|10>', () => {
    const m = g('ISWAP');
    // column 1 (|01>): row 2 should be i
    expect(m.data[2 * (2 * 4 + 1)]).toBeCloseTo(0);
    expect(m.data[2 * (2 * 4 + 1) + 1]).toBeCloseTo(1);
  });
  it('non-unitary kinds throw', () => {
    expect(() => gateMatrix('MEASURE', [])).toThrow();
  });
  it('GATE_INFO metadata', () => {
    expect(GATE_INFO.Sdg.label).toBe('S†');
    expect(GATE_INFO.U.params).toEqual(['θ', 'φ', 'λ']);
    expect(ids.filter((i) => GATE_INFO[i].quick).sort()).toEqual(['B', 'H', 'S', 'SWAP', 'SX', 'T', 'X', 'Y', 'Z']);
  });
});
