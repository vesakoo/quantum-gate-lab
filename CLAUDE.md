# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server (or `docker compose --profile dev up dev`, port 5173)
- `npm run build` — typecheck + production build to `dist/`
- `npm test` — all Vitest tests (jsdom)
- Single file: `npx vitest run tests/sim/backend.test.ts`; single test: `npx vitest run -t "name"`
- `npm run typecheck`
- `docker compose up` — nginx-served production build at http://localhost:8080

## Architecture

- `src/sim`: gate matrices (`gates.ts`) and two backends. `StateVector` is used unless the circuit contains MEASURE or RESET, in which case `DensityMatrix` is used. `simulate` returns a `SimResult` with `bloch[s][q]` (s = 0 is the input state, s = k is after step k-1), `probabilities`, `qubitP1`.
- `src/model`: pure edit functions on the `Circuit` that return the same object when an edit is rejected. The backends do not validate wire overlap, so `serialize.ts` (`parseCircuit`/`fromHash`) is the guard for loaded circuits; the URL hash mirrors the circuit.
- `src/ui`: dnd-kit editor (`App`, `CircuitGrid`, `Palette`), simulation runs in a Web Worker via `useSimulation` with a synchronous fallback, the Bloch detail panel (three.js) is lazy-loaded, plus the probability chart and Save/Load/Copy link/Clear toolbar.

## Conventions

- q[0] is the most significant / leftmost bit in basis labels and state indices.
- `wires[0]` is the MSB of multi-qubit gate matrices, and the H / control end of the B (Bell) gate.
- Controls in a step apply to all unitary ops in that step. Controls cannot share a step with measure/reset/barrier.
- Measure is modelled as dephasing (no random collapse).
- Indices are 0-based in code; step labels in the UI are 1-based.
