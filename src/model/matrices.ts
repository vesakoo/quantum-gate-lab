import { parseAngle } from '../sim/angle';
import type { Mat } from '../sim/complex';
import { GATE_INFO, gateMatrix } from '../sim/gates';
import { StateVector } from '../sim/statevector';
import type { Circuit, Step } from './circuit';
import { circuitOperators, type CircuitOperators } from './operators';

/** Matrices are written out only up to this many qubits (2⁴ = 16 rows). */
export const MAX_MATRIX_QUBITS = 4;

export type CircuitMatrices = {
  numQubits: number;
  initial: (0 | 1)[];
  /** First step first; only steps with at least one unitary gate. */
  factors: { step: number; m: Mat }[];
  /** M_last · … · M_first (identity if there are no factors). */
  product: Mat;
  /** Basis vector of `initial`, interleaved re/im. */
  input: Float64Array;
  /** product · input */
  output: Float64Array;
  stoppedAt: CircuitOperators['stoppedAt'];
  invalidAngles: boolean;
};

const bits = (n: number, j: number): (0 | 1)[] =>
  Array.from({ length: n }, (_, q) => ((j >> (n - 1 - q)) & 1) as 0 | 1);

/**
 * The 2ⁿ×2ⁿ matrix of one step, built column by column by running the step on each basis state with
 * the simulator's own code, so wire order and controls match the simulation exactly. Gates whose
 * angle does not parse act as I, as in the simulator.
 */
export function stepMatrix(n: number, step: Step): Mat {
  const dim = 1 << n;
  const data = new Float64Array(2 * dim * dim);
  for (let j = 0; j < dim; j++) {
    const sv = new StateVector(n, bits(n, j));
    for (const op of step.ops) {
      if (GATE_INFO[op.gate].kind !== 'unitary') continue;
      const params = op.params.map(parseAngle);
      if (params.some((p) => p === null)) continue;
      sv.applyGate(gateMatrix(op.gate, params as number[]), op.wires, step.controls);
    }
    const col = sv.amplitudes();
    for (let i = 0; i < dim; i++) {
      data[2 * (i * dim + j)] = col[2 * i];
      data[2 * (i * dim + j) + 1] = col[2 * i + 1];
    }
  }
  return { dim, data };
}

function identity(dim: number): Mat {
  const data = new Float64Array(2 * dim * dim);
  for (let i = 0; i < dim; i++) data[2 * (i * dim + i)] = 1;
  return { dim, data };
}

function mul(a: Mat, b: Mat): Mat {
  const d = a.dim;
  const out = new Float64Array(2 * d * d);
  for (let r = 0; r < d; r++)
    for (let k = 0; k < d; k++) {
      const ar = a.data[2 * (r * d + k)];
      const ai = a.data[2 * (r * d + k) + 1];
      if (ar === 0 && ai === 0) continue;
      for (let c = 0; c < d; c++) {
        const br = b.data[2 * (k * d + c)];
        const bi = b.data[2 * (k * d + c) + 1];
        out[2 * (r * d + c)] += ar * br - ai * bi;
        out[2 * (r * d + c) + 1] += ar * bi + ai * br;
      }
    }
  return { dim: d, data: out };
}

/** The circuit as step matrices, their product and the product applied to the input; null above 4 qubits. */
export function circuitMatrices(c: Circuit): CircuitMatrices | null {
  const n = c.numQubits;
  if (n > MAX_MATRIX_QUBITS) return null;
  const ops = circuitOperators(c);
  const factors = ops.factors
    .map((f) => f.step)
    .filter((s) => c.steps[s].ops.some((o) => GATE_INFO[o.gate].kind === 'unitary'))
    .map((s) => ({ step: s, m: stepMatrix(n, c.steps[s]) }));
  const dim = 1 << n;
  const product = factors.reduce((acc, f) => mul(f.m, acc), identity(dim));
  const input = new StateVector(n, c.initial).amplitudes();
  const output = new Float64Array(2 * dim);
  for (let r = 0; r < dim; r++)
    for (let k = 0; k < dim; k++) {
      const pr = product.data[2 * (r * dim + k)];
      const pi = product.data[2 * (r * dim + k) + 1];
      output[2 * r] += pr * input[2 * k] - pi * input[2 * k + 1];
      output[2 * r + 1] += pr * input[2 * k + 1] + pi * input[2 * k];
    }
  return { numQubits: n, initial: c.initial.slice(), factors, product, input, output, stoppedAt: ops.stoppedAt, invalidAngles: ops.invalidAngles };
}
