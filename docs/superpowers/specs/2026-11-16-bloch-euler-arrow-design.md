# Bloch panel: Euler amplitudes, visible arrow, README refresh

Date: 2026-11-16 · Size: small change

## Why

The Bloch panel's "Polar (Euler) form" section now shows only θ, φ and the ket.
The user wants to see the Euler form itself: each amplitude as r·e^{iφ} and as Re + i·Im,
with the ket below. Separately, the red state arrow in the 3D sphere fades or disappears
when it lies along a main axis. The README has fallen behind the last few merges.

## Approaches (Euler block)

- A. Polar only: α, β as r·e^{iφ}. Hides how e^{iφ} splits into cos φ + i·sin φ.
- **B. Polar and Re/Im side by side (picked by the user).** One extra column. It shows both forms.

## Design

1. **Euler block** (in `BlochPanel`, pure qubits only; the mixed-state message is unchanged):
   ```
   |ψ⟩ = cos(θ/2)|0⟩ + e^{iφ}·sin(θ/2)|1⟩      ← general formula, fixed text
         r·e^{iφ}          Re + i·Im
   α     0.707·e^{i0}      0.707 + 0.000i
   β     0.707·e^{iπ/4}    0.500 + 0.500i
   |ψ⟩ = (|0⟩ + e^{iπ/4}|1⟩)/√2              ← existing ket line, kept
   ```
   - The amplitudes come from `qubitAmplitudes(θ, φ)` (global phase dropped, so α is real and ≥ 0).
   - r is printed with 3 decimals. The phase uses `formatRadians` (π fractions when it is a multiple of π/12, otherwise decimals), and an amplitude of 0 prints as `0`.
   - Re/Im have 3 decimals with the sign written out (`0.500 − 0.500i`), and −0 shows as 0.
   - At a pole, where φ is undefined: |0⟩ gives α = 1·e^{i0}, β = 0, and |1⟩ gives α = 0, β = 1·e^{i0}.
   - The formatting is a pure helper in `polar.ts`, unit-tested. The panel gets a small table with test ids.
2. **Arrow visibility** (`blochScene.ts`):
   - Replace `ArrowHelper` (its shaft is a 1-pixel WebGL line) with a cylinder shaft (radius about 0.025) plus a cone head.
   - Use a brighter, unlit red (`MeshBasicMaterial`) so lighting doesn't darken it.
   - Draw the arrow last with `depthTest: false`, so the sphere and axis lines never hide or fade it.
   - Short vectors (mixed states) scale the head down as they do now. Length 0 still hides the arrow.
3. **Docs** (`README.md`):
   - Describe the new Euler table.
   - Add a line on invalid-angle warnings: such gates are drawn red, act as the identity, and are listed with a Fix… button.
   - The 2026-11-15 design spec stays as a historical record.

## Non-goals

No changes to the simulator, the Output state (KetView) panel, or the mini spheres. The mini spheres are already 2D SVG.

## Left to the builder

The exact shaft and head sizes and the shade of red, judged by eye in the running app. The table's CSS should follow the existing `bloch-coords` look.
