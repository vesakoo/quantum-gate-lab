import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toHash } from '../../src/model/serialize';
import App from '../../src/ui/App';
import { circ, on1, op } from '../export/helpers';

function openWith(c?: ReturnType<typeof circ>) {
  history.replaceState(null, '', c ? `/#${toHash(c)}` : '/');
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Export…' }));
  return screen.getByRole('dialog', { name: 'Export circuit' });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Export dialog', () => {
  it('opens from the toolbar with the Qiskit tab', () => {
    const d = openWith();
    expect(within(d).getByRole('tab', { name: 'Qiskit' })).toHaveAttribute('aria-selected', 'true');
    expect(within(d).getByLabelText('Qiskit code')).toHaveTextContent('QuantumCircuit(3, 3)');
  });

  it('switches tabs with arrow keys', () => {
    const d = openWith();
    const qiskit = within(d).getByRole('tab', { name: 'Qiskit' });
    fireEvent.keyDown(qiskit, { key: 'ArrowRight' });
    const qasm = within(d).getByRole('tab', { name: 'OpenQASM 2.0' });
    expect(qasm).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(qasm);
    expect(within(d).getByLabelText('OpenQASM 2.0 code')).toHaveTextContent('OPENQASM 2.0;');
  });

  it('refusal shows message and no copy', () => {
    const d = openWith(circ(3, [[[op('H', [2])], [on1(0), on1(1)]]]));
    fireEvent.click(within(d).getByRole('tab', { name: 'OpenQASM 2.0' }));
    const panel = within(d).getByRole('tabpanel');
    expect(panel).toHaveTextContent('Step 1: H with 2 controls has no OpenQASM 2.0 gate. Use the Qiskit tab.');
    expect(within(panel).queryByRole('button', { name: 'Copy' })).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Download' })).toBeNull();
  });

  it('invalid angle shows the fix message and no code', () => {
    const d = openWith(circ(2, [[[op('RX', [1], ['pi/'])]]]));
    const panel = within(d).getByRole('tabpanel');
    expect(panel).toHaveTextContent('Fix the angle of RX on q[1], step 1 before exporting.');
    expect(within(panel).queryByLabelText('Qiskit code')).toBeNull();
  });

  it('Esc closes and returns focus to the Export button', () => {
    const d = openWith();
    fireEvent.keyDown(d, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Export circuit' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Export…' }));
  });

  it('copy puts the code on the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const d = openWith();
    await act(async () => fireEvent.click(within(d).getByRole('button', { name: 'Copy' })));
    expect(writeText).toHaveBeenCalledWith(within(d).getByLabelText('Qiskit code').textContent);
    expect(within(d).getByRole('button', { name: 'Copied!' })).toBeInTheDocument();
  });
});
