export type Mat = { dim: number; data: Float64Array };

/** Build a matrix from rows of [re, im] pairs. */
export function mat(rows: [number, number][][]): Mat {
  const dim = rows.length;
  const data = new Float64Array(2 * dim * dim);
  rows.forEach((row, r) =>
    row.forEach(([re, im], c) => {
      data[2 * (r * dim + c)] = re;
      data[2 * (r * dim + c) + 1] = im;
    }),
  );
  return { dim, data };
}

export function matMul(a: Mat, b: Mat): Mat {
  const n = a.dim;
  const data = new Float64Array(2 * n * n);
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      let re = 0;
      let im = 0;
      for (let k = 0; k < n; k++) {
        const ar = a.data[2 * (r * n + k)];
        const ai = a.data[2 * (r * n + k) + 1];
        const br = b.data[2 * (k * n + c)];
        const bi = b.data[2 * (k * n + c) + 1];
        re += ar * br - ai * bi;
        im += ar * bi + ai * br;
      }
      data[2 * (r * n + c)] = re;
      data[2 * (r * n + c) + 1] = im;
    }
  return { dim: n, data };
}

/** Conjugate transpose. */
export function dagger(a: Mat): Mat {
  const n = a.dim;
  const data = new Float64Array(2 * n * n);
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      data[2 * (c * n + r)] = a.data[2 * (r * n + c)];
      data[2 * (c * n + r) + 1] = -a.data[2 * (r * n + c) + 1];
    }
  return { dim: n, data };
}

export function approxEqual(a: Mat, b: Mat, tol = 1e-9): boolean {
  if (a.dim !== b.dim) return false;
  for (let i = 0; i < a.data.length; i++) if (Math.abs(a.data[i] - b.data[i]) > tol) return false;
  return true;
}

export function isUnitary(a: Mat): boolean {
  const n = a.dim;
  const id = new Float64Array(2 * n * n);
  for (let i = 0; i < n; i++) id[2 * (i * n + i)] = 1;
  return approxEqual(matMul(a, dagger(a)), { dim: n, data: id });
}
