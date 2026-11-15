import type { Mat } from './complex';
import {
  applyGroups, bitMask, blochFrom, initialIndex, planGate,
  type Backend, type Bloch, type Control,
} from './backend';

/** Mixed-state backend: 2^n × 2^n complex density matrix, row-major, interleaved re/im. */
export class DensityMatrix implements Backend {
  readonly n: number;
  private readonly dim: number;
  private readonly rho: Float64Array;

  constructor(n: number, initial: (0 | 1)[]) {
    this.n = n;
    this.dim = 1 << n;
    this.rho = new Float64Array(2 * this.dim * this.dim);
    const i = initialIndex(n, initial);
    this.rho[2 * (i * this.dim + i)] = 1;
  }

  /** ρ → CU ρ CU†: U on each column (row index varies), then conj(U) on each row. */
  applyGate(m: Mat, targets: number[], controls: Control[]): void {
    const plan = planGate(this.n, targets, controls);
    const scratch = new Float64Array(2 * m.dim);
    const D = this.dim;
    for (let c = 0; c < D; c++) applyGroups(this.rho, 2 * c, 2 * D, plan, m, false, scratch);
    for (let r = 0; r < D; r++) applyGroups(this.rho, 2 * r * D, 2, plan, m, true, scratch);
  }

  /** Non-selective measurement: drop coherences between differing values of bit q. */
  measure(q: number): void {
    const b = bitMask(this.n, q);
    const D = this.dim;
    for (let r = 0; r < D; r++)
      for (let c = 0; c < D; c++)
        if ((r & b) !== (c & b)) {
          this.rho[2 * (r * D + c)] = 0;
          this.rho[2 * (r * D + c) + 1] = 0;
        }
  }

  /** ρ' = K0ρK0† + K1ρK1† with K0 = |0⟩⟨0|, K1 = |0⟩⟨1| on qubit q. */
  reset(q: number): void {
    const b = bitMask(this.n, q);
    const D = this.dim;
    const p = this.rho;
    for (let r = 0; r < D; r++) {
      if (r & b) continue;
      for (let c = 0; c < D; c++) {
        if (c & b) continue;
        const dst = 2 * (r * D + c);
        const src = 2 * ((r | b) * D + (c | b));
        p[dst] += p[src];
        p[dst + 1] += p[src + 1];
      }
    }
    for (let r = 0; r < D; r++)
      for (let c = 0; c < D; c++)
        if ((r | c) & b) {
          p[2 * (r * D + c)] = 0;
          p[2 * (r * D + c) + 1] = 0;
        }
  }

  bloch(q: number): Bloch {
    const b = bitMask(this.n, q);
    const D = this.dim;
    const p = this.rho;
    let p0 = 0;
    let p1 = 0;
    let re01 = 0;
    let im01 = 0;
    for (let i = 0; i < D; i++) {
      if (i & b) continue;
      const j = i | b;
      p0 += p[2 * (i * D + i)];
      p1 += p[2 * (j * D + j)];
      re01 += p[2 * (i * D + j)];
      im01 += p[2 * (i * D + j) + 1];
    }
    return blochFrom(2 * re01, -2 * im01, p0 - p1);
  }

  probabilities(): Float64Array {
    const D = this.dim;
    const out = new Float64Array(D);
    for (let i = 0; i < D; i++) out[i] = this.rho[2 * (i * D + i)];
    return out;
  }
}
