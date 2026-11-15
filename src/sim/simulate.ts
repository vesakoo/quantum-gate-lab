import type { Circuit } from '../model/circuit';
import { parseAngle } from './angle';
import type { Backend, Bloch } from './backend';
import { DensityMatrix } from './density';
import { GATE_INFO, gateMatrix } from './gates';
import { StateVector } from './statevector';

export type SimResult = {
  bloch: Bloch[][];
  probabilities: number[];
  qubitP1: number[];
  backend: 'statevector' | 'density';
};

function snapshot(b: Backend): Bloch[] {
  return Array.from({ length: b.n }, (_, q) => b.bloch(q));
}

export function simulate(c: Circuit): SimResult {
  const n = c.numQubits;
  const needsDensity = c.steps.some((s) =>
    s.ops.some((o) => GATE_INFO[o.gate].kind === 'measure' || GATE_INFO[o.gate].kind === 'reset'),
  );
  const backend: Backend = needsDensity ? new DensityMatrix(n, c.initial) : new StateVector(n, c.initial);
  const bloch: Bloch[][] = [snapshot(backend)];

  for (const step of c.steps) {
    for (const op of step.ops) {
      const kind = GATE_INFO[op.gate].kind;
      if (kind === 'barrier') continue;
      if (kind === 'measure') backend.measure(op.wires[0]);
      else if (kind === 'reset') backend.reset(op.wires[0]);
      else {
        const params: number[] = [];
        let ok = true;
        for (const expr of op.params) {
          const v = parseAngle(expr);
          if (v === null) {
            ok = false;
            break;
          }
          params.push(v);
        }
        if (!ok) continue;
        backend.applyGate(gateMatrix(op.gate, params), op.wires, step.controls);
      }
    }
    bloch.push(snapshot(backend));
  }

  const probabilities = Array.from(backend.probabilities(), (p) => (p < 1e-12 ? 0 : p));
  const last = bloch[bloch.length - 1];
  return {
    bloch,
    probabilities,
    qubitP1: last.map((b) => b.probs.one),
    backend: needsDensity ? 'density' : 'statevector',
  };
}
