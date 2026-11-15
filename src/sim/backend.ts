import type { Mat } from './complex';

export type ControlKind = 'on1' | 'on0';
export type Control = { wire: number; kind: ControlKind };

export type Bloch = {
  x: number;
  y: number;
  z: number;
  length: number;
  mixed: boolean;
  probs: { zero: number; one: number; plus: number; minus: number; plusI: number; minusI: number };
};

export interface Backend {
  readonly n: number;
  applyGate(m: Mat, targets: number[], controls: Control[]): void;
  measure(q: number): void;
  reset(q: number): void;
  bloch(q: number): Bloch;
  probabilities(): Float64Array;
}

const clean = (v: number): number => {
  const c = Math.max(-1, Math.min(1, v));
  return Math.abs(c) < 1e-12 ? 0 : c;
};

export function blochFrom(x: number, y: number, z: number): Bloch {
  x = clean(x);
  y = clean(y);
  z = clean(z);
  const length = Math.sqrt(x * x + y * y + z * z);
  return {
    x,
    y,
    z,
    length,
    mixed: length < 1 - 1e-6,
    probs: {
      zero: (1 + z) / 2,
      one: (1 - z) / 2,
      plus: (1 + x) / 2,
      minus: (1 - x) / 2,
      plusI: (1 + y) / 2,
      minusI: (1 - y) / 2,
    },
  };
}

/** Bit mask of qubit q in a global basis index (q0 is the most significant bit). */
export const bitMask = (n: number, q: number): number => 1 << (n - 1 - q);

/**
 * Index groups for applying a k-target gate with controls on n qubits.
 * `bases` holds every global index whose target bits are all 0 and whose controls are
 * satisfied; `offsets[l]` is the global offset for gate-local index l (targets[0] = MSB).
 */
export type GatePlan = { bases: Int32Array; offsets: Int32Array };

export function planGate(n: number, targets: number[], controls: Control[]): GatePlan {
  const k = targets.length;
  const offsets = new Int32Array(1 << k);
  for (let l = 0; l < 1 << k; l++) {
    let off = 0;
    for (let j = 0; j < k; j++) if (l & (1 << (k - 1 - j))) off |= bitMask(n, targets[j]);
    offsets[l] = off;
  }
  let targetMask = 0;
  for (const t of targets) targetMask |= bitMask(n, t);
  let ctrlMask = 0;
  let ctrlWant = 0;
  for (const c of controls) {
    const b = bitMask(n, c.wire);
    ctrlMask |= b;
    if (c.kind === 'on1') ctrlWant |= b;
  }
  const size = 1 << n;
  const bases: number[] = [];
  for (let i = 0; i < size; i++)
    if ((i & targetMask) === 0 && (i & ctrlMask) === ctrlWant) bases.push(i);
  return { bases: Int32Array.from(bases), offsets };
}

/**
 * Apply matrix m (optionally conjugated) in place to the complex vectors embedded in buf.
 * Element at global index i of the vector lives at buf[start + i*stride] (re) and +1 (im).
 * `scratch` must hold at least 2*m.dim numbers.
 */
export function applyGroups(
  buf: Float64Array,
  start: number,
  stride: number,
  plan: GatePlan,
  m: Mat,
  conj: boolean,
  scratch: Float64Array,
): void {
  const d = m.dim;
  const md = m.data;
  const sgn = conj ? -1 : 1;
  const { bases, offsets } = plan;
  if (d === 2) {
    // fast path for single-target gates
    const m00r = md[0], m00i = sgn * md[1], m01r = md[2], m01i = sgn * md[3];
    const m10r = md[4], m10i = sgn * md[5], m11r = md[6], m11i = sgn * md[7];
    const o1 = offsets[1] * stride;
    for (let g = 0; g < bases.length; g++) {
      const p0 = start + bases[g] * stride;
      const p1 = p0 + o1;
      const ar = buf[p0], ai = buf[p0 + 1], br = buf[p1], bi = buf[p1 + 1];
      buf[p0] = m00r * ar - m00i * ai + m01r * br - m01i * bi;
      buf[p0 + 1] = m00r * ai + m00i * ar + m01r * bi + m01i * br;
      buf[p1] = m10r * ar - m10i * ai + m11r * br - m11i * bi;
      buf[p1 + 1] = m10r * ai + m10i * ar + m11r * bi + m11i * br;
    }
    return;
  }
  for (let g = 0; g < bases.length; g++) {
    const base = bases[g];
    for (let l = 0; l < d; l++) {
      const p = start + (base + offsets[l]) * stride;
      scratch[2 * l] = buf[p];
      scratch[2 * l + 1] = buf[p + 1];
    }
    for (let r = 0; r < d; r++) {
      let re = 0;
      let im = 0;
      const row = 2 * r * d;
      for (let c = 0; c < d; c++) {
        const ar = md[row + 2 * c];
        const ai = sgn * md[row + 2 * c + 1];
        const br = scratch[2 * c];
        const bi = scratch[2 * c + 1];
        re += ar * br - ai * bi;
        im += ar * bi + ai * br;
      }
      const p = start + (base + offsets[r]) * stride;
      buf[p] = re;
      buf[p + 1] = im;
    }
  }
}

/** Global basis index for initial bits (q0 is the most significant bit). */
export function initialIndex(n: number, initial: (0 | 1)[]): number {
  let idx = 0;
  for (let q = 0; q < n; q++) if (initial[q]) idx |= bitMask(n, q);
  return idx;
}
