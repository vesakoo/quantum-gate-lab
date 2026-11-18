import type { Circuit, Control, ControlKind, Op } from '../model/circuit';
import { parseAngle } from '../sim/angle';
import { GATE_INFO, gateMatrix, type GateId } from '../sim/gates';
import type { DocKey, MatrixSpec } from './gateDocs';
import { formatAngle } from './GateView';
import { formatComplex } from './ket';
import { subscript } from './operatorText';

export type CardTarget =
  | { kind: 'palette'; gate: GateId }
  | { kind: 'palette-control'; ctl: ControlKind }
  | { kind: 'op'; opId: string }
  | { kind: 'control'; step: number; wire: number };

export type ControlInfo = {
  condition: string;
  block: MatrixSpec;
  blockLabel: string;
  projector: string;
  basisOrder: string;
};

export type HereInfo = {
  position: string;
  angles?: { name: string; text: string; valid: boolean }[];
  evaluated?: MatrixSpec;
  invalidNote?: string;
  control?: ControlInfo;
  orphanNote?: string;
  /** For an uncontrolled two-qubit gate on reversed wires: which qubit is the left bit of |00⟩…|11⟩. */
  basisOrder?: string;
};

const ascending = (ws: number[]) => ws.every((w, i) => i === 0 || w > ws[i - 1]);

type Found = { op: Op; step: number } | { control: Control; step: number } | null;

function find(c: Circuit, t: CardTarget): Found {
  if (t.kind === 'op') {
    for (let s = 0; s < c.steps.length; s++) {
      const op = c.steps[s].ops.find((o) => o.id === t.opId);
      if (op) return { op, step: s };
    }
    return null;
  }
  if (t.kind === 'control') {
    const k = c.steps[t.step]?.controls.find((x) => x.wire === t.wire);
    return k ? { control: k, step: t.step } : null;
  }
  return null;
}

/** Which static doc the card shows; null when the op or control no longer exists. */
export function docKey(c: Circuit, t: CardTarget): DocKey | null {
  if (t.kind === 'palette') return t.gate;
  if (t.kind === 'palette-control') return `ctl:${t.ctl}`;
  const f = find(c, t);
  if (!f) return null;
  return 'op' in f ? f.op.gate : `ctl:${f.control.kind}`;
}

const isUnitary = (o: Op) => GATE_INFO[o.gate].kind === 'unitary';
const identity = (size: number) => (size === 2 ? 'I' : `I${subscript(size)}`);
const opName = (o: Op) =>
  GATE_INFO[o.gate].label + (o.params.length ? `(${o.params.map(formatAngle).join(',')})` : '');
const sat = (k: Control): 0 | 1 => (k.kind === 'on1' ? 1 : 0);

function controlInfo(controlsIn: Control[], opsIn: Op[]): ControlInfo {
  const controls = controlsIn.slice().sort((a, b) => a.wire - b.wire);
  const ops = opsIn.slice().sort((a, b) => Math.min(...a.wires) - Math.min(...b.wires));
  const nc = controls.length;
  const nt = ops.reduce((s, o) => s + o.wires.length, 0);
  const t = 2 ** nt;
  const uName = ops.map(opName).join(' ⊗ ');
  const b = controls.reduce((acc, k) => acc * 2 + sat(k), 0);

  // block-diagonal: [I_a] [U] [I_c], size-0 blocks dropped
  const blocks: string[] = [];
  if (b > 0) blocks.push(identity(b * t));
  blocks.push(uName);
  const rest = (2 ** nc - 1 - b) * t;
  if (rest > 0) blocks.push(identity(rest));
  const rows = blocks.map((d, i) => blocks.map((_, j) => (i === j ? d : '0')));

  const prefix = controls.map((k) => (k.kind === 'on1' ? 'C' : 'C̄')).join('');
  const blockLabel = `${prefix}${ops.length > 1 ? `(${uName})` : uName} =`;

  // k + 1 projector terms, controls first, the target part as one slot
  const proj = (bit: number) => `|${bit}⟩⟨${bit}|`;
  const terms: string[] = [];
  controls.forEach((k, j) => {
    const slots = controls.map((p, i) => (i < j ? proj(sat(p)) : i === j ? proj(1 - sat(k)) : 'I'));
    terms.push([...slots, identity(t)].join(' ⊗ '));
  });
  terms.push([...controls.map((k) => proj(sat(k))), uName].join(' ⊗ '));

  const targets = ops.flatMap((o) => o.wires);
  const order = [...controls.map((k) => k.wire), ...targets];
  const causes = [
    ...(controls.some((k) => targets.some((w) => k.wire > w)) ? ['control first'] : []),
    ...(ascending(targets) ? [] : ['gate wire order']),
  ];
  return {
    condition: `applied only when ${controls.map((k) => `q[${k.wire}] = ${sat(k)}`).join(' and ')}`,
    block: { rows },
    blockLabel,
    projector: terms.join(' + '),
    basisOrder: `Basis order: ${order.map((w) => `q[${w}]`).join(' ')}${causes.length ? ` (${causes.join(', ')})` : ''}`,
  };
}

/** The "Here" facts for a placed gate or control; null for palette and stale targets. */
export function cardHere(c: Circuit, t: CardTarget): HereInfo | null {
  const f = find(c, t);
  if (!f) return null;
  const step = c.steps[f.step];
  const unitaries = step.ops.filter(isUnitary);
  const controlled = step.controls.length > 0 && unitaries.length > 0;
  const k = f.step + 1;

  if ('control' in f) {
    const who = f.control.kind === 'on1' ? 'control' : 'anti-control';
    const here: HereInfo = { position: `${who} on q[${f.control.wire}], step ${k}` };
    if (controlled) here.control = controlInfo(step.controls, unitaries);
    else here.orphanNote = 'No gate in this step — this control is ignored.';
    return here;
  }

  const op = f.op;
  const position =
    op.wires.length === 2 ? `q[${op.wires[0]}] ↔ q[${op.wires[1]}], step ${k}` : `on q[${op.wires[0]}], step ${k}`;
  const here: HereInfo = { position };
  const names = GATE_INFO[op.gate].params;
  if (names.length) {
    const values = op.params.map(parseAngle);
    here.angles = names.map((name, i) => ({ name, text: formatAngle(op.params[i] ?? ''), valid: values[i] !== null }));
    const bad = here.angles.find((a) => !a.valid);
    if (bad) {
      here.invalidNote = `${bad.name} = ${bad.text} is not a valid angle; the simulator treats this gate as I. Double-click to fix.`;
    } else {
      const m = gateMatrix(op.gate, values as number[]);
      const rows: string[][] = [];
      for (let r = 0; r < m.dim; r++) {
        const row: string[] = [];
        for (let col = 0; col < m.dim; col++) {
          const i = 2 * (r * m.dim + col);
          row.push(formatComplex(m.data[i], m.data[i + 1]));
        }
        rows.push(row);
      }
      here.evaluated = { rows };
    }
  }
  if (controlled && isUnitary(op)) here.control = controlInfo(step.controls, unitaries);
  else if (op.wires.length === 2 && !ascending(op.wires)) {
    here.basisOrder = `Basis order: ${op.wires.map((w) => `q[${w}]`).join(' ')} (gate wire order)`;
  }
  return here;
}
