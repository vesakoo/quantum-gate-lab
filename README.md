# Quantum Gate Lab

A browser-based quantum circuit simulator. Drag gates onto up to 10 qubit wires, see per-step Bloch spheres and the output probability distribution update live, and read the result as a ket, as a Dirac operator product and as a matrix multiplication. Circuits can be saved/loaded as JSON or shared as a link (the circuit is encoded in the URL hash).

![Quantum Gate Lab in the dark theme: SX† and a CNOT entangle two qubits; the Bloch panel, output state, probabilities, operator product and step matrices are shown](docs/images/screenshot.png)

*An SX† (√X†) gate takes q[0] from |0⟩ to |i⟩ (Bloch panel: the arrow points along +y, P(|i⟩) = 100 %). A CNOT then entangles it with q[1], giving (|00⟩ + i|11⟩)/√2 with a global phase e<sup>−iπ/4</sup>. The bottom panels show the same circuit as an operator product and as step matrices, their product U and U·|00⟩.*

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

## Themes and accessibility

- Light and dark theme. The first visit follows the OS (`prefers-color-scheme`), dark when the OS prefers dark or says nothing; the header button ("Switch to light/dark theme") switches and remembers the choice. A small script in `index.html` applies the theme before the first paint, so there is no flash.
- Both themes meet WCAG 2.2 AAA text contrast (7:1) and 3:1 for UI parts and graphics, with two documented exceptions chosen on purpose: the soft Out-box fill level (the exact P(1) is in the box's accessible name and tooltip) and the light theme's 3D Bloch sphere, kept exactly as before (its state is also given as numbers in the panel). The dark theme draws the 3D sphere flat with a full-contrast outline.
- State is never shown by fading: recomputed results show an "Updating…" badge, orphan controls a dashed ring, invalid gates a "!" badge as well as red. Windows High Contrast (forced colours) keeps gates, wires, controls, selection and focus visible.
- `npm test` checks every colour pair of both themes from `src/ui/styles.css` (all colours are tokens there). `npm run a11y` builds the app, opens it in Chrome in both themes, runs axe (WCAG 2.2 A/AA/AAA rules), measures rendered pixels where axe cannot (SVG, canvas, overlapping text, focus rings), walks every keyboard focus stop and checks forced colours; screenshots and the full report go to `a11y-report/`.

## Conventions

- q[0] is the leftmost (most significant) bit: `0100` means q1 = 1.
- The Bloch panel also shows polar angles θ (from +z) and φ (from +x toward +y) and, for pure states, the state |ψ⟩ = cos(θ/2)|0⟩ + e<sup>iφ</sup>·sin(θ/2)|1⟩ (global phase dropped), written symbolically where the amplitudes are known values, e.g. (|0⟩ − |1⟩)/√2, and in decimals otherwise. φ is undefined at the poles and both angles are undefined for a fully mixed qubit. Below the formula a table lists each amplitude α, β in Euler form r·e<sup>iφ</sup> and as Re + i·Im, followed by the state in ket form.
- Rotation angles are expressions such as `pi/2` or `3*π/4`. A gate whose angle cannot be parsed (e.g. `pi/`) is drawn red and skipped (it acts as the identity); a warning above the toolbar lists each skipped gate with its step, wires and angle, and a Fix… button that opens its angle dialog.
- The Output state panel shows the final pure state in ket notation, e.g. (|00⟩ + |11⟩)/√2. Amplitudes of the form √(p/q) and phases that are multiples of π/12 are written symbolically (1/√2, √3/2, i, e<sup>iπ/4</sup>), others as decimals; a common magnitude 1/√k is factored out. The global phase is factored out of the formula (so equal states look equal) and shown on the line below, e.g. "Global phase e<sup>i3π/4</sup> (135.0°) factored out", or "none". After measure/reset it is "unknown", because the density matrix does not keep it. "Why can't it be measured?" opens a short explanation: it changes no probability, its value depends on the gate convention (T and RZ(π/4) differ by e<sup>−iπ/8</sup>), and it becomes measurable as phase kickback when the gates are controlled. A mixed state (after measure/reset) shows its purity Tr ρ² instead.
- The Circuit as operators panel, below the probabilities, writes the circuit as an unsimplified Dirac operator product, e.g. |ψ⟩ = (|0⟩⟨0| ⊗ I + |1⟩⟨1| ⊗ X) · (H ⊗ I) |00⟩: last step leftmost, q[0] the leftmost factor, controls as sums of projectors, qubit subscripts (SWAP₀,₂) when a two-qubit gate spans non-adjacent or reversed wires. It ends before the first measure/reset, and Copy puts the line on the clipboard as Unicode text.
- The Circuit as matrices panel, below it, writes the same circuit as a matrix multiplication for up to 4 qubits:
  - **First line:** each step as its full 2ⁿ×2ⁿ matrix (last step leftmost, captioned with its step number), then `=` and the circuit matrix U.
  - **Second line:** U·|input⟩, with the input and output state as columns.
  - **Building and writing the matrices:** each step matrix is built with the simulator itself, so the bit order and controls always match the simulation. Entries are written symbolically like the ket, and a common magnitude such as 1/√2 is factored out in front.
  - **Differences from the Output state panel:** the output column keeps the global phase.
  - **Long circuits:** step matrices are hidden above 4096 cells in total (16 steps at 4 qubits); U and the output are still shown.
  - **Measure/reset:** like the operator panel, the calculation ends before the first measure/reset.
  - **Wide lines:** they wrap, and a single matrix wider than the panel scrolls sideways.
- Hovering a gate or control (in the palette or on the circuit) for a moment, or focusing it with the keyboard, opens a gate card: name, a short description, what it does to basis states, and its matrix. On the circuit the card adds a Here section: qubit and step, the angle with the evaluated matrix, and for controlled gates the block matrix with the controls first in the basis order, e.g. CCX = [[I₆, 0], [0, X]], plus the projector form. Click a palette item to pin its card; Esc closes the card (a second Esc clears the selection).
- Controls (filled = on 1, hollow = on 0) in a step apply to every unitary gate in that step.
- The B gate is a Bell-pair gate (H on one wire, then CNOT): the dot marks its H/control end; the other end is the CNOT target.
- Measure is dephasing: it removes coherence and does not collapse randomly, so outputs stay deterministic. Circuits with measure/reset use a density-matrix backend (the cheaper state vector is used up to the first measure/reset step).
