# Circuit export (Qiskit + OpenQASM 2.0) — design

## Intent

A circuit built and understood in the lab should be runnable on real hardware: IBM Quantum (Qiskit,
Composer), VTT's IQM machines (through `qiskit-iqm`) or other services. The lab exports the circuit as
code; it does not run anything itself.

## Goals

- Export the current circuit as **Qiskit Python** code. This works for **every** circuit the lab can build.
- Export the current circuit as **OpenQASM 2.0**. This works whenever the circuit fits the standard gate set;
  otherwise the export says which step does not fit and points to the Qiskit tab.
- The exported circuit gives the same outcome probabilities as the lab. The same unitary, up to the bit order
  note below, before any final measurement.

## Non-goals

- **Import.** The user decided against it: import could not reproduce circuits identically in general.
- OpenQASM 3, Cirq, Q#, Braket SDK. These could be added later from the same exporter structure.
- Running jobs, API keys, talking to any service.

## Approaches considered

- **A. OpenQASM 2.0 only.** Widest support, but multi-controlled or controlled non-standard gates such as
  controlled iSWAP, H with two controls, or a controlled B would need hand-made decompositions, or would
  have to be refused.
- **B. Qiskit Python only.** Exact for everything (`gate.control(n, ctrl_state=…)`), and Qiskit decomposes
  for the target backend, which covers IBM and VTT. It needs Python, though, and is not language-neutral.
- **C. OpenQASM 3.** Exact (`ctrl @`, `negctrl @`), but tool support is uneven (Qiskit needs an extra
  package to read it).
- **Chosen: B + A together.** Qiskit is always available and exact; OpenQASM 2.0 covers the common case and
  opens directly in IBM Composer.

## How it works

### UI

- An **Export…** button in the toolbar after Copy link opens a dialog. It follows the existing angle dialog
  pattern: Esc closes it and focus returns to the button.
- The dialog has two tabs, **Qiskit** and **OpenQASM 2.0**. Each shows the code in a read-only, scrollable,
  monospace block with **Copy** and **Download** (`circuit.py` / `circuit.qasm`) buttons.
- If OpenQASM 2.0 cannot express the circuit, its tab shows the reason instead of code, e.g. "Step 3: H with
  2 controls has no OpenQASM 2.0 gate. Use the Qiskit tab", and offers no Copy or Download.
- Same accessibility bar as the rest of the app: keyboard tabs (arrow keys, `role="tablist"`), focus visible,
  the code block focusable for scrolling, and `npm run a11y` clean in both themes.

### Translation, shared by both targets

- Steps are emitted in order. Within a step, controls are attached to **each** unitary op of the step, as in
  the simulator.
- **Controls.** Filled controls are ordinary controls. A hollow (on-0) control is encoded in Qiskit as
  `ctrl_state`; in OpenQASM 2.0 it is written as `x` on that wire before and after the controlled gate.
- **Initial |1⟩ inputs** become an `x` at the start.
- **MEASURE** becomes `measure q[i] -> c[i]`, **RESET** becomes `reset q[i]`, and **BARRIER** becomes
  `barrier q[i]`.
- **Final measurement (my call, revised after review).** Every qubit whose last op is not a MEASURE is measured at the end, so counts always match the lab. The original rule below left partial or early measurements unmatched.
  Original rule: if the circuit has no MEASURE at all, a measurement of every qubit into
  `c` is added at the end with a comment, because hardware only returns counts. If the circuit has its own
  measurements, nothing is added. The lab's dephasing measure and a real collapsing measure give the same
  outcome statistics, so mid-circuit measures stay faithful.
- **Angles.** The user's expression is kept when it is valid in the target (numbers, `pi`, `+ - * /`,
  parentheses; `π` is written as `pi`). Otherwise the evaluated number is written.
- **Invalid angles (my call).** If a gate's angle does not parse (the gate is drawn red), the export does not
  produce code. It says which gate to fix, matching the existing warning, rather than silently dropping the gate.
- **Wire numbering** stays the same, so lab `q[i]` is target `q[i]`.
- **Bit order comment (my call).** Qiskit prints count keys with q[0] on the right, the lab with q[0] on the
  left. The exported code carries a one-line comment explaining this, with an example from the circuit. The
  circuit itself is not reordered.
- A header comment names the lab, the circuit size and a link back to the circuit (the share URL).

### Gate mapping

| Lab | Qiskit | OpenQASM 2.0 (`qelib1.inc`) |
|---|---|---|
| I X Y Z H S Sdg T Tdg SX SXdg | `id x y z h s sdg t tdg sx sxdg` | same names |
| RX RY RZ P | `rx ry rz p` | same names |
| U(θ,φ,λ) | `u` (same matrix convention as the lab) | `u3` (or `u`, whichever the builder verifies) |
| SWAP | `swap` | `swap` |
| iSWAP | `iswap` | a `gate iswap` definition in the file header, from standard gates |
| √SWAP | an exact Qiskit gate (e.g. `SwapGate().power(0.5)` or a unitary) | a `gate sqswap` definition from standard gates, if one exists exactly; otherwise "not expressible" |
| B (Bell) | `h` then `cx` (`wires[0]` is the H/control end) | `h` then `cx` |

Note: `sx`, `sxdg`, `p`, `cp` and `csx` are not in the original OpenQASM 2.0 `qelib1.inc`. They are in Qiskit's
extended `qelib1.inc`, which IBM Composer and `QuantumCircuit.from_qasm_str` use, and that is the target here.
A strict OpenQASM 2.0 tool may reject them. The header comment says the file targets Qiskit's `qelib1.inc`.

The table shows the one-control OpenQASM 2.0 forms the builder can rely on: `cx cy cz ch crx cry crz cp
cu3 csx cswap`, plus `ccx` for X with two controls. Any other controlled combination (more controls, or a
control on iSWAP, √SWAP, B, SX† …) is **not expressible** in OpenQASM 2.0 and is reported per step.

### Code structure

- `src/export/` holds pure functions, one module per target sharing one lowering step:
  `lower(circuit) → ExportOp[] | ExportError`, then `toQiskit(ops)` and `toQasm2(ops)`. These have no React
  and are unit tested on text.
- An `ExportDialog.tsx` component, wired into `App.tsx`.

## Verification

- **Unit tests** check the emitted text for every gate, on-0 controls, initial |1⟩, measure/reset/barrier,
  added final measurement, angle expressions, invalid-angle refusal, and each "not expressible" case.
- **Exactness of decompositions** (B, iSWAP, √SWAP, hollow-control X sandwiches) is tested in TypeScript.
  Each decomposition is applied with the lab's own `gateMatrix`/`StateVector` and compared with the lab
  gate's matrix, including global phase where it matters (it matters once the gate is controlled).
- **One-off cross-check against real Qiskit** in a throwaway Python venv (not part of `npm test`; Qiskit is
  not installed locally): for a set of circuits, `Operator(exported)` equals the lab's matrix, up to Qiskit's
  bit order.

## Left to the builder

- The exact `gate iswap` / `gate sqswap` OpenQASM 2.0 bodies. They must pass the exactness test. If √SWAP has
  no exact form from `qelib1.inc` gates, report it as not expressible.
- Whether to write `u3` or `u` in OpenQASM 2.0, decided by the Qiskit cross-check.
- Dialog styling, within the existing panel and dialog look.
