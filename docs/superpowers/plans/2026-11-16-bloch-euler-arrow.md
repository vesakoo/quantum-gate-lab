# Bloch Euler Table, Visible Arrow, README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each qubit amplitude as r·e^{iφ} and Re + i·Im in the Bloch panel, make the 3D state arrow clearly visible on any axis, and bring the README up to date.

**Architecture:** A pure formatter `eulerRows` in `src/ui/polar.ts` feeds a small table in `BlochPanel.tsx`; the three.js `ArrowHelper` in `blochScene.ts` is replaced by a mesh arrow (cylinder + cone) drawn on top; README text edits.

**Tech Stack:** React + TypeScript, Vitest (jsdom), three.js.

**Spec:** `docs/superpowers/specs/2026-11-16-bloch-euler-arrow-design.md`

## Global Constraints

- Global phase dropped: α is real and ≥ 0 (amplitudes from `qubitAmplitudes(θ, φ)`).
- r, Re, Im: 3 decimals; phases via `formatRadians`; an amplitude of 0 prints `0` in the polar column; no `−0.000`.
- Minus sign is U+2212 `−` (as elsewhere in the UI).
- Mixed state: no table; existing `bloch-euler-mixed` message unchanged.
- Existing `bloch-euler` ket line and its tests stay as they are.
- No changes to simulator, KetView, or mini spheres.

## Review Focus

1. Amplitudes that round to zero (e.g. Im of |+⟩'s β ≈ 1e-17) must print `0.000`, never `−0.000`. → Task 1 test "never prints −0.000".
2. Negative real part (φ = 3π/4) prints `−0.500 + 0.500i`. → Task 1 test.
3. Pole |1⟩ (θ = π, φ null): α polar `0`, β `1.000·e^{i0}`. → Task 1 test.
4. φ not a multiple of π/12 shows decimal radians `e^{i1.000}`. → Task 1 test.
5. Arrow along +z / +x (axis-aligned) must be clearly visible over the grey axis line and sphere. → Task 2 visual check.

---

### Task 1: Euler amplitude table

**Files:**
- Modify: `src/ui/polar.ts` (add `EulerRow`, `eulerRows`)
- Modify: `src/ui/BlochPanel.tsx` (formula line + table between θ/φ list and ket line)
- Modify: `src/ui/styles.css` (`.bloch-euler-table`, after `.bloch-euler`)
- Test: `tests/ui/polar.test.ts`, `tests/ui/bloch.test.tsx`

**Interfaces:**
- Produces: `export type EulerRow = { name: 'α' | 'β'; polar: string; rect: string }` and `export function eulerRows(theta: number, phi: number | null): EulerRow[]` (always `[α, β]`). `polar` uses the ket `e^{…}` syntax so `KetText` (from `./KetView`) renders the superscript.

- [ ] **Step 1: Write failing unit tests** in `tests/ui/polar.test.ts`:

```ts
describe('eulerRows', () => {
  const rows = (t: number, p: number | null) => eulerRows(t, p).map((r) => [r.name, r.polar, r.rect]);
  it('θ = π/2, φ = π/4', () => {
    expect(rows(PI / 2, PI / 4)).toEqual([
      ['α', '0.707·e^{i0}', '0.707 + 0.000i'],
      ['β', '0.707·e^{iπ/4}', '0.500 + 0.500i'],
    ]);
  });
  it('negative real part at φ = 3π/4', () => {
    expect(eulerRows(PI / 2, (3 * PI) / 4)[1].rect).toBe('−0.500 + 0.500i');
  });
  it('negative imaginary part at φ = 3π/2', () => {
    expect(eulerRows(PI / 2, (3 * PI) / 2)[1]).toMatchObject({ polar: '0.707·e^{i3π/2}', rect: '0.000 − 0.707i' });
  });
  it('poles: zero amplitude prints 0', () => {
    expect(rows(0, null)).toEqual([
      ['α', '1.000·e^{i0}', '1.000 + 0.000i'],
      ['β', '0', '0.000 + 0.000i'],
    ]);
    expect(rows(PI, null)).toEqual([
      ['α', '0', '0.000 + 0.000i'],
      ['β', '1.000·e^{i0}', '1.000 + 0.000i'],
    ]);
  });
  it('decimal phase off the π/12 grid', () => {
    expect(eulerRows(PI / 2, 1)[1].polar).toBe('0.707·e^{i1.000}');
  });
  it('never prints −0.000', () => {
    for (const p of [0, PI / 2, PI, (3 * PI) / 2]) for (const r of eulerRows(PI / 2, p)) expect(r.rect).not.toMatch(/−0\.000/);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/ui/polar.test.ts` — Expected: FAIL (`eulerRows` not exported).

- [ ] **Step 3: Implement `eulerRows` in `src/ui/polar.ts`.** Magnitude/phase per amplitude: α = (cos(θ/2), 0), β = (sin(θ/2), φ ?? 0). A magnitude < 5e-4 is "zero" (polar `'0'`). Re/Im = r·cos, r·sin, each snapped to 0 when |v| < 5e-4; format `${re} ${im < 0 ? '−' : '+'} ${|im|}i` with `−` prefix for negative re.

- [ ] **Step 4: Run** `npx vitest run tests/ui/polar.test.ts` — Expected: PASS.

- [ ] **Step 5: Write failing panel test** — append to the existing test `'the panel shows polar angles and the state in symbolic ket form'` in `tests/ui/bloch.test.tsx`:

```ts
// after the step-2 (|i⟩) assertions on `p`:
expect(p.getByTestId('bloch-euler-formula')).toHaveTextContent('|ψ⟩ = cos(θ/2)|0⟩ + eiφ·sin(θ/2)|1⟩');
expect(p.getByTestId('euler-β')).toHaveTextContent('β0.707·eiπ/20.000 + 0.707i');
expect(p.getByTestId('euler-α')).toHaveTextContent('α0.707·ei00.707 + 0.000i');
```

and to the mixed-state test (around line 111): `expect(within(panel).queryByTestId('bloch-euler-table')).not.toBeInTheDocument();`

- [ ] **Step 6: Run** `npx vitest run tests/ui/bloch.test.tsx` — Expected: FAIL (testids missing).

- [ ] **Step 7: Render in `BlochPanel.tsx`** inside the non-mixed branch, before the existing `bloch-euler` `<p>` (wrap both in a fragment):
  - `<p className="bloch-euler" data-testid="bloch-euler-formula">|ψ⟩ = <KetText text="cos(θ/2)|0⟩ + e^{iφ}·sin(θ/2)|1⟩" /></p>`
  - `<table className="bloch-euler-table" data-testid="bloch-euler-table">` with header row `['', 'r·e^{iφ}', 'Re + i·Im']` (header cell rendered via `KetText`), and one `<tr data-testid={`euler-${row.name}`}>` per `eulerRows(polar.theta ?? 0, polar.phi)`: `<th scope="row">{name}</th><td><KetText text={polar} /></td><td>{rect}</td>`.
  - CSS: monospace 13px like `.bloch-euler`, `th` italic bold, cells left-aligned, `padding: 1px 10px 1px 0`, `margin: 0 0 6px`.

- [ ] **Step 8: Run** `npm test && npm run typecheck` — Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/ui/polar.ts src/ui/BlochPanel.tsx src/ui/styles.css tests/ui/polar.test.ts tests/ui/bloch.test.tsx
git commit -m "feat(ui): Euler amplitude table (r·e^{iφ} and Re + i·Im) in Bloch panel"
```

### Task 2: Visible 3D state arrow

**Files:**
- Modify: `src/ui/blochScene.ts` (replace `ArrowHelper` + `ARROW` color)

**Interfaces:** `BlochScene` (`update`, `dispose`) unchanged.

- [ ] **Step 1: Replace the arrow** with a `THREE.Group` holding a shaft `CylinderGeometry(0.025, 0.025, 1, 16)` and head `ConeGeometry(0.07, 1, 20)`, both `MeshBasicMaterial({ color: 0xff2020, depthTest: false })`, `renderOrder = 10` on both meshes and on `tipDot` (also `depthTest: false`). Translate geometries so their base is at y = 0 (`geo.translate(0, 0.5, 0)`). In `update`: orient the group with `quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir)`; head length `h = Math.min(0.18, len * 0.45)`; shaft `scale.y = len − h`; head `position.y = len − h`, `scale.y = h`. Keep `visible = false` for len < 1e-6. Track geometries/materials in `disposables`; drop `arrow.dispose()`.

- [ ] **Step 2: Run** `npm run typecheck && npm test` — Expected: pass (jsdom never loads the scene).

- [ ] **Step 3: Visual check** in the dev server (`npm run dev`): open the Bloch panel for q[0] input (|0⟩, along +z), after H (|+⟩, along +x toward viewer), and after SX† (|i⟩, along +y). Expected: a thick bright-red arrow clearly visible in all three, not hidden behind the axis line or dimmed by the sphere; rotate to confirm. Take screenshots.

- [ ] **Step 4: Commit**

```bash
git add src/ui/blochScene.ts
git commit -m "fix(ui): thick, always-on-top Bloch state arrow"
```

### Task 3: README

**Files:**
- Modify: `README.md` (Conventions list)

- [ ] **Step 1: Edit** the Bloch-panel bullet: after the |ψ⟩ formula sentence, add that a table lists each amplitude α, β as r·e<sup>iφ</sup> and as Re + i·Im, with the ket form below. Add a new bullet: "A rotation angle that cannot be parsed (e.g. `pi/`) makes the gate red; it acts as the identity, and a warning list above the grid names each skipped gate with a Fix… button that opens its angle dialog." Verify that wording against `src/ui/App.tsx` warning rendering before committing and adjust if the UI differs.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README for Euler table and invalid-angle warnings"
```
