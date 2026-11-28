import { describe, expect, it } from 'vitest';
import { emptyCircuit, type Control, type Op } from '../../src/model/circuit';
import { angleText, lower, type Lowered } from '../../src/export/lower';
import type { GateId } from '../../src/sim/gates';

let uid = 0;
const op = (gate: GateId, wires: number[], params: string[] = []): Op => ({ id: `l${uid++}`, gate, wires, params });
const on1 = (wire: number): Control => ({ wire, kind: 'on1' });

function circ(n: number, steps: [Op[], Control[]?][], initial?: (0 | 1)[]) {
  const c = emptyCircuit(n, Math.max(steps.length, 1));
  steps.forEach(([ops, controls = []], s) => (c.steps[s] = { ops, controls }));
  if (initial) c.initial = initial;
  return c;
}
function ok(c: ReturnType<typeof circ>): Lowered {
  const r = lower(c);
  if (!r.ok) throw new Error('expected ok');
  return r.value;
}

describe('lower', () => {
  it('initial |1⟩ goes to initialOnes', () => {
    expect(ok(circ(3, [], [0, 1, 1])).initialOnes).toEqual([1, 2]);
  });

  it('controls attach to each gate of the step', () => {
    const l = ok(circ(3, [[[op('X', [1]), op('H', [2])], [on1(0)]]]));
    expect(l.ops).toHaveLength(2);
    for (const o of l.ops) expect(o.kind === 'gate' && o.controls).toEqual([{ wire: 0, kind: 'on1' }]);
  });

  it('controls are sorted by wire', () => {
    const l = ok(circ(3, [[[op('X', [2])], [on1(1), { wire: 0, kind: 'on0' }]]]));
    expect(l.ops[0].kind === 'gate' && l.ops[0].controls.map((c) => c.wire)).toEqual([0, 1]);
  });

  it('wire roles are kept', () => {
    const l = ok(circ(3, [[[op('B', [2, 0])]]]));
    expect(l.ops[0]).toMatchObject({ kind: 'gate', gate: 'B', wires: [2, 0], step: 0 });
  });

  it('I is dropped', () => {
    expect(ok(circ(1, [[[op('I', [0])]]])).ops).toEqual([]);
  });

  it('finalMeasure lists every qubit whose last op is not a measure', () => {
    expect(ok(circ(2, [[[op('H', [0])]]])).finalMeasure).toEqual([0, 1]);
    expect(ok(circ(2, [])).finalMeasure).toEqual([0, 1]);
    // measure then a gate on the same qubit: it must be measured again at the end
    expect(ok(circ(1, [[[op('MEASURE', [0])]], [[op('X', [0])]]])).finalMeasure).toEqual([0]);
    // Bell pair with only q0 measured: q1 still needs its measurement
    expect(ok(circ(2, [[[op('H', [0])]], [[op('X', [1])], [{ wire: 0, kind: 'on1' }]], [[op('MEASURE', [0])]]])).finalMeasure).toEqual([1]);
    expect(ok(circ(2, [[[op('MEASURE', [0]), op('MEASURE', [1])]]])).finalMeasure).toEqual([]);
  });

  it('measure/reset/barrier', () => {
    const l = ok(circ(3, [[[op('MEASURE', [0]), op('RESET', [1])]], [[op('BARRIER', [2])]]]));
    expect(l.ops).toEqual([
      { kind: 'measure', step: 0, wire: 0 },
      { kind: 'reset', step: 0, wire: 1 },
      { kind: 'barrier', step: 1, wire: 2 },
    ]);
  });

  it('params are converted to target syntax', () => {
    const l = ok(circ(1, [[[op('RZ', [0], ['3*π/4'])]]]));
    expect(l.ops[0]).toMatchObject({ params: ['3*pi/4'] });
  });

  it('invalid angle refuses', () => {
    const r = lower(circ(2, [[[]], [[]], [[op('RX', [1], ['pi/'])]]]));
    expect(r).toEqual({ ok: false, error: { kind: 'invalid-angle', step: 2, gate: 'RX', wires: [1], param: 'pi/' } });
  });
});

describe('angleText', () => {
  it('converts to target syntax', () => {
    expect(angleText('3*π/4')).toBe('3*pi/4');
    expect(angleText('-pi/2')).toBe('-pi/2');
    expect(angleText(' pi ')).toBe('pi');
    expect(angleText('π')).toBe('pi');
    expect(angleText('0.5')).toBe('0.5');
    // leading zeros are a SyntaxError in Python 3: fall back to the value
    expect(angleText('01')).toBe('1');
    expect(angleText('pi/007')).toBe(String(Math.PI / 7));
    expect(angleText('0.07*pi')).toBe('0.07*pi');
  });
});
