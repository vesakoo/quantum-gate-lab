import { cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import App from '../../src/ui/App';
import AngleDialog from '../../src/ui/AngleDialog';
import { emptyCircuit } from '../../src/model/circuit';
import { placeGate } from '../../src/model/edit';
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
    for (let q = 0; q < 4; q++) expect(screen.getByText(`q[${q}]`)).toBeInTheDocument();
    expect(screen.queryByText('q[4]')).not.toBeInTheDocument();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(Array.from({ length: 12 }, (_, i) => String(i + 1)));
    expect(screen.getAllByText('Step')).toHaveLength(2);
    expect(screen.getByText('In')).toBeInTheDocument();
    expect(screen.getByText('Out')).toBeInTheDocument();
  });

  it('toggling the initial state of q[2] makes its Out box show 1', () => {
    render(<App />);
    const box = screen.getByLabelText('Initial state of q[2]');
    expect(box).toHaveTextContent('|0⟩');
    expect(screen.getByLabelText('q[2] output')).toHaveTextContent('0');
    fireEvent.click(box);
    expect(box).toHaveTextContent('|1⟩');
    expect(screen.getByLabelText('q[2] output')).toHaveTextContent('1');
    expect(screen.getByLabelText('q[1] output')).toHaveTextContent('0');
  });

  it('adds and removes qubits', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Add qubit' }));
    expect(screen.getByText('q[4]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove q[4]' }));
    expect(screen.queryByText('q[4]')).not.toBeInTheDocument();
    expect(screen.getByText('q[3]')).toBeInTheDocument();
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
