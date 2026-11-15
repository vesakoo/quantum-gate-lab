import { GATE_INFO, type GateId } from '../sim/gates';
import type { Circuit, Control, ControlKind, Op, Step } from './circuit';

export const MIN_STEPS = 12;
export const MAX_QUBITS = 10;

let counter = 0;
function newId(): string {
  counter += 1;
  const rnd =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `op-${rnd}-${counter.toString(36)}`;
}

const isNonUnitary = (g: GateId) => GATE_INFO[g].kind !== 'unitary';

function defaultParams(gate: GateId): string[] {
  if (gate === 'U') return ['pi/2', '0', 'pi'];
  return GATE_INFO[gate].params.map(() => 'pi/2');
}

export function normalizeSteps(c: Circuit): Circuit {
  let last = -1;
  c.steps.forEach((s, i) => {
    if (s.ops.length > 0 || s.controls.length > 0) last = i;
  });
  const len = Math.max(MIN_STEPS, last + 2);
  if (len === c.steps.length) return c;
  const steps: Step[] = c.steps.slice(0, len);
  while (steps.length < len) steps.push({ ops: [], controls: [] });
  return { ...c, steps };
}

function withStep(c: Circuit, i: number, step: Step): Circuit {
  const steps = c.steps.slice();
  while (steps.length <= i) steps.push({ ops: [], controls: [] });
  steps[i] = step;
  return normalizeSteps({ ...c, steps });
}

function occupied(step: Step, wire: number): boolean {
  return step.ops.some((o) => o.wires.includes(wire)) || step.controls.some((k) => k.wire === wire);
}

/** Can `gate` on `wires` be added to `step` (already stripped of the item being moved)? */
function fits(c: Circuit, step: Step | undefined, gate: GateId, wires: number[]): boolean {
  if (!step) return false;
  if (wires.length !== GATE_INFO[gate].arity) return false;
  if (wires.some((w) => !Number.isInteger(w) || w < 0 || w >= c.numQubits)) return false;
  if (wires.length === 2 && wires[0] === wires[1]) return false;
  if (wires.some((w) => occupied(step, w))) return false;
  if (isNonUnitary(gate) && step.controls.length > 0) return false;
  return true;
}

function findOp(c: Circuit, opId: string): { si: number; op: Op } | null {
  for (let si = 0; si < c.steps.length; si++) {
    const op = c.steps[si].ops.find((o) => o.id === opId);
    if (op) return { si, op };
  }
  return null;
}

function stripOp(c: Circuit, si: number, opId: string): Circuit {
  const s = c.steps[si];
  const steps = c.steps.slice();
  steps[si] = { ...s, ops: s.ops.filter((o) => o.id !== opId) };
  return { ...c, steps };
}

export function placeGate(c: Circuit, gate: GateId, step: number, wire: number, params?: string[]): Circuit {
  if (!Number.isInteger(step) || step < 0 || !Number.isInteger(wire)) return c;
  const arity = GATE_INFO[gate].arity;
  let wires: number[];
  if (arity === 2) wires = wire + 1 < c.numQubits ? [wire, wire + 1] : [wire - 1, wire];
  else wires = [wire];
  const s = c.steps[step] ?? { ops: [], controls: [] };
  if (!fits(c, s, gate, wires)) return c;
  const op: Op = { id: newId(), gate, wires, params: params ? params.slice() : defaultParams(gate) };
  return withStep(c, step, { ...s, ops: [...s.ops, op] });
}

export function placeControl(c: Circuit, kind: ControlKind, step: number, wire: number): Circuit {
  if (!Number.isInteger(step) || step < 0 || !Number.isInteger(wire)) return c;
  if (wire < 0 || wire >= c.numQubits) return c;
  const s = c.steps[step] ?? { ops: [], controls: [] };
  if (occupied(s, wire)) return c;
  if (s.ops.some((o) => isNonUnitary(o.gate))) return c;
  return withStep(c, step, { ...s, controls: [...s.controls, { wire, kind }] });
}

export function moveOp(c: Circuit, opId: string, toStep: number, toWire: number): Circuit {
  const f = findOp(c, opId);
  if (!f || !Number.isInteger(toStep) || toStep < 0) return c;
  const offset = f.op.wires.map((w) => w - f.op.wires[0]);
  const wires = offset.map((o) => toWire + o);
  const base = stripOp(c, f.si, opId);
  const target = base.steps[toStep] ?? { ops: [], controls: [] };
  if (!fits(base, target, f.op.gate, wires)) return c;
  return withStep(base, toStep, { ...target, ops: [...target.ops, { ...f.op, wires }] });
}

export function moveOpEnd(c: Circuit, opId: string, endIndex: 0 | 1, toWire: number): Circuit {
  const f = findOp(c, opId);
  if (!f || f.op.wires.length !== 2) return c;
  const wires = f.op.wires.slice();
  wires[endIndex] = toWire;
  const base = stripOp(c, f.si, opId);
  if (!fits(base, base.steps[f.si], f.op.gate, wires)) return c;
  const s = base.steps[f.si];
  return withStep(base, f.si, { ...s, ops: [...s.ops, { ...f.op, wires }] });
}

export function moveControl(c: Circuit, step: number, wire: number, toStep: number, toWire: number): Circuit {
  const s = c.steps[step];
  const ctl = s?.controls.find((k) => k.wire === wire);
  if (!ctl || !Number.isInteger(toStep) || toStep < 0) return c;
  if (!Number.isInteger(toWire) || toWire < 0 || toWire >= c.numQubits) return c;
  const steps = c.steps.slice();
  steps[step] = { ...s, controls: s.controls.filter((k) => k !== ctl) };
  const base = { ...c, steps };
  const t = base.steps[toStep] ?? { ops: [], controls: [] };
  if (occupied(t, toWire) || t.ops.some((o) => isNonUnitary(o.gate))) return c;
  return withStep(base, toStep, { ...t, controls: [...t.controls, { wire: toWire, kind: ctl.kind }] });
}

export function removeOp(c: Circuit, opId: string): Circuit {
  const f = findOp(c, opId);
  if (!f) return c;
  return normalizeSteps(stripOp(c, f.si, opId));
}

export function removeControl(c: Circuit, step: number, wire: number): Circuit {
  const s = c.steps[step];
  if (!s || !s.controls.some((k) => k.wire === wire)) return c;
  return withStep(c, step, { ...s, controls: s.controls.filter((k) => k.wire !== wire) });
}

export function setParams(c: Circuit, opId: string, params: string[]): Circuit {
  const f = findOp(c, opId);
  if (!f) return c;
  const s = c.steps[f.si];
  return withStep(c, f.si, {
    ...s,
    ops: s.ops.map((o) => (o.id === opId ? { ...o, params: params.slice() } : o)),
  });
}

export function toggleInitial(c: Circuit, wire: number): Circuit {
  if (!Number.isInteger(wire) || wire < 0 || wire >= c.numQubits) return c;
  const initial = c.initial.slice();
  initial[wire] = initial[wire] === 0 ? 1 : 0;
  return normalizeSteps({ ...c, initial });
}

export function addQubit(c: Circuit): Circuit {
  if (c.numQubits >= MAX_QUBITS) return c;
  return normalizeSteps({ ...c, numQubits: c.numQubits + 1, initial: [...c.initial, 0] });
}

export function removeQubit(c: Circuit, wire: number): Circuit {
  if (c.numQubits <= 1 || !Number.isInteger(wire) || wire < 0 || wire >= c.numQubits) return c;
  const shift = (w: number) => (w > wire ? w - 1 : w);
  const steps: Step[] = c.steps.map((s) => ({
    ops: s.ops
      .filter((o) => !o.wires.includes(wire))
      .map((o) => ({ ...o, wires: o.wires.map(shift) })),
    controls: s.controls.filter((k: Control) => k.wire !== wire).map((k) => ({ ...k, wire: shift(k.wire) })),
  }));
  const initial = c.initial.filter((_, i) => i !== wire);
  return normalizeSteps({ numQubits: c.numQubits - 1, initial, steps });
}
