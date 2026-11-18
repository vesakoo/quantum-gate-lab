# Circuit as operators: Dirac formula panel

Date: 2026-11-18 · Size: small change

## Why

The user wants the whole circuit written as one operator formula in Dirac notation,
e.g. `|ψ⟩ = (|0⟩⟨0| ⊗ I + |1⟩⟨1| ⊗ X) · (H ⊗ I) |00⟩`, so it can be copied as plain text
into notes or chat. A later step may also show the operators as matrices
(full 2ⁿ×2ⁿ or block form), so the formula must come from a model a matrix view can reuse.

## Goals / non-goals

- Goal: an unsimplified, exact formula that matches what the simulator computes, plus a Copy button (Unicode).
- Non-goal now: LaTeX output, matrix display, simplification (no dropped identities, no `H₂` shorthand).
- Anti-goal: a formula that looks like a product of matrices but isn't one (e.g. a measurement written as a factor).

## Approaches

- A. Direct string formatter (like `ket.ts`). Least work, but the matrix view would have to
  re-derive the same column → terms → factors interpretation and could drift from the formula.
- **B. Intermediate model + Unicode renderer (picked by the user).** The circuit becomes a data
  structure (product of factors; factor = sum of terms; term = tensor product of slots); a small
  renderer turns it into text. The matrix view later renders the same model via `gateMatrix`.
- (Dropped) computing it in the Web Worker: it is cheap and depends only on the circuit.

## Decided with the user

- Unicode only, copy puts `|ψ⟩ = …` on the clipboard.
- No simplification: every wire appears in every tensor product (`H ⊗ I ⊗ I ⊗ I`).
- Controls in projector form (option A):
  `(|0⟩⟨0| ⊗ I ⊗ I ⊗ I + |1⟩⟨1| ⊗ X ⊗ I ⊗ I)`.
- Placement: its own panel **below the Probabilities chart**.
- Two-qubit gates (SWAP, iSWAP, √SWAP, B): adjacent and in order (`wires[1] = wires[0] + 1`)
  → one factor in the tensor product, `I ⊗ SWAP ⊗ I`. Non-adjacent or reversed → that whole
  column is written with qubit subscripts, slots in q order by first wire: `SWAP₀,₂ ⊗ H₁ ⊗ I₃`
  (subscripts in `wires` order, so B's H end comes first: `B₁,₀`). In a controlled column every term uses the same style.

## Design

1. **Model** (`src/model/operators.ts`, pure, unit-tested):
   - `circuitOperators(c: Circuit) → { initial: (0|1)[]; factors: Factor[]; stoppedAt: { step: number; kind: 'measure' | 'reset' } | null }`.
   - `Factor = { step: number; terms: Term[]; indexed: boolean }`, `Term = Slot[]` covering every wire once,
     `Slot = { wires: number[]; op: { gate: GateId; params: string[] } | { proj: 0 | 1 } | 'I' }`.
   - Factors are in circuit order (step 0 first); the renderer reverses them.
2. **Column rules**
   - Empty columns and barrier-only columns are skipped. An explicit `I` gate is kept (it was placed on purpose).
   - No controls: one term with the column's gates, `I` elsewhere.
   - k controls (each `on1` → `|1⟩⟨1|`, `on0` → `|0⟩⟨0|`): k + 1 terms, controls in q order —
     term j has controls 1…j−1 satisfied, control j unsatisfied, everything else `I`; the last term
     has all controls satisfied plus the gates. Example (Toffoli):
     `|0⟩⟨0| ⊗ I ⊗ I + |1⟩⟨1| ⊗ |0⟩⟨0| ⊗ I + |1⟩⟨1| ⊗ |1⟩⟨1| ⊗ X`. Exact, no subtraction, no 2ᵏ blow-up.
   - The first step containing MEASURE or RESET ends the formula (same cut point as the simulator's
     switch to the density backend); `stoppedAt` records it.
3. **Renderer** (`src/ui/operatorText.ts`, unit-tested):
   - `|ψ⟩ = F_last · … · F_first |q₀q₁…⟩`; each factor in parentheses, terms joined by ` + `,
     slots by ` ⊗ `, factors by ` · `. With no factors: `|ψ⟩ = |0000⟩`.
   - Gate names from `GATE_INFO[..].label` (`S†`, `iSWAP`, `√SWAP`, …); parameters with
     `formatAngle`: `RX(π/2)`, `U(π,0,π)`.
   - Subscripts with Unicode digits (`₀…₉`, multi-digit for ≥ 10 qubits).
4. **Panel** (`src/ui/OperatorView.tsx`, under `ProbabilityChart` in `App`):
   - Title "Circuit as operators", Copy button (same pattern as `KetView`), the formula wrapping
     freely, a note line "Last step on the left · q[0] is the leftmost factor".
   - If `stoppedAt`: note "Measurement (or reset) at step k: the formula ends before it." (1-based step).
   - Built from the current circuit with `useMemo`, not from `SimResult`, so it never lags.
5. **Docs**: README gets a short paragraph about the panel.

## Calls I made (check these)

- Gates with an angle that does not parse are written as typed (e.g. `RX(foo)`) and the panel adds
  "Gates with invalid angles act as I in the simulation." The formula itself does not hide them.
- The formula doesn't end with `= result`, since the Output state panel already shows the ket.
- English UI text, like the rest of the app.

## Left to the builder

- CSS and test ids for the panel; exact file split between model and renderer helpers.
