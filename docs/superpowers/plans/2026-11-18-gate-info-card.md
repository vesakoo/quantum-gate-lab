# Gate Info Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A hover/focus card (pinnable by click in the palette) that describes every gate and control — name, description, basis action, matrix — and, for placed items, a "Here" section with position, angles, evaluated matrix and controlled-gate block matrix.

**Architecture:** Static per-gate content (`gateDocs.ts`) and a pure "Here" builder (`gateCardHere.ts`) feed presentational components (`GateCard`, `MatrixView`). A `GateCardProvider` (inside `DndContext`) owns open/pin state, timers, drag suppression, Escape and positioning, and renders the card in a portal; palette and grid elements spread trigger props from `useGateCardTrigger(target)`.

**Tech Stack:** React 18, TypeScript, @dnd-kit/core (`useDndMonitor`), Vitest + Testing Library (jsdom). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-18-gate-info-card-design.md`

## Global Constraints

- No new dependencies.
- English copy, plain sentence case, descriptions ≤ 2 sentences.
- Open delay 400 ms; close grace 150 ms; switching between triggers while a card is open is immediate.
- Grid: hover or keyboard focus only (focus from a mouse/pointer press never opens); no pinning. Palette: click toggles pin.
- No card opens during a dnd-kit drag; an open card closes on drag start.
- Escape with a card open closes only the card (event stopped before App's handler); with no card open Escape deselects as today.
- Card: `role="tooltip"`, trigger gets `aria-describedby` while open (merged with dnd-kit's own value), portal on `document.body`, fixed position, right of the trigger, flipped left / clamped vertically to stay in the viewport.
- Block matrices: controls first (wire order), then targets (wire order; 2-qubit gate wires in op order); block b = satisfied pattern as binary; `[[I_a, 0, 0], [0, U, 0], [0, 0, I_c]]`, a = b·2^n_t, c = (2^n_c − 1 − b)·2^n_t, size-0 blocks dropped, `I` subscript omitted when size is 2.
- Remove native `title` attributes that the card replaces (palette items, gates, end handles, connectors, control dots).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch `feature/gate-info-card`.

## Review Focus

- Click on a grid gate (select) or the start of a drag must not flash a card — Task 4 test `pointer focus does not open`.
- Escape with a card open must keep the selection — Task 5 test `escape closes card first, then deselects`.
- Card near the bottom/right edge stays inside the viewport — Task 4 test `clamps to the viewport`.
- Orphan control (step without a unitary) and invalid angle inside a controlled step show sensible Here text, not a crash — Task 2 tests `orphan control`, `invalid angle in controlled step`.
- Card content follows edits: after changing an angle the open card shows the new matrix — Task 5 test `card follows circuit edits`.

---

### Task 1: Static gate docs + matrix component

**Files:**
- Create: `src/ui/gateDocs.ts`, `src/ui/MatrixView.tsx`
- Test: `tests/ui/gateDocs.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type MatrixSpec = { scalar?: string; rows: string[][]; rowLabels?: string[] };
  export type GateDoc = { name: string; description: string; basis?: string[]; matrix?: MatrixSpec };
  export type DocKey = GateId | 'ctl:on1' | 'ctl:on0';
  export const GATE_DOCS: Record<DocKey, GateDoc>;
  export function MatrixView(props: { m: MatrixSpec; label?: string }): JSX.Element; // default export too
  ```
  `MatrixView` renders `<span className="matrix-row">` with optional `label` (e.g. `CX =`), optional scalar, and a bracketed CSS grid `<span className="matrix" role="table">` of `role="cell"` entries; `rowLabels` render as a left column. Entries are plain strings; `e^{…}` renders with `<sup>` (reuse `KetText` from `KetView.tsx`).

Content rules: names per spec (Hadamard, Pauli-X (NOT), Pauli-Y, Pauli-Z, Identity, S (phase π/2), S-dagger, T (phase π/4), T-dagger, √X, √X-dagger, Rotation about X/Y/Z, Phase, General single-qubit (U), SWAP, iSWAP, √SWAP, Bell, Measure, Reset, Barrier, Control, Anti-control). Matrix entries use only: integers, `i`, `−`, `1+i`/`1−i` style, `e^{iπ/4}`/`e^{−iπ/4}`, and for parametric gates the symbols `θ φ λ` with `cos(θ/2)`, `sin(θ/2)`, `e^{iλ}`, `e^{iφ}`, `e^{i(φ+λ)}`, `e^{−iθ/2}`, `e^{iθ/2}`. Scalars: `1/√2` (H, B), `½` (SX, SX†). Two-qubit gates have `rowLabels: ['|00⟩','|01⟩','|10⟩','|11⟩']`. MEASURE, RESET, BARRIER and controls have no matrix; MEASURE's description mentions dephasing.

- [ ] **Step 1: Write the failing tests**
  - `every gate and control has a doc`: for every key of `GATE_INFO` plus `'ctl:on1'`, `'ctl:on0'`: `name` and `description` non-empty, description ≤ 2 sentences (`split(/[.!?](\s|$)/).filter(Boolean).length <= 2`).
  - `unitaries have matrices of the right size`: every `GATE_INFO` unitary has `matrix`, `rows.length === 2 ** arity`, each row that long; non-unitaries and controls have none.
  - `fixed matrices agree with gateMatrix`: for every unitary with no params, evaluate each entry with a small test-local parser (handles integers, `i`, leading `−`, `a+bi` / `a−bi`, `e^{±iπ/4}`) times the scalar (`1/√2`, `½`, or 1) and compare to `gateMatrix(id)` within 1e-9.
  - `MatrixView renders scalar, label and cells`: render H's matrix with `label="H ="`; expect text `1/√2`, 4 elements with `role="cell"`, `getByRole('table')`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/gateDocs.test.tsx` — expected FAIL (module not found).
- [ ] **Step 3: Implement** `GATE_DOCS` and `MatrixView` (+ `.matrix`, `.matrix-row` CSS in `src/ui/styles.css`: brackets as left/right borders, `display:inline-grid`, centered cells).
- [ ] **Step 4: Run** the test file — expected PASS; `npm run typecheck` clean.
- [ ] **Step 5: Commit** `feat(ui): gate docs and matrix view for the gate card`.

### Task 2: "Here" builder (pure)

**Files:**
- Create: `src/ui/gateCardHere.ts`
- Modify: `src/ui/ket.ts` (export a complex formatter)
- Test: `tests/ui/gateCardHere.test.ts`

**Interfaces:**
- Consumes: `MatrixSpec` (Task 1); `gateMatrix`, `GATE_INFO`; `parseAngle`; `formatAngle`, `opLabel` (`GateView.tsx`); `subscript` (`operatorText.ts`).
- Produces:
  ```ts
  // ket.ts
  export function formatComplex(re: number, im: number): string; // '0', '1', '−1', 'i', '−i', '1/√2', '−i/√2', 'e^{iπ/4}', decimals as fallback
  // gateCardHere.ts
  export type CardTarget =
    | { kind: 'palette'; gate: GateId }
    | { kind: 'palette-control'; ctl: ControlKind }
    | { kind: 'op'; opId: string }
    | { kind: 'control'; step: number; wire: number };
  export type HereInfo = {
    position: string;                       // 'on q[1], step 3' | 'q[1] ↔ q[2], step 2' | 'control on q[0], step 2'
    angles?: { name: string; text: string; valid: boolean }[];   // text via formatAngle
    evaluated?: MatrixSpec;                 // only when the op has params and all are valid
    invalidNote?: string;                   // 'θ = foo is not a valid angle; the simulator treats this gate as I. Double-click to fix.'
    control?: { condition: string; block: MatrixSpec; blockLabel: string; projector: string; basisOrder: string };
    orphanNote?: string;                    // 'No gate in this step — this control is ignored.'
  };
  export function docKey(c: Circuit, t: CardTarget): DocKey | null;   // null if the op/control no longer exists
  export function cardHere(c: Circuit, t: CardTarget): HereInfo | null; // null for palette targets and stale targets
  ```

Rules: `formatComplex` reuses `ket.ts`'s private `general`/`symbolicSqrt` (sign + body; empty body → `1`; |z|² < 1e-10 → `0`). `control` is present when the step has controls and ≥ 1 unitary op (for an op target only if the op is unitary; for a control target always, describing its step). `condition`: `applied only when q[0] = 1 and q[1] = 0` (controls in wire order). `blockLabel`: `C` per on1 control / `C̄` per on0 control, then U's name, `=`; e.g. `CX =`, `CCX =`, `C̄SWAP =`, `C(H ⊗ X) =`. U's name = the step's unitary ops in wire order of their first wire, label plus `(params)` via `formatAngle`, joined ` ⊗ `; in block cells the same string. `projector`: k + 1 terms in controls-first order with the target part as one slot (`U` or `I`/`I₄`…), e.g. CX `|0⟩⟨0| ⊗ I + |1⟩⟨1| ⊗ X`. `basisOrder`: `Basis order: q[0] q[1]`, plus ` (control first)` when that order is not ascending.

- [ ] **Step 1: Write the failing tests** (circuits via `emptyCircuit`, exact values):
  - `formatComplex`: `(1,0)→'1'`, `(-1,0)→'−1'`, `(0,1)→'i'`, `(0,-1)→'−i'`, `(S2,0)→'1/√2'`, `(0,-S2)→'−i/√2'`, `(cos π/4, sin π/4)→'e^{iπ/4}'`, `(1e-12,0)→'0'`.
  - `palette targets have no here`: `cardHere(c, {kind:'palette', gate:'H'})` → null; `docKey` → `'H'`; `{kind:'palette-control', ctl:'on0'}` → `'ctl:on0'`.
  - `single gate position`: H on q[1] at step 2 → `position: 'on q[1], step 3'`, no `control`, no `evaluated`.
  - `two-qubit position`: SWAP [1,2] at step 0 → `'q[1] ↔ q[2], step 1'`.
  - `evaluated angle`: RX `'pi/2'` → `angles: [{name:'θ', text:'π/2', valid:true}]`, `evaluated.rows` = `[['1/√2','−i/√2'],['−i/√2','1/√2']]`.
  - `invalid angle`: RX `'foo'` → `valid:false`, no `evaluated`, `invalidNote` as above.
  - `cnot block`: X on 1, control on1 on 0 (2q) → `blockLabel 'CX ='`, `block.rows` `[['I','0'],['0','X']]`, `condition 'applied only when q[0] = 1'`, `projector '|0⟩⟨0| ⊗ I + |1⟩⟨1| ⊗ X'`, `basisOrder 'Basis order: q[0] q[1]'`.
  - `toffoli block`: controls 0,1, X on 2 → `'CCX ='`, rows `[['I₆','0'],['0','X']]`, condition `'applied only when q[0] = 1 and q[1] = 1'`.
  - `control below target`: X on 0, control on 2 (3q) → basisOrder `'Basis order: q[2] q[0] (control first)'`.
  - `open-control swap`: on0 on 0, SWAP [1,2] → `'C̄SWAP ='`, rows `[['SWAP','0'],['0','I₄']]`.
  - `middle block`: on1 on 0, on0 on 1, X on 2 → b = 2: rows `[['I₄','0','0'],['0','X','0'],['0','0','I']]`.
  - `several targets`: control on 0, H on 1, X on 2 → `'C(H ⊗ X) ='`, rows `[['I₄','0'],['0','H ⊗ X']]`.
  - `control target`: `{kind:'control', step, wire:0}` in the CNOT circuit → `position 'control on q[0], step 1'`, same `control` block as the X.
  - `orphan control`: control alone in a step → `orphanNote`, no `control`.
  - `invalid angle in controlled step`: control + RX `'foo'` → block uses `RX(foo)`, `invalidNote` set, no crash.
  - `stale target`: unknown opId → `docKey` null, `cardHere` null.
- [ ] **Step 2: Run** `npx vitest run tests/ui/gateCardHere.test.ts` — expected FAIL.
- [ ] **Step 3: Implement** `formatComplex` in `ket.ts` and `docKey`/`cardHere` in `gateCardHere.ts`.
- [ ] **Step 4: Run** the test file and `tests/ui/ket.test.tsx` — expected PASS.
- [ ] **Step 5: Commit** `feat(ui): Here builder for placed gates and controls`.

### Task 3: GateCard component

**Files:**
- Create: `src/ui/GateCard.tsx`
- Modify: `src/ui/styles.css`
- Test: `tests/ui/gateCard.test.tsx`

**Interfaces:**
- Consumes: `GATE_DOCS`, `MatrixView`, `DocKey` (Task 1); `HereInfo` (Task 2); `GateBox`, `ControlGlyph` (`GateView.tsx`).
- Produces: `export default function GateCard(props: { docKey: DocKey; here: HereInfo | null; pinned?: boolean; id: string })` — presentational only; root `<div role="tooltip" id={id} className="gate-card">`.

Layout: header (glyph via `GateBox`/`ControlGlyph` + name), description `<p>`, basis lines, `MatrixView` of the doc matrix, then if `here`: a `.gate-card-here` section starting `Here: {position}`, angle lines `θ = π/2`, `evaluated` matrix, `invalidNote`, `orphanNote`, `control.condition`, `MatrixView` of `control.block` with `label={control.blockLabel}`, the projector line (`= …`), and `basisOrder` (small). `pinned` adds a small `Pinned · Esc to close` line.

- [ ] **Step 1: Write the failing tests:**
  - `palette H`: shows `Hadamard`, the description, `|0⟩ → (|0⟩ + |1⟩)/√2`, `1/√2`; no `Here:`.
  - `placed controlled X`: with `cardHere` of the CNOT circuit → `Here: on q[1], step 2`, `applied only when q[0] = 1`, `CX =`, `|0⟩⟨0| ⊗ I + |1⟩⟨1| ⊗ X`.
  - `measure has no matrix`: `docKey 'MEASURE'` → no `role="table"`.
  - `pinned hint`: `pinned` → `Pinned · Esc to close`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/gateCard.test.tsx` — expected FAIL.
- [ ] **Step 3: Implement** `GateCard` and `.gate-card*` CSS (width ~300px, panel background `var(--panel)`, border `var(--grid-border)`, small shadow, arrow via `::before` on `[data-side="right"|"left"]`, no transition under `prefers-reduced-motion`).
- [ ] **Step 4: Run** — expected PASS.
- [ ] **Step 5: Commit** `feat(ui): gate card component`.

### Task 4: Provider, trigger hook, positioning

**Files:**
- Create: `src/ui/gateCardContext.tsx`
- Test: `tests/ui/gateCardContext.test.tsx`

**Interfaces:**
- Consumes: `GateCard` (Task 3); `CardTarget`, `docKey`, `cardHere` (Task 2); `useDndMonitor` from `@dnd-kit/core`.
- Produces:
  ```ts
  export const OPEN_DELAY = 400, CLOSE_GRACE = 150;
  export function GateCardProvider(props: { circuit: Circuit; children: ReactNode }): JSX.Element; // must be inside DndContext
  export function useGateCardTrigger(target: CardTarget, opts?: { pinnable?: boolean }): {
    onPointerEnter; onPointerLeave; onFocus; onBlur; onClick?; 'aria-describedby'?: string; 'data-card-trigger': string;
  };
  export function placeCard(trigger: DOMRect, card: { width: number; height: number }, viewport: { width: number; height: number }):
    { left: number; top: number; side: 'right' | 'left' };   // gap 10px, margin 8px from edges
  ```
  Callers merge `aria-describedby` with dnd-kit's (`[ours, theirs].filter(Boolean).join(' ')`); the hook accepts the existing value as `opts.describedBy?: string` and returns the merged string.

Behaviour: one open card at a time (`{ target, anchor: HTMLElement, pinned }`). Pointer enter starts the 400 ms timer (immediate if a card is already open); pointer leave of trigger or card starts the 150 ms close timer, cancelled by entering either. Focus opens immediately only when no `pointerdown` happened in the last 300 ms (document capture listener records it); blur closes unless pinned. `onClick` (pinnable only) toggles pin and opens immediately. While pinned, hover elsewhere does not replace it; Escape, a pointerdown outside card and trigger, or clicking the trigger again unpins/closes. `useDndMonitor({ onDragStart })` closes and sets `dragging=true` until `onDragEnd`/`onDragCancel`; no opening while dragging. Window `scroll` (capture, so `.circuit-scroll` counts) closes unpinned cards. Escape: a `keydown` listener on `window` in **capture** phase, attached only while a card is open, closes it and calls `e.stopPropagation()`. Content is resolved on every render from `circuit` (`docKey`/`cardHere`); if `docKey` returns null the card closes. Card rendered with `createPortal` into `document.body`, positioned with `placeCard` after measuring (layout effect).

- [ ] **Step 1: Write the failing tests** (fake timers; a test harness renders `DndContext` > `GateCardProvider` > buttons using the hook):
  - `placeCard`: right side when room (`trigger {left:100,right:140,top:100,bottom:140}`, card 300×200, viewport 1000×800 → `{left:150, side:'right'}`); flips left near right edge (trigger right 900 → `side:'left'`, left = trigger.left − 10 − 300); `clamps to the viewport` (trigger bottom 790, card height 200 → top = 800 − 8 − 200).
  - `opens after 400 ms hover`: pointerEnter, advance 399 → no tooltip; advance 1 → `getByRole('tooltip')` with `Hadamard`.
  - `leave closes after grace`: open, pointerLeave, advance 149 → still open; advance 1 → gone; pointerEnter on card within grace keeps it open.
  - `switches immediately`: with H open, pointerEnter on X trigger → X card without waiting.
  - `keyboard focus opens`, `pointer focus does not open`: `fireEvent.focus` → open; `fireEvent.pointerDown` then `focus` → no tooltip.
  - `click pins in palette`: click → open with `Pinned`; pointerLeave + advance 1000 → still open; Escape → closed; non-pinnable trigger click → no card.
  - `escape is consumed`: a bubble-phase window keydown spy does not see Escape while a card is open, and does see it when none is open.
  - `aria-describedby`: while open the trigger's attribute contains the card id and the passed-in `describedBy`.
  - `stale target closes`: rerender provider with a circuit without the op → tooltip gone.
  - (drag suppression is covered in Task 5 with real dnd-kit sensors.)
- [ ] **Step 2: Run** `npx vitest run tests/ui/gateCardContext.test.tsx` — expected FAIL.
- [ ] **Step 3: Implement** `gateCardContext.tsx`.
- [ ] **Step 4: Run** — expected PASS.
- [ ] **Step 5: Commit** `feat(ui): gate card provider with hover, focus, pin and placement`.

### Task 5: Wire into palette, grid and App; docs

**Files:**
- Modify: `src/ui/App.tsx` (wrap the editor inside `DndContext` with `<GateCardProvider circuit={circuit}>`), `src/ui/Palette.tsx` (`PaletteItem` uses the trigger, `pinnable: true`; drop `title`, `HINTS` moves into docs if any text is not already there), `src/ui/GateView.tsx` (`GateView` main element, connectors and `EndHandle`s use `{kind:'op', opId}`; `ControlView` uses `{kind:'control', step, wire}`; drop the replaced `title`s), `README.md`
- Test: `tests/ui/gateCardApp.test.tsx`

**Interfaces:**
- Consumes: `GateCardProvider`, `useGateCardTrigger`, `OPEN_DELAY` (Task 4).

- [ ] **Step 1: Write the failing tests** (render `<App />`, circuit via `history.replaceState(null, '', '/#' + toHash(c))` as in `tests/ui/ket.test.tsx`; fake timers):
  - `palette hover shows the card`: pointerEnter on `getByLabelText('H')` in the palette, advance 400 → tooltip contains `Hadamard`; the item has no `title` attribute.
  - `grid gate shows Here`: CNOT circuit; hover the X gate (`getByLabelText(/^X on q\[1\], step 2/)`) → tooltip contains `CX =` and `Here: on q[1], step 2`.
  - `control dot shows Here`: hover `getByLabelText('Control on q[0], step 2')` → `applied only when q[0] = 1`.
  - `escape closes card first, then deselects`: click the X gate (selected → `.selection` present), hover until open, Escape → tooltip gone and `.selection` still present; Escape again → `.selection` gone.
  - `no card while dragging`: pointerDown on the palette H item, pointerMove 20px (dnd-kit drag starts), pointerEnter on a grid gate, advance 1000 → no tooltip; any open card closes when the drag starts.
  - `card follows circuit edits`: RX `'pi/2'` gate open → `−i/√2`; change angle via the existing angle dialog flow (double-click, type `pi`, OK) → card (re-hovered) shows `−i`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/gateCardApp.test.tsx` — expected FAIL.
- [ ] **Step 3: Implement** the wiring; README: one bullet describing the card (hover or keyboard focus, click to pin in the palette, Here section with block form for controlled gates).
- [ ] **Step 4: Verify** `npm test` all pass (existing tests that relied on `title` text are updated to use the card or `aria-label`, recorded as a ruling), `npm run build` succeeds.
- [ ] **Step 5: Commit** `feat(ui): gate info card in the palette and on the circuit`.
