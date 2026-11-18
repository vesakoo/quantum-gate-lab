import { describe, expect, it } from 'vitest';
import { emptyCircuit, type Control, type Op } from '../../src/model/circuit';
import { circuitOperators } from '../../src/model/operators';
import type { GateId } from '../../src/sim/gates';
import { formatOperators, subscript } from '../../src/ui/operatorText';

let uid = 0;
const op = (gate: GateId, wires: number[], params: string[] = []): Op => ({ id: `t${uid++}`, gate, wires, params });
const on1 = (wire: number): Control => ({ wire, kind: 'on1' });

function text(n: number, steps: [Op[], Control[]?][], initial?: (0 | 1)[]): string {
  const c = emptyCircuit(n, Math.max(1, steps.length));
  steps.forEach(([ops, controls = []], s) => (c.steps[s] = { ops, controls }));
  if (initial) c.initial = initial;
  return formatOperators(circuitOperators(c));
}

const bell = (n: number) => text(n, [[[op('H', [0])]], [[op('X', [1])], [on1(0)]]]);

describe('formatOperators', () => {
  it('bell on 2 qubits', () => {
    expect(bell(2)).toBe('|ψ⟩ = (|0⟩⟨0| ⊗ I + |1⟩⟨1| ⊗ X) · (H ⊗ I) |00⟩');
  });

  it('bell on 4 qubits, unsimplified', () => {
    expect(bell(4)).toBe(
      '|ψ⟩ = (|0⟩⟨0| ⊗ I ⊗ I ⊗ I + |1⟩⟨1| ⊗ X ⊗ I ⊗ I) · (H ⊗ I ⊗ I ⊗ I) |0000⟩',
    );
  });

  it('empty circuit is just the input ket', () => {
    expect(text(4, [])).toBe('|ψ⟩ = |0000⟩');
    expect(text(4, [], [0, 1, 0, 0])).toBe('|ψ⟩ = |0100⟩');
  });

  it('params and daggers', () => {
    expect(text(2, [[[op('RX', [0], ['pi/2']), op('Sdg', [1])]]])).toBe('|ψ⟩ = (RX(π/2) ⊗ S†) |00⟩');
    expect(text(1, [[[op('U', [0], ['pi', '0', 'pi'])]]])).toBe('|ψ⟩ = (U(π,0,π)) |0⟩');
  });

  it('adjacent two-qubit gate', () => {
    expect(text(4, [[[op('SWAP', [1, 2])]]])).toBe('|ψ⟩ = (I ⊗ SWAP ⊗ I) |0000⟩');
  });

  it('indexed columns', () => {
    expect(text(4, [[[op('SWAP', [0, 2]), op('H', [1])]]])).toBe('|ψ⟩ = (SWAP₀,₂ ⊗ H₁ ⊗ I₃) |0000⟩');
    expect(text(2, [[[op('B', [1, 0])]]])).toBe('|ψ⟩ = (B₁,₀) |00⟩');
  });

  it('controlled and indexed', () => {
    expect(text(3, [[[op('SWAP', [0, 2])], [on1(1)]]])).toBe(
      '|ψ⟩ = (I₀ ⊗ |0⟩⟨0|₁ ⊗ I₂ + SWAP₀,₂ ⊗ |1⟩⟨1|₁) |000⟩',
    );
  });

  it('multi-digit subscripts', () => {
    expect(text(11, [[[op('SWAP', [0, 10])]]])).toContain('SWAP₀,₁₀');
    expect(subscript(12)).toBe('₁₂');
  });
});
