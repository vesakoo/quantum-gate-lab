import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyCircuit, type Control, type Op } from '../../src/model/circuit';
import { toHash } from '../../src/model/serialize';
import type { GateId } from '../../src/sim/gates';
import App from '../../src/ui/App';
import MatrixProductView from '../../src/ui/MatrixProductView';
import css from '../../src/ui/styles.css?raw';

let uid = 0;
const op = (gate: GateId, wires: number[], params: string[] = []): Op => ({ id: `p${uid++}`, gate, wires, params });
const on1 = (wire: number): Control => ({ wire, kind: 'on1' });

function circ(n: number, steps: [Op[], Control[]?][]) {
  const c = emptyCircuit(n, steps.length);
  steps.forEach(([ops, controls = []], s) => (c.steps[s] = { ops, controls }));
  return c;
}

const bell = () => circ(2, [[[op('H', [0])]], [[op('X', [1])], [on1(0)]]]);
const line1 = () => screen.getByRole('group', { name: 'Circuit matrix product' });
const line2 = () => screen.getByRole('group', { name: 'Circuit matrix applied to the input' });
const tables = (el: Element) => Array.from(el.querySelectorAll('[role=table]'));

afterEach(() => {
  cleanup();
  history.replaceState(null, '', '/');
});

describe('MatrixProductView', () => {
  it('Bell: step matrices last step first, product, and U applied to the input', () => {
    render(<MatrixProductView circuit={bell()} />);
    expect(tables(line1())).toHaveLength(3);
    const captions = Array.from(line1().querySelectorAll('.matrix-caption')).map((e) => e.textContent);
    expect(captions).toEqual(['step 2', 'step 1']);
    expect(line2().textContent!.startsWith('U·|00⟩ =')).toBe(true);
    const t = tables(line2());
    expect(t).toHaveLength(3);
    const out = t[2];
    expect(Array.from(out.querySelectorAll('[role=cell]')).map((c) => c.textContent)).toEqual(['1', '0', '0', '1']);
    expect(out.parentElement!.querySelector('.matrix-scalar')!.textContent).toBe('1/√2');
  });

  it('one factor is shown once', () => {
    render(<MatrixProductView circuit={circ(1, [[[op('H', [0])]]])} />);
    expect(tables(line1())).toHaveLength(1);
  });

  it('empty circuit reads U = I', () => {
    render(<MatrixProductView circuit={circ(1, [])} />);
    expect(line1().textContent).toContain('U = I');
  });

  it('measurement note', () => {
    render(<MatrixProductView circuit={circ(2, [[[op('H', [0])]], [[op('MEASURE', [0]), op('H', [1])]]])} />);
    expect(
      screen.getByText('Measurement at step 2 — the formula ends before that step, including its other gates.'),
    ).toBeTruthy();
  });

  it('invalid angle note', () => {
    render(<MatrixProductView circuit={circ(1, [[[op('RX', [0], ['foo'])]]])} />);
    expect(screen.getByText('Gates with invalid angles act as I in the simulation.')).toBeTruthy();
  });

  it('above 4 qubits only a note; 4 qubits renders', () => {
    const { container, unmount } = render(<MatrixProductView circuit={circ(5, [[[op('H', [0])]]])} />);
    expect(screen.getByText('Matrices are written out up to 4 qubits')).toBeTruthy();
    expect(tables(container)).toHaveLength(0);
    unmount();
    const r4 = render(<MatrixProductView circuit={circ(4, [[[op('H', [0])]]])} />);
    expect(tables(r4.container).length).toBeGreaterThan(0);
  });

  it('App renders it after Circuit as operators', () => {
    history.replaceState(null, '', `/#${toHash(bell())}`);
    render(<App />);
    const ops = screen.getByRole('heading', { name: 'Circuit as operators' });
    const mats = screen.getByRole('heading', { name: 'Circuit as matrices' });
    expect(ops.compareDocumentPosition(mats) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a term wider than the panel scrolls inside the line', () => {
    const m = css.match(/(^|\n)\.matrix-product\s*\{([^}]*)\}/);
    expect(m?.[2]).toContain('overflow-x: auto');
  });

  it('scrollable lines can be reached by keyboard', () => {
    render(<MatrixProductView circuit={bell()} />);
    expect(line1().tabIndex).toBe(0);
    expect(line2().tabIndex).toBe(0);
  });

  it('is memoised so unrelated App renders skip it', () => {
    expect((MatrixProductView as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
  });

  it('hides step matrices above the cell budget but keeps the product', () => {
    const c = circ(4, Array.from({ length: 17 }, (_, i): [Op[]] => [[op('H', [i % 4])]]));
    render(<MatrixProductView circuit={c} />);
    expect(tables(line1())).toHaveLength(1);
    expect(line1().textContent).toContain('U = M₁₇ · … · M₁ =');
    expect(screen.getByText('Step matrices are hidden above 16 steps at 4 qubits; U is still the product of all 17 steps.')).toBeTruthy();
  });

  it('16 steps at 4 qubits still shows every step matrix', () => {
    const c = circ(4, Array.from({ length: 16 }, (_, i): [Op[]] => [[op('H', [i % 4])]]));
    render(<MatrixProductView circuit={c} />);
    expect(tables(line1())).toHaveLength(17);
  });

  it('long lines wrap', () => {
    const m = css.match(/(^|\n)\.matrix-product\s*\{([^}]*)\}/);
    expect(m?.[2]).toContain('flex-wrap: wrap');
  });
});
