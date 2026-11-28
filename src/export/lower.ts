import { parseAngle } from '../sim/angle';
import { GATE_INFO, type GateId } from '../sim/gates';
import type { Circuit, Control } from '../model/circuit';

export type ExportOp =
  | { kind: 'gate'; step: number; gate: GateId; wires: number[]; params: string[]; controls: Control[] }
  | { kind: 'measure' | 'reset' | 'barrier'; step: number; wire: number };

/** `finalMeasure`: qubits whose last op is not a measure; the exporters measure them at the end. */
export type Lowered = { numQubits: number; initialOnes: number[]; ops: ExportOp[]; finalMeasure: number[] };

export type LowerError = { kind: 'invalid-angle'; step: number; gate: GateId; wires: number[]; param: string };

/** An angle expression in target syntax (`π` → `pi`); falls back to its value when it is not plain arithmetic. */
export function angleText(expr: string): string {
  const t = expr.trim().replace(/π/g, 'pi');
  // integer literals with leading zeros (`01`) are a SyntaxError in Python 3
  const leadingZero = /(^|[^\d.])0\d/.test(t);
  if (!leadingZero && /^[\d.\s+\-*/()]*$/.test(t.replace(/pi/g, ''))) return t;
  return String(parseAngle(expr));
}

/** The circuit as a flat op list for the exporters, or the first gate whose angle does not parse. */
export function lower(c: Circuit): { ok: true; value: Lowered } | { ok: false; error: LowerError } {
  const ops: ExportOp[] = [];
  // per qubit: is its last op a measure? (barriers do not change the state)
  const measuredLast = Array.from({ length: c.numQubits }, () => false);
  for (let step = 0; step < c.steps.length; step++) {
    const s = c.steps[step];
    const controls = s.controls.slice().sort((a, b) => a.wire - b.wire);
    for (const o of s.ops) {
      const kind = GATE_INFO[o.gate].kind;
      if (kind !== 'unitary') {
        if (kind !== 'barrier') measuredLast[o.wires[0]] = kind === 'measure';
        ops.push({ kind, step, wire: o.wires[0] });
        continue;
      }
      const bad = o.params.find((p) => parseAngle(p) === null);
      if (bad !== undefined) return { ok: false, error: { kind: 'invalid-angle', step, gate: o.gate, wires: o.wires.slice(), param: bad } };
      if (o.gate === 'I') continue;
      for (const w of [...o.wires, ...controls.map((x) => x.wire)]) measuredLast[w] = false;
      ops.push({ kind: 'gate', step, gate: o.gate, wires: o.wires.slice(), params: o.params.map(angleText), controls });
    }
  }
  const initialOnes = c.initial.flatMap((b, q) => (b === 1 ? [q] : []));
  return { ok: true, value: { numQubits: c.numQubits, initialOnes, ops, finalMeasure: measuredLast.flatMap((m, q) => (m ? [] : [q])) } };
}
