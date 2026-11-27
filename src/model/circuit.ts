import type { GateId } from '../sim/gates';
import type { Control } from '../sim/backend';

export type { Control, ControlKind } from '../sim/backend';

export type Op = { id: string; gate: GateId; wires: number[]; params: string[] };
export type Step = { ops: Op[]; controls: Control[] };
export type Circuit = { numQubits: number; initial: (0 | 1)[]; steps: Step[] };

export function emptyCircuit(numQubits = 3, numSteps = 12): Circuit {
  return {
    numQubits,
    initial: Array.from({ length: numQubits }, () => 0 as const),
    steps: Array.from({ length: numSteps }, () => ({ ops: [], controls: [] })),
  };
}
