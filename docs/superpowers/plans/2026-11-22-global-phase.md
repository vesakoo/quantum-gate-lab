# Global Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the global phase that `formatKet` drops, in the output-state panel note, with an expandable explanation.

**Architecture:** A pure helper `globalPhase` in `src/ui/ket.ts` returns the phase text; `KetView` gets the backend from `App` and picks the note text; a native `<details>` holds the explanation.

**Tech Stack:** React 18, TypeScript, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-22-global-phase-design.md`

## Global Constraints
- Note texts verbatim: `Global phase e^{iγ} (D°) factored out · q[0] is the leftmost bit`, `Global phase: none · q[0] is the leftmost bit`, `Global phase unknown after measure/reset · q[0] is the leftmost bit`.
- Summary text: `Why can't it be measured?`
- Copy keeps copying `|ψ⟩ = <formula>` without the phase. Mixed state view unchanged.
- No colour literals; existing tokens only. `npm test`, `npm run typecheck`, `npm run a11y` (0 failures) green.

## Review Focus
1. γ = π (e.g. Z·X|0⟩ = −|1⟩): written `−1`, not `e^{iπ}`; degrees `180.0°`. → Task 1 test.
2. Phase with rounding noise near 0 (e.g. H·H|0⟩ gives 1 + tiny im): must read "none". → Task 1 test.
3. Density backend with a pure recovered state: must say "unknown", never a number. → Task 2 test.
4. Non-π/12 phase (RZ with angle 0.8 gives −0.4): `e^{−i0.400}` and `−22.9°`. → Task 1 test.
5. Copy after the change still copies the formula only. → Task 2 test.

---

### Task 1: `globalPhase` helper

**Files:**
- Modify: `src/ui/ket.ts` (next to `formatKet`)
- Test: `tests/ui/ket.test.tsx` (new `describe('globalPhase')`)

**Interfaces:**
- Produces: `export function globalPhase(amp: ArrayLike<number>): { text: string; degrees: string } | null` — null when the phase is 0 (within the ket's `ZERO2`-style tolerance, 1e-9 rad) or the state is all zero. `text` uses the same symbols as the ket (`e^{i3π/4}`, `e^{−iπ/4}`, `−1`, `i`, `−i`, else `e^{i0.400}` / `e^{−i0.400}`); `degrees` is `135.0°` with one decimal and `−` (U+2212) for negatives. γ is in (−π, π].

- [ ] **Step 1: Write the failing tests**

```ts
describe('globalPhase', () => {
  const amp = (re: number, im: number, n = 2, at = 1) => { const a = new Array(2 * n).fill(0); a[2 * at] = re; a[2 * at + 1] = im; return a; };
  const r = Math.SQRT1_2;
  it('T·T·T|1⟩: e^{i3π/4}, 135.0°', () => expect(globalPhase(amp(-r, r))).toEqual({ text: 'e^{i3π/4}', degrees: '135.0°' }));
  it('γ = π is −1, 180.0°', () => expect(globalPhase(amp(-1, 0))).toEqual({ text: '−1', degrees: '180.0°' }));
  it('γ = π/2 is i; −π/2 is −i', () => {
    expect(globalPhase(amp(0, 1))).toEqual({ text: 'i', degrees: '90.0°' });
    expect(globalPhase(amp(0, -1))).toEqual({ text: '−i', degrees: '−90.0°' });
  });
  it('negative multiple of π/12', () => expect(globalPhase(amp(r, -r))).toEqual({ text: 'e^{−iπ/4}', degrees: '−45.0°' }));
  it('non-π/12 phase as decimals', () =>
    expect(globalPhase(amp(Math.cos(-0.4), Math.sin(-0.4)))).toEqual({ text: 'e^{−i0.400}', degrees: '−22.9°' }));
  it('zero and rounding noise are none', () => {
    expect(globalPhase(amp(1, 0))).toBeNull();
    expect(globalPhase(amp(1, 1e-12))).toBeNull();
  });
  it('uses the first non-zero amplitude', () =>
    expect(globalPhase([0, 0, 0, r, r, 0])).toEqual({ text: 'i', degrees: '90.0°' }));
});
```

- [ ] **Step 2:** `npx vitest run tests/ui/ket.test.tsx -t globalPhase` → FAIL (`globalPhase` is not exported).
- [ ] **Step 3: Implement `globalPhase`** reusing `symbolicPhase` (`{neg, unit}`: neg+'' → `−1`, ''+'' never reached because 0 → null, neg+'i' → `−i`) and the ket's `dec` for the decimal form.
- [ ] **Step 4:** same command → PASS; `npm test` green.
- [ ] **Step 5: Commit** `feat(ket): globalPhase helper`.

### Task 2: note and explanation in `KetView`

**Files:**
- Modify: `src/ui/KetView.tsx`, `src/ui/App.tsx:307` (pass `backend={sim.backend}`), `src/ui/styles.css` (`.ket-why` spacing only, tokens only)
- Test: `tests/ui/ket.test.tsx` (App-level, via URL hash as the existing tests do)

**Interfaces:**
- Consumes: `globalPhase` (Task 1); `SimResult.backend: 'statevector' | 'density'`.
- Produces: `KetView` prop `backend: 'statevector' | 'density'` (required).

- [ ] **Step 1: Write the failing tests**
  - `|1⟩` then T, T, T on 1 qubit: `.ket-note` text is `Global phase ei3π/4 (135.0°) factored out · q[0] is the leftmost bit` (sup renders without `^{}`); formula still `|ψ⟩ = |1⟩`.
  - H on |0⟩: note `Global phase: none · q[0] is the leftmost bit`.
  - X then MEASURE on |0⟩ (density backend, pure): note `Global phase unknown after measure/reset · q[0] is the leftmost bit`.
  - `getByText("Why can't it be measured?")` is a `SUMMARY` inside a `DETAILS`; the details text contains `changes no probability`, `e^{−iπ/8}` rendered as e<sup>−iπ/8</sup>, and `phase kickback`.
  - Copy after T·T·T|1⟩ writes exactly `|ψ⟩ = |1⟩` (spy on `navigator.clipboard.writeText`).
  - Mixed state (H then MEASURE on q[0]) shows no `.ket-note` and no `details`.
- [ ] **Step 2:** `npx vitest run tests/ui/ket.test.tsx` → the new tests FAIL.
- [ ] **Step 3: Implement.** Note text from `backend === 'density'` → unknown; else `globalPhase(amplitudes)` → none / `Global phase <KetText text={p.text}/> (p.degrees) factored out`. The `<details className="ket-why">` sits right after the note with the three sentences from the spec (use `KetText` for the exponents).
- [ ] **Step 4:** `npm test`, `npm run typecheck` → green; `npm run a11y` → 0 failures.
- [ ] **Step 5: Commit** `feat(ket): show the global phase and why it is not measurable`.
