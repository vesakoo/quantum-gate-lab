import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../src/ui/App';
import { projectBloch } from '../../src/ui/MiniBloch';
import { blochFrom } from '../../src/sim/backend';
import { emptyCircuit } from '../../src/model/circuit';
import { placeControl, placeGate } from '../../src/model/edit';
import { toHash } from '../../src/model/serialize';

beforeEach(() => {
  history.replaceState(null, '', '/');
});
afterEach(cleanup);

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 9);

describe('projectBloch', () => {
  const r = 20;
  it('|0⟩ projects straight up', () => {
    const p = projectBloch(blochFrom(0, 0, 1), r);
    close(p.px, 0);
    close(p.py, -r);
  });
  it('|i⟩ projects to the right', () => {
    const p = projectBloch(blochFrom(0, 1, 0), r);
    close(p.px, r);
    close(p.py, 0);
  });
  it('|+⟩ projects down-left (toward the viewer)', () => {
    const p = projectBloch(blochFrom(1, 0, 0), r);
    close(p.px, -0.35 * r);
    close(p.py, 0.35 * r);
  });
});

describe('Bloch strip', () => {
  it('renders an input sphere plus one per step for every qubit', () => {
    render(<App />);
    const strip = screen.getByRole('region', { name: 'Bloch spheres' });
    const s = within(strip);
    for (let q = 0; q < 4; q++) {
      expect(s.getByRole('button', { name: `q[${q}] input` })).toBeInTheDocument();
      for (let k = 1; k <= 12; k++) expect(s.getByRole('button', { name: `q[${q}] after step ${k}` })).toBeInTheDocument();
      expect(s.getAllByRole('button', { name: new RegExp(`^q\\[${q}\\] `) })).toHaveLength(13);
    }
    expect(s.queryByRole('button', { name: 'q[4] input' })).not.toBeInTheDocument();
  });

  it('marks an entangled qubit as mixed', () => {
    // H on q[0] at step 1, then CNOT q[0] -> q[1] at step 2: both qubits become maximally mixed
    const c = placeControl(placeGate(placeGate(emptyCircuit(), 'H', 0, 0), 'X', 1, 1), 'on1', 1, 0);
    history.replaceState(null, '', `/#${toHash(c)}`);
    render(<App />);
    const pure = screen.getByRole('button', { name: 'q[0] after step 1' });
    expect(pure).not.toHaveClass('mixed');
    for (const name of ['q[0] after step 2', 'q[1] after step 2', 'q[1] after step 12']) {
      const m = screen.getByRole('button', { name });
      expect(m).toHaveClass('mixed');
      expect(m.getAttribute('title')).toContain('entangled / mixed');
    }
    expect(screen.getByRole('button', { name: 'q[2] after step 2' })).not.toHaveClass('mixed');
  });

  it('clicking a mini sphere opens the panel with the full numbers', () => {
    const c = placeGate(emptyCircuit(), 'H', 2, 0);
    history.replaceState(null, '', `/#${toHash(c)}`);
    render(<App />);
    expect(screen.queryByRole('complementary', { name: /Bloch sphere/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'q[0] after step 3' }));
    const panel = screen.getByRole('complementary', { name: 'Bloch sphere q[0] after step 3' });
    const p = within(panel);
    expect(p.getByText('q[0] after step 3')).toBeInTheDocument();
    expect(p.getByTestId('bloch-x')).toHaveTextContent('1.000');
    expect(p.getByTestId('bloch-y')).toHaveTextContent('0.000');
    expect(p.getByTestId('bloch-z')).toHaveTextContent('0.000');
    expect(p.getByTestId('bloch-length')).toHaveTextContent('1.000');
    const expected: [string, string][] = [
      ['|0⟩', '50.0 %'],
      ['|1⟩', '50.0 %'],
      ['|+⟩', '100.0 %'],
      ['|−⟩', '0.0 %'],
      ['|i⟩', '50.0 %'],
      ['|−i⟩', '50.0 %'],
    ];
    for (const [label, pct] of expected) {
      expect(p.getByTestId(`prob-${label}`)).toHaveTextContent(label);
      expect(p.getByTestId(`prob-${label}`)).toHaveTextContent(pct);
    }
    expect(p.queryByText('entangled / mixed')).not.toBeInTheDocument();

    // the input sphere shows |0⟩
    fireEvent.click(screen.getByRole('button', { name: 'q[0] input' }));
    const panel2 = screen.getByRole('complementary', { name: 'Bloch sphere q[0] input' });
    expect(within(panel2).getByTestId('prob-|0⟩')).toHaveTextContent('100.0 %');
    expect(screen.getByRole('button', { name: 'q[0] input' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(within(panel2).getByRole('button', { name: 'Close Bloch panel' }));
    expect(screen.queryByRole('complementary', { name: /Bloch sphere/ })).not.toBeInTheDocument();
  });

  it('the panel marks a mixed qubit and shows its shorter length', () => {
    const c = placeControl(placeGate(placeGate(emptyCircuit(), 'H', 0, 0), 'X', 1, 1), 'on1', 1, 0);
    history.replaceState(null, '', `/#${toHash(c)}`);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'q[1] after step 2' }));
    const panel = screen.getByRole('complementary', { name: 'Bloch sphere q[1] after step 2' });
    expect(within(panel).getByText('entangled / mixed')).toBeInTheDocument();
    expect(within(panel).getByTestId('bloch-length')).toHaveTextContent('0.000');
    expect(within(panel).getByTestId('bloch-theta')).toHaveTextContent(/^undefined \(length 0\)$/);
    expect(within(panel).getByTestId('bloch-phi')).toHaveTextContent(/^undefined \(length 0\)$/);
    expect(within(panel).queryByTestId('bloch-euler')).not.toBeInTheDocument();
    expect(within(panel).getByTestId('bloch-euler-mixed')).toHaveTextContent('no single |ψ⟩');
    expect(within(panel).queryByTestId('bloch-euler-table')).not.toBeInTheDocument();
  });

  it('the panel shows polar angles and the state in symbolic ket form', () => {
    // H then S: |i⟩; then T: phase 3π/4
    const c = placeGate(placeGate(placeGate(emptyCircuit(), 'H', 0, 0), 'S', 1, 0), 'T', 2, 0);
    history.replaceState(null, '', `/#${toHash(c)}`);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'q[0] after step 2' }));
    const p = within(screen.getByRole('complementary', { name: 'Bloch sphere q[0] after step 2' }));
    expect(p.getByTestId('bloch-theta')).toHaveTextContent('π/2 (90.0°)');
    expect(p.getByTestId('bloch-phi')).toHaveTextContent('π/2 (90.0°)');
    expect(p.getByTestId('bloch-euler')).toHaveTextContent('|ψ⟩ = (|0⟩ + i|1⟩)/√2');
    expect(p.getByTestId('bloch-euler-formula')).toHaveTextContent('|ψ⟩ = cos(θ/2)|0⟩ + eiφ·sin(θ/2)|1⟩');
    expect(p.getByTestId('euler-β')).toHaveTextContent('β0.707·eiπ/20.000 + 0.707i');
    expect(p.getByTestId('euler-α')).toHaveTextContent('α0.707·ei00.707 + 0.000i');

    fireEvent.click(screen.getByRole('button', { name: 'q[0] after step 3' }));
    const p3 = within(screen.getByRole('complementary', { name: 'Bloch sphere q[0] after step 3' }));
    const euler = p3.getByTestId('bloch-euler');
    expect(p3.getByTestId('bloch-phi')).toHaveTextContent('3π/4 (135.0°)');
    expect(euler).toHaveTextContent('|ψ⟩ = (|0⟩ + ei3π/4|1⟩)/√2');
    expect(euler.querySelector('sup')).toHaveTextContent('i3π/4');

    // input |0⟩: θ = 0, φ undefined at the pole
    fireEvent.click(screen.getByRole('button', { name: 'q[0] input' }));
    const p0 = within(screen.getByRole('complementary', { name: 'Bloch sphere q[0] input' }));
    expect(p0.getByTestId('bloch-theta')).toHaveTextContent('0 (0.0°)');
    expect(p0.getByTestId('bloch-phi')).toHaveTextContent(/^undefined \(at a pole\)$/);
    expect(p0.getByTestId('bloch-euler')).toHaveTextContent('|ψ⟩ = |0⟩');
  });
});
