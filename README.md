# Quantum Gate Lab

A browser-based quantum circuit simulator. Drag gates onto up to 10 qubit wires, see per-step Bloch spheres and the output probability distribution update live. Circuits can be saved/loaded as JSON or shared as a link (the circuit is encoded in the URL hash).

## Run

```
docker compose up --build
```

Then open http://localhost:8080.

Development (hot reload):

```
docker compose --profile dev up dev     # http://localhost:5173
# or
npm install && npm run dev
```

## Tests

```
npm test
npx vitest run tests/sim/backend.test.ts     # one file
npx vitest run -t "test name"                # one test
npm run typecheck
```

## Conventions

- q[0] is the leftmost (most significant) bit: `0100` means q1 = 1.
- Controls (filled = on 1, hollow = on 0) in a step apply to every unitary gate in that step.
- The B gate is a Bell-pair gate; its two wires are H and control ends, marked by role.
- Measure is dephasing: it removes coherence and does not collapse randomly, so outputs stay deterministic. Circuits with measure/reset use a density-matrix backend.
