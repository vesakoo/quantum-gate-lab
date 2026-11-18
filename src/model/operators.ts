import { GATE_INFO, type GateId } from '../sim/gates';
import { parseAngle } from '../sim/angle';
import type { Circuit, Control, Op } from './circuit';

/**
 * The circuit as an operator product, for the "Circuit as operators" formula (and a later matrix
 * view): factors (one per used step) → terms (summed) → slots (tensored, covering every wire).
 */
export type SlotOp =
  | { kind: 'gate'; gate: GateId; params: string[] }
  | { kind: 'proj'; bit: 0 | 1 } // |bit⟩⟨bit|
  | { kind: 'I' };
/** `wires`: one entry, or the op's wires in op order for 2-qubit gates. */
export type Slot = { wires: number[]; op: SlotOp };
/** Covers every wire exactly once, sorted by the smallest wire of each slot. */
export type Term = Slot[];
/** `indexed`: a 2-qubit gate is non-adjacent or reversed, so every slot is written with qubit subscripts. */
export type Factor = { step: number; terms: Term[]; indexed: boolean };
export type CircuitOperators = {
  numQubits: number;
  initial: (0 | 1)[];
  /** Circuit order (step 0 first). */
  factors: Factor[];
  /** 0-based step of the first MEASURE/RESET; the formula ends before it. */
  stoppedAt: { step: number; kind: 'measure' | 'reset' } | null;
  /** Some included gate has a parameter that does not parse (the simulator treats it as I). */
  invalidAngles: boolean;
};

const minWire = (s: Slot) => Math.min(...s.wires);

/** One term: the given slots plus I on every other wire. */
function term(n: number, slots: Slot[]): Term {
  const used = new Set(slots.flatMap((s) => s.wires));
  const rest: Slot[] = [];
  for (let w = 0; w < n; w++) if (!used.has(w)) rest.push({ wires: [w], op: { kind: 'I' } });
  return [...slots, ...rest].sort((a, b) => minWire(a) - minWire(b));
}

const proj = (wire: number, bit: 0 | 1): Slot => ({ wires: [wire], op: { kind: 'proj', bit } });
const satisfied = (k: Control): 0 | 1 => (k.kind === 'on1' ? 1 : 0);

export function circuitOperators(c: Circuit): CircuitOperators {
  const n = c.numQubits;
  const factors: Factor[] = [];
  let stoppedAt: CircuitOperators['stoppedAt'] = null;
  let invalidAngles = false;

  for (let s = 0; s < c.steps.length; s++) {
    const step = c.steps[s];
    if (step.ops.some((o) => o.gate === 'MEASURE' || o.gate === 'RESET')) {
      stoppedAt = { step: s, kind: step.ops.some((o) => o.gate === 'MEASURE') ? 'measure' : 'reset' };
      break;
    }
    const gates: Op[] = step.ops.filter((o) => GATE_INFO[o.gate].kind === 'unitary');
    if (gates.length === 0 && step.controls.length === 0) continue;
    if (gates.some((o) => o.params.some((p) => parseAngle(p) === null))) invalidAngles = true;

    const gateSlots: Slot[] = gates.map((o) => ({
      wires: o.wires.slice(),
      op: { kind: 'gate', gate: o.gate, params: o.params.slice() },
    }));
    const controls = step.controls.slice().sort((a, b) => a.wire - b.wire);
    const terms: Term[] = [];
    // term j: controls before j satisfied, control j not; the last term has all satisfied plus the gates
    controls.forEach((k, j) => {
      const slots = controls.slice(0, j).map((p) => proj(p.wire, satisfied(p)));
      slots.push(proj(k.wire, (1 - satisfied(k)) as 0 | 1));
      terms.push(term(n, slots));
    });
    terms.push(term(n, [...controls.map((k) => proj(k.wire, satisfied(k))), ...gateSlots]));

    const indexed = gates.some((o) => o.wires.length === 2 && o.wires[1] !== o.wires[0] + 1);
    factors.push({ step: s, terms, indexed });
  }

  return { numQubits: n, initial: c.initial.slice(), factors, stoppedAt, invalidAngles };
}
