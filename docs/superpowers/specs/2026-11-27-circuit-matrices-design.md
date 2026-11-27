# Circuit as matrices: design (short)

## Intent
Below "Circuit as operators", the user wants to see the circuit as a matrix multiplication. Each step
appears as its own written-out matrix (like `CX = (4×4)`), not as Dirac factors. The product follows
as one matrix, and then the circuit matrix applied to the input with its result. This lets the user
follow the linear algebra behind the simulated state.

## Goals / non-goals / anti-goals
- Goal: a new panel "Circuit as matrices" directly below the operator panel. It has two lines that
  wrap when long:
  1. `U = M_k · … · M₁ = <product>`, rightmost step first as in the operator panel, with the step
     number under each factor.
  2. `U·|input⟩ = <U> · <input column> = <output column>`.
- Goal: the matrices use exactly the simulator's conventions: q[0] is the MSB, the gate wire order,
  controls, and the B gate.
- Non-goal: more than 4 qubits. Above that the panel shows only the note
  "Matrices are written out up to 4 qubits".
- Non-goal: Copy button, block decomposition, symbolic algebra.
- Anti-goal: matrices that disagree with the simulation (a second hand-written Kronecker builder that
  could drift).

## Approaches
1. **Columns from the simulator (chosen, user 2026-11-27).** For each basis |j⟩, run the step's
   gates on a `StateVector` with the same code path as `simulate`. The amplitudes are column j.
   Conventions match by construction. The cost is 16 runs per step at 4 qubits, which is trivial.
2. Kronecker products written by hand: rejected, because they duplicate the wire-order and control
   logic.
3. Symbolic algebra: rejected as too heavy.

## Design
- The panel is computed from the circuit, like `OperatorView`. It never lags behind the simulation.
- Each entry uses `formatComplex` (1/√2, i, e^{iπ/4}, else decimals). When all non-zero entries of a
  matrix or vector share one magnitude ≠ 1 that `symbolicSqrt` can write, that magnitude is factored
  out as a scalar (`·1/√2`), and the entries keep only their phase.
- Steps with no unitary gate (empty, or barrier only) are skipped. With no steps the first line is
  `U = I`, and the identity is still written out on the second line.
- A gate with an invalid angle acts as I, as in the simulator. The panel shows the same note as the
  operator panel.
- At the first step with MEASURE/RESET, the product ends before that step (including that step's
  other gates). The panel shows the same note as the operator panel ("Measurement at step N — …").
- Only existing tokens are used, with no colour literals. The panel renders with `MatrixView`.
  `npm test`, `npm run typecheck`, and `npm run a11y` (0 failures) stay green.

## Left to the builder
The module name and location (pure functions next to the existing operator model), the exact markup
and wrapping CSS, and the test layout.
