# Circuit as Operators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A panel below the Probabilities chart that writes the whole circuit as an unsimplified Unicode Dirac formula, e.g. `|ψ⟩ = (|0⟩⟨0| ⊗ I + |1⟩⟨1| ⊗ X) · (H ⊗ I) |00⟩`, with a Copy button.

**Architecture:** A pure model (`src/model/operators.ts`) turns a `Circuit` into factors → terms → slots; a pure renderer (`src/ui/operatorText.ts`) prints it; `OperatorView` shows it in `App`. A later matrix view will reuse the model.

**Tech Stack:** TypeScript, React, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-18-operator-formula-design.md`

## Global Constraints

- Unicode only; Copy puts exactly the displayed `|ψ⟩ = …` text on the clipboard.
- No simplification: every wire appears in every term (`H ⊗ I ⊗ I ⊗ I`).
- Separators exactly: slots ` ⊗ `, terms ` + `, factors ` · `, each factor in parentheses, one space before the input ket.
- Last step leftmost; q[0] leftmost slot and leftmost bit of the input ket.
- UI text in English. Panel title `Circuit as operators`.
- Branch: `feature/operator-formula`. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Circuit with no gates (or only barriers): formula is just `|ψ⟩ = |0000⟩` — test in Task 2.
- MEASURE/RESET in the very first used step: no factors, the input ket alone plus the stop note — tests in Tasks 1 and 3.
- 10+ qubits with an indexed column: multi-digit subscripts `SWAP₀,₁₀` — test in Task 2.
- Initial state with |1⟩ wires: input ket reflects `circuit.initial` — test in Task 2.
- A controlled column that also has a non-adjacent two-qubit gate: every term is indexed, not just the gate's term — test in Task 1 (flag) and Task 2 (text).

---

### Task 1: Operator model

**Files:**
- Create: `src/model/operators.ts`
- Test: `tests/model/operators.test.ts`

**Interfaces:**
- Consumes: `Circuit`, `Op`, `Control` from `src/model/circuit.ts`; `GATE_INFO`, `GateId` from `src/sim/gates.ts`; `parseAngle` from `src/sim/angle.ts`.
- Produces:
  ```ts
  export type SlotOp =
    | { kind: 'gate'; gate: GateId; params: string[] }
    | { kind: 'proj'; bit: 0 | 1 }   // |bit⟩⟨bit|
    | { kind: 'I' };
  export type Slot = { wires: number[]; op: SlotOp };   // wires: 1 entry, or the op's wires in op order for 2-qubit gates
  export type Term = Slot[];                             // covers every wire exactly once, sorted by Math.min(...wires)
  export type Factor = { step: number; terms: Term[]; indexed: boolean };
  export type CircuitOperators = {
    numQubits: number;
    initial: (0 | 1)[];
    factors: Factor[];                                   // circuit order (step 0 first)
    stoppedAt: { step: number; kind: 'measure' | 'reset' } | null;  // 0-based step
    invalidAngles: boolean;                              // any included gate has a param parseAngle rejects
  };
  export function circuitOperators(c: Circuit): CircuitOperators;
  ```

Rules (from the spec):
- Walk steps in order. The first step containing a MEASURE or RESET op stops the walk (`kind` = 'measure' if it has any MEASURE, else 'reset'); that step is not included.
- Skip a step whose ops are all BARRIER (or empty) and that has no controls. Explicit `I` gates are kept as `{kind:'gate', gate:'I'}`.
- Gate term: each unitary op becomes one slot at its wires; every other wire an `{kind:'I'}` slot.
- k controls, sorted by wire: k + 1 terms. Term j (0-based, j < k): controls 0…j−1 satisfied, control j unsatisfied, all other wires `I`. Last term: all controls satisfied plus the gate slots. Satisfied: `on1` → bit 1, `on0` → bit 0; unsatisfied is the other bit.
- `indexed` is true when any 2-qubit op in the step has `wires[1] !== wires[0] + 1`.

- [ ] **Step 1: Write the failing tests** (`describe('circuitOperators')`), building circuits with `emptyCircuit` like `tests/ui/ket.test.tsx`:
  - `bell`: 2 qubits, step0 H on 0, step1 X on 1 with control `{wire:0, kind:'on1'}` → 2 factors; factor[0].terms = `[[H@0, I@1]]`; factor[1].terms = `[[proj0@0, I@1], [proj1@0, X@1]]`; both `indexed: false`; `stoppedAt: null`.
  - `toffoli`: controls on 0,1 (on1), X on 2 → 3 terms: `[p0, I, I]`, `[p1, p0, I]`, `[p1, p1, X]`.
  - `anti-control`: control `on0` on 0, X on 1 → terms `[p1, I]`, `[p0, X]`.
  - `skips empty and barrier columns, keeps I gates`: steps [empty, BARRIER on 0, I on 1] → 1 factor with `step: 2`.
  - `adjacent two-qubit gate is one slot`: SWAP on [1,2] of 4 → term slots wires `[[0],[1,2],[3]]`, `indexed: false`.
  - `non-adjacent or reversed is indexed`: SWAP on [0,2] + H on 1 of 4 → slot order by min wire `[[0,2],[1],[3]]`, `indexed: true`; B on [1,0] → `indexed: true`, slot wires `[1,0]` first.
  - `controlled column with non-adjacent gate is indexed`: control on 1, SWAP on [0,2] → `indexed: true` (one flag covers every term).
  - `stops at the first measure/reset`: H, MEASURE, X → 1 factor, `stoppedAt: {step:1, kind:'measure'}`; RESET at step 0 → 0 factors, `stoppedAt: {step:0, kind:'reset'}`.
  - `invalidAngles`: RX with param `'foo'` → true; RX `'pi/2'` → false; an invalid angle after a measurement → false.
  - `initial` and `numQubits` copied from the circuit.

- [ ] **Step 2: Run** `npx vitest run tests/model/operators.test.ts` — expected FAIL (module not found).
- [ ] **Step 3: Implement** `circuitOperators` in `src/model/operators.ts` per the rules above (pure; no mutation of `c`).
- [ ] **Step 4: Run** `npx vitest run tests/model/operators.test.ts` — expected PASS; `npm run typecheck` — clean.
- [ ] **Step 5: Commit** `feat(model): circuit-to-operator model for the Dirac formula`.

### Task 2: Unicode renderer

**Files:**
- Create: `src/ui/operatorText.ts`
- Test: `tests/ui/operatorText.test.ts`

**Interfaces:**
- Consumes: `CircuitOperators`, `circuitOperators` (Task 1); `GATE_INFO` (`src/sim/gates.ts`); `formatAngle` (`src/ui/GateView.tsx`).
- Produces: `export function formatOperators(ops: CircuitOperators): string` — the full `|ψ⟩ = …` line; `export function subscript(n: number): string` (`12` → `₁₂`).

Rendering: factors reversed, joined ` · `, each `(` terms joined ` + ` `)`; term = slots joined ` ⊗ `; slot text: `I`, `|0⟩⟨0|`, gate label from `GATE_INFO[g].label` plus `(` params via `formatAngle` joined `,` `)` when it has params. In an `indexed` factor every slot gets its wires as subscripts joined `,` (`SWAP₀,₂`, `H₁`, `I₃`, `|1⟩⟨1|₁`). Then a space and the input ket `|` + initial bits + `⟩`. With no factors: `|ψ⟩ = |…⟩`.

- [ ] **Step 1: Write the failing tests** (build circuits, run `formatOperators(circuitOperators(c))`), exact strings:
  - Bell (2q): `|ψ⟩ = (|0⟩⟨0| ⊗ I + |1⟩⟨1| ⊗ X) · (H ⊗ I) |00⟩`
  - Bell on 4q: `|ψ⟩ = (|0⟩⟨0| ⊗ I ⊗ I ⊗ I + |1⟩⟨1| ⊗ X ⊗ I ⊗ I) · (H ⊗ I ⊗ I ⊗ I) |0000⟩`
  - Empty 4q circuit: `|ψ⟩ = |0000⟩`; initial `[0,1,0,0]` with no gates: `|ψ⟩ = |0100⟩`.
  - Params and daggers: RX `'pi/2'` on 0, Sdg on 1 (same step, 2q): `|ψ⟩ = (RX(π/2) ⊗ S†) |00⟩`; U `['pi','0','pi']`: `U(π,0,π)`.
  - Adjacent SWAP on [1,2] of 4: `|ψ⟩ = (I ⊗ SWAP ⊗ I) |0000⟩`.
  - Indexed: SWAP [0,2] + H on 1 of 4: `|ψ⟩ = (SWAP₀,₂ ⊗ H₁ ⊗ I₃) |0000⟩`; B on [1,0] of 2: `|ψ⟩ = (B₁,₀) |00⟩`.
  - Controlled + indexed: control on1 on 1, SWAP [0,2], 3q: `|ψ⟩ = (I₀ ⊗ |0⟩⟨0|₁ ⊗ I₂ + SWAP₀,₂ ⊗ |1⟩⟨1|₁) |000⟩`.
  - 11 qubits, SWAP [0,10]: output contains `SWAP₀,₁₀`; `subscript(12)` → `₁₂`.

  (Within a term, slots sort by `Math.min(...wires)` per Task 1, so `SWAP₀,₂` comes before `|1⟩⟨1|₁`.)

- [ ] **Step 2: Run** `npx vitest run tests/ui/operatorText.test.ts` — expected FAIL.
- [ ] **Step 3: Implement** `formatOperators` and `subscript` in `src/ui/operatorText.ts`.
- [ ] **Step 4: Run** `npx vitest run tests/ui/operatorText.test.ts` — expected PASS.
- [ ] **Step 5: Commit** `feat(ui): Unicode Dirac renderer for the operator model`.

### Task 3: Panel, App wiring, styles, README

**Files:**
- Create: `src/ui/OperatorView.tsx`
- Modify: `src/ui/App.tsx` (render after `ProbabilityChart`, ~line 307), `src/ui/styles.css` (next to `.ket-view` rules, ~line 928), `README.md` (after the Output state bullet, line 39)
- Test: `tests/ui/operatorView.test.tsx`

**Interfaces:**
- Consumes: `circuitOperators` (Task 1), `formatOperators` (Task 2).
- Produces: `export default function OperatorView({ circuit }: { circuit: Circuit })`.

Panel: `<section className="operator-view">`, header with `<h2>Circuit as operators</h2>` and a Copy button (same copied/“Copied!” pattern as `KetView`), formula `<p className="ket" aria-label="Circuit as operators formula">`, note `<p className="ket-note">Last step on the left · q[0] is the leftmost factor</p>`. If `stoppedAt`: `<p className="ket-note">Measurement at step {k} — the formula ends before it.</p>` (`Reset at step …` for reset; k = step + 1). If `invalidAngles`: `<p className="ket-note">Gates with invalid angles act as I in the simulation.</p>`. Memoize the model + text on `circuit`. In `App`, render `<OperatorView circuit={circuit} />` unconditionally after the ProbabilityChart block (not tied to `sim`). CSS: `.operator-view` gets the same box rules as `.ket-view` (extend the selectors, don't copy).

- [ ] **Step 1: Write the failing tests:**
  - `shows the formula`: render `OperatorView` with the 2q Bell circuit → `getByLabelText('Circuit as operators formula').textContent` is the Bell string from Task 2.
  - `copies the displayed text`: mock `navigator.clipboard.writeText`, click `Copy` → called with that same string; button shows `Copied!`.
  - `measurement note`: H then MEASURE → text contains `Measurement at step 2`; RESET at step 0 → `Reset at step 1` and formula `|ψ⟩ = |00⟩`.
  - `invalid angle note`: RX `'foo'` → note present.
  - `App renders it below the probabilities`: link a Bell circuit via `history.replaceState(null, '', '/#' + toHash(c))` (as in `tests/ui/ket.test.tsx`), `render(<App />)` → formula present, and the operator section follows the probability chart in document order (`chart.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING`).
- [ ] **Step 2: Run** `npx vitest run tests/ui/operatorView.test.tsx` — expected FAIL.
- [ ] **Step 3: Implement** `OperatorView`, wire into `App`, add CSS, add a README bullet: the "Circuit as operators" panel writes the circuit as an unsimplified Dirac operator product (last step leftmost, controls as projector sums, subscripts for non-adjacent two-qubit gates; stops at the first measure/reset) with a Copy button.
- [ ] **Step 4: Verify** `npm test` — all pass; `npm run build` — succeeds.
- [ ] **Step 5: Commit** `feat(ui): Circuit as operators panel below the probabilities`.
