# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server (or `docker compose --profile dev up dev`, port 5173)
- `npm run build` — typecheck + production build to `dist/`
- `npm test` — all Vitest tests (jsdom)
- Single file: `npx vitest run tests/sim/backend.test.ts`; single test: `npx vitest run -t "name"`
- `npm run typecheck`
- `npm run a11y` — builds the app and audits it in Chrome in both themes (axe, pixel contrast, focus walk, forced colours); report in `a11y-report/`
- `docker compose up` — nginx-served production build at http://localhost:8080
- Deploy: every push to `main` publishes to GitHub Pages via `.github/workflows/pages.yml` (built with `--base=/<repo>/`); there is no other deploy in the repo

## Architecture

- `src/sim`: gate matrices (`gates.ts`) and two backends. `StateVector` is used unless the circuit contains MEASURE or RESET; then the state vector runs up to the first step with MEASURE/RESET and is converted to a `DensityMatrix` (|ψ⟩⟨ψ|) there (`simulate(c, { hybrid: false })` uses the density matrix throughout, as a test reference), and `backend` reports `'density'`. `simulate` returns a `SimResult` with `numQubits`, `bloch[s][q]` (s = 0 is the input state, s = k is after `steps[k-1]`, i.e. UI step k), `probabilities`, `qubitP1`, plus `amplitudes` (final pure state, interleaved re/im; for the density backend recovered by `DensityMatrix.pureState()` when Tr ρ² ≈ 1, else null), `purity`, `warnings` (ops skipped because an angle does not parse: they act as the identity; the UI draws such gates red via `hasInvalidAngle` and lists the warnings with a Fix… button). `src/ui/ket.ts` formats amplitudes as a ket (`KetView` panel).
- `src/model`: pure edit functions on the `Circuit` that return the same object when an edit is rejected. The backends do not validate wire overlap, so `serialize.ts` (`parseCircuit`/`fromHash`) is the guard for loaded circuits (caps steps and angle-string length, runs `normalizeSteps`); the URL hash mirrors the circuit after the first edit (a bad link is reported, not overwritten).
- `src/model` also builds the circuit as text and numbers for the panels: `operators.ts` (Dirac operator product, ends before the first measure/reset) and `matrices.ts` (step matrices built by running each basis state through `StateVector`, their product U and U·input; up to 4 qubits).
- `src/export`: pure exporters. `lower(circuit)` gives a flat op list (controls attached to each op, `finalMeasure` = qubits whose last op is not a measure) or an invalid-angle error; `toQiskit` and `toQasm2` turn it into text (OpenQASM 2.0 refuses steps it cannot express, per step). B/iSWAP/√SWAP decompositions live in `decompositions.ts` and are tested for exactness incl. global phase.
- `src/ui`: dnd-kit editor (`App`, `CircuitGrid`, `Palette`), simulation runs in a Web Worker via `useSimulation` (one request in flight, only the newest pending circuit is sent next; results may lag, so UI renders from `SimResult.numQubits`) with a synchronous fallback, drops on the grid container (headers, In/Out) are no-ops (`drop.ts`), the Bloch detail panel (three.js) is lazy-loaded, plus the probability chart, the Output state / Circuit as operators / Circuit as matrices panels, and the Save/Load/Copy link/Export…/Clear toolbar (`ExportDialog`).

## Conventions

- q[0] is the most significant / leftmost bit in basis labels and state indices.
- `wires[0]` is the MSB of multi-qubit gate matrices, and the H / control end of the B (Bell) gate.
- Controls in a step apply to all unitary ops in that step. Controls cannot share a step with measure/reset/barrier.
- Measure is modelled as dephasing (no random collapse).
- Indices are 0-based in code; step labels in the UI are 1-based.
