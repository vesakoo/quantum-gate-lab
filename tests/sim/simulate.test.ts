import { describe, expect, it } from 'vitest';
import { emptyCircuit, type Circuit, type Op } from '../../src/model/circuit';
import { simulate } from '../../src/sim/simulate';
import type { GateId } from '../../src/sim/gates';

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
});
