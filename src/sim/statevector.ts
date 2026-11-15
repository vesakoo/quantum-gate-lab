import type { Mat } from './complex';
import {
  applyGroups, bitMask, blochFrom, initialIndex, planGate,
  type Backend, type Bloch, type Control,
} from './backend';

/** Pure-state backend: 2^n complex amplitudes, interleaved re/im. */
export class StateVector implements Backend {
  readonly n: number;
  private readonly amp: Float64Array;

  constructor(n: number, initial: (0 | 1)[]) {
    this.n = n;
    this.amp = new Float64Array(2 << n);
    this.amp[2 * initialIndex(n, initial)] = 1;
  }

  applyGate(m: Mat, targets: number[], controls: Control[]): void {
    const scratch = new Float64Array(2 * m.dim);
    applyGroups(this.amp, 0, 2, planGate(this.n, targets, controls), m, false, scratch);
  }

  measure(_q: number): void {
    throw new Error('use DensityMatrix');
  }

  reset(_q: number): void {
    throw new Error('use DensityMatrix');
  }

  bloch(q: number): Bloch {
    const b = bitMask(this.n, q);
    const a = this.amp;
    let p0 = 0;
    let p1 = 0;
    let re01 = 0;
    let im01 = 0;
    for (let i = 0; i < 1 << this.n; i++) {
      if (i & b) continue;
      const ar = a[2 * i], ai = a[2 * i + 1];
      const br = a[2 * (i | b)], bi = a[2 * (i | b) + 1];
      p0 += ar * ar + ai * ai;
      p1 += br * br + bi * bi;
      // ρ01 += a0 * conj(a1)
      re01 += ar * br + ai * bi;
      im01 += ai * br - ar * bi;
    }
    return blochFrom(2 * re01, -2 * im01, p0 - p1);
  }

  probabilities(): Float64Array {
    const size = 1 << this.n;
    const out = new Float64Array(size);
    for (let i = 0; i < size; i++) out[i] = this.amp[2 * i] ** 2 + this.amp[2 * i + 1] ** 2;
    return out;
  }
}
