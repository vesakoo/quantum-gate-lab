import { describe, it, expect } from 'vitest';
import { gateMatrix, type GateId } from '../../src/sim/gates';
import { blochFrom, type Backend, type Bloch, type Control } from '../../src/sim/backend';
import { StateVector } from '../../src/sim/statevector';
import { DensityMatrix } from '../../src/sim/density';

type Ctor = new (n: number, initial: (0 | 1)[]) => Backend;

const g = (id: GateId, params: number[] = []) => gateMatrix(id, params);
const on1 = (wire: number): Control => ({ wire, kind: 'on1' });
const on0 = (wire: number): Control => ({ wire, kind: 'on0' });

function expectBloch(b: Bloch, x: number, y: number, z: number) {
  expect(b.x).toBeCloseTo(x, 9);
  expect(b.y).toBeCloseTo(y, 9);
  expect(b.z).toBeCloseTo(z, 9);
}

function expectProbs(p: Float64Array, expected: number[]) {
  expect(p.length).toBe(expected.length);
  expected.forEach((e, i) => expect(p[i]).toBeCloseTo(e, 9));
}

/** Probability vector that is 1 at the basis state given as a bit string (q0 first). */
function basis(bits: string): number[] {
  const out = new Array(1 << bits.length).fill(0);
  out[parseInt(bits, 2)] = 1;
  return out;
}

const bitsOf = (s: string) => s.split('').map((c) => Number(c) as 0 | 1);

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe.each([
  ['StateVector', StateVector as Ctor],
  ['DensityMatrix', DensityMatrix as Ctor],
])('%s', (_name, B) => {
  it('|0> has bloch (0,0,1) and pure probs', () => {
    const s = new B(1, [0]);
    const b = s.bloch(0);
    expectBloch(b, 0, 0, 1);
    expect(b.probs.zero).toBeCloseTo(1, 9);
    expect(b.probs.plus).toBeCloseTo(0.5, 9);
    expect(b.mixed).toBe(false);
  });

  it('H -> (1,0,0)', () => {
    const s = new B(1, [0]);
    s.applyGate(g('H'), [0], []);
    expectBloch(s.bloch(0), 1, 0, 0);
    expect(s.bloch(0).mixed).toBe(false);
  });

  it('H,S -> (0,1,0) with plusI=1', () => {
    const s = new B(1, [0]);
    s.applyGate(g('H'), [0], []);
    s.applyGate(g('S'), [0], []);
    const b = s.bloch(0);
    expectBloch(b, 0, 1, 0);
    expect(b.probs.plusI).toBeCloseTo(1, 9);
    expect(b.mixed).toBe(false);
  });

  it('X -> (0,0,-1)', () => {
    const s = new B(1, [0]);
    s.applyGate(g('X'), [0], []);
    expectBloch(s.bloch(0), 0, 0, -1);
    expect(s.bloch(0).mixed).toBe(false);
  });

  it('B on [0,1] makes a Bell pair', () => {
    const s = new B(2, [0, 0]);
    s.applyGate(g('B'), [0, 1], []);
    expectProbs(s.probabilities(), [0.5, 0, 0, 0.5]);
    for (const q of [0, 1]) {
      expect(s.bloch(q).length).toBeCloseTo(0, 9);
      expect(s.bloch(q).mixed).toBe(true);
    }
  });

  it('B role: wires [2,0] vs [0,2] with q0=1', () => {
    const s = new B(3, [1, 0, 0]);
    s.applyGate(g('B'), [2, 0], []);
    const p = s.probabilities();
    expectProbs(p, [0, 0.5, 0, 0, 0.5, 0, 0, 0]);

    const t = new B(3, [1, 0, 0]);
    t.applyGate(g('B'), [0, 2], []);
    expectProbs(t.probabilities(), [0.5, 0, 0, 0, 0, 0.5, 0, 0]);
  });

  it('controlled X (on1)', () => {
    const a = new B(2, [1, 0]);
    a.applyGate(g('X'), [1], [on1(0)]);
    expectProbs(a.probabilities(), basis('11'));
    const b = new B(2, [0, 0]);
    b.applyGate(g('X'), [1], [on1(0)]);
    expectProbs(b.probabilities(), basis('00'));
  });

  it('anti-controlled X (on0)', () => {
    const a = new B(2, [0, 0]);
    a.applyGate(g('X'), [1], [on0(0)]);
    expectProbs(a.probabilities(), basis('01'));
    const b = new B(2, [1, 0]);
    b.applyGate(g('X'), [1], [on0(0)]);
    expectProbs(b.probabilities(), basis('10'));
  });

  it('CCX and CCCX', () => {
    const a = new B(3, bitsOf('110'));
    a.applyGate(g('X'), [2], [on1(0), on1(1)]);
    expectProbs(a.probabilities(), basis('111'));
    const b = new B(3, bitsOf('100'));
    b.applyGate(g('X'), [2], [on1(0), on1(1)]);
    expectProbs(b.probabilities(), basis('100'));
    const c = new B(4, bitsOf('1110'));
    c.applyGate(g('X'), [3], [on1(0), on1(1), on1(2)]);
    expectProbs(c.probabilities(), basis('1111'));
  });

  it('mixed controls on S', () => {
    const a = new B(3, [1, 0, 0]);
    a.applyGate(g('H'), [2], []);
    a.applyGate(g('S'), [2], [on1(0), on0(1)]);
    expectBloch(a.bloch(2), 0, 1, 0);

    const b = new B(3, [1, 1, 0]);
    b.applyGate(g('H'), [2], []);
    b.applyGate(g('S'), [2], [on1(0), on0(1)]);
    expectBloch(b.bloch(2), 1, 0, 0);
  });

  it('SWAP [0,2] and Fredkin', () => {
    const a = new B(3, bitsOf('100'));
    a.applyGate(g('SWAP'), [0, 2], []);
    expectProbs(a.probabilities(), basis('001'));
    const f = new B(3, bitsOf('110'));
    f.applyGate(g('SWAP'), [1, 2], [on1(0)]);
    expectProbs(f.probabilities(), basis('101'));
    const h = new B(3, bitsOf('010'));
    h.applyGate(g('SWAP'), [1, 2], [on1(0)]);
    expectProbs(h.probabilities(), basis('010'));
  });
});

describe('StateVector vs DensityMatrix', () => {
  it('agree on a random seeded circuit', () => {
    const rand = mulberry32(12345);
    const n = 4;
    const ri = (k: number) => Math.floor(rand() * k);
    const oneQ: GateId[] = ['H', 'X', 'Y', 'S', 'T', 'SX', 'RX', 'RY', 'RZ', 'U'];
    const twoQ: GateId[] = ['SWAP', 'ISWAP', 'SQSWAP', 'B'];
    const sv = new StateVector(n, [0, 1, 0, 0]);
    const dm = new DensityMatrix(n, [0, 1, 0, 0]);
    for (let step = 0; step < 10; step++) {
      const wires = [0, 1, 2, 3].sort(() => rand() - 0.5);
      const two = rand() < 0.4;
      const id = two ? twoQ[ri(twoQ.length)] : oneQ[ri(oneQ.length)];
      const params = ['RX', 'RY', 'RZ'].includes(id)
        ? [rand() * 6]
        : id === 'U'
          ? [rand() * 6, rand() * 6, rand() * 6]
          : [];
      const k = two ? 2 : 1;
      const targets = wires.slice(0, k);
      const nc = ri(n - k + 1);
      const controls: Control[] = wires
        .slice(k, k + nc)
        .map((w) => ({ wire: w, kind: rand() < 0.5 ? 'on1' : 'on0' }));
      const m = gateMatrix(id, params);
      sv.applyGate(m, targets, controls);
      dm.applyGate(m, targets, controls);
    }
    const ps = sv.probabilities();
    const pd = dm.probabilities();
    for (let i = 0; i < ps.length; i++) expect(Math.abs(ps[i] - pd[i])).toBeLessThan(1e-9);
    for (let q = 0; q < n; q++) {
      const a = sv.bloch(q);
      const b = dm.bloch(q);
      expect(Math.abs(a.x - b.x)).toBeLessThan(1e-9);
      expect(Math.abs(a.y - b.y)).toBeLessThan(1e-9);
      expect(Math.abs(a.z - b.z)).toBeLessThan(1e-9);
    }
  });
});

describe('StateVector', () => {
  it('measure and reset throw', () => {
    const s = new StateVector(1, [0]);
    expect(() => s.measure(0)).toThrow('use DensityMatrix');
    expect(() => s.reset(0)).toThrow('use DensityMatrix');
  });
});

describe('DensityMatrix only', () => {
  it('H, measure -> mixed; then H -> [0.5,0.5]', () => {
    const d = new DensityMatrix(1, [0]);
    d.applyGate(g('H'), [0], []);
    d.measure(0);
    const b = d.bloch(0);
    expectBloch(b, 0, 0, 0);
    expect(b.mixed).toBe(true);
    d.applyGate(g('H'), [0], []);
    expectProbs(d.probabilities(), [0.5, 0.5]);
  });

  it('measure(0) on a Bell pair leaves probs unchanged', () => {
    const d = new DensityMatrix(2, [0, 0]);
    d.applyGate(g('B'), [0, 1], []);
    d.measure(0);
    expectProbs(d.probabilities(), [0.5, 0, 0, 0.5]);
  });

  it('X, reset -> |0>', () => {
    const d = new DensityMatrix(1, [0]);
    d.applyGate(g('X'), [0], []);
    d.reset(0);
    expectBloch(d.bloch(0), 0, 0, 1);
  });

  it('reset(0) on a Bell pair', () => {
    const d = new DensityMatrix(2, [0, 0]);
    d.applyGate(g('B'), [0, 1], []);
    d.reset(0);
    expectBloch(d.bloch(0), 0, 0, 1);
    expectBloch(d.bloch(1), 0, 0, 0);
  });
});

describe('blochFrom', () => {
  it('snaps tiny values to +0', () => {
    const b = blochFrom(-1e-17, 0, 1);
    expect(b.x).toBe(0);
    expect(Object.is(b.x, -0)).toBe(false);
  });

  it('treats near-unit length as pure', () => {
    expect(blochFrom(0, 0, 0.9999999999).mixed).toBe(false);
  });

  it('clamps components and computes probs', () => {
    const b = blochFrom(1.0000001, 0, 0);
    expect(b.x).toBe(1);
    expect(b.probs.plus).toBe(1);
    expect(b.probs.minus).toBe(0);
    expect(b.probs.zero).toBe(0.5);
  });
});
