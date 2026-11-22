import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyCircuit, type Op } from '../../src/model/circuit';
import { toHash } from '../../src/model/serialize';
import type { GateId } from '../../src/sim/gates';
import { DensityMatrix } from '../../src/sim/density';
import { simulate } from '../../src/sim/simulate';
import { StateVector } from '../../src/sim/statevector';
import { gateMatrix } from '../../src/sim/gates';
import App from '../../src/ui/App';
import KetView from '../../src/ui/KetView';
import { formatKet, globalPhase, qubitAmplitudes, symbolicSqrt } from '../../src/ui/ket';
import { blochPolar } from '../../src/ui/polar';
import { blochFrom } from '../../src/sim/backend';

const PI = Math.PI;

let uid = 0;
const op = (gate: GateId, wires: number[], params: string[] = []): Op => ({ id: `k${uid++}`, gate, wires, params });

/** Circuit with one op list per step; returns the formatted final ket. */
function ketOf(n: number, steps: Op[][], initial?: (0 | 1)[]): string {
  const c = emptyCircuit(n, steps.length);
  if (initial) c.initial = initial;
  steps.forEach((ops, s) => (c.steps[s].ops = ops));
  const r = simulate(c);
  if (!r.amplitudes) throw new Error('mixed');
  return formatKet(r.amplitudes, n).text;
}

const S2 = Math.SQRT1_2;
/** Amplitudes from [re, im] pairs. */
const amps = (...cs: [number, number][]) => cs.flat();

describe('symbolicSqrt', () => {
  it.each([
    [1, '1', '1'],
    [1 / 2, '1', '√2'],
    [1 / 4, '1', '2'],
    [1 / 8, '1', '(2√2)'],
    [3 / 4, '√3', '2'],
    [3 / 8, '√6', '4'],
    [1 / 3, '1', '√3'],
    [2 / 3, '√6', '3'],
    [1 / 1024, '1', '32'],
  ])('|a|² = %d', (m2, num, den) => {
    expect(symbolicSqrt(m2)).toEqual({ num, den });
  });
  it('returns null for a generic value', () => {
    expect(symbolicSqrt(Math.cos(0.5) ** 2)).toBeNull();
    expect(symbolicSqrt(0)).toBeNull();
  });
  it('only uses nice denominators', () => {
    expect(symbolicSqrt(0.3)).toBeNull(); // not √30/10
    expect(symbolicSqrt(0.7)).toBeNull();
    expect(symbolicSqrt(5 / 49)).toBeNull();
    expect(symbolicSqrt(5 / 12)).toEqual({ num: '√15', den: '6' });
  });
});

describe('qubitAmplitudes (Bloch panel ket)', () => {
  const s = (x: number, y: number, z: number) => {
    const p = blochPolar(blochFrom(x, y, z));
    return formatKet(qubitAmplitudes(p.theta!, p.phi), 1).text;
  };
  it('poles, |±⟩, |±i⟩', () => {
    expect(s(0, 0, 1)).toBe('|0⟩');
    expect(s(0, 0, -1)).toBe('|1⟩');
    expect(s(1, 0, 0)).toBe('(|0⟩ + |1⟩)/√2');
    expect(s(-1, 0, 0)).toBe('(|0⟩ − |1⟩)/√2');
    expect(s(0, 1, 0)).toBe('(|0⟩ + i|1⟩)/√2');
    expect(s(0, -1, 0)).toBe('(|0⟩ − i|1⟩)/√2');
  });
  it('known magnitudes and phases', () => {
    // RY(π/3)|0⟩
    expect(s(Math.sin(PI / 3), 0, Math.cos(PI / 3))).toBe('(√3/2)|0⟩ + (1/2)|1⟩');
    // H then T
    expect(s(Math.cos(PI / 4), Math.sin(PI / 4), 0)).toBe('(|0⟩ + e^{iπ/4}|1⟩)/√2');
  });
  it('other states fall back to decimals', () => {
    expect(s(Math.sin(1), 0, Math.cos(1))).toBe('0.878|0⟩ + 0.479|1⟩');
    expect(s(Math.cos(1), Math.sin(1), 0)).toBe('(|0⟩ + e^{i1.000}|1⟩)/√2');
    expect(s(Math.cos(-1), Math.sin(-1), 0)).toBe('(|0⟩ + e^{−i1.000}|1⟩)/√2');
  });
});

describe('formatKet', () => {
  it('basis states', () => {
    expect(formatKet(amps([1, 0], [0, 0]), 1).text).toBe('|0⟩');
    expect(ketOf(4, [[op('X', [1])]])).toBe('|0100⟩');
  });

  it('Bell and GHZ states factor out 1/√k', () => {
    expect(ketOf(2, [[op('B', [0, 1])]])).toBe('(|00⟩ + |11⟩)/√2');
    const c = emptyCircuit(3, 3);
    c.steps[0].ops = [op('H', [0])];
    c.steps[1] = { ops: [op('X', [1])], controls: [{ wire: 0, kind: 'on1' }] };
    c.steps[2] = { ops: [op('X', [2])], controls: [{ wire: 0, kind: 'on1' }] };
    expect(formatKet(simulate(c).amplitudes!, 3).text).toBe('(|000⟩ + |111⟩)/√2');
  });

  it('relative signs and phases', () => {
    expect(ketOf(1, [[op('H', [0])]], [1])).toBe('(|0⟩ − |1⟩)/√2');
    expect(ketOf(1, [[op('SXdg', [0])]])).toBe('(|0⟩ + i|1⟩)/√2');
    expect(ketOf(1, [[op('H', [0])], [op('S', [0])], [op('H', [0])]])).toBe('(|0⟩ − i|1⟩)/√2');
    expect(ketOf(1, [[op('H', [0])], [op('T', [0])]])).toBe('(|0⟩ + e^{iπ/4}|1⟩)/√2');
    expect(ketOf(1, [[op('H', [0])], [op('Tdg', [0])]])).toBe('(|0⟩ + e^{−iπ/4}|1⟩)/√2');
    // 3π/4 stays e^{i3π/4} (matches φ in the Bloch panel); only −1 and −i become a sign
    expect(ketOf(1, [[op('H', [0])], [op('P', [0], ['3*pi/4'])]])).toBe('(|0⟩ + e^{i3π/4}|1⟩)/√2');
    expect(ketOf(1, [[op('H', [0])], [op('P', [0], ['-3*pi/4'])]])).toBe('(|0⟩ + e^{−i3π/4}|1⟩)/√2');
  });

  it('drops the global phase', () => {
    expect(ketOf(1, [[op('Y', [0])]])).toBe('|1⟩'); // Y|0⟩ = i|1⟩
    expect(formatKet(amps([0, S2], [0, -S2]), 1).text).toBe('(|0⟩ − |1⟩)/√2');
  });

  it('unequal known magnitudes are written per term', () => {
    expect(ketOf(1, [[op('RY', [0], ['pi/3'])]])).toBe('(√3/2)|0⟩ + (1/2)|1⟩');
    expect(formatKet(amps([0.5, 0], [0, Math.sqrt(3) / 2]), 1).text).toBe('(1/2)|0⟩ + (i√3/2)|1⟩');
    expect(formatKet(amps([0.5, 0], [0, -Math.sqrt(3) / 2]), 1).text).toBe('(1/2)|0⟩ − (i√3/2)|1⟩');
    expect(formatKet(amps([0.5, 0], [0, 0], [0, 0.5], [-S2, 0]), 2).text).toBe('(1/2)|00⟩ + (i/2)|10⟩ − (1/√2)|11⟩');
  });

  it('falls back to decimals', () => {
    expect(ketOf(1, [[op('RY', [0], ['1'])]])).toBe('0.878|0⟩ + 0.479|1⟩');
    expect(ketOf(1, [[op('U', [0], ['1', '0.3', '0'])]])).toBe('0.878|0⟩ + (0.458 + 0.142i)|1⟩');
    // known phase, unknown magnitude
    expect(ketOf(1, [[op('RX', [0], ['1'])]])).toBe('0.878|0⟩ − 0.479i|1⟩');
  });

  it('elides long sums', () => {
    const all = Array.from({ length: 4 }, (_, q) => op('H', [q]));
    expect(ketOf(4, [all])).toBe('(|0000⟩ + |0001⟩ + |0010⟩ + |0011⟩ + |0100⟩ + |0101⟩ + … + |1111⟩)/4');
    const c = emptyCircuit(4, 1);
    c.steps[0].ops = Array.from({ length: 4 }, (_, q) => op('H', [q]));
    const f = formatKet(simulate(c).amplitudes!, 4, { maxTerms: Infinity });
    expect(f.terms).toBe(16);
    expect(f.text).not.toContain('…');
  });

  it('ignores numerical noise', () => {
    expect(formatKet(amps([1, 1e-13], [1e-9, 0]), 1).text).toBe('|0⟩');
  });
});

describe('simulate amplitudes / purity', () => {
  it('state vector results carry the amplitudes', () => {
    const c = emptyCircuit(2, 1);
    c.steps[0].ops = [op('B', [0, 1])];
    const r = simulate(c);
    expect(r.purity).toBe(1);
    expect(r.amplitudes).toHaveLength(8);
    [S2, 0, 0, 0, 0, 0, S2, 0].forEach((v, i) => expect(r.amplitudes![i]).toBeCloseTo(v, 12));
  });

  it('a measured Bell pair is mixed', () => {
    const c = emptyCircuit(2, 2);
    c.steps[0].ops = [op('B', [0, 1])];
    c.steps[1].ops = [op('MEASURE', [0])];
    const r = simulate(c);
    expect(r.amplitudes).toBeNull();
    expect(r.purity).toBeCloseTo(0.5, 12);
  });

  it('reset of an unentangled qubit stays pure and keeps relative phases', () => {
    const c = emptyCircuit(2, 2);
    c.steps[0].ops = [op('X', [0]), op('SX', [1])];
    c.steps[1].ops = [op('RESET', [0])];
    const r = simulate(c);
    expect(r.backend).toBe('density');
    expect(formatKet(r.amplitudes!, 2).text).toBe('(|00⟩ − i|01⟩)/√2');
  });

  it('DensityMatrix.pureState reproduces |ψ⟩⟨ψ| up to a global phase', () => {
    const sv = new StateVector(2, [0, 0]);
    sv.applyGate(gateMatrix('U', [1, 0.3, 0.7]), [0], []);
    sv.applyGate(gateMatrix('ISWAP'), [0, 1], []);
    const psi = DensityMatrix.fromStateVector(sv).pureState()!;
    const a = sv.amplitudes();
    // |⟨a|ψ⟩| = 1
    let re = 0, im = 0;
    for (let i = 0; i < 4; i++) {
      re += a[2 * i] * psi[2 * i] + a[2 * i + 1] * psi[2 * i + 1];
      im += a[2 * i] * psi[2 * i + 1] - a[2 * i + 1] * psi[2 * i];
    }
    expect(Math.hypot(re, im)).toBeCloseTo(1, 12);
  });
});

describe('KetView', () => {
  beforeEach(() => history.replaceState(null, '', '/'));
  afterEach(cleanup);

  it('renders the ket with a superscript phase', () => {
    const { container } = render(
      <KetView amplitudes={amps([S2, 0], [0.5, 0.5])} purity={1} numQubits={1} backend="statevector" />,
    );
    expect(screen.getByLabelText('Output state in ket notation').textContent).toBe('|ψ⟩ = (|0⟩ + eiπ/4|1⟩)/√2');
    expect(container.querySelector('.ket sup')?.textContent).toBe('iπ/4');
  });

  it('explains a mixed state', () => {
    render(<KetView amplitudes={null} purity={0.5} numQubits={2} backend="statevector" />);
    expect(screen.getByText(/Mixed state \(purity Tr ρ² = 0\.500\)/)).toBeTruthy();
  });

  it('offers all terms for long sums', () => {
    const n = 4;
    const a = Array.from({ length: 16 }, () => [0.25, 0] as [number, number]).flat();
    render(<KetView amplitudes={a} purity={1} numQubits={n} backend="statevector" />);
    const ket = screen.getByLabelText('Output state in ket notation');
    expect(ket.textContent).toContain('…');
    fireEvent.click(screen.getByLabelText('Show all 16 terms'));
    expect(ket.textContent).not.toContain('…');
  });

  it('App shows the output state of a linked circuit', () => {
    const c = emptyCircuit(2, 4);
    c.steps[0].ops = [op('B', [0, 1])];
    history.replaceState(null, '', `/#${toHash(c)}`);
    render(<App />);
    expect(screen.getByLabelText('Output state in ket notation').textContent).toBe('|ψ⟩ = (|00⟩ + |11⟩)/√2');
  });
});

describe('globalPhase', () => {
  const amp = (re: number, im: number, n = 2, at = 1) => {
    const a = new Array(2 * n).fill(0);
    a[2 * at] = re;
    a[2 * at + 1] = im;
    return a;
  };
  const r = Math.SQRT1_2;
  it('T·T·T|1⟩: e^{i3π/4}, 135.0°', () => expect(globalPhase(amp(-r, r))).toEqual({ text: 'e^{i3π/4}', degrees: '135.0°' }));
  it('γ = π is −1, 180.0°', () => expect(globalPhase(amp(-1, 0))).toEqual({ text: '−1', degrees: '180.0°' }));
  it('γ = π/2 is i; −π/2 is −i', () => {
    expect(globalPhase(amp(0, 1))).toEqual({ text: 'i', degrees: '90.0°' });
    expect(globalPhase(amp(0, -1))).toEqual({ text: '−i', degrees: '−90.0°' });
  });
  it('negative multiple of π/12', () => expect(globalPhase(amp(r, -r))).toEqual({ text: 'e^{−iπ/4}', degrees: '−45.0°' }));
  it('non-π/12 phase as decimals', () =>
    expect(globalPhase(amp(Math.cos(-0.4), Math.sin(-0.4)))).toEqual({ text: 'e^{−i0.400}', degrees: '−22.9°' }));
  it('zero and rounding noise are none', () => {
    expect(globalPhase(amp(1, 0))).toBeNull();
    expect(globalPhase(amp(1, 1e-12))).toBeNull();
    expect(globalPhase(amp(1, 1e-7))).toBeNull();
  });
  it('uses the first non-zero amplitude', () => expect(globalPhase([0, 0, 0, r, r, 0])).toEqual({ text: 'i', degrees: '90.0°' }));
  it('all-zero amplitudes give null', () => expect(globalPhase([0, 0, 0, 0])).toBeNull());
});

describe('KetView global phase', () => {
  beforeEach(() => history.replaceState(null, '', '/'));
  afterEach(cleanup);

  const show = (n: number, steps: Op[][], initial?: (0 | 1)[]) => {
    const c = emptyCircuit(n, steps.length);
    if (initial) c.initial = initial;
    steps.forEach((ops, s) => (c.steps[s].ops = ops));
    history.replaceState(null, '', `/#${toHash(c)}`);
    return render(<App />);
  };
  const note = (container: HTMLElement) => container.querySelector('.ket-view .ket-note')?.textContent;

  it('T·T·T|1⟩ shows e^{i3π/4} (135.0°) and keeps the formula |1⟩', () => {
    const { container } = show(1, [[op('T', [0])], [op('T', [0])], [op('T', [0])]], [1]);
    expect(screen.getByLabelText('Output state in ket notation').textContent).toBe('|ψ⟩ = |1⟩');
    expect(note(container)).toBe('Global phase ei3π/4 (135.0°) factored out · q[0] is the leftmost bit');
    expect(container.querySelector('.ket-view .ket-note sup')?.textContent).toBe('i3π/4');
  });

  it('no phase reads none', () => {
    const { container } = show(1, [[op('H', [0])]]);
    expect(note(container)).toBe('Global phase: none · q[0] is the leftmost bit');
  });

  it('after measure/reset the phase is unknown, never a number', () => {
    const { container } = show(1, [[op('X', [0])], [op('MEASURE', [0])]]);
    expect(screen.getByLabelText('Output state in ket notation').textContent).toBe('|ψ⟩ = |1⟩');
    expect(note(container)).toBe('Global phase unknown after measure/reset · q[0] is the leftmost bit');
  });

  it('explains why it cannot be measured in a native disclosure', () => {
    const { container } = show(1, [[op('T', [0])]], [1]);
    const summary = screen.getByText("Why can't it be measured?");
    expect(summary.tagName).toBe('SUMMARY');
    const details = summary.closest('details')!;
    expect(details.textContent).toContain('changes no probability');
    expect(details.textContent).toContain('phase kickback');
    expect([...details.querySelectorAll('sup')].map((s) => s.textContent)).toContain('−iπ/8');
    expect(container.querySelectorAll('.ket-view details')).toHaveLength(1);
  });

  it('Copy still copies the formula without the phase', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { container } = show(1, [[op('T', [0])], [op('T', [0])], [op('T', [0])]], [1]);
    fireEvent.click(container.querySelector('.ket-view .ket-actions button')!);
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('|ψ⟩ = |1⟩');
  });

  it('a mixed state shows neither the note nor the explanation', () => {
    const { container } = show(1, [[op('H', [0])], [op('MEASURE', [0])]]);
    expect(container.querySelector('.ket-view .ket-note')).toBeNull();
    expect(container.querySelector('.ket-view details')).toBeNull();
  });
});
