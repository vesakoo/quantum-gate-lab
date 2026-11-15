import { describe, expect, it } from 'vitest';
import { emptyCircuit, type Circuit, type Op } from '../../src/model/circuit';
import { simulate } from '../../src/sim/simulate';
import { GATE_INFO, type GateId } from '../../src/sim/gates';
import { DensityMatrix } from '../../src/sim/density';
import { StateVector } from '../../src/sim/statevector';

let uid = 0;
const op = (gate: GateId, wires: number[], params: string[] = []): Op => ({
  id: `o${uid++}`, gate, wires, params,
});

describe('simulate', () => {
  it('reference circuit', () => {
    const c = emptyCircuit(4, 12);
    c.initial = [0, 0, 1, 0];
    c.steps[1].ops = [op('B', [1, 2])];
    c.steps[3].ops = [op('H', [1]), op('H', [2])];
    c.steps[4].ops = [op('X', [2])];
    c.steps[4].controls = [{ wire: 1, kind: 'on1' }];
    c.steps[5].ops = [op('H', [1]), op('H', [2])];
    c.steps[7].ops = [op('T', [2])];
    c.steps[7].controls = [{ wire: 1, kind: 'on1' }];
    c.steps[9].ops = [op('S', [2])];
    c.steps[9].controls = [{ wire: 1, kind: 'on0' }];
    c.steps[10].ops = [op('S', [2])];
    c.steps[10].controls = [{ wire: 1, kind: 'on1' }];
    const r = simulate(c);
    expect(r.bloch.length).toBe(13);
    expect(r.backend).toBe('statevector');
    r.probabilities.forEach((p, i) => expect(p).toBeCloseTo(i === 4 || i === 6 ? 0.5 : 0, 9));
    [0, 1, 0.5, 0].forEach((p, q) => expect(r.qubitP1[q]).toBeCloseTo(p, 9));
  });

  it('shared control applies to every op in the step', () => {
    for (const q0 of [0, 1] as const) {
      const c = emptyCircuit(3, 1);
      c.initial = [q0, 0, 0];
      c.steps[0] = { ops: [op('X', [1]), op('X', [2])], controls: [{ wire: 0, kind: 'on1' }] };
      const r = simulate(c);
      expect(r.qubitP1[1]).toBeCloseTo(q0, 9);
      expect(r.qubitP1[2]).toBeCloseTo(q0, 9);
    }
  });

  it('orphan controls do nothing', () => {
    const c = emptyCircuit(2, 1);
    c.initial = [1, 0];
    c.steps[0].controls = [{ wire: 0, kind: 'on1' }];
    expect(simulate(c).probabilities[2]).toBeCloseTo(1, 9);
  });

  it('barrier is a no-op and bad params are skipped', () => {
    const c = emptyCircuit(1, 2);
    c.steps[0].ops = [op('BARRIER', [0])];
    c.steps[1].ops = [op('RX', [0], ['oops'])];
    const r = simulate(c);
    expect(r.probabilities[0]).toBeCloseTo(1, 9);
    expect(r.qubitP1[0]).toBeCloseTo(0, 9);
  });

  it('chooses backend', () => {
    const c = emptyCircuit(1, 2);
    c.steps[0].ops = [op('H', [0])];
    expect(simulate(c).backend).toBe('statevector');
    c.steps[1].ops = [op('MEASURE', [0])];
    const r = simulate(c);
    expect(r.backend).toBe('density');
    expect(r.probabilities[0]).toBeCloseTo(0.5, 9);
  });

  it('is fast for 10 qubits x 20 steps', () => {
    const c: Circuit = emptyCircuit(10, 20);
    c.steps.forEach((s, k) => {
      if (k % 2 === 0) s.ops = Array.from({ length: 10 }, (_, q) => op('H', [q]));
      else {
        s.ops = [op('X', [9])];
        s.controls = [{ wire: 0, kind: 'on1' }];
      }
    });
    simulate(c);
    const t0 = performance.now();
    simulate(c);
    expect(performance.now() - t0).toBeLessThan(50);
  });
  it('density timing: 10 qubits x 20 H steps with MEASURE at the last step', () => {
    const c: Circuit = emptyCircuit(10, 20);
    c.steps.forEach((s, k) => {
      s.ops = Array.from({ length: 10 }, (_, q) => op(k === 19 && q === 0 ? 'MEASURE' : 'H', [q]));
    });
    expect(simulate(c).backend).toBe('density');
    const t0 = performance.now();
    simulate(c);
    expect(performance.now() - t0).toBeLessThan(300);
  });

  it('hybrid path matches the pure density backend', () => {
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const unitary = (Object.keys(GATE_INFO) as GateId[]).filter((g) => GATE_INFO[g].kind === 'unitary');
    const build = (measureAt: number[]): Circuit => {
      const n = 4;
      const c = emptyCircuit(n, 12);
      c.initial = [1, 0, 1, 0];
      c.steps.forEach((s, k) => {
        const free = [0, 1, 2, 3].sort(() => rnd() - 0.5);
        if (measureAt.includes(k)) {
          s.ops.push(op(k % 2 ? 'RESET' : 'MEASURE', [free.pop()!]));
          s.ops.push(op('MEASURE', [free.pop()!]));
        } else {
          const ctl = free.pop()!;
          s.controls = rnd() < 0.5 ? [{ wire: ctl, kind: rnd() < 0.5 ? 'on1' : 'on0' }] : [];
        }
        while (free.length) {
          const g = unitary[Math.floor(rnd() * unitary.length)];
          const ar = GATE_INFO[g].arity;
          if (ar > free.length) continue;
          const wires = Array.from({ length: ar }, () => free.pop()!);
          const params = g === 'U' ? ['0.3', '1.1', '-0.4'] : GATE_INFO[g].params.map(() => String(rnd() * 6));
          s.ops.push(op(g, wires, params));
        }
      });
      return c;
    };
    for (const measureAt of [[5], [11], [3, 11]]) {
      const c = build(measureAt);
      const h = simulate(c);
      const d = simulate(c, { hybrid: false });
      expect(h.backend).toBe('density');
      expect(d.backend).toBe('density');
      expect(h.bloch.length).toBe(d.bloch.length);
      h.probabilities.forEach((p, i) => expect(p).toBeCloseTo(d.probabilities[i], 9));
      h.bloch.forEach((row, s) =>
        row.forEach((b, q) => {
          expect(b.x).toBeCloseTo(d.bloch[s][q].x, 9);
          expect(b.y).toBeCloseTo(d.bloch[s][q].y, 9);
          expect(b.z).toBeCloseTo(d.bloch[s][q].z, 9);
        }),
      );
    }
  });

  it('DensityMatrix.fromStateVector equals |psi><psi|', () => {
    const sv = new StateVector(2, [0, 1]);
    const dm = new DensityMatrix(2, [0, 1]);
    const h = { dim: 2, data: new Float64Array([Math.SQRT1_2, 0, Math.SQRT1_2, 0, Math.SQRT1_2, 0, -Math.SQRT1_2, 0]) };
    const s = { dim: 2, data: new Float64Array([1, 0, 0, 0, 0, 0, 0, 1]) };
    for (const b of [sv, dm]) {
      b.applyGate(h, [0], []);
      b.applyGate(s, [0], []);
      b.applyGate(h, [1], [{ wire: 0, kind: 'on1' }]);
    }
    const conv = DensityMatrix.fromStateVector(sv);
    for (let q = 0; q < 2; q++) {
      const a = conv.bloch(q), b = dm.bloch(q);
      expect(a.x).toBeCloseTo(b.x, 12);
      expect(a.y).toBeCloseTo(b.y, 12);
      expect(a.z).toBeCloseTo(b.z, 12);
    }
    Array.from(conv.probabilities()).forEach((p, i) => expect(p).toBeCloseTo(dm.probabilities()[i], 12));
  });
});
