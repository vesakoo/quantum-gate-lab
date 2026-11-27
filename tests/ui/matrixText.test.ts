import { describe, expect, it } from 'vitest';
import { mat, type Mat } from '../../src/sim/complex';
import { gateMatrix } from '../../src/sim/gates';
import { matrixSpec, vectorSpec } from '../../src/ui/matrixText';

const r = Math.SQRT1_2;
const real = (rows: number[][]): Mat => mat(rows.map((row) => row.map((v): [number, number] => [v, 0])));

function mul(a: Mat, b: Mat): Mat {
  const d = a.dim;
  const out = new Float64Array(2 * d * d);
  for (let i = 0; i < d; i++)
    for (let j = 0; j < d; j++)
      for (let k = 0; k < d; k++) {
        const ar = a.data[2 * (i * d + k)], ai = a.data[2 * (i * d + k) + 1];
        const br = b.data[2 * (k * d + j)], bi = b.data[2 * (k * d + j) + 1];
        out[2 * (i * d + j)] += ar * br - ai * bi;
        out[2 * (i * d + j) + 1] += ar * bi + ai * br;
      }
  return { dim: d, data: out };
}

describe('matrixSpec / vectorSpec', () => {
  it('H factors out 1/√2', () => {
    expect(matrixSpec(gateMatrix('H'))).toEqual({ scalar: '1/√2', rows: [['1', '1'], ['1', '−1']] });
  });

  it('CX has no scalar', () => {
    const cx = real([[1, 0, 0, 0], [0, 0, 0, 1], [0, 0, 1, 0], [0, 1, 0, 0]]);
    expect(matrixSpec(cx)).toEqual({
      rows: [['1', '0', '0', '0'], ['0', '0', '0', '1'], ['0', '0', '1', '0'], ['0', '1', '0', '0']],
    });
  });

  it('numeric H·H reads as the identity', () => {
    const h = gateMatrix('H');
    expect(matrixSpec(mul(h, h))).toEqual({ rows: [['1', '0'], ['0', '1']] });
  });

  it('Bell vector factors out 1/√2', () => {
    expect(vectorSpec([r, 0, 0, 0, 0, 0, r, 0])).toEqual({ scalar: '1/√2', rows: [['1'], ['0'], ['0'], ['1']] });
  });

  it('unequal magnitudes keep decimals and no scalar', () => {
    const s = vectorSpec([Math.cos(0.5), 0, Math.sin(0.5), 0]);
    expect(s.scalar).toBeUndefined();
    expect(s.rows).toEqual([['0.878'], ['0.479']]);
  });

  it('H ⊗ H factors out 1/2', () => {
    const hh = real([[1, 1, 1, 1], [1, -1, 1, -1], [1, 1, -1, -1], [1, -1, -1, 1]].map((row) => row.map((v) => v / 2)));
    const s = matrixSpec(hh);
    expect(s.scalar).toBe('1/2');
    expect(s.rows[3]).toEqual(['1', '−1', '−1', '1']);
  });
});
