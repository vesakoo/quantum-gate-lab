# Gate info card

Date: 2026-11-18 · Size: project

## Why

Gates currently describe themselves only through the browser's `title` tooltip: a single line
("Swap two qubits"), and for most gates just the name. The user finds bare gates dull ("tympeät")
and wants a proper description, in the spirit of Quirk and IBM Quantum Composer, including the
matrix. They want it both in the palette (when picking a gate) and in the circuit (when looking at
a placed gate). A dark theme toggle was requested too, as a separate project that comes after this one.

## Goals / non-goals / anti-goals

- Goals: every palette item and every placed gate can show a card with name, plain-language
  description, action on basis states, and matrix; placed gates add "Here" facts (qubit, angle,
  controls) with the actual matrix, using block form for controlled gates.
- Non-goals: a persistent side info panel (IBM style), right-click menus, a whole-circuit matrix
  view, dark theme (next project), translations.
- Anti-goals: the card must never break or slow down drag-and-drop, click-to-select,
  double-click-to-edit or Delete; it must not pop up while dragging; it must not leave the screen
  or get clipped by the circuit's horizontal scroll area.

## Approaches

- **A. Hover card, pinnable with a click in the palette (picked by the user).** Opens next to the
  gate after a short hover or on keyboard focus. Quirk-like: immediate, and the grid's
  click/double-click keep their meaning.
- B. Info panel driven by selection (IBM Composer style). Plenty of room and works everywhere, but
  the eye has to travel and the panel always takes space.
- C. Both (short hover card + full panel). Most complete, roughly double the work.
- Dropped: right-click / context menu. Undiscoverable, hides the browser's menu, missing on touch.

## Decided with the user

- Approach A.
- The card always has the description and basis-state action, not just a matrix (the user reacted
  to the block-matrix mockup that had dropped the text: "kuvaukset kuten aiemmassa, ei pelkkä matriisi").
- Large matrices of controlled gates use **block form** with the controls first in the basis
  order, so every controlled gate is a 2×2 block matrix: CX = [[I, 0], [0, X]],
  CCX = [[I₆, 0], [0, X]], open-control CSWAP = [[SWAP, 0], [0, I₄]]. The card states the basis
  order ("Basis order: q[2] q[0] (control first)") when it differs from the circuit's order.

## Design

### Card content

1. **Header:** the gate glyph (same look as the palette, `GateBox`) and the full name
   (H → Hadamard, X → Pauli-X (NOT), S† → S-dagger, SX → √X, B → Bell, …).
2. **Description:** one or two plain English sentences, written per gate.
3. **Basis action** where it is illuminating (e.g. `|0⟩ → (|0⟩ + |1⟩)/√2`, `|1⟩ → −|1⟩`,
   `|01⟩ → |10⟩`); skipped for parametric gates, where the matrix says it better.
4. **Matrix** of the gate itself, typeset as a matrix (bracketed grid), symbolic:
   - Fixed gates: exact entries with a common scalar factored out where it exists
     (H: `1/√2 [[1, 1], [1, −1]]`; SX: `½ [[1+i, 1−i], [1−i, 1+i]]`; T: `[[1, 0], [0, e^{iπ/4}]]`).
   - Parametric gates in terms of their parameters: RX `[[cos(θ/2), −i sin(θ/2)], [−i sin(θ/2), cos(θ/2)]]`,
     RY, RZ, P(λ), U(θ, φ, λ) in the form `gateMatrix` implements.
   - Two-qubit gates (SWAP, iSWAP, √SWAP, B): full 4×4 with row labels |00⟩…|11⟩ (wires[0] = left bit).
   - MEASURE, RESET, BARRIER: no matrix; the description says why (not unitary / visual only),
     and that measure is modelled as dephasing here.
   - Control and anti-control (palette items and dots on the grid): description of when the step
     applies; no matrix.
5. **"Here" section (placed gates only):**
   - Position: `on q[1]`, or `q[1] ↔ q[2]` for two-qubit gates, plus `step k` (1-based).
   - Parametric gates: the angle(s) as written (`θ = π/2`) and the evaluated matrix, entries
     formatted with the existing symbolic helpers (`symbolicSqrt`, phase as in `ket.ts`), falling
     back to 3 decimals. Invalid angle: "θ = foo is not a valid angle; the simulator treats this
     gate as I. Double-click to fix." and no evaluated matrix.
   - Controls in the same step: `applied only when q[0] = 1 and q[1] = 0`, then the block matrix.
     Basis order: controls first (in wire order), then the targets (in wire order; a two-qubit
     gate's wires in op order). With n_c controls and n_t target qubits the matrix is
     block-diagonal with 2^n_c blocks of size 2^n_t: every block is I except block b = U, where b
     is the satisfied control pattern read as a binary number. Shown collapsed:
     `[[I_a, 0, 0], [0, U, 0], [0, 0, I_c]]`, a = b·2^n_t, c = (2^n_c − 1 − b)·2^n_t, dropping
     blocks of size 0 (so CX = `[[I, 0], [0, X]]`, CCX = `[[I₆, 0], [0, X]]`, open-control
     CSWAP = `[[SWAP, 0], [0, I₄]]`). Identity subscripts are omitted when the size is 2.
     Below it, the projector form in the same notation as the Circuit as operators panel
     (`|0⟩⟨0| ⊗ I + |1⟩⟨1| ⊗ X`, controls-first order), and the basis order line.
   - When a controlled step has several gates, U is their tensor product, named as such
     (`U = H ⊗ X`, block shown as `H ⊗ X`).
   - Hovering a control dot on the grid shows the same "Here" section for its step.

### Interaction

- **Open:** pointer rests on a palette item or placed gate/control for 400 ms, or the element
  receives **keyboard** focus (`:focus-visible`; dnd-kit already makes them focusable). Focus
  from a mouse press does not open the card, so click-to-select and the mousedown of a drag
  never flash a card. (My call: touch users get no card on the grid; the grid is a desktop
  editing surface, and the palette pin covers touch.) Moving to a neighbouring gate
  while a card is open switches immediately (no second delay).
- **Close:** pointer leaves the gate and the card (a short 150 ms grace lets the pointer move onto
  the card), `Escape`, focus leaves, a drag starts, the page or circuit area scrolls.
  (My call: while a card is open, `Escape` only closes the card and is not passed on, so it does
  not also clear the selection; a second `Escape` deselects as today. This needs the card's key
  listener to run before App's global handler, e.g. capture phase.)
- **Pin (palette only):** a click on a palette item pins its card open (a small "pinned" state,
  closes with Escape, a click outside, or clicking the item again). On touch devices this is the
  way to open it. Clicks on the grid keep meaning select; the grid has no pinning.
- **Never during drag:** no card opens while a dnd-kit drag is active; an open card closes on drag start.
- **Placement:** rendered in a portal on `document.body` with fixed positioning, to the right of
  the element by default, flipped to the left / clamped vertically to stay inside the viewport;
  an arrow points at the element. Not clipped by `.circuit-scroll`.
- **Accessibility:** the card has `role="tooltip"` and the element `aria-describedby` it while
  open; content is text, so screen readers read the description. `prefers-reduced-motion`: no
  fade. The native `title` attributes that duplicate the card are removed (the drag-end hint
  "Drag to move this end of …" and "double-click to fix" move into the card).

### Code shape (builder's to refine)

- `src/ui/gateDocs.ts`: per-gate static content — full name, description, basis action lines,
  symbolic matrix (as rows of display strings plus optional scalar), for every `GateId` and both
  control kinds. A test checks every `GateId` has an entry and every unitary has a matrix.
- `src/ui/gateCardHere.ts` (pure): builds the "Here" data for a placed op from the circuit
  (position, angles, evaluated matrix, control condition, block layout, projector text). Reuses
  `circuitOperators`' control-term logic where it fits.
- `src/ui/GateCard.tsx` + `src/ui/MatrixView.tsx` (bracketed grid; block entries as named cells)
  + a small hover/pin controller hook (`useGateCard`) with the timers and drag suppression.
- Hook into `Palette` items and `GateView` (single, two-qubit, controls). No new dependency;
  positioning is simple enough to do by hand (`getBoundingClientRect`).

## Calls I made (check these)

- English text, like the rest of the UI.
- 400 ms open delay, 150 ms close grace.
- No pinning on the grid (click must keep selecting); keyboard focus is the non-hover path there,
  so touch users get no card on the grid.
- If a card is open, the first `Escape` closes it only and the next one deselects; with no card
  open, `Escape` deselects at once as today (confirmed by the user).
- The whole-circuit matrix view stays a later feature.

## Left to the builder

- Exact copy of each description (plain, sentence case, ≤ 2 sentences), card width and styling
  within the app's existing look, the arrow, and test ids.
