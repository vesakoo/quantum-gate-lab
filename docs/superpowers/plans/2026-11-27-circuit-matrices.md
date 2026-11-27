# Circuit as Matrices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Circuit as matrices" panel below "Circuit as operators". It shows each step's written-out
matrix, their product U, and U applied to the input with the result. Up to 4 qubits.

**Architecture:**
- A pure model `src/model/matrices.ts` builds each step's 2ⁿ×2ⁿ matrix column by column by running the
  step on a `StateVector` (the same code path as `simulate`). It reuses `circuitOperators` for the
  stop and invalid-angle logic.
- `src/ui/matrixText.ts` turns numbers into `MatrixSpec`, with a common magnitude factored out.
- `src/ui/MatrixProductView.tsx` renders the result with `MatrixView`.

**Tech Stack:** React 18, TypeScript, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-27-circuit-matrices-design.md`

## Global Constraints
- The panel heading is `Circuit as matrices`. It sits directly below `<OperatorView>` in `App.tsx`.
- More than 4 qubits: only the note `Matrices are written out up to 4 qubits`.
- The stop note and invalid-angle note use the operator panel's wording, with "formula" kept:
  - `Measurement at step N — the formula ends before that step, including its other gates.` (or `Reset …`)
  - `Gates with invalid angles act as I in the simulation.`
- Steps with no unitary gate are skipped. With no factors the first line is `U = I`, and I is still
  written out.
- No Copy button. No colour literals; existing tokens only. `npm test`, `npm run typecheck`, and
  `npm run a11y` (0 failures) stay green.

## Review Focus
1. CX with control q[1] and target q[0] on 2 qubits gives exactly the user's screenshot
   `[[1,0,0,0],[0,0,0,1],[0,0,1,0],[0,1,0,0]]`, with q[0] as the MSB. → Task 1 test.
2. Reversed or non-adjacent wires (CX wires [2,0] on 3 qubits), the B gate, and anti-controls: the
   `output` must equal `simulate(c).amplitudes`. → Task 1 consistency test.
3. MEASURE in a step together with other gates: the whole step and everything after it are left out.
   → Task 1 test.
4. Rounding noise in a product (H·H): it reads as the identity, with entries `1`/`0`, no scalar and no
   `−0.000`. → Task 2 test.
5. Exactly 4 qubits renders, and 5 qubits gives only the note. → Task 1 and Task 3 tests.

---

### Task 1: matrix model

**Files:**
- Create: `src/model/matrices.ts`
- Test: `tests/model/matrices.test.ts` (use the `op`/`circ` helpers as in `tests/ui/operatorView.test.tsx`)

**Interfaces:**
- Consumes: `circuitOperators(c)` (`factors[].step`, `stoppedAt`, `invalidAngles`), `StateVector`,
  `gateMatrix`, `parseAngle`, `GATE_INFO`.
- Produces:
  ```ts
  export const MAX_MATRIX_QUBITS = 4;
  export type CircuitMatrices = {
    numQubits: number;
    initial: (0 | 1)[];
    factors: { step: number; m: Mat }[];   // step order (first step first), only steps with ≥1 unitary gate
    product: Mat;                          // M_last · … · M_first (identity if no factors)
    input: Float64Array;                   // basis vector of `initial`, interleaved re/im
    output: Float64Array;                  // product · input
    stoppedAt: CircuitOperators['stoppedAt'];
    invalidAngles: boolean;
  };
  export function stepMatrix(n: number, step: Step): Mat;
  export function circuitMatrices(c: Circuit): CircuitMatrices | null; // null when numQubits > 4
  ```

- [ ] **Step 1: Write the failing tests** (`describe('circuitMatrices')`, helper `rows(m: Mat)` →
  rounded `[re, im]` arrays or real numbers when im ≈ 0):
  - `CX control q[1] → target q[0] is the screenshot matrix`: `stepMatrix(2, {ops:[op('X',[0])], controls:[on1(1)]})`
    has real rows `[[1,0,0,0],[0,0,0,1],[0,0,1,0],[0,1,0,0]]`.
  - `H on q[0] of 2 qubits is H ⊗ I`: rows `r·[[1,0,1,0],[0,1,0,1],[1,0,−1,0],[0,1,0,−1]]` with r = 1/√2.
  - `product is last step on the left`: for H on q[0] then CX (control q[0], target q[1]), `product`
    equals `factors[1].m · factors[0].m`, and `output` is `[r,0, 0,0, 0,0, r,0]`.
  - `output matches simulate`, for each of:
    - CX wires [2,0] on 3 qubits after H on q[2]
    - B on [1,0] with input |01⟩
    - an RY('pi/3') with an anti-control `{wire:0,kind:'on0'}` on 2 qubits

    For each, `output` equals `simulate(c).amplitudes` within 1e-12.
  - `empty and barrier-only steps are skipped`: `factors.map(f => f.step)` for steps `[[], [H], [BARRIER], [X]]`
    is `[1, 3]`. With no steps, `product` is the identity and `output === input`.
  - `measure stops before its step`: steps `[[H q0], [MEASURE q0, H q1], [X q1]]` give `factors.length === 1`
    and `stoppedAt` `{ step: 1, kind: 'measure' }`.
  - `invalid angle acts as I and is flagged`: RX('abc') on 1 qubit gives `factors[0].m` = identity and
    `invalidAngles === true`.
  - `4 qubits works, 5 gives null`.
- [ ] **Step 2:** `npx vitest run tests/model/matrices.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement.**
  - `stepMatrix`: for each column j, build a `StateVector(n, bits of j with q[0] as MSB)`. Apply the
    step's unitary ops with parsed params via `applyGate(gateMatrix(..), op.wires, step.controls)`,
    skipping ops whose angle does not parse. The amplitudes are column j.
  - `circuitMatrices`: take the steps from `circuitOperators(c).factors`, keeping those with ≥1
    unitary gate (controls-only steps are the identity). Multiply with a small local complex matmul.
- [ ] **Step 4:** same command → PASS; `npm test` green.
- [ ] **Step 5: Commit** `feat(model): circuit step matrices from the simulator`.

### Task 2: matrix text

**Files:**
- Create: `src/ui/matrixText.ts`
- Test: `tests/ui/matrixText.test.ts`

**Interfaces:**
- Consumes: `formatComplex`, `symbolicSqrt` (`src/ui/ket.ts`), `MatrixSpec` (`src/ui/gateDocs.ts`), `Mat`.
- Produces: `export function matrixSpec(m: Mat): MatrixSpec` and
  `export function vectorSpec(amp: ArrayLike<number>): MatrixSpec` (a column: one-entry rows).

**Scalar rule:** take the entries with |a|² > 1e-10. If they all have the same magnitude s (within
1e-7), s is not ≈ 1, and `symbolicSqrt(s²)` gives `{num, den}`, then set
`scalar = den === '1' ? num : \`${num}/${den}\`` and write each entry as `formatComplex(re/s, im/s)`.
Otherwise there is no scalar and each entry is `formatComplex(re, im)`.

- [ ] **Step 1: Write the failing tests**
  - H → `{ scalar: '1/√2', rows: [['1','1'],['1','−1']] }`
  - CX (from `gateMatrix('CX')` or the Task 1 screenshot matrix) → no `scalar`, entries `'1'`/`'0'`
  - numeric H·H → identity rows `[['1','0'],['0','1']]`, no `scalar`
  - `vectorSpec([r,0,0,0,0,0,r,0])` → `{ scalar: '1/√2', rows: [['1'],['0'],['0'],['1']] }`
  - RY(1)|0⟩ amplitudes → no `scalar`, decimal entries such as `'0.878'`
  - 2-qubit H⊗H (all ±½) → `scalar: '1/2'`
- [ ] **Step 2:** `npx vitest run tests/ui/matrixText.test.ts` → FAIL.
- [ ] **Step 3: Implement** both functions with the scalar rule above. They share one helper over a
  flat list of entries.
- [ ] **Step 4:** PASS; `npm test` green.
- [ ] **Step 5: Commit** `feat(ui): matrix text with a common scalar`.

### Task 3: the panel

**Files:**
- Create: `src/ui/MatrixProductView.tsx`
- Modify: `src/ui/App.tsx` (render `<MatrixProductView circuit={circuit} />` right after `<OperatorView>`),
  `src/ui/styles.css` (`.matrix-view`, styled like `.operator-view`; `.matrix-product` with
  `display: flex; flex-wrap: wrap; align-items: center; gap`; `.matrix-term` with the caption under
  the matrix; tokens only)
- Test: `tests/ui/matrixProductView.test.tsx`

**Interfaces:**
- Consumes: `circuitMatrices`, `MAX_MATRIX_QUBITS` (Task 1); `matrixSpec`, `vectorSpec` (Task 2); `MatrixView`.

**Markup:**
- `<section className="matrix-view">` with `<h2>Circuit as matrices</h2>`.
- Line 1 is `<div className="matrix-product" aria-label="Circuit matrix product">` containing `U =`,
  then each factor last-step-first as a `.matrix-term` (MatrixView plus `<span className="matrix-caption">step N</span>`,
  1-based), separated by `·`, then `=` and the product.
  - With exactly one factor: `U =` and that one term only, with no repeated product.
  - With none: `U = I =` and the identity.
- Line 2 is `<div className="matrix-product" aria-label="Circuit matrix applied to the input">`
  containing `U·|<initial bits>⟩ =`, the product, `·`, the input column, `=`, and the output column.
- Then the notes (`.ket-note`), as in the Global Constraints.

- [ ] **Step 1: Write the failing tests**
  - Bell circuit (H q0; X q1 with control q0): line 1 has 3 `[role=table]` matrices and the captions
    `step 2`, `step 1` in that order. Line 2 text starts with `U·|00⟩ =` and has 3 tables. The last
    table's cells read `1,0,0,1` and `1/√2` is shown as its scalar.
  - one H on 1 qubit: line 1 has exactly 1 table.
  - empty 1-qubit circuit: line 1 text contains `U = I`.
  - measurement note, using the operator wording and `circ(2, [[[H q0]], [[MEASURE q0, H q1]]])`.
  - invalid-angle note.
  - 5 qubits: `Matrices are written out up to 4 qubits` and no `[role=table]` in the section.
    4 qubits: tables are present.
  - App-level: the `Circuit as matrices` heading appears after `Circuit as operators` in document order.
  - CSS: the `.matrix-product` body contains `flex-wrap: wrap` (read `styles.css?raw` as in
    `tests/ui/blochPolarLabels.test.ts`).
- [ ] **Step 2:** `npx vitest run tests/ui/matrixProductView.test.tsx` → FAIL.
- [ ] **Step 3: Implement** as specified. Use `useMemo` on `circuit`.
- [ ] **Step 4:** `npm test` and `npm run typecheck` → green; `npm run a11y` → 0 failures.
- [ ] **Step 5: Commit** `feat(ui): circuit as matrices panel`.
