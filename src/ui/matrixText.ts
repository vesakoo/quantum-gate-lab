import type { Mat } from '../sim/complex';
import type { MatrixSpec } from './gateDocs';
import { formatComplex, symbolicSqrt } from './ket';

/** |a|² below this is zero (as in the ket). */
const ZERO2 = 1e-10;
const TOL = 1e-7;

/**
 * Entries (interleaved re/im) as text. When every non-zero entry has the same magnitude s ≠ 1 and s
 * has a symbolic form, s is returned as the scalar and the entries keep only their phase.
 */
function entries(data: ArrayLike<number>): { scalar?: string; cells: string[] } {
  const count = data.length / 2;
  const mags: number[] = [];
  for (let i = 0; i < count; i++) {
    const m2 = data[2 * i] ** 2 + data[2 * i + 1] ** 2;
    if (m2 > ZERO2) mags.push(Math.sqrt(m2));
  }
  let s = 1;
  let scalar: string | undefined;
  if (mags.length > 0 && mags.every((m) => Math.abs(m - mags[0]) < TOL) && Math.abs(mags[0] - 1) > TOL) {
    const f = symbolicSqrt(mags[0] ** 2);
    if (f) {
      s = mags[0];
      scalar = f.den === '1' ? f.num : `${f.num}/${f.den}`;
    }
  }
  const cells = Array.from({ length: count }, (_, i) => formatComplex(data[2 * i] / s, data[2 * i + 1] / s));
  return scalar ? { scalar, cells } : { cells };
}

/** A square matrix as a `MatrixSpec`, with a common magnitude factored out when there is one. */
export function matrixSpec(m: Mat): MatrixSpec {
  const { scalar, cells } = entries(m.data);
  const rows = Array.from({ length: m.dim }, (_, r) => cells.slice(r * m.dim, (r + 1) * m.dim));
  return scalar ? { scalar, rows } : { rows };
}

/** A state vector (interleaved re/im) as a one-column `MatrixSpec`. */
export function vectorSpec(amp: ArrayLike<number>): MatrixSpec {
  const { scalar, cells } = entries(amp);
  const rows = cells.map((c) => [c]);
  return scalar ? { scalar, rows } : { rows };
}
