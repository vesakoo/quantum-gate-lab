# Quantum Gate Lab — Design

Date: 2026-11-15
Repo: `quantum-gate-lab` (public, GitHub account `vesakoo`)

## Intent

A browser-based quantum circuit simulator in the style of a drag-and-drop circuit composer (the user's reference: a "Drag gate to circuit" palette, a step grid with qubit wires, measurement meters, and an output-probability bar chart). What sets it apart: **after every step, the user sees the full Bloch-sphere state of every qubit** — the vector (x, y, z) and the probabilities of the six cardinal states |0⟩, |1⟩, |+⟩, |−⟩, |i⟩, |−i⟩. It's a learning/exploration tool: build a circuit, watch each qubit move around its sphere step by step.

## Goals

- Free choice of qubit count (1–10), add/remove at will.
- Drag-and-drop circuit building from a gate library.
- Black **control** balls and white **anti-control** balls that can be dropped on any wire to control any gate; any number of them, mixed (CX, CCX, CCCX, anti-controlled S, …). Toffoli/Fredkin/CZ/etc. are built this way, not separate buttons.
- A non-standard **B (Bell)** gate.
- Per-step Bloch-sphere display for every qubit (UI option "C", below).
- Output probabilities chart and per-qubit output meters.
- Correct physics, verified by unit tests.
- Runs in Docker; code in a public GitHub repo.
- All UI text in English.

## Non-goals

- Real quantum hardware, noise models.
- More than 10 qubits.
- User accounts or any backend server — it's a static web app.
- Export to QASM/Qiskit (could come later).
- A "D" gate (explicitly dropped by the user).

## Anti-goals (would be a failure even if it "works")

- Wrong physics: wrong qubit ordering, sign/phase errors, controls behaving wrongly. Every gate must be tested against its matrix.
- A sluggish editor: dragging and editing must feel instant at 10 qubits × ~20 steps.

## Layout (from the user's reference screenshots)

Top to bottom:

1. **Gate palette — "Drag gate to circuit".** Quick row: `H X Y Z S T SX B`, the SWAP symbol (two X's joined by a vertical line), a black ball (control), a white ball (anti-control). Below or expandable: "More gates" with the rest of the library.
2. **Circuit grid.** Header row "Step" with numbered columns (default 12, grows as needed). Left column "In": `q[0]`, `q[1]`, … each with a clickable initial-state box toggling `|0⟩` / `|1⟩`. Right column "Out": per qubit a meter icon and an output box whose cyan fill shows P(qubit = 1) and which shows the most likely value (0 or 1). Buttons to add/remove qubits.
3. **Bloch panel (option C).** For each qubit, a row of mini Bloch spheres aligned under the circuit's step columns, plus one for the input state (step 0). Clicking any mini sphere opens a side panel with a large, mouse-rotatable 3D sphere (labelled axes x/y/z and the six cardinal states) and the full numbers: x, y, z, the six probabilities, and the vector length.
4. **Output probabilities.** Horizontal bar chart over all 2ⁿ basis states (0–100 %), with a "Hide 0% rows" checkbox.

Reference circuit for sanity-checking ordering (from the user's screenshot): 4 qubits, q[2] starts in |1⟩; step 2 B on q[1],q[2]; step 4 H on q[1],q[2]; step 5 X on q[2] controlled by q[1]; step 6 H on q[1],q[2]; step 8 T on q[2] controlled by q[1]; step 10 S on q[2] anti-controlled by q[1]; step 11 S on q[2] controlled by q[1]. Expected output: 50 % `0100`, 50 % `0110`; q[1] out = 1 (fully cyan), q[2] half cyan. **Basis labels are written with q[0] as the leftmost bit.**

## Gate library

| Group | Gates |
|---|---|
| Quick row | H, X, Y, Z, S, T, SX (√X), B, SWAP, ● control, ○ anti-control |
| One-qubit fixed (More gates) | I, S†, T†, SX† |
| One-qubit with angle | RX(θ), RY(θ), RZ(θ), P(λ), U(θ, φ, λ) |
| Two-qubit | SWAP, iSWAP, √SWAP |
| Non-unitary / visual | Measure, Reset (to \|0⟩), Barrier (visual divider only) |
| Non-standard | B (Bell) |

Definitions follow standard conventions (Qiskit's matrices), notably T = diag(1, e^{iπ/4}) so T·T = S.

**B (Bell):** a two-qubit block on two wires (top = first). Acts as H on the top qubit, then CNOT with the top qubit controlling the bottom one. |00⟩ → (|00⟩+|11⟩)/√2. Each end of B keeps its role wherever it is dragged (my call): the H/control end is marked on the block (e.g. a small dot), so dragging it below the other end never silently changes the physics. Tests cover B flipped across non-adjacent wires.

**Controls:** a black ball on a wire in a step means "apply only when this qubit is |1⟩"; a white ball means "only when |0⟩". Balls are drawn joined to the gate by a vertical line; when attached, the balls and the gate border turn orange (as in the reference). Any number of balls per step. Controls may be added to any unitary gate, including SWAP (→ Fredkin) and B. Measure, Reset and Barrier cannot be controlled.

**Two-qubit gates (SWAP, iSWAP, √SWAP, B):** dropped onto two wires; each end can be dragged to any other wire, so non-adjacent qubits work.

**Angles:** typing a value opens on drop/double-click; accepts numbers and expressions with `pi` (e.g. `pi/4`, `-3*pi/2`). The gate shows its angle as a short label.

## Simulation

- Own implementation in TypeScript, no external quantum library.
- **Density-matrix simulation** (my call): handles Measure and Reset mid-circuit honestly — Measure is shown as "the qubit could be 0 or 1" (dephasing, no random collapse), Reset sets the qubit to |0⟩. At 10 qubits a density matrix is 1024×1024 complex numbers, which is fine in the browser.
- After each step, compute every qubit's reduced state and its Bloch vector (x, y, z). The six probabilities are P(|0⟩)=(1+z)/2, P(|1⟩)=(1−z)/2, P(|+⟩)=(1+x)/2, P(|−⟩)=(1−x)/2, P(|i⟩)=(1+y)/2, P(|−i⟩)=(1−y)/2.
- A qubit that's entangled (or measured) has a vector shorter than 1; the arrow draws inside the sphere and the qubit is marked "entangled / mixed".
- Recalculate on every circuit change. Run the simulation off the main thread (Web Worker) if needed to keep the UI responsive — builder's call.

## Editing

- Drag from palette to a cell; drag within the grid to move; drag off the grid (or select + Delete) to remove.
- Several gates can share a step on different wires. Control balls in a step apply to every gate in that step (Quirk's convention — my call).
- Save/load the circuit as a JSON file, and keep it in the URL so a link reproduces it (my call).

## How it's built (my calls, accepted by the user without objection)

- TypeScript + React + Vite.
- three.js for the large rotatable sphere; mini spheres are lightweight SVG.
- Vitest unit tests covering: every gate matrix, T·T = S, B produces a Bell pair, controls and anti-controls, multi-controls, non-adjacent SWAP, qubit ordering (the reference circuit above), Bloch vectors for the six cardinal states, reduced-state length < 1 for entangled qubits, Measure/Reset.
- Docker: multi-stage Dockerfile (Node build → nginx static serve). `docker compose up` serves the app at `http://localhost:8080`; a dev service with hot reload.
- GitHub: public repo `vesakoo/quantum-gate-lab`, created with `gh`.

## Left to the builder

- Visual styling details beyond the reference (colors, fonts, spacing).
- Exact mini-sphere rendering and how the Bloch panel scrolls with the circuit.
- Project folder structure, state-management approach, lint/format setup.
- Whether to use a Web Worker.
