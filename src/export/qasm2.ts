import { GATE_INFO, type GateId } from '../sim/gates';
import { DECOMP, type DecompOp } from './decompositions';
import type { ExportOp, Lowered } from './lower';
import { bitOrderNote } from './qiskit';

/** Uncontrolled lab gate → OpenQASM 2.0 name (Qiskit's qelib1.inc, plus the iswap/sqswap definitions below). */
const NAME: Partial<Record<GateId, string>> = {
  X: 'x', Y: 'y', Z: 'z', H: 'h', S: 's', Sdg: 'sdg', T: 't', Tdg: 'tdg', SX: 'sx', SXdg: 'sxdg',
  RX: 'rx', RY: 'ry', RZ: 'rz', P: 'p', U: 'u3', SWAP: 'swap', ISWAP: 'iswap', SQSWAP: 'sqswap',
};

/** One-control forms; S/T phases are cp with a fixed angle (S = P(π/2) exactly). */
const ONE_CONTROL: Partial<Record<GateId, string>> = {
  X: 'cx', Y: 'cy', Z: 'cz', H: 'ch', RX: 'crx', RY: 'cry', RZ: 'crz', P: 'cp', U: 'cu3', SX: 'csx', SWAP: 'cswap',
  S: 'cp(pi/2)', Sdg: 'cp(-pi/2)', T: 'cp(pi/4)', Tdg: 'cp(-pi/4)',
};

const DEFS = { ISWAP: 'iswap', SQSWAP: 'sqswap' } as const;

function defLine(name: string, ops: DecompOp[]): string {
  const v = ['a', 'b'];
  const body = ops.map((d) =>
    d.control === undefined ? `${NAME[d.gate]} ${v[d.wires[0]]};` : `${ONE_CONTROL[d.gate]} ${v[d.control]},${v[d.wires[0]]};`,
  );
  return `gate ${name} a,b { ${body.join(' ')} }`;
}

const qs = (ws: number[]) => ws.map((w) => `q[${w}]`).join(',');
const call = (name: string, params: string[], ws: number[]) => `${params.length ? `${name}(${params.join(',')})` : name} ${qs(ws)};`;

/** The lowered circuit as OpenQASM 2.0, or the first step it cannot express. */
export function toQasm2(l: Lowered, shareUrl: string): { ok: true; code: string } | { ok: false; message: string } {
  const used = new Set<'ISWAP' | 'SQSWAP'>();
  const body: string[] = l.initialOnes.map((q) => `x q[${q}];`);
  for (const o of l.ops) {
    const r = opLines(o, used);
    if (typeof r === 'string') return { ok: false, message: r };
    body.push(...r);
  }
  if (l.finalMeasure) body.push('measure q -> c; // added: hardware returns counts only after measurement');
  const out = [
    '// Exported from Quantum Gate Lab',
    `// ${shareUrl}`,
    "// Uses Qiskit's qelib1.inc (sx, sxdg, p, cp, csx)",
    bitOrderNote(l, '//'),
    'OPENQASM 2.0;',
    'include "qelib1.inc";',
  ];
  for (const g of (['ISWAP', 'SQSWAP'] as const).filter((g) => used.has(g))) out.push(defLine(DEFS[g], DECOMP[g]));
  out.push(`qreg q[${l.numQubits}];`, `creg c[${l.numQubits}];`, ...body, '');
  return { ok: true, code: out.join('\n') };
}

function opLines(o: ExportOp, used: Set<'ISWAP' | 'SQSWAP'>): string[] | string {
  if (o.kind === 'measure') return [`measure q[${o.wire}] -> c[${o.wire}];`];
  if (o.kind === 'reset') return [`reset q[${o.wire}];`];
  if (o.kind === 'barrier') return [`barrier q[${o.wire}];`];
  const { gate, wires, params, controls } = o;
  if (gate === 'ISWAP' || gate === 'SQSWAP') used.add(gate);

  if (controls.length === 0) {
    if (gate === 'B') return [call('h', [], [wires[0]]), call('cx', [], [wires[0], wires[1]])];
    return [call(NAME[gate]!, params, wires)];
  }

  const cw = controls.map((c) => c.wire);
  let line: string | null = null;
  if (controls.length === 1 && ONE_CONTROL[gate]) line = call(ONE_CONTROL[gate]!, params, [...cw, ...wires]);
  else if (controls.length === 2 && gate === 'X') line = call('ccx', [], [...cw, ...wires]);
  if (!line) {
    const k = controls.length;
    return `Step ${o.step + 1}: ${GATE_INFO[gate].label} with ${k} control${k === 1 ? '' : 's'} has no OpenQASM 2.0 gate. Use the Qiskit tab.`;
  }
  // a hollow (on-0) control is an ordinary control between two X gates
  const flips = controls.filter((c) => c.kind === 'on0').map((c) => `x q[${c.wire}];`);
  return [...flips, line, ...flips];
}
