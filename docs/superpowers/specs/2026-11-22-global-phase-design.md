# Global phase in the output-state panel — design (short)

## Intent
The output-state panel writes T·T·T|1⟩ as just `|1⟩`: `formatKet` drops the global phase. The user
wants to see that phase (here e^{i3π/4}) where it belongs, without making equal states look different,
and with an honest explanation of what it means.

## Goals / non-goals / anti-goals
- Goal: show the global phase the formula dropped, next to the formula, in the output-state panel.
- Goal: explain on demand why it is not measurable, that it depends on gate conventions, and when it
  becomes measurable (controlled version → phase kickback).
- Non-goal: Bloch panel changes (a single qubit's Bloch vector has no global phase).
- Anti-goal: a made-up number. After MEASURE/RESET the simulator only has ρ; the phase recovered by
  `DensityMatrix.pureState()` is arbitrary, so it is not shown.
- Anti-goal: writing the factor into the formula (equal states would look different).

## Approaches
1. **Phase in the existing note line + expandable explanation (chosen by the user, 2026-11-22).**
2. Factor written into the formula `e^{i3π/4}·|1⟩`: rejected, equal states look different, copied
   formulas stop being comparable.
3. Hover tooltip: rejected, not reachable by keyboard or touch.

## Design
- `KetView` gets the backend (`SimResult.backend`) from `App`.
- The note under the formula (`.ket-note`, today "Global phase dropped · q[0] is the leftmost bit")
  becomes one of:
  - phase γ ≠ 0, state-vector backend: `Global phase e^{iγ} (D°) factored out · q[0] is the leftmost bit`
  - γ = 0: `Global phase: none · q[0] is the leftmost bit`
  - density backend: `Global phase unknown after measure/reset · q[0] is the leftmost bit`
- γ = arg of the first non-zero amplitude (the one `formatKet` rotates to real positive), in (−π, π].
  Written like the ket's phases: symbolic when a multiple of π/12 (`e^{i3π/4}`, `e^{−iπ/4}`;
  γ = π as `−1`, γ = ±π/2 as `i` / `−i`), else `e^{i0.400}`; degrees to 1 decimal. Zero within the
  ket's existing tolerance counts as none.
- Below the note, a native `<details>` with summary "Why can't it be measured?" and three short
  sentences: (1) multiplying the whole state by e^{iγ} changes no probability or expectation value;
  (2) its value depends on how gate matrices are defined (T = diag(1, e^{iπ/4}) and RZ(π/4) differ by
  e^{−iπ/8}); (3) it becomes a measurable relative phase when the same gates are controlled by
  another qubit (phase kickback).
- Copy keeps copying the formula without the phase.
- Mixed state: unchanged (no note, no details).
- Colours: existing tokens only (`--muted` note text); the literal ban and contrast tests stay green
  in both themes; `npm run a11y` 0 failures.

## Left to the builder
Helper name/location (a pure function in `src/ui/ket.ts` next to `formatKet`), exact markup of the
`<details>`, and test file layout.
