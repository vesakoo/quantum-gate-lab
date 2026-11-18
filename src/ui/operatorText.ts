import type { CircuitOperators, Slot } from '../model/operators';
import { GATE_INFO } from '../sim/gates';
import { formatAngle } from './GateView';

const SUB = '₀₁₂₃₄₅₆₇₈₉';

/** `12` → `₁₂`. */
export function subscript(n: number): string {
  return String(n).replace(/\d/g, (d) => SUB[Number(d)]);
}

function slotText(s: Slot, indexed: boolean): string {
  const o = s.op;
  let t: string;
  if (o.kind === 'I') t = 'I';
  else if (o.kind === 'proj') t = `|${o.bit}⟩⟨${o.bit}|`;
  else {
    t = GATE_INFO[o.gate].label;
    if (o.params.length) t += `(${o.params.map(formatAngle).join(',')})`;
  }
  return indexed ? t + s.wires.map(subscript).join(',') : t;
}

/**
 * The circuit as one Unicode line, `|ψ⟩ = F_last · … · F_first |input⟩`: each factor in parentheses,
 * terms joined by ` + `, slots by ` ⊗ `. No simplification.
 */
export function formatOperators(ops: CircuitOperators): string {
  const ket = `|${ops.initial.join('')}⟩`;
  if (ops.factors.length === 0) return `|ψ⟩ = ${ket}`;
  const factors = ops.factors
    .slice()
    .reverse()
    .map((f) => `(${f.terms.map((t) => t.map((s) => slotText(s, f.indexed)).join(' ⊗ ')).join(' + ')})`);
  return `|ψ⟩ = ${factors.join(' · ')} ${ket}`;
}
