import type { Circuit, Op } from '../model/circuit';
import { parseAngle } from './angle';
import type { Backend, Bloch } from './backend';
import { DensityMatrix } from './density';
import { GATE_INFO, gateMatrix } from './gates';
import { StateVector } from './statevector';

export type SimResult = {
  /** Qubit count of the simulated circuit (results may lag behind the edited circuit). */
  numQubits: number;
  bloch: Bloch[][];
  probabilities: number[];
  qubitP1: number[];
  backend: 'statevector' | 'density';
  /**
   * Final pure state as 2^n amplitudes interleaved re/im (index i at [2i], [2i+1]); null for a mixed
   * state. From the density backend it is only defined up to a global phase.
   */
  amplitudes: number[] | null;
  /** Tr(ρ²) of the final state: 1 when pure. */
  purity: number;
};

function snapshot(b: Backend): Bloch[] {
  return Array.from({ length: b.n }, (_, q) => b.bloch(q));
}

const isNonUnitary = (o: Op): boolean => {
  const k = GATE_INFO[o.gate].kind;
  return k === 'measure' || k === 'reset';
};

/**
 * Simulates the circuit. Circuits without MEASURE/RESET use the StateVector backend.
 * With them, the result reports the 'density' backend, but by default (`hybrid`) the state
 * vector is used up to the first step containing MEASURE/RESET and only then converted to
 * a DensityMatrix |ψ⟩⟨ψ|. `hybrid: false` uses the DensityMatrix from the start (reference).
 */
export function simulate(c: Circuit, { hybrid = true }: { hybrid?: boolean } = {}): SimResult {
  const n = c.numQubits;
  const needsDensity = c.steps.some((s) => s.ops.some(isNonUnitary));
  let backend: Backend = needsDensity && !hybrid ? new DensityMatrix(n, c.initial) : new StateVector(n, c.initial);
  const bloch: Bloch[][] = [snapshot(backend)];

  for (const step of c.steps) {
    // A step with measure/reset has no controls and disjoint wires, so its unitaries commute with
    // the measure/reset: apply them first, while the (cheaper) state vector may still be in use.
    const ops = step.ops.some(isNonUnitary)
      ? [...step.ops.filter((o) => !isNonUnitary(o)), ...step.ops.filter(isNonUnitary)]
      : step.ops;
    for (const op of ops) {
      const kind = GATE_INFO[op.gate].kind;
      if (kind === 'barrier') continue;
      if (kind === 'measure' || kind === 'reset') {
        if (backend instanceof StateVector) backend = DensityMatrix.fromStateVector(backend);
        if (kind === 'measure') backend.measure(op.wires[0]);
        else backend.reset(op.wires[0]);
      } else {
        const params: number[] = [];
        let ok = true;
        for (const expr of op.params) {
          const v = parseAngle(expr);
          if (v === null) {
            ok = false;
            break;
          }
          params.push(v);
        }
        if (!ok) continue;
        backend.applyGate(gateMatrix(op.gate, params), op.wires, step.controls);
      }
    }
    bloch.push(snapshot(backend));
  }

  const probabilities = Array.from(backend.probabilities(), (p) => (p < 1e-12 ? 0 : p));
  const last = bloch[bloch.length - 1];
  let amplitudes: number[] | null;
  let purity: number;
  if (backend instanceof StateVector) {
    amplitudes = Array.from(backend.amplitudes());
    purity = 1;
  } else {
    const dm = backend as DensityMatrix;
    purity = dm.purity();
    const psi = dm.pureState();
    amplitudes = psi ? Array.from(psi) : null;
  }
  return {
    numQubits: n,
    bloch,
    probabilities,
    qubitP1: last.map((b) => b.probs.one),
    backend: needsDensity ? 'density' : 'statevector',
    amplitudes,
    purity,
  };
}
