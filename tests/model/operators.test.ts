import { describe, expect, it } from 'vitest';
import { emptyCircuit, type Control, type Op } from '../../src/model/circuit';
import { circuitOperators, type Slot } from '../../src/model/operators';
import type { GateId } from '../../src/sim/gates';

let uid = 0;
const op = (gate: GateId, wires: number[], params: string[] = []): Op => ({ id: `o${uid++}`, gate, wires, params });
const on1 = (wire: number): Control => ({ wire, kind: 'on1' });
const on0 = (wire: number): Control => ({ wire, kind: 'on0' });

/** Circuit with one [ops, controls] pair per step. */
function circ(n: number, steps: [Op[], Control[]?][]) {
  const c = emptyCircuit(n, steps.length);
  steps.forEach(([ops, controls = []], s) => (c.steps[s] = { ops, controls }));
  return c;
}

/** Compact slot description: 'I', 'p0', 'p1', or the gate id; wires as listed. */
const short = (s: Slot): string =>
  s.op.kind === 'I' ? 'I' : s.op.kind === 'proj' ? `p${s.op.bit}` : s.op.gate;
const terms = (t: Slot[][]) => t.map((term) => term.map(short));
const wires = (t: Slot[][]) => t.map((term) => term.map((s) => s.wires));

describe('circuitOperators', () => {
  it('bell', () => {
    const r = circuitOperators(circ(2, [[[op('H', [0])]], [[op('X', [1])], [on1(0)]]]));
    expect(r.factors).toHaveLength(2);
    expect(terms(r.factors[0].terms)).toEqual([['H', 'I']]);
    expect(terms(r.factors[1].terms)).toEqual([['p0', 'I'], ['p1', 'X']]);
    expect(r.factors.map((f) => f.indexed)).toEqual([false, false]);
    expect(r.factors.map((f) => f.step)).toEqual([0, 1]);
    expect(r.stoppedAt).toBeNull();
  });

  it('toffoli', () => {
    const r = circuitOperators(circ(3, [[[op('X', [2])], [on1(1), on1(0)]]]));
    expect(terms(r.factors[0].terms)).toEqual([
      ['p0', 'I', 'I'],
      ['p1', 'p0', 'I'],
      ['p1', 'p1', 'X'],
    ]);
  });

  it('anti-control', () => {
    const r = circuitOperators(circ(2, [[[op('X', [1])], [on0(0)]]]));
    expect(terms(r.factors[0].terms)).toEqual([['p1', 'I'], ['p0', 'X']]);
  });

  it('skips empty and barrier columns, keeps I gates', () => {
    const r = circuitOperators(circ(2, [[[]], [[op('BARRIER', [0])]], [[op('I', [1])]]]));
    expect(r.factors).toHaveLength(1);
    expect(r.factors[0].step).toBe(2);
    expect(terms(r.factors[0].terms)).toEqual([['I', 'I']]);
    expect(r.factors[0].terms[0][1].op).toEqual({ kind: 'gate', gate: 'I', params: [] });
  });

  it('adjacent two-qubit gate is one slot', () => {
    const r = circuitOperators(circ(4, [[[op('SWAP', [1, 2])]]]));
    expect(wires(r.factors[0].terms)).toEqual([[[0], [1, 2], [3]]]);
    expect(r.factors[0].indexed).toBe(false);
  });

  it('non-adjacent or reversed is indexed', () => {
    const a = circuitOperators(circ(4, [[[op('H', [1]), op('SWAP', [0, 2])]]]));
    expect(wires(a.factors[0].terms)).toEqual([[[0, 2], [1], [3]]]);
    expect(a.factors[0].indexed).toBe(true);
    const b = circuitOperators(circ(2, [[[op('B', [1, 0])]]]));
    expect(wires(b.factors[0].terms)).toEqual([[[1, 0]]]);
    expect(b.factors[0].indexed).toBe(true);
  });

  it('controlled column with non-adjacent gate is indexed', () => {
    const r = circuitOperators(circ(3, [[[op('SWAP', [0, 2])], [on1(1)]]]));
    expect(r.factors[0].indexed).toBe(true);
    expect(terms(r.factors[0].terms)).toEqual([['I', 'p0', 'I'], ['SWAP', 'p1']]);
  });

  it('stops at the first measure/reset', () => {
    const r = circuitOperators(circ(1, [[[op('H', [0])]], [[op('MEASURE', [0])]], [[op('X', [0])]]]));
    expect(r.factors).toHaveLength(1);
    expect(r.stoppedAt).toEqual({ step: 1, kind: 'measure' });
    const z = circuitOperators(circ(2, [[[op('RESET', [0])]], [[op('X', [1])]]]));
    expect(z.factors).toHaveLength(0);
    expect(z.stoppedAt).toEqual({ step: 0, kind: 'reset' });
  });

  it('invalidAngles', () => {
    expect(circuitOperators(circ(1, [[[op('RX', [0], ['foo'])]]])).invalidAngles).toBe(true);
    expect(circuitOperators(circ(1, [[[op('RX', [0], ['pi/2'])]]])).invalidAngles).toBe(false);
    const after = circ(1, [[[op('MEASURE', [0])]], [[op('RX', [0], ['foo'])]]]);
    expect(circuitOperators(after).invalidAngles).toBe(false);
  });

  it('copies initial and numQubits', () => {
    const c = circ(3, [[[]]]);
    c.initial = [0, 1, 1];
    const r = circuitOperators(c);
    expect(r.numQubits).toBe(3);
    expect(r.initial).toEqual([0, 1, 1]);
    expect(r.initial).not.toBe(c.initial);
  });
});
