# Quantum Gate Lab

A browser-based quantum circuit simulator. Drag gates onto up to 10 qubit wires, see per-step Bloch spheres and the output probability distribution update live. Circuits can be saved/loaded as JSON or shared as a link (the circuit is encoded in the URL hash).

![Quantum Gate Lab: an SX† gate puts q[0] into |i⟩, shown on its Bloch sphere](docs/images/screenshot.png)

*An SX† (√X†) gate takes q[0] from |0⟩ to |i⟩: the arrow points along +y and P(|i⟩) = 100 %.*

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
- The B gate is a Bell-pair gate (H on one wire, then CNOT): the dot marks its H/control end; the other end is the CNOT target.
- Measure is dephasing: it removes coherence and does not collapse randomly, so outputs stay deterministic. Circuits with measure/reset use a density-matrix backend (the cheaper state vector is used up to the first measure/reset step).
