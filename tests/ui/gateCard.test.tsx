import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyCircuit, type Op } from '../../src/model/circuit';
import GateCard from '../../src/ui/GateCard';
import { cardHere } from '../../src/ui/gateCardHere';

afterEach(cleanup);

describe('GateCard', () => {
  it('palette H', () => {
    const { container } = render(<GateCard id="c1" docKey="H" here={null} />);
    expect(screen.getByRole('tooltip').id).toBe('c1');
    expect(screen.getByText('Hadamard')).toBeTruthy();
    expect(screen.getByText(/equal superposition/)).toBeTruthy();
    expect(screen.getByText('|0⟩ → (|0⟩ + |1⟩)/√2')).toBeTruthy();
    expect(screen.getByText('1/√2')).toBeTruthy();
    expect(container.textContent).not.toContain('Here:');
  });

  it('placed controlled X', () => {
    const c = emptyCircuit(2, 2);
    const x: Op = { id: 'x', gate: 'X', wires: [1], params: [] };
    c.steps[1] = { ops: [x], controls: [{ wire: 0, kind: 'on1' }] };
    const { container } = render(<GateCard id="c2" docKey="X" here={cardHere(c, { kind: 'op', opId: 'x' })} />);
    const t = container.textContent ?? '';
    expect(t).toContain('Here: on q[1], step 2');
    expect(t).toContain('applied only when q[0] = 1');
    expect(t).toContain('CX =');
    expect(t).toContain('= |0⟩⟨0| ⊗ I + |1⟩⟨1| ⊗ X');
    expect(t).toContain('Basis order: q[0] q[1]');
  });

  it('measure has no matrix', () => {
    render(<GateCard id="c3" docKey="MEASURE" here={null} />);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('pinned hint', () => {
    render(<GateCard id="c4" docKey="H" here={null} pinned />);
    expect(screen.getByText('Pinned · Esc to close')).toBeTruthy();
  });
});
