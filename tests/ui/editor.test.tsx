import { act, cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import App from '../../src/ui/App';
import AngleDialog from '../../src/ui/AngleDialog';
import { emptyCircuit } from '../../src/model/circuit';
import { moveOpEnd, placeGate } from '../../src/model/edit';
import { toHash } from '../../src/model/serialize';

beforeEach(() => {
  history.replaceState(null, '', '/');
});
afterEach(cleanup);

describe('Palette', () => {
  it('shows the quick row and reveals more gates', () => {
    render(<App />);
    const palette = screen.getByRole('region', { name: 'Drag gate to circuit' });
    const p = within(palette);
    for (const g of ['H', 'X', 'Y', 'Z', 'S', 'T', 'SX', 'B', 'SWAP', 'Control', 'Anti-control']) {
      expect(p.getByRole('button', { name: g })).toBeInTheDocument();
    }
    const more = ['S†', 'T†', 'SX†', 'I', 'RX', 'RY', 'RZ', 'P', 'U', 'iSWAP', '√SWAP', 'M', '|0⟩', 'Barrier'];
    for (const g of more) expect(p.queryByRole('button', { name: g })).not.toBeInTheDocument();
    fireEvent.click(p.getByRole('button', { name: 'More gates' }));
    for (const g of more) expect(p.getByRole('button', { name: g })).toBeInTheDocument();
  });
});

describe('CircuitGrid', () => {
  it('renders qubit rows, step headers and corner headers', () => {
    render(<App />);
    for (let q = 0; q < 3; q++) expect(screen.getByText(`q[${q}]`)).toBeInTheDocument();
    expect(screen.queryByText('q[3]')).not.toBeInTheDocument();
    const headers = Array.from(document.querySelectorAll('.step-head')).map((h) => h.textContent);
    expect(headers).toEqual(Array.from({ length: 12 }, (_, i) => String(i + 1)));
    expect(screen.getAllByText('Step')).toHaveLength(2);
    expect(screen.getByText('In')).toBeInTheDocument();
    expect(screen.getByText('Out')).toBeInTheDocument();
  });

  it('toggling the initial state of q[2] makes its Out box show 1', () => {
    render(<App />);
    const box = screen.getByLabelText('Initial state of q[2]');
    expect(box).toHaveTextContent('|0⟩');
    expect(screen.getByLabelText(/^q\[2\] output/)).toHaveTextContent('0');
    fireEvent.click(box);
    expect(box).toHaveTextContent('|1⟩');
    expect(screen.getByLabelText(/^q\[2\] output/)).toHaveTextContent('1');
    expect(screen.getByLabelText(/^q\[1\] output/)).toHaveTextContent('0');
  });

  it('starts with 3 qubits', () => {
    render(<App />);
    expect(screen.getByText('q[2]')).toBeInTheDocument();
    expect(screen.queryByText('q[3]')).not.toBeInTheDocument();
  });

  it('adds and removes qubits', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Add qubit' }));
    expect(screen.getByText('q[3]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove q[3]' }));
    expect(screen.queryByText('q[3]')).not.toBeInTheDocument();
    expect(screen.getByText('q[2]')).toBeInTheDocument();
  });

  it('loads from the URL hash, edits angles on double-click, deletes the selected op', () => {
    const c = placeGate(placeGate(emptyCircuit(), 'RX', 0, 1, ['pi/4']), 'H', 2, 0);
    history.replaceState(null, '', `/#${toHash(c)}`);
    render(<App />);
    const rx = screen.getByRole('button', { name: 'RX π/4 on q[1], step 1' });
    fireEvent.doubleClick(rx);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('θ'), { target: { value: 'pi/2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'RX π/2 on q[1], step 1' })).toBeInTheDocument();

    const h = screen.getByRole('button', { name: 'H on q[0], step 3' });
    fireEvent.click(h);
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(screen.queryByRole('button', { name: 'H on q[0], step 3' })).not.toBeInTheDocument();
    expect(location.hash).not.toBe(`#${toHash(c)}`);
  });
});

describe('B gate drawing', () => {
  it('adjacent B is one block; non-adjacent B is two end boxes and a connector', () => {
    const adj = placeGate(emptyCircuit(4), 'B', 0, 0);
    history.replaceState(null, '', `/#${toHash(adj)}`);
    const first = render(<App />);
    expect(first.container.querySelectorAll('.b-block')).toHaveLength(1);
    expect(first.container.querySelectorAll('.b-end')).toHaveLength(0);
    first.unmount();

    const id = adj.steps[0].ops[0].id;
    const far = moveOpEnd(adj, id, 1, 3);
    expect(far.steps[0].ops[0].wires).toEqual([0, 3]);
    history.replaceState(null, '', `/#${toHash(far)}`);
    const { container } = render(<App />);
    expect(container.querySelectorAll('.b-block')).toHaveLength(0);
    const ends = container.querySelectorAll('.b-end');
    expect(ends).toHaveLength(2);
    expect(screen.getByLabelText('B control end on q[0], step 1').querySelector('.b-dot')).not.toBeNull();
    expect(screen.getByLabelText('B target end on q[3], step 1').querySelector('.b-dot')).toBeNull();
    expect(screen.getByRole('button', { name: 'B on q[0], q[3], step 1' }).classList.contains('connector')).toBe(true);
  });
});

describe('URL hash', () => {
  it('a bad hash shows an error and is kept until the first edit', () => {
    history.replaceState(null, '', '/#garbage!!');
    render(<App />);
    expect(screen.getByRole('alert').textContent).toMatch(/Could not load the circuit from the link: Invalid hash encoding/);
    expect(location.hash).toBe('#garbage!!');
    expect(document.querySelectorAll('.step-head')).toHaveLength(12); // empty circuit shown
    fireEvent.click(screen.getByLabelText('Initial state of q[0]'));
    expect(location.hash).not.toBe('#garbage!!');
    expect(location.hash.length).toBeGreaterThan(10);
  });

  it('a truncated hash shows the parse error', () => {
    const c = placeGate(emptyCircuit(), 'H', 0, 0);
    history.replaceState(null, '', `/#${toHash(c).slice(0, 30)}`);
    render(<App />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('a bad pasted hash shows an error and keeps the circuit', () => {
    render(<App />);
    fireEvent.click(screen.getByLabelText('Initial state of q[1]'));
    const before = location.hash;
    history.replaceState(null, '', '/#nope');
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByRole('alert').textContent).toMatch(/Could not load the circuit from the link/);
    expect(screen.getByLabelText('Initial state of q[1]')).toHaveTextContent('|1⟩');
    expect(before).not.toBe('#nope');
  });

  it('a valid hash loads without an error', () => {
    const c = placeGate(emptyCircuit(), 'H', 0, 0);
    history.replaceState(null, '', `/#${toHash(c)}`);
    render(<App />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'H on q[0], step 1' })).toBeInTheDocument();
  });
});

describe('AngleDialog', () => {
  it('validates the angle expression', () => {
    const onOk = vi.fn();
    render(<AngleDialog gate="RX" params={['pi/2']} onOk={onOk} onCancel={() => {}} />);
    const input = screen.getByLabelText('θ');
    const ok = screen.getByRole('button', { name: 'OK' });
    expect(ok).toBeEnabled();
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/invalid/i);
    expect(ok).toBeDisabled();
    fireEvent.change(input, { target: { value: 'pi/4' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(ok).toBeEnabled();
    fireEvent.click(ok);
    expect(onOk).toHaveBeenCalledWith(['pi/4']);
  });
});
