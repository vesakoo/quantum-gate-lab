import type { GateId } from '../sim/gates';

/** A matrix for display: entries are plain strings (`e^{…}` is rendered as a superscript). */
export type MatrixSpec = { scalar?: string; rows: string[][]; rowLabels?: string[] };
export type GateDoc = { name: string; description: string; basis?: string[]; matrix?: MatrixSpec };
export type DocKey = GateId | 'ctl:on1' | 'ctl:on0';

const TWO = ['|00⟩', '|01⟩', '|10⟩', '|11⟩'];
const m2 = (rows: string[][], scalar?: string): MatrixSpec => (scalar ? { scalar, rows } : { rows });
const m4 = (rows: string[][], scalar?: string): MatrixSpec => ({ ...m2(rows, scalar), rowLabels: TWO });

/** Static content of the gate card: one entry per gate and per control kind. */
export const GATE_DOCS: Record<DocKey, GateDoc> = {
  I: {
    name: 'Identity',
    description: 'Leaves the qubit unchanged. Useful as a placeholder or to mark an idle step.',
    matrix: m2([['1', '0'], ['0', '1']]),
  },
  X: {
    name: 'Pauli-X (NOT)',
    description: 'Flips |0⟩ and |1⟩, like a classical NOT. It is a half turn about the x axis of the Bloch sphere.',
    basis: ['|0⟩ → |1⟩', '|1⟩ → |0⟩'],
    matrix: m2([['0', '1'], ['1', '0']]),
  },
  Y: {
    name: 'Pauli-Y',
    description: 'Flips |0⟩ and |1⟩ and adds a phase of ±i. It is a half turn about the y axis.',
    basis: ['|0⟩ → i|1⟩', '|1⟩ → −i|0⟩'],
    matrix: m2([['0', '−i'], ['i', '0']]),
  },
  Z: {
    name: 'Pauli-Z',
    description: 'Leaves |0⟩ alone and flips the sign of |1⟩. It is a half turn about the z axis.',
    basis: ['|0⟩ → |0⟩', '|1⟩ → −|1⟩'],
    matrix: m2([['1', '0'], ['0', '−1']]),
  },
  H: {
    name: 'Hadamard',
    description: 'Puts a basis state into an equal superposition. Applying it twice gives back the original state.',
    basis: ['|0⟩ → (|0⟩ + |1⟩)/√2', '|1⟩ → (|0⟩ − |1⟩)/√2'],
    matrix: m2([['1', '1'], ['1', '−1']], '1/√2'),
  },
  S: {
    name: 'S (phase π/2)',
    description: 'Multiplies |1⟩ by i, a quarter turn about the z axis. Two S gates make a Z.',
    basis: ['|0⟩ → |0⟩', '|1⟩ → i|1⟩'],
    matrix: m2([['1', '0'], ['0', 'i']]),
  },
  Sdg: {
    name: 'S-dagger',
    description: 'The inverse of S: multiplies |1⟩ by −i.',
    basis: ['|0⟩ → |0⟩', '|1⟩ → −i|1⟩'],
    matrix: m2([['1', '0'], ['0', '−i']]),
  },
  T: {
    name: 'T (phase π/4)',
    description: 'Multiplies |1⟩ by e^{iπ/4}, an eighth turn about the z axis. Two T gates make an S.',
    basis: ['|0⟩ → |0⟩', '|1⟩ → e^{iπ/4}|1⟩'],
    matrix: m2([['1', '0'], ['0', 'e^{iπ/4}']]),
  },
  Tdg: {
    name: 'T-dagger',
    description: 'The inverse of T: multiplies |1⟩ by e^{−iπ/4}.',
    basis: ['|0⟩ → |0⟩', '|1⟩ → e^{−iπ/4}|1⟩'],
    matrix: m2([['1', '0'], ['0', 'e^{−iπ/4}']]),
  },
  SX: {
    name: '√X',
    description: 'The square root of X: a quarter turn about the x axis. Two of them make an X.',
    matrix: m2([['1+i', '1−i'], ['1−i', '1+i']], '½'),
  },
  SXdg: {
    name: '√X-dagger',
    description: 'The inverse of √X: a quarter turn back about the x axis.',
    matrix: m2([['1−i', '1+i'], ['1+i', '1−i']], '½'),
  },
  RX: {
    name: 'Rotation about X',
    description: 'Turns the qubit by the angle θ around the x axis of the Bloch sphere.',
    matrix: m2([['cos(θ/2)', '−i sin(θ/2)'], ['−i sin(θ/2)', 'cos(θ/2)']]),
  },
  RY: {
    name: 'Rotation about Y',
    description: 'Turns the qubit by the angle θ around the y axis. Its amplitudes stay real.',
    matrix: m2([['cos(θ/2)', '−sin(θ/2)'], ['sin(θ/2)', 'cos(θ/2)']]),
  },
  RZ: {
    name: 'Rotation about Z',
    description: 'Turns the qubit by the angle θ around the z axis, changing only the relative phase.',
    matrix: m2([['e^{−iθ/2}', '0'], ['0', 'e^{iθ/2}']]),
  },
  P: {
    name: 'Phase',
    description: 'Multiplies |1⟩ by e^{iλ} and leaves |0⟩ alone. P(π/2) is S and P(π/4) is T.',
    basis: ['|0⟩ → |0⟩', '|1⟩ → e^{iλ}|1⟩'],
    matrix: m2([['1', '0'], ['0', 'e^{iλ}']]),
  },
  U: {
    name: 'General single-qubit (U)',
    description: 'Any single-qubit gate, set by three angles θ, φ and λ. For example U(π, 0, π) is X.',
    matrix: m2([
      ['cos(θ/2)', '−e^{iλ} sin(θ/2)'],
      ['e^{iφ} sin(θ/2)', 'e^{i(φ+λ)} cos(θ/2)'],
    ]),
  },
  SWAP: {
    name: 'SWAP',
    description: 'Exchanges the states of two qubits.',
    basis: ['|01⟩ → |10⟩', '|10⟩ → |01⟩'],
    matrix: m4([
      ['1', '0', '0', '0'],
      ['0', '0', '1', '0'],
      ['0', '1', '0', '0'],
      ['0', '0', '0', '1'],
    ]),
  },
  ISWAP: {
    name: 'iSWAP',
    description: 'Exchanges two qubits and multiplies the swapped terms by i.',
    basis: ['|01⟩ → i|10⟩', '|10⟩ → i|01⟩'],
    matrix: m4([
      ['1', '0', '0', '0'],
      ['0', '0', 'i', '0'],
      ['0', 'i', '0', '0'],
      ['0', '0', '0', '1'],
    ]),
  },
  SQSWAP: {
    name: '√SWAP',
    description: 'Half of a SWAP: two of them exchange the qubits. On its own it entangles |01⟩ and |10⟩.',
    matrix: m4([
      ['1', '0', '0', '0'],
      ['0', '(1+i)/2', '(1−i)/2', '0'],
      ['0', '(1−i)/2', '(1+i)/2', '0'],
      ['0', '0', '0', '1'],
    ]),
  },
  B: {
    name: 'Bell',
    description: 'H on the dot end, then a CNOT from the dot end onto the other qubit. It turns |00⟩ into the Bell state (|00⟩ + |11⟩)/√2.',
    basis: ['|00⟩ → (|00⟩ + |11⟩)/√2', '|01⟩ → (|01⟩ + |10⟩)/√2'],
    matrix: m4(
      [
        ['1', '0', '1', '0'],
        ['0', '1', '0', '1'],
        ['0', '1', '0', '−1'],
        ['1', '0', '−1', '0'],
      ],
      '1/√2',
    ),
  },
  MEASURE: {
    name: 'Measure',
    description: 'Reads the qubit in the 0/1 basis. Here it is modelled as dephasing, so the result stays a mix of 0 and 1 instead of a random collapse.',
  },
  RESET: {
    name: 'Reset',
    description: 'Sets the qubit back to |0⟩, whatever its state. It is not a unitary gate, so it has no matrix.',
  },
  BARRIER: {
    name: 'Barrier',
    description: 'A visual divider between parts of the circuit. It does nothing to the state.',
  },
  'ctl:on1': {
    name: 'Control',
    description: 'The gates in this step apply only when this qubit is |1⟩. Several controls must all hold.',
  },
  'ctl:on0': {
    name: 'Anti-control',
    description: 'The gates in this step apply only when this qubit is |0⟩. Several controls must all hold.',
  },
};
