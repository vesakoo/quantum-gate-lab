import type { Mat } from './complex';
import {
  applyGroups, bitMask, blochFrom, initialIndex, planGate,
  type Backend, type Bloch, type Control, type GatePlan,
} from './backend';
import type { StateVector } from './statevector';

/**
 * ρ → (U on the row index) ρ, i.e. applyGroups on every column, but looping column-innermost so
 * the d rows of each group are read contiguously (a strided column walk is cache-hostile).
 */
function applyLeft(rho: Float64Array, D: number, plan: GatePlan, m: Mat, scratch: Float64Array): void {
  const d = m.dim;
  const md = m.data;
  const { bases, offsets } = plan;
  if (d === 2) {
    const m00r = md[0], m00i = md[1], m01r = md[2], m01i = md[3];
    const m10r = md[4], m10i = md[5], m11r = md[6], m11i = md[7];
    for (let g = 0; g < bases.length; g++) {
      const r0 = 2 * (bases[g] + offsets[0]) * D;
      const r1 = 2 * (bases[g] + offsets[1]) * D;
      for (let c2 = 0; c2 < 2 * D; c2 += 2) {
        const ar = rho[r0 + c2], ai = rho[r0 + c2 + 1], br = rho[r1 + c2], bi = rho[r1 + c2 + 1];
        rho[r0 + c2] = m00r * ar - m00i * ai + m01r * br - m01i * bi;
        rho[r0 + c2 + 1] = m00r * ai + m00i * ar + m01r * bi + m01i * br;
        rho[r1 + c2] = m10r * ar - m10i * ai + m11r * br - m11i * bi;
        rho[r1 + c2 + 1] = m10r * ai + m10i * ar + m11r * bi + m11i * br;
      }
    }
    return;
  }
  const rowStart = new Int32Array(d);
  for (let g = 0; g < bases.length; g++) {
    for (let l = 0; l < d; l++) rowStart[l] = 2 * (bases[g] + offsets[l]) * D;
    for (let c2 = 0; c2 < 2 * D; c2 += 2) {
      for (let l = 0; l < d; l++) {
        scratch[2 * l] = rho[rowStart[l] + c2];
        scratch[2 * l + 1] = rho[rowStart[l] + c2 + 1];
      }
      for (let r = 0; r < d; r++) {
        let re = 0;
        let im = 0;
        const row = 2 * r * d;
        for (let k = 0; k < d; k++) {
          const ar = md[row + 2 * k], ai = md[row + 2 * k + 1];
          const br = scratch[2 * k], bi = scratch[2 * k + 1];
          re += ar * br - ai * bi;
          im += ar * bi + ai * br;
        }
        rho[rowStart[r] + c2] = re;
        rho[rowStart[r] + c2 + 1] = im;
      }
    }
  }
}

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

  /** Pure state |ψ⟩⟨ψ|: ρ[r][c] = ψ[r]·conj(ψ[c]). */
  static fromStateVector(sv: StateVector): DensityMatrix {
    const dm = new DensityMatrix(sv.n, new Array<0 | 1>(sv.n).fill(0));
    const a = sv.amplitudes();
    const D = dm.dim;
    const p = dm.rho;
    for (let r = 0; r < D; r++) {
      const ar = a[2 * r], ai = a[2 * r + 1];
      for (let c = 0; c < D; c++) {
        const br = a[2 * c], bi = a[2 * c + 1];
        const k = 2 * (r * D + c);
        p[k] = ar * br + ai * bi;
        p[k + 1] = ai * br - ar * bi;
      }
    }
    return dm;
  }

  /** ρ → CU ρ CU†: U on each column (row index varies), then conj(U) on each row. */
  applyGate(m: Mat, targets: number[], controls: Control[]): void {
    const plan = planGate(this.n, targets, controls);
    const scratch = new Float64Array(2 * m.dim);
    const D = this.dim;
    applyLeft(this.rho, D, plan, m, scratch);
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

  /** Tr(ρ²): 1 for a pure state, 1/2^n for the maximally mixed one. */
  purity(): number {
    let s = 0;
    for (let k = 0; k < this.rho.length; k++) s += this.rho[k] * this.rho[k];
    return s;
  }

  /**
   * If ρ is pure (Tr ρ² ≈ 1), a state vector ψ with ρ = |ψ⟩⟨ψ| (interleaved re/im, defined up to a
   * global phase), read off the column of the largest diagonal entry: ψ[r] = ρ[r][c] / √ρ[c][c].
   */
  pureState(tol = 1e-9): Float64Array | null {
    if (this.purity() < 1 - tol) return null;
    const D = this.dim;
    let c = 0;
    for (let i = 1; i < D; i++) if (this.rho[2 * (i * D + i)] > this.rho[2 * (c * D + c)]) c = i;
    const norm = Math.sqrt(this.rho[2 * (c * D + c)]);
    const out = new Float64Array(2 * D);
    for (let r = 0; r < D; r++) {
      out[2 * r] = this.rho[2 * (r * D + c)] / norm;
      out[2 * r + 1] = this.rho[2 * (r * D + c) + 1] / norm;
    }
    return out;
  }

  probabilities(): Float64Array {
    const D = this.dim;
    const out = new Float64Array(D);
    for (let i = 0; i < D; i++) out[i] = this.rho[2 * (i * D + i)];
    return out;
  }
}
