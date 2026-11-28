import type { GateId } from '../sim/gates';

/** One gate of a decomposition, on local wires 0/1; `control` is an on-1 control wire. */
export type DecompOp = { gate: GateId; wires: number[]; control?: number };

/**
 * Lab gates that have no standard counterpart, written with standard gates. Each equals the lab gate
 * exactly, including global phase (tests/export/decompositions.test.ts), so they stay right when controlled.
 */
export const DECOMP: { B: DecompOp[]; ISWAP: DecompOp[]; SQSWAP: DecompOp[] } = {
  // H on wires[0], then CNOT wires[0] → wires[1]
  B: [
    { gate: 'H', wires: [0] },
    { gate: 'X', wires: [1], control: 0 },
  ],
  ISWAP: [
    { gate: 'S', wires: [0] },
    { gate: 'S', wires: [1] },
    { gate: 'H', wires: [0] },
    { gate: 'X', wires: [1], control: 0 },
    { gate: 'X', wires: [0], control: 1 },
    { gate: 'H', wires: [1] },
  ],
  SQSWAP: [
    { gate: 'X', wires: [0], control: 1 },
    { gate: 'SX', wires: [1], control: 0 },
    { gate: 'X', wires: [0], control: 1 },
  ],
};
