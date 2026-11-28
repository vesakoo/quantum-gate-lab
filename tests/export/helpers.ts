import { emptyCircuit, type Circuit, type Control, type Op } from '../../src/model/circuit';
import { lower, type Lowered } from '../../src/export/lower';
import type { GateId } from '../../src/sim/gates';

let uid = 0;
export const op = (gate: GateId, wires: number[], params: string[] = []): Op => ({ id: `e${uid++}`, gate, wires, params });
export const on1 = (wire: number): Control => ({ wire, kind: 'on1' });
export const on0 = (wire: number): Control => ({ wire, kind: 'on0' });

export function circ(n: number, steps: [Op[], Control[]?][], initial?: (0 | 1)[]): Circuit {
  const c = emptyCircuit(n, Math.max(steps.length, 1));
  steps.forEach(([ops, controls = []], s) => (c.steps[s] = { ops, controls }));
  if (initial) c.initial = initial;
  return c;
}

export function lowered(c: Circuit): Lowered {
  const r = lower(c);
  if (!r.ok) throw new Error('expected ok');
  return r.value;
}
