# Circuit Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export the current circuit as Qiskit Python (every circuit) and OpenQASM 2.0 (when it fits), from an Export… dialog.

**Architecture:** Pure functions in `src/export/`. `lower()` turns a `Circuit` into a flat, validated op list. The two emitters `toQiskit()` and `toQasm2()` turn that list into text. Decompositions (B, iSWAP, √SWAP) are data in one module, used by the emitters and checked against the lab's own simulator in tests. `ExportDialog.tsx` shows the result and is opened from the toolbar.

**Tech Stack:** React 18, TypeScript, Vitest (jsdom). A throwaway Python venv with Qiskit for one cross-check; it is not a project dependency.

**Spec:** `docs/superpowers/specs/2026-11-28-circuit-export-design.md`

## Global Constraints

- Wire numbering is unchanged: lab `q[i]` → target `q[i]`. The circuit is not reordered for Qiskit's bit order. A comment explains it instead.
- Controls in a step attach to **each** unitary op of that step. A hollow control is `kind: 'on0'`.
- OpenQASM 2.0 targets **Qiskit's extended `qelib1.inc`** (`sx`, `sxdg`, `p`, `cp`, `csx` allowed), and the header comment says so.
- If the circuit has no MEASURE, both exports add a measurement of every qubit at the end with a comment. Otherwise nothing is added.
- An unparseable angle anywhere means no code for either target, only a message naming the gate.
- Copy text is fixed by the spec: the OpenQASM refusal reads `Step N: <label> with <k> control(s) has no OpenQASM 2.0 gate. Use the Qiskit tab.`
- No new runtime dependencies.

## Review Focus

1. **Hollow controls in Qiskit `ctrl_state`.** Qiskit's string is little-endian over the control list: the rightmost char belongs to the first control. Mixed on0/on1 controls must come out right (Task 2 test "ctrl_state is little-endian").
2. **Reversed and non-adjacent wires.** CX with the target above the control, SWAP `[2,0]`, B with `wires [2,0]` (H on q2). These must keep the roles, not sort the wires (Task 1 and Task 3 tests).
3. **Several gates in one controlled step.** E.g. X on q1 and H on q2 with a control on q0: each gate is controlled (Task 1 test).
4. **Empty circuit and measure-first circuits.** An empty circuit exports only the final measurement. A circuit whose measure comes first and is followed by gates gets no extra measurement (Task 2 and Task 3 tests).
5. **Angle text.** `3*π/4` becomes `3*pi/4`. `-pi/2` stays as it is. A valid lab expression that is not target syntax falls back to its number (Task 1 test).

---

### Task 1: Lowering and decompositions

**Files:**
- Create: `src/export/lower.ts`, `src/export/decompositions.ts`
- Test: `tests/export/lower.test.ts`, `tests/export/decompositions.test.ts`

**Interfaces:**
- Consumes: `Circuit`, `Op`, `Control` from `src/model/circuit`, `GATE_INFO`/`GateId` from `src/sim/gates`, `parseAngle` from `src/sim/angle`, and `stepMatrix` from `src/model/matrices` (tests only).
- Produces:
  ```ts
  export type ExportOp =
    | { kind: 'gate'; step: number; gate: GateId; wires: number[]; params: string[]; controls: Control[] }
    | { kind: 'measure' | 'reset' | 'barrier'; step: number; wire: number };
  export type Lowered = { numQubits: number; initialOnes: number[]; ops: ExportOp[]; finalMeasure: boolean };
  export type LowerError = { kind: 'invalid-angle'; step: number; gate: GateId; wires: number[]; param: string };
  export function lower(c: Circuit): { ok: true; value: Lowered } | { ok: false; error: LowerError };
  export function angleText(expr: string): string; // target-syntax angle
  // decompositions.ts
  export type DecompOp = { gate: GateId; wires: number[]; control?: number }; // local wires 0/1
  export const DECOMP: { B: DecompOp[]; ISWAP: DecompOp[]; SQSWAP: DecompOp[] };
  ```
  `step` is 0-based. `params` are already `angleText`-converted. Gates with `GATE_INFO[g].kind === 'unitary'` become `'gate'`. The I gate is dropped. Steps with no ops emit nothing. `controls` are the step's controls sorted by wire.

- [ ] **Step 1: Write failing tests** in `tests/export/lower.test.ts`. Build circuits with `emptyCircuit` and literal ops, as in `tests/model/matrices.test.ts`.
  - `initial |1⟩ goes to initialOnes`: `initial [0,1,1]` → `initialOnes` equals `[1, 2]`.
  - `controls attach to each gate of the step`: step 0 has X on q1 and H on q2 with an on1 control on q0. Both ops have `controls` equal to `[{ wire: 0, kind: 'on1' }]`.
  - `wire roles are kept`: B with `wires [2,0]` lowers to `wires: [2, 0]`.
  - `finalMeasure`: true for a circuit with no MEASURE (including the empty circuit). False when step 0 has MEASURE on q0 and step 1 has H on q0.
  - `measure/reset/barrier`: each becomes its own kind with the right `wire` and `step`.
  - `invalid angle refuses`: RX `['pi/']` at step 2 on q1 → `{ ok: false, error: { kind: 'invalid-angle', step: 2, gate: 'RX', wires: [1], param: 'pi/' } }`.
  - `angleText`: `'3*π/4'` → `'3*pi/4'`, `'-pi/2'` → `'-pi/2'`, `' pi '` → `'pi'`, `'π'` → `'pi'`, `'0.5'` → `'0.5'`.

  In `tests/export/decompositions.test.ts`, test `each decomposition equals the lab gate exactly`. For B, ISWAP and SQSWAP, multiply `stepMatrix(2, …)` over the `DECOMP` ops: one step per op, with `control` as an on1 Control. Compare to `stepMatrix(2, { ops: [{ gate, wires: [0, 1] }] })` entrywise within 1e-12. The comparison includes global phase.
- [ ] **Step 2: Run** `npx vitest run tests/export`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement `lower` and `angleText`.** `angleText` replaces `π` with `pi` and trims. If the result, with `pi` removed, matches `/^[\d.\s+\-*/()]*$/`, it is returned as is. Otherwise it returns `String(parseAngle(expr))`.

  The decompositions are fixed:
  - `B` = `h 0; cx 0→1`
  - `ISWAP` = `s 0; s 1; h 0; cx 0→1; cx 1→0; h 1`
  - `SQSWAP` = `cx 1→0; csx 0→1; cx 1→0`, where `csx` is `{ gate: 'SX', wires: [1], control: 0 }`.

  If the exactness test fails for one, fix the sequence. Do not loosen the test.
- [ ] **Step 4: Run** `npx vitest run tests/export`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(export): lower circuits to an export op list; exact B/iSWAP/√SWAP decompositions`.

### Task 2: Qiskit emitter

**Files:**
- Create: `src/export/qiskit.ts`
- Test: `tests/export/qiskit.test.ts`

**Interfaces:**
- Consumes: `Lowered`, `ExportOp`, `DECOMP` (Task 1).
- Produces: `export function toQiskit(l: Lowered, shareUrl: string): string`.

Output shape, top to bottom:
1. **Header comments:** `# Exported from Quantum Gate Lab`, the share URL, and the bit-order note: `# Bit order: the lab writes q[0] as the leftmost bit, Qiskit as the rightmost. Lab |<bits>⟩ is Qiskit key '<reversed>'.`, with `<bits>` being the circuit's `initial` bits.
2. **Imports:** `from math import pi`, `from qiskit import QuantumCircuit`, and `from qiskit.circuit.library import …`. Import only what is used.
3. **Helper gates,** only when used: `SQSWAP` and `BELL`, each built as a 2-qubit `QuantumCircuit(2, name='sqswap'|'bell')` from `DECOMP` and `.to_gate()`.
4. `qc = QuantumCircuit(n, n)`, then the ops, then the final measurement if `finalMeasure`: `qc.measure(range(n), range(n))  # added: hardware returns counts only after measurement`.

**Per op:**
- **No controls:** use the method (`qc.h(0)`, `qc.rx(pi/4, 1)`, `qc.u(θ, φ, λ, 0)`, `qc.swap(0, 2)`, `qc.iswap(0, 1)`). For B, write `qc.h(a)` then `qc.cx(a, b)`. For √SWAP, write `qc.append(SQSWAP, [a, b])`.
- **One on1 control,** with a gate in {X, Y, Z, H, SX, SWAP, RX, RY, RZ, P}: use `qc.cx/cy/cz/ch/csx/cswap/crx/cry/crz/cp`. Two on1 controls on X use `qc.ccx`.
- **Any other controlled op:** `qc.append(<Gate>.control(k, ctrl_state='<s>'), [*controls, *wires])`, where `<Gate>` is the library gate (`HGate()`, `UGate(θ, φ, λ)`, `iSwapGate()`, `SQSWAP`, `BELL`, …). `<s>` has char `k-1-j` equal to `'1'` when control j is on1.
- **measure/reset/barrier:** `qc.measure(i, i)`, `qc.reset(i)`, `qc.barrier(i)`.

- [ ] **Step 1: Write failing tests** (exact line assertions with `toContain`):
  - `CNOT`: H on q0, then X on q1 with on1 control q0 → contains `qc.h(0)` and `qc.cx(0, 1)`, and the measure line.
  - `ctrl_state is little-endian`: H on q2 with controls q0 on0 and q1 on1 → contains `qc.append(HGate().control(2, ctrl_state='10'), [0, 1, 2])`.
  - `reversed CX keeps roles`: X on q0 with on1 control q2 → `qc.cx(2, 0)`.
  - `angles`: RZ `['3*π/4']` on q1 → `qc.rz(3*pi/4, 1)`.
  - `B and √SWAP`: an uncontrolled B `[2,0]` gives `qc.h(2)` then `qc.cx(2, 0)`. √SWAP defines `SQSWAP` once and appends it.
  - `initial ones`: `initial [1,0]` → `qc.x(0)` comes before the first gate, and the header has `Lab |10⟩ is Qiskit key '01'`.
  - `empty circuit`: only the measure line after `qc = QuantumCircuit(3, 3)`.
  - `own measure, no extra`: MEASURE q0 then H q0 → contains `qc.measure(0, 0)` and not `range(`.
  - `share URL in header`: the passed URL appears on line 2.
- [ ] **Step 2: Run** `npx vitest run tests/export/qiskit.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `toQiskit`.**
- [ ] **Step 4: Run** it. Expected: PASS.
- [ ] **Step 5: Commit** `feat(export): Qiskit Python emitter`.

### Task 3: OpenQASM 2.0 emitter

**Files:**
- Create: `src/export/qasm2.ts`
- Test: `tests/export/qasm2.test.ts`

**Interfaces:**
- Consumes: `Lowered`, `DECOMP`, `GATE_INFO` (for labels in messages).
- Produces: `export function toQasm2(l: Lowered, shareUrl: string): { ok: true; code: string } | { ok: false; message: string }`.

**Output:**
- **Header:**
  - `// Exported from Quantum Gate Lab`
  - the URL
  - `// Uses Qiskit's qelib1.inc (sx, sxdg, p, cp, csx)`
  - the same bit-order note as Qiskit
  - `OPENQASM 2.0;`
  - `include "qelib1.inc";`
- **Gate definitions,** only when used:
  - `gate iswap a,b { … }` from `DECOMP.ISWAP`
  - `gate sqswap a,b { … }` from `DECOMP.SQSWAP`
- **Registers:** `qreg q[n];` and `creg c[n];`. Then `x q[i];` for initial ones, the ops, and the final `measure q -> c;` with its comment.

**Mapping:**
- **Uncontrolled:** the lowercase name (`id` is never emitted, since I is dropped). U becomes `u3(θ,φ,λ)`. B becomes `h` then `cx`. ISWAP becomes `iswap`, SQSWAP becomes `sqswap`.
- **One control:**

  | Gate | QASM |
  |---|---|
  | X, Y, Z, H | `cx`, `cy`, `cz`, `ch` |
  | RX, RY, RZ | `crx`, `cry`, `crz` |
  | P | `cp` |
  | U | `cu3` |
  | SX | `csx` |
  | SWAP | `cswap` |
  | S, Sdg, T, Tdg | `cp(pi/2)`, `cp(-pi/2)`, `cp(pi/4)`, `cp(-pi/4)` |

- **Two controls on X:** `ccx`.
- **On0 controls:** an `x q[c];` before and after the controlled gate, for each on0 control.
- **Everything else controlled:** return `{ ok: false, message: 'Step N: <GATE_INFO label> with k control(s) has no OpenQASM 2.0 gate. Use the Qiskit tab.' }`, with N 1-based. This includes SXdg, iSWAP, √SWAP and B with any control, more than one control on non-X, and 3+ controls.

- [ ] **Step 1: Write failing tests:**
  - `Bell`: contains `h q[0];`, `cx q[0],q[1];` and `measure q -> c;`.
  - `hollow control sandwich`: X on q1 with on0 control q0 → the lines `x q[0];`, `cx q[0],q[1];`, `x q[0];` in that order.
  - `controlled S is cp(pi/2)`: → `cp(pi/2) q[0],q[1];`
  - `Toffoli`: X q2, on1 controls q0 and q1 → `ccx q[0],q[1],q[2];`
  - `iSWAP defines its gate once`: two iSWAPs → one `gate iswap` line and two `iswap q[…],q[…];` lines.
  - `refusal`: H on q2 with two on1 controls at step index 2 → `{ ok: false, message: 'Step 3: H with 2 controls has no OpenQASM 2.0 gate. Use the Qiskit tab.' }`. With 1 control on iSWAP: `'… iSWAP with 1 control has …'`.
  - `reversed SWAP`: SWAP `[2,0]` → `swap q[2],q[0];`
  - `u3`: U `['pi/2','0','pi']` → `u3(pi/2,0,pi) q[0];`
  - `empty circuit`: `qreg q[3];`, `creg c[3];`, `measure q -> c;`, and no other gate lines.
- [ ] **Step 2: Run** `npx vitest run tests/export/qasm2.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `toQasm2`.**
- [ ] **Step 4: Run** it. Expected: PASS.
- [ ] **Step 5: Commit** `feat(export): OpenQASM 2.0 emitter with per-step refusal`.

### Task 4: Export dialog, toolbar, README

**Files:**
- Create: `src/ui/ExportDialog.tsx`
- Modify: `src/ui/App.tsx` (toolbar after Copy link, around line 303), `src/ui/styles.css` (next to `.angle-dialog`, around line 773), `README.md`
- Test: `tests/ui/exportDialog.test.tsx`

**Interfaces:**
- Consumes: `lower`, `toQiskit`, `toQasm2`, `toHash` (share URL is built like `onCopyLink` builds it).
- Produces: `export default function ExportDialog(props: { circuit: Circuit; shareUrl: string; onClose: () => void })`.

**Dialog behaviour:**
- **Structure:** reuse `.modal-backdrop`. The panel is `role="dialog" aria-modal="true" aria-labelledby` an `<h3>Export circuit</h3>`.
- **Tabs:** a `role="tablist"` with tabs `Qiskit` and `OpenQASM 2.0` (`role="tab"`, `aria-selected`, roving `tabIndex`, Left/Right switch). The `role="tabpanel"` holds `<pre tabIndex={0} aria-label="Qiskit code">` or `"OpenQASM 2.0 code"`.
- **Buttons:** `Copy` (shows `Copied!` for 1.5 s), `Download` (`circuit.py` / `circuit.qasm`, the same Blob pattern as `onSave`) and `Close`.
- **On a lowering error,** both panels show `Fix the angle of <label> on q[…], step N before exporting.` instead of code, with no Copy or Download. On an OpenQASM refusal, that panel shows the refusal message, with no Copy or Download.
- **Closing:** Esc or Close calls `onClose`. App returns focus to the Export… button.

- [ ] **Step 1: Write failing tests:**
  - `opens from the toolbar`: clicking `Export…` shows dialog `Export circuit` with the Qiskit tab selected and the code containing `QuantumCircuit(3, 3)`.
  - `switches tabs with arrow keys`: ArrowRight on the Qiskit tab selects OpenQASM 2.0, and the code contains `OPENQASM 2.0;`.
  - `refusal shows message and no copy`: load a hash with H and two controls, open the dialog, select OpenQASM. The refusal text is shown and there is no `Copy` button in that panel.
  - `invalid angle`: load RX `pi/` → the fix message, and no code.
  - `Esc closes and returns focus`: after Esc the dialog is gone and `document.activeElement` is the Export… button.
  - `copy`: stub `navigator.clipboard.writeText`. Clicking Copy calls it with the panel text.
- [ ] **Step 2: Run** `npx vitest run tests/ui/exportDialog.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement the dialog and wire it into `App.tsx`.** The `Export…` button opens it. Add CSS using existing tokens only: the code block is monospace, scrolls with `max-height`, and uses `overflow:auto`.
- [ ] **Step 4: Run** `npx vitest run tests/ui/exportDialog.test.tsx`, then `npm test`. Expected: all pass.
- [ ] **Step 5: README.** Add a bullet after the Circuit as matrices bullet. It covers: Export… gives Qiskit (any circuit) and OpenQASM 2.0 (standard gates, Qiskit's `qelib1.inc`), the final measurement added when the circuit has none, the bit-order comment, and refusals.
- [ ] **Step 6: Commit** `feat(ui): Export dialog with Qiskit and OpenQASM 2.0 tabs`.

### Task 5: Cross-check against Qiskit, a11y

**Files:**
- Scratchpad only. Nothing committed except fixes found here, each with a failing test first in the task that owns the code.

- [ ] **Step 1:** Create a venv in the scratchpad and `pip install qiskit`. Generate exports with `npx tsx` for these circuits:
  - Bell
  - a hollow-control Toffoli
  - RZ/U with angles
  - iSWAP and √SWAP, both uncontrolled and controlled (Qiskit only)
  - a B on `[2,0]`
  - H with mixed on0/on1 controls

  For each, strip the final measurement, run the Qiskit code, and compare `Operator(qc)` with the lab's `circuitMatrices(c).product` after `reverse_qargs()`, with `equiv` disallowed (exact incl. phase, tolerance 1e-9). For the OpenQASM files, do the same via `QuantumCircuit.from_qasm_str`.
  - Expected: all equal.
  - If `u3` vs `u` or a definition differs, rule in the ledger and fix with a test.
- [ ] **Step 2: Run** `npm run a11y`. Expected: 0 failures in both themes with the dialog open. If the audit does not open the dialog, add the dialog state to the audit the way existing dialogs are covered.
- [ ] **Step 3: Run** `npm test` and `npm run typecheck`. Expected: all pass.
