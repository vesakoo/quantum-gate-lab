# Quantum Gate Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Dockerized, browser-based drag-and-drop quantum circuit simulator (1–10 qubits) that shows every qubit's Bloch-sphere state after every step.

**Architecture:** A pure TypeScript simulation core (`src/sim/`) with two interchangeable backends — a state vector (fast, used when the circuit has no Measure/Reset) and a density matrix (used otherwise) — behind one `Backend` interface, tested against each other. A pure editing model (`src/model/`) holds the circuit as plain data with reducer-style edit functions and JSON/URL serialization. React UI (`src/ui/`) renders palette, grid, Bloch views and chart; simulation runs in a Web Worker.

**Tech Stack:** TypeScript 5, React 18, Vite 5, Vitest, @dnd-kit/core, three.js (+ OrbitControls, CSS2DRenderer), Docker (node:22-alpine → nginx:1.27-alpine).

**Spec:** `docs/superpowers/specs/2026-11-15-quantum-gate-lab-design.md`

## Global Constraints

- All UI text in English.
- Qubit count 1–10; default **4 qubits**, **12 steps**; steps grow as needed.
- Basis labels and state indexing: **q[0] is the leftmost / most significant bit** (`index = Σ bit_q << (n-1-q)`).
- Gate matrices follow Qiskit conventions; T = diag(1, e^{iπ/4}).
- Multi-qubit gate local ordering: `wires[0]` is the most significant local bit; for B, `wires[0]` is the H/control end and keeps that role when moved.
- Control balls in a step apply to every unitary op in that step. Measure, Reset, Barrier can't share a step with controls.
- No external quantum library. No backend server.
- `docker compose up` serves the app at `http://localhost:8080`.
- GitHub repo: public, `vesakoo/quantum-gate-lab`.
- `.superpowers/` is git-ignored.

## Review Focus

1. **Big circuits stay responsive** — 10 qubits × 20 full steps must simulate fast (state vector < 50 ms) and density-matrix runs must not freeze the UI (Worker). Test in Task 4.
2. **Removing a qubit that a gate or control touches** — any op with a wire on that qubit is deleted whole, the control is deleted, higher wires shift down by one. Test in Task 5.
3. **Loading a malformed file or bad URL hash** — reported as an error, current circuit kept, no crash. Test in Task 5.
4. **Floating-point noise** — no "-0.0 %", no 1e-17 rows surviving "Hide 0% rows", pure states not flagged mixed. Test in Task 4 (tolerances) and Task 8 (chart filter).
5. **Orphan controls** (controls in a step with no gate, e.g. after dragging the gate away) — ignored by simulation, drawn faded. Test in Task 4.

---

## File map

```
Dockerfile, docker-compose.yml, nginx.conf, .dockerignore, .gitignore
package.json, tsconfig.json, vite.config.ts, index.html, README.md, CLAUDE.md
src/sim/complex.ts      Mat type (Float64Array, interleaved re/im), matMul, dagger, kron, isUnitary helpers
src/sim/angle.ts        parseAngle — safe expression parser
src/sim/gates.ts        GateId, GATE_INFO table, gateMatrix(id, params)
src/sim/backend.ts      Backend interface, Bloch type, blochFrom(), shared constants
src/sim/statevector.ts  StateVector implements Backend
src/sim/density.ts      DensityMatrix implements Backend
src/sim/simulate.ts     simulate(circuit) → SimResult
src/sim/worker.ts       Web Worker wrapper around simulate
src/model/circuit.ts    Circuit/Step/Op/Control types, emptyCircuit()
src/model/edit.ts       pure edit functions
src/model/serialize.ts  toJSON/parseCircuit, toHash/fromHash
src/ui/App.tsx, useCircuit.ts, useSimulation.ts, Palette.tsx, CircuitGrid.tsx, GateView.tsx,
       AngleDialog.tsx, OutColumn.tsx, MiniBloch.tsx, BlochPanel.tsx, ProbabilityChart.tsx, styles.css
tests/  mirrors src/ (*.test.ts / *.test.tsx)
```

---

### Task 1: Scaffold, Docker, GitHub repo

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/ui/App.tsx`, `.gitignore`, `Dockerfile`, `docker-compose.yml`, `nginx.conf`, `.dockerignore`
- Test: `tests/smoke.test.tsx`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `test` (`vitest run`), `typecheck` (`tsc --noEmit`); `App` default export.

- [ ] **Step 1:** Scaffold Vite React-TS by hand (folder isn't empty). Add deps: `react react-dom @dnd-kit/core three`; dev: `vite @vitejs/plugin-react typescript vitest jsdom @testing-library/react @testing-library/jest-dom @types/react @types/react-dom @types/three`. Vitest config in `vite.config.ts`: `environment: 'jsdom'`, include `tests/**/*.test.{ts,tsx}`.
- [ ] **Step 2: Write smoke test** `tests/smoke.test.tsx`: renders `<App/>`, expects text "Drag gate to circuit".
- [ ] **Step 3:** Run `npm test` → FAIL; make `App` render the heading; run → PASS. `npm run typecheck` → no errors.
- [ ] **Step 4: Docker.** `Dockerfile` multi-stage: `node:22-alpine` runs `npm ci && npm run build`; `nginx:1.27-alpine` serves `dist/` with `nginx.conf` (listen 80, SPA fallback to `index.html`, serve `.js` workers with correct MIME). `docker-compose.yml`: service `app` (build ., ports `8080:80`); service `dev` under profile `dev` (image `node:22-alpine`, mounts `.`, runs `npm ci && npm run dev -- --host 0.0.0.0`, ports `5173:5173`). `.gitignore`: `node_modules dist .superpowers .DS_Store`.
- [ ] **Step 5: Verify:** `docker compose up -d --build && sleep 5 && curl -s localhost:8080 | grep -c '<div id="root">'` → `1`; `docker compose down`.
- [ ] **Step 6: Repo.** `git init -b main`, commit "chore: scaffold quantum-gate-lab" (includes `docs/`). `gh repo create quantum-gate-lab --public --source . --push`. Verify `gh repo view vesakoo/quantum-gate-lab --json visibility` → `"PUBLIC"`.

---

### Task 2: Complex math, gate library, angle parser

**Files:**
- Create: `src/sim/complex.ts`, `src/sim/gates.ts`, `src/sim/angle.ts`
- Test: `tests/sim/gates.test.ts`, `tests/sim/angle.test.ts`

**Interfaces:**
- Produces:
  - `type Mat = { dim: number; data: Float64Array }` (row-major, `data[2*(r*dim+c)]` = re, `+1` = im); `mat(rows: [number, number][][]): Mat`; `matMul(a, b): Mat`; `dagger(a): Mat`; `approxEqual(a, b, tol = 1e-9): boolean`; `isUnitary(a): boolean`.
  - `type GateId = 'I'|'X'|'Y'|'Z'|'H'|'S'|'Sdg'|'T'|'Tdg'|'SX'|'SXdg'|'RX'|'RY'|'RZ'|'P'|'U'|'SWAP'|'ISWAP'|'SQSWAP'|'B'|'MEASURE'|'RESET'|'BARRIER'`
  - `GATE_INFO: Record<GateId, { label: string; arity: 1 | 2; params: string[]; kind: 'unitary' | 'measure' | 'reset' | 'barrier'; quick: boolean }>` — `params` names, e.g. RX `['θ']`, P `['λ']`, U `['θ','φ','λ']`; `quick` true for H X Y Z S T SX B SWAP. Labels: `S†`, `T†`, `SX†`, `iSWAP`, `√SWAP`, `M`, `|0⟩`, `B`.
  - `gateMatrix(id: GateId, params: number[]): Mat` (unitary kinds only; throws otherwise). 4×4 matrices use `wires[0]` as MSB. B = CNOT(0→1)·(H⊗I).
  - `parseAngle(expr: string): number | null` — accepts numbers (incl. `1e-3`), `pi`, `π`, `+ - * /`, parentheses, unary minus, whitespace; anything else → `null`. No `eval`/`Function`.

- [ ] **Step 1: Write failing tests** `gates.test.ts`:
  - every unitary GateId with sample params (`[0.7]`, U `[0.3,1.1,-0.4]`) passes `isUnitary`.
  - `matMul(T,T) ≈ S`; `matMul(S,S) ≈ Z`; `matMul(SX,SX) ≈ X`; `matMul(H,H) ≈ I`; `Sdg ≈ dagger(S)`; `Tdg ≈ dagger(T)`; `SXdg ≈ dagger(SX)`; `matMul(SQSWAP,SQSWAP) ≈ SWAP`.
  - `U(π,0,π) ≈ X`; `U(π/2,0,π) ≈ H`; `P(π/2) ≈ S`; `RX(π) ≈ -i·X`.
  - `B` applied to column |00⟩ gives `[1/√2,0,0,1/√2]`; `ISWAP` maps |01⟩ → i|10⟩.
  - `gateMatrix('MEASURE', [])` throws.
  `angle.test.ts`: `pi/4`→π/4; `-3*pi/2`→−3π/2; `π`→π; `(1+1)*pi`→2π; `0.5`→0.5; `1e-3`→0.001; `''`, `abc`, `pi pi`, `2**3`, `alert(1)`, `(pi` → `null`.
- [ ] **Step 2:** `npx vitest run tests/sim` → FAIL (modules missing).
- [ ] **Step 3:** Implement the three files. `parseAngle` is a small recursive-descent parser (expr → term (±term)*, term → factor (*|/ factor)*, factor → ±factor | number | pi | (expr)).
- [ ] **Step 4:** `npx vitest run tests/sim` → PASS.
- [ ] **Step 5:** Commit "feat(sim): gate library and angle parser".

---

### Task 3: Simulation backends

**Files:**
- Create: `src/sim/backend.ts`, `src/sim/statevector.ts`, `src/sim/density.ts`
- Test: `tests/sim/backend.test.ts`

**Interfaces:**
- Consumes: `Mat`, `gateMatrix` (Task 2).
- Produces:
  - `type ControlKind = 'on1' | 'on0'`; `type Control = { wire: number; kind: ControlKind }` (re-exported by `src/model/circuit.ts`).
  - `type Bloch = { x: number; y: number; z: number; length: number; mixed: boolean; probs: { zero: number; one: number; plus: number; minus: number; plusI: number; minusI: number } }`
  - `blochFrom(x, y, z): Bloch` — clamps components to [−1,1], snaps |v| < 1e-12 to 0 (no `-0`), `mixed = length < 1 - 1e-6`, probs per spec formulas.
  - `interface Backend { readonly n: number; applyGate(m: Mat, targets: number[], controls: Control[]): void; measure(q: number): void; reset(q: number): void; bloch(q: number): Bloch; probabilities(): Float64Array }`
  - `class StateVector implements Backend { constructor(n: number, initial: (0|1)[]) }` — `measure`/`reset` throw (`'use DensityMatrix'`).
  - `class DensityMatrix implements Backend { constructor(n: number, initial: (0|1)[]) }` — `applyGate`: ρ → UρU† restricted to basis indices where all controls are satisfied (identity elsewhere); `measure(q)`: zero entries where bit q of row ≠ bit q of col; `reset(q)`: ρ' = K0ρK0† + K1ρK1†, K0=|0⟩⟨0|, K1=|0⟩⟨1|; `bloch(q)`: partial trace to 2×2, x = 2Re ρ01, y = −2Im ρ01, z = ρ00 − ρ11.
  - Both apply a gate on k targets by iterating over index groups (2^k entries differing only in target bits) — never building a 2^n × 2^n operator.

- [ ] **Step 1: Write failing tests**, parameterised over both backends (`describe.each([StateVector, DensityMatrix])`) for unitary cases:
  - |0⟩ → bloch (0,0,1), probs.zero=1, plus=0.5; H → (1,0,0); H,S → (0,1,0), probs.plusI=1; X → (0,0,−1); none flagged mixed.
  - B on wires [0,1] from |00⟩: probabilities `[0.5,0,0,0.5]`, both qubits length ≈ 0 and mixed.
  - B role (3 qubits, initial q0=1): B wires [2,0] → probs 0.5 at `100` (index 4) and `001` (index 1); B wires [0,2] → 0.5 at `000` and `101`.
  - X on q1 controlled on1 by q0: initial `10` → `11`, `00` → `00`. Anti-control on0: `00` → `01`, `10` → `10`.
  - CCX (controls q0,q1 on1, target q2): `110`→`111`, `100`→`100`. CCCX on 4 qubits: `1110`→`1111`.
  - Mixed controls on S: q2 prepared |+⟩ via H, controls q0 on1 (initial 1), q1 on0 (initial 0) → q2 bloch (0,1,0); flip q1 initial to 1 → q2 stays (1,0,0).
  - SWAP wires [0,2]: `100`→`001`. Fredkin (SWAP [1,2] + q0 on1): `110`→`101`; `010`→`010`.
  - Random seeded circuit (10 random unitary gates with random controls, 4 qubits): StateVector and DensityMatrix give equal probabilities and blochs within 1e-9.
  DensityMatrix only:
  - H, measure → bloch (0,0,0), mixed; then H → probs [0.5,0.5] (not back to |0⟩).
  - B on [0,1], measure(0) → probs unchanged `[0.5,0,0,0.5]`.
  - X, reset → (0,0,1); B on [0,1], reset(0) → q0 (0,0,1), q1 (0,0,0).
  `blochFrom`: `blochFrom(-1e-17, 0, 1)` has `x === 0` and `Object.is(x, -0) === false`; `blochFrom(0, 0, 0.9999999999)` not mixed.
- [ ] **Step 2:** `npx vitest run tests/sim/backend.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit "feat(sim): state-vector and density-matrix backends".

---

### Task 4: Circuit model and `simulate`

**Files:**
- Create: `src/model/circuit.ts`, `src/sim/simulate.ts`
- Test: `tests/sim/simulate.test.ts`

**Interfaces:**
- Consumes: Task 2, Task 3.
- Produces:
  - `type Op = { id: string; gate: GateId; wires: number[]; params: string[] }` (params are angle expressions as typed).
  - `type Step = { ops: Op[]; controls: Control[] }`
  - `type Circuit = { numQubits: number; initial: (0|1)[]; steps: Step[] }`
  - `emptyCircuit(numQubits = 4, numSteps = 12): Circuit`
  - `type SimResult = { bloch: Bloch[][]; probabilities: number[]; qubitP1: number[]; backend: 'statevector' | 'density' }` — `bloch[s][q]`, `s = 0` is input, `s = k` after step k (length `steps.length + 1`).
  - `simulate(c: Circuit): SimResult` — DensityMatrix iff any op is MEASURE/RESET, else StateVector. Per step: apply every op in order; unitary ops get the step's controls; BARRIER is a no-op; a step with controls and no unitary op does nothing. Ops with unparsable params are skipped. Probabilities with value < 1e-12 are set to 0.

- [ ] **Step 1: Write failing tests:**
  - Reference circuit from the spec (4 qubits, q[2]=|1⟩; step 2 B[1,2]; step 4 H q1, H q2; step 5 X q2 + on1 q1; step 6 H q1, H q2; step 8 T q2 + on1 q1; step 10 S q2 + on0 q1; step 11 S q2 + on1 q1): probabilities 0.5 at `0100` (index 4) and `0110` (index 6), all others 0; `qubitP1 ≈ [0,1,0.5,0]`; `bloch.length === 13`.
  - Two X ops in one step + on1 control on q0: q0=1 flips both; q0=0 flips neither.
  - Orphan controls (step with only controls) → state unchanged.
  - BARRIER → unchanged; RX with params `['oops']` → skipped.
  - Circuit with MEASURE → `backend === 'density'`; without → `'statevector'`.
  - Performance: 10 qubits, 20 steps each with H on every qubit plus one controlled X, statevector `simulate` < 50 ms (`performance.now()`).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit "feat(sim): circuit model and simulate".

---

### Task 5: Editing operations and serialization

**Files:**
- Create: `src/model/edit.ts`, `src/model/serialize.ts`
- Test: `tests/model/edit.test.ts`, `tests/model/serialize.test.ts`

**Interfaces:**
- Consumes: Task 4 types, `GATE_INFO`, `parseAngle`.
- Produces (all pure, return a new `Circuit`, or the same object unchanged when the edit is invalid):
  - `MIN_STEPS = 12`, `MAX_QUBITS = 10`
  - `placeGate(c, gate: GateId, step: number, wire: number, params?: string[]): Circuit` — two-qubit gates take `[wire, wire+1]` (or `[wire-1, wire]` on the last wire); default params: each `'pi/2'` for RX/RY/RZ/P, `['pi/2','0','pi']` for U. Rejected if any target wire is occupied (by an op or control) in that step, or if the gate is MEASURE/RESET/BARRIER and the step has controls.
  - `placeControl(c, kind: ControlKind, step, wire)` — rejected if wire occupied or the step holds MEASURE/RESET/BARRIER.
  - `moveOp(c, opId, toStep, toWire)` — moves the whole op; for two-qubit ops keeps the wire offset.
  - `moveOpEnd(c, opId, endIndex: 0 | 1, toWire)` — moves one end; `wires` order (roles) preserved even if `wires[0] > wires[1]`. Rejected if `toWire` is occupied or equals the other end.
  - `moveControl(c, step, wire, toStep, toWire)`, `removeOp(c, opId)`, `removeControl(c, step, wire)`, `setParams(c, opId, params: string[])`, `toggleInitial(c, wire)`
  - `addQubit(c)` (no-op at 10), `removeQubit(c, wire)` (no-op at 1; deletes ops/controls touching `wire`, decrements higher wires)
  - `normalizeSteps(c)` — called by every edit: `steps.length = max(MIN_STEPS, lastUsedStepIndex + 2)`.
  - `serialize.ts`: `toJSON(c): string`; `parseCircuit(text: string): { ok: true; circuit: Circuit } | { ok: false; error: string }` — validates shape, `1 ≤ numQubits ≤ 10`, wires in range, known GateIds, correct arity/param count, no duplicate wire per step; `toHash(c): string` (base64url of JSON); `fromHash(hash: string)` → same result type as `parseCircuit`.

- [ ] **Step 1: Write failing tests:**
  - placeGate on occupied cell → same object; MEASURE into a step with a control → rejected; control into a step with RESET → rejected.
  - placeGate SWAP on last wire of 4 → wires `[2,3]`.
  - moveOpEnd on B `[1,2]` end 0 → wire 3 gives `[3,2]`.
  - removeQubit(1) on a circuit with B[1,2], X q3, control q1 → B and the control deleted, X now on q2, numQubits 3, `initial` shortened.
  - Placing at step 11 of 12 → `steps.length === 13`; removing it → back to 12.
  - addQubit at 10 → unchanged.
  - serialize: round-trip of the reference circuit (JSON and hash) is deep-equal; `parseCircuit('{')`, wire 7 in a 4-qubit circuit, unknown gate `'Q'`, U with 2 params, `fromHash('!!!')` → `ok: false` with a non-empty error.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit "feat(model): edit operations and serialization".

---

### Task 6: Editor UI — palette, grid, drag and drop, controls, angles, output column

**Files:**
- Create: `src/ui/useCircuit.ts`, `src/ui/useSimulation.ts`, `src/sim/worker.ts`, `src/ui/Palette.tsx`, `src/ui/CircuitGrid.tsx`, `src/ui/GateView.tsx`, `src/ui/AngleDialog.tsx`, `src/ui/OutColumn.tsx`, `src/ui/styles.css`
- Modify: `src/ui/App.tsx`
- Test: `tests/ui/editor.test.tsx`

**Interfaces:**
- Consumes: Task 4 `simulate`/types, Task 5 edit functions.
- Produces:
  - `useCircuit(): { circuit: Circuit; dispatch: (edit: (c: Circuit) => Circuit) => void; replace: (c: Circuit) => void }` — initial circuit from `location.hash` if `fromHash` ok, else `emptyCircuit()`; writes `toHash` to `location.hash` (via `history.replaceState`) on change.
  - `useSimulation(c: Circuit): SimResult | null` — posts to `worker.ts` (`new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' })`), ignores stale responses by request id; falls back to calling `simulate` synchronously when `Worker` is undefined (jsdom).
  - Drag data (dnd-kit `data`): `{ type: 'palette', gate: GateId } | { type: 'palette-control', kind } | { type: 'op', opId } | { type: 'op-end', opId, end: 0|1 } | { type: 'control', step, wire }`; droppable ids `cell:${step}:${wire}` and `trash` (the palette area and anywhere off-grid).

- [ ] **Step 1: Write failing tests** (`editor.test.tsx`, call edit dispatch through rendered UI where practical; drag itself is covered by Task 5 tests):
  - Palette shows quick-row buttons `H X Y Z S T SX B` plus SWAP, control and anti-control items, and a "More gates" toggle revealing `S† T† SX† I RX RY RZ P U iSWAP √SWAP M |0⟩` and Barrier.
  - Grid renders `q[0]`…`q[3]`, step headers 1…12, "Step"/"In"/"Out" headers.
  - Clicking the `|0⟩` initial box of q[2] changes it to `|1⟩` and q[2]'s Out box shows `1`.
  - "Add qubit" adds `q[4]`; the remove button on a row removes it.
  - AngleDialog: typing `abc` shows an error and disables OK; `pi/4` enables OK.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.** Layout per spec ("Drag gate to circuit" palette; grid with diagonal Step/In and Step/Out corner headers; wires as horizontal lines). GateView: blue square with label; angle gates show short label (e.g. `RX π/4`); two-qubit ops drawn as a vertical connector across their wire span with a drag handle per end, SWAP ends as `×`, B as a tall block with a dot on `wires[0]`. Controls: black/white circles; when the step has ≥1 unitary op, the controls, connector line and gate borders are orange (`#f0a040`); orphan controls drawn at 40 % opacity. Drop of an angle gate opens AngleDialog (Cancel removes the just-placed op); double-click an angle gate reopens it. Selected op + Delete/Backspace removes it. OutColumn: meter icon + box with cyan (`#7ff4f8`) fill width = `qubitP1 * 100%` and digit `qubitP1 >= 0.5 - 1e-9 ? 1 : 0`.
- [ ] **Step 4:** `npm test` → PASS; `npm run typecheck` clean.
- [ ] **Step 5: Manual check** with `npm run dev` in a browser: rebuild the spec's reference circuit by dragging (B, H, controls, anti-control, T, S); Out shows q[1]=1 full cyan, q[2] half cyan. Drag a B end below the other; drag a gate to the palette to delete it.
- [ ] **Step 6:** Commit "feat(ui): circuit editor".

---

### Task 7: Bloch views

**Files:**
- Create: `src/ui/MiniBloch.tsx`, `src/ui/BlochPanel.tsx`
- Modify: `src/ui/App.tsx`, `src/ui/CircuitGrid.tsx` (or a sibling `BlochStrip` section aligned to step columns)
- Test: `tests/ui/bloch.test.tsx`

**Interfaces:**
- Consumes: `SimResult.bloch`, `Bloch`.
- Produces: `MiniBloch({ bloch: Bloch; size?: number; onClick?: () => void; selected?: boolean })` (SVG); `projectBloch(b: Bloch, r: number): { px: number; py: number }` exported for tests — oblique projection, screen-right = +y, up = +z, +x toward viewer drawn down-left: `px = r*(y - 0.35*x)`, `py = r*(-z + 0.35*x)`; `BlochPanel({ qubit: number; step: number; bloch: Bloch; onClose: () => void })`.

- [ ] **Step 1: Write failing tests:**
  - `projectBloch` for |0⟩ → `(0, -r)`; |i⟩ → `(r, 0)`; |+⟩ → `(-0.35r, 0.35r)`.
  - Rendering App shows a Bloch row per qubit with `steps.length + 1` mini spheres (input + each step); each has an accessible label like `q[0] after step 3` / `q[0] input`.
  - A mixed qubit's mini sphere has class `mixed` and title containing "entangled / mixed".
  - Clicking a mini sphere opens the panel showing `x`, `y`, `z`, length and the six labels `|0⟩ |1⟩ |+⟩ |−⟩ |i⟩ |−i⟩` with percentages (one decimal).
  BlochPanel's three.js canvas is skipped under jsdom (render the numbers; mount WebGL only when `WebGLRenderingContext` exists).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.** Mini sphere: circle, dashed equator ellipse, red arrow from centre (shorter when mixed), small dot at tip. Bloch strip rows sit under the circuit, columns aligned to the grid's step columns, scrolling horizontally together. BlochPanel: side panel; three.js scene with translucent sphere, equator/meridian circles, x/y/z axes, CSS2D labels `|0⟩ |1⟩ |+⟩ |−⟩ |i⟩ |−i⟩` at the six poles, arrow (ArrowHelper) of the Bloch vector, OrbitControls (rotate only); updates when the circuit changes; disposes renderer on unmount.
- [ ] **Step 4:** `npm test` → PASS; manual check in browser that the large sphere rotates and H→|+⟩ points along +x.
- [ ] **Step 5:** Commit "feat(ui): per-step Bloch spheres".

---

### Task 8: Probability chart, save/load, docs, ship

**Files:**
- Create: `src/ui/ProbabilityChart.tsx`, `README.md`, `CLAUDE.md`
- Modify: `src/ui/App.tsx`
- Test: `tests/ui/chart.test.tsx`

**Interfaces:**
- Consumes: `SimResult.probabilities`, `toJSON`, `parseCircuit`, `useCircuit().replace`.
- Produces: `ProbabilityChart({ probabilities: number[]; numQubits: number })`; `basisLabel(index: number, n: number): string` (q[0] leftmost, e.g. `basisLabel(4, 4) === '0100'`); `visibleRows(probs, hideZero): number[]` (hides `p < 5e-4`, i.e. rounds to 0.0 %).

- [ ] **Step 1: Write failing tests:** `basisLabel(4,4)==='0100'`, `basisLabel(6,4)==='0110'`; `visibleRows([0.5, 1e-17, 0.5, 0], true)` → `[0,2]`, with `false` → `[0,1,2,3]`; chart renders "Output probabilities" title and a "Hide 0% rows" checkbox; percentages render without `-0.0`. Save/Load: loading a file with invalid JSON shows an error message and keeps the existing circuit.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.** Horizontal SVG bars (dark blue `#1f4e9c`), x-axis 0–100 with ticks every 10, monospace basis labels; scrollable when tall. Toolbar buttons "Save" (downloads `circuit.json`), "Load" (file input → `parseCircuit` → `replace` or error banner), "Copy link" (copies URL with hash), "Clear".
- [ ] **Step 4:** `npm test`, `npm run typecheck`, `npm run build` → all pass.
- [ ] **Step 5: Docs.** `README.md`: what it is, `docker compose up` → http://localhost:8080, dev (`docker compose --profile dev up dev` or `npm run dev`), tests (`npm test`, single file `npx vitest run tests/sim/backend.test.ts`, single test `-t "name"`), conventions (q[0] leftmost, control semantics, B role marker, measure = dephasing). `CLAUDE.md` with the required header, commands, and the architecture summary (sim backends + switch rule, pure model/edit layer, worker, ordering conventions).
- [ ] **Step 6: Final verify:** `docker compose up -d --build`, open http://localhost:8080, build the reference circuit, confirm 50 % `0100` / 50 % `0110`; `docker compose down`.
- [ ] **Step 7:** Commit "feat(ui): probability chart, save/load, docs" and `git push`.
