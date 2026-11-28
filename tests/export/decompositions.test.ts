import { describe, expect, it } from 'vitest';
import { DECOMP } from '../../src/export/decompositions';
import { stepMatrix } from '../../src/model/matrices';
import type { Mat } from '../../src/sim/complex';

function mul(a: Mat, b: Mat): Mat {
  const d = a.dim;
  const out = new Float64Array(2 * d * d);
  for (let r = 0; r < d; r++)
    for (let c = 0; c < d; c++)
      for (let k = 0; k < d; k++) {
        const ar = a.data[2 * (r * d + k)], ai = a.data[2 * (r * d + k) + 1];
        const br = b.data[2 * (k * d + c)], bi = b.data[2 * (k * d + c) + 1];
        out[2 * (r * d + c)] += ar * br - ai * bi;
        out[2 * (r * d + c) + 1] += ar * bi + ai * br;
      }
  return { dim: d, data: out };
}

describe('DECOMP', () => {
  for (const gate of ['B', 'ISWAP', 'SQSWAP'] as const) {
    it(`${gate} decomposition equals the lab gate exactly (incl. global phase)`, () => {
      let m: Mat | null = null;
      for (const d of DECOMP[gate]) {
        const s = stepMatrix(2, {
          ops: [{ id: 'd', gate: d.gate, wires: d.wires, params: [] }],
          controls: d.control === undefined ? [] : [{ wire: d.control, kind: 'on1' }],
        });
        m = m ? mul(s, m) : s;
      }
      const target = stepMatrix(2, { ops: [{ id: 't', gate, wires: [0, 1], params: [] }], controls: [] });
      for (let i = 0; i < target.data.length; i++) expect(Math.abs(m!.data[i] - target.data[i])).toBeLessThan(1e-12);
    });
  }
});
