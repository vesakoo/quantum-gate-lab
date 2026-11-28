import type { GateId } from '../sim/gates';
import { DECOMP, type DecompOp } from './decompositions';
import type { ExportOp, Lowered } from './lower';

/** Qiskit method and library class for each lab gate with a direct counterpart. */
const DIRECT: Partial<Record<GateId, { method: string; cls: string }>> = {
  X: { method: 'x', cls: 'XGate' },
  Y: { method: 'y', cls: 'YGate' },
  Z: { method: 'z', cls: 'ZGate' },
  H: { method: 'h', cls: 'HGate' },
  S: { method: 's', cls: 'SGate' },
  Sdg: { method: 'sdg', cls: 'SdgGate' },
  T: { method: 't', cls: 'TGate' },
  Tdg: { method: 'tdg', cls: 'TdgGate' },
  SX: { method: 'sx', cls: 'SXGate' },
  SXdg: { method: 'sxdg', cls: 'SXdgGate' },
  RX: { method: 'rx', cls: 'RXGate' },
  RY: { method: 'ry', cls: 'RYGate' },
  RZ: { method: 'rz', cls: 'RZGate' },
  P: { method: 'p', cls: 'PhaseGate' },
  U: { method: 'u', cls: 'UGate' },
  SWAP: { method: 'swap', cls: 'SwapGate' },
  ISWAP: { method: 'iswap', cls: 'iSwapGate' },
};

/** Gates with a one-control method (`qc.cx`, `qc.crz`, …). */
const ONE_CONTROL: Partial<Record<GateId, string>> = {
  X: 'cx', Y: 'cy', Z: 'cz', H: 'ch', SX: 'csx', SWAP: 'cswap', RX: 'crx', RY: 'cry', RZ: 'crz', P: 'cp',
};

const HELPERS = { SQSWAP: { name: 'sqswap', ops: DECOMP.SQSWAP }, B: { name: 'bell', ops: DECOMP.B } } as const;
const HELPER_VAR = { SQSWAP: 'SQSWAP', B: 'BELL' } as const;

function decompLine(target: string, d: DecompOp, map: (w: number) => number): string {
  const m = d.control === undefined ? DIRECT[d.gate]!.method : ONE_CONTROL[d.gate]!;
  const wires = d.control === undefined ? d.wires.map(map) : [map(d.control), ...d.wires.map(map)];
  return `${target}.${m}(${wires.join(', ')})`;
}

/** Header comment: the lab's bit order versus Qiskit's, with the circuit's own input as the example. */
export function bitOrderNote(l: Lowered, comment: string): string {
  let bits = Array.from({ length: l.numQubits }, (_, q) => (l.initialOnes.includes(q) ? '1' : '0')).join('');
  let label = '';
  // a palindrome (e.g. the usual all-zero input) shows nothing; use q[0] = 1 instead
  if (bits === [...bits].reverse().join('') && l.numQubits > 1) {
    bits = '1' + '0'.repeat(l.numQubits - 1);
    label = ' (q[0] = 1)';
  }
  const rev = [...bits].reverse().join('');
  return `${comment} Bit order: the lab writes q[0] as the leftmost bit, Qiskit as the rightmost. Lab |${bits}⟩${label} is Qiskit key '${rev}'.`;
}

/** The lowered circuit as a runnable Qiskit Python script. */
export function toQiskit(l: Lowered, shareUrl: string): string {
  const classes = new Set<string>();
  const helpers = new Set<'SQSWAP' | 'B'>();
  const body: string[] = [];
  const n = l.numQubits;

  for (const q of l.initialOnes) body.push(`qc.x(${q})`);
  for (const o of l.ops) body.push(...opLines(o, classes, helpers));
  if (l.finalMeasure) body.push(`qc.measure(range(${n}), range(${n}))  # added: hardware returns counts only after measurement`);

  const out: string[] = [
    '# Exported from Quantum Gate Lab',
    `# ${shareUrl}`,
    bitOrderNote(l, '#'),
    '',
    'from math import pi',
    'from qiskit import QuantumCircuit',
  ];
  if (classes.size) out.push(`from qiskit.circuit.library import ${[...classes].sort().join(', ')}`);
  for (const h of (['SQSWAP', 'B'] as const).filter((x) => helpers.has(x))) {
    const tmp = `_${HELPERS[h].name}`;
    out.push('', `${tmp} = QuantumCircuit(2, name='${HELPERS[h].name}')`);
    for (const d of HELPERS[h].ops) out.push(decompLine(tmp, d, (w) => w));
    out.push(`${HELPER_VAR[h]} = ${tmp}.to_gate()`);
  }
  out.push('', `qc = QuantumCircuit(${n}, ${n})`, ...body, '');
  return out.join('\n');
}

function opLines(o: ExportOp, classes: Set<string>, helpers: Set<'SQSWAP' | 'B'>): string[] {
  if (o.kind !== 'gate') return [o.kind === 'measure' ? `qc.measure(${o.wire}, ${o.wire})` : `qc.${o.kind}(${o.wire})`];
  const { gate, wires, params, controls } = o;
  const args = (ws: number[]) => [...params, ...ws].join(', ');

  if (controls.length === 0) {
    if (gate === 'B') return DECOMP.B.map((d) => decompLine('qc', d, (w) => wires[w]));
    if (gate === 'SQSWAP') {
      helpers.add('SQSWAP');
      return [`qc.append(SQSWAP, [${wires.join(', ')}])`];
    }
    return [`qc.${DIRECT[gate]!.method}(${args(wires)})`];
  }

  const allOn1 = controls.every((c) => c.kind === 'on1');
  const cw = controls.map((c) => c.wire);
  if (allOn1 && controls.length === 1 && ONE_CONTROL[gate]) return [`qc.${ONE_CONTROL[gate]}(${args([...cw, ...wires])})`];
  if (allOn1 && controls.length === 2 && gate === 'X') return [`qc.ccx(${[...cw, ...wires].join(', ')})`];

  let g: string;
  if (gate === 'SQSWAP' || gate === 'B') {
    helpers.add(gate);
    g = HELPER_VAR[gate];
  } else {
    const cls = DIRECT[gate]!.cls;
    classes.add(cls);
    g = `${cls}(${params.join(', ')})`;
  }
  // Qiskit's ctrl_state is little-endian over the control list: the last char is the first control.
  const state = controls.map((c) => (c.kind === 'on1' ? '1' : '0')).reverse().join('');
  return [`qc.append(${g}.control(${controls.length}, ctrl_state='${state}'), [${[...cw, ...wires].join(', ')}])`];
}
