import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyCircuit, type Control, type Op } from '../../src/model/circuit';
import { toHash } from '../../src/model/serialize';
import type { GateId } from '../../src/sim/gates';
import App from '../../src/ui/App';
import OperatorView from '../../src/ui/OperatorView';

let uid = 0;
const op = (gate: GateId, wires: number[], params: string[] = []): Op => ({ id: `v${uid++}`, gate, wires, params });
const on1 = (wire: number): Control => ({ wire, kind: 'on1' });

function circ(n: number, steps: [Op[], Control[]?][]) {
  const c = emptyCircuit(n, steps.length);
  steps.forEach(([ops, controls = []], s) => (c.steps[s] = { ops, controls }));
  return c;
}

const bell = () => circ(2, [[[op('H', [0])]], [[op('X', [1])], [on1(0)]]]);
const BELL = '|ψ⟩ = (|0⟩⟨0| ⊗ I + |1⟩⟨1| ⊗ X) · (H ⊗ I) |00⟩';
const formula = () => screen.getByLabelText('Circuit as operators formula');

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  history.replaceState(null, '', '/');
});

describe('OperatorView', () => {
  it('shows the formula', () => {
    render(<OperatorView circuit={bell()} />);
    expect(formula().textContent).toBe(BELL);
    expect(screen.getByText('Last step on the left · q[0] is the leftmost factor')).toBeTruthy();
  });

  it('copies the displayed text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<OperatorView circuit={bell()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });
    expect(writeText).toHaveBeenCalledWith(BELL);
    expect(screen.getByRole('button', { name: 'Copied!' })).toBeTruthy();
  });

  it('measurement note', () => {
    render(<OperatorView circuit={circ(1, [[[op('H', [0])]], [[op('MEASURE', [0])]]])} />);
    expect(screen.getByText(/Measurement at step 2/)).toBeTruthy();
  });

  it('stop note says other gates in that step are left out too', () => {
    render(<OperatorView circuit={circ(2, [[[op('H', [0])]], [[op('MEASURE', [0]), op('H', [1])]]])} />);
    expect(
      screen.getByText('Measurement at step 2 — the formula ends before that step, including its other gates.'),
    ).toBeTruthy();
  });

  it('reset note with no factors', () => {
    render(<OperatorView circuit={circ(2, [[[op('RESET', [0])]]])} />);
    expect(screen.getByText(/Reset at step 1/)).toBeTruthy();
    expect(formula().textContent).toBe('|ψ⟩ = |00⟩');
  });

  it('invalid angle note', () => {
    render(<OperatorView circuit={circ(1, [[[op('RX', [0], ['foo'])]]])} />);
    expect(screen.getByText('Gates with invalid angles act as I in the simulation.')).toBeTruthy();
  });

  it('App renders it below the probabilities', () => {
    const c = emptyCircuit(2, 4);
    c.steps[0].ops = [op('H', [0])];
    c.steps[1] = { ops: [op('X', [1])], controls: [on1(0)] };
    history.replaceState(null, '', `/#${toHash(c)}`);
    const { container } = render(<App />);
    expect(formula().textContent).toBe(BELL);
    const chart = container.querySelector('.prob-chart');
    const section = container.querySelector('.operator-view');
    expect(chart && section).toBeTruthy();
    expect(chart!.compareDocumentPosition(section!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
