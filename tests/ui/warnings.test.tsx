import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyCircuit, type Op } from '../../src/model/circuit';
import { toHash } from '../../src/model/serialize';
import type { GateId } from '../../src/sim/gates';
import { simulate } from '../../src/sim/simulate';
import App from '../../src/ui/App';
import { hasInvalidAngle } from '../../src/ui/GateView';

const op = (id: string, gate: GateId, wires: number[], params: string[] = []): Op => ({ id, gate, wires, params });

function badCircuit() {
  const c = emptyCircuit(2, 4);
  c.steps[0].ops = [op('h', 'H', [0])];
  c.steps[2].ops = [op('bad', 'RX', [1], ['pi/']), op('ok', 'RZ', [0], ['pi/2'])];
  return c;
}

describe('simulate warnings', () => {
  it('a valid circuit has no warnings', () => {
    const c = emptyCircuit(1, 1);
    c.steps[0].ops = [op('a', 'U', [0], ['pi/2', '0', 'pi'])];
    expect(simulate(c).warnings).toEqual([]);
  });

  it('reports an op with an unparsable angle and skips only that op', () => {
    const r = simulate(badCircuit());
    expect(r.warnings).toEqual([
      {
        opId: 'bad',
        step: 2,
        gate: 'RX',
        wires: [1],
        param: 'pi/',
        message: 'invalid angle "pi/"; the gate was skipped',
      },
    ]);
    // q[1] stays |0⟩ (RX skipped); q[0] is H then RZ(π/2), still on the equator
    expect(r.qubitP1[1]).toBeCloseTo(0, 12);
    expect(r.qubitP1[0]).toBeCloseTo(0.5, 12);
    expect(r.bloch[3][0].y).toBeCloseTo(1, 12);
  });

  it('names the first bad parameter of a multi-angle gate', () => {
    const c = emptyCircuit(1, 1);
    c.steps[0].ops = [op('u', 'U', [0], ['1', 'x', 'also bad'])];
    expect(simulate(c).warnings.map((w) => w.param)).toEqual(['x']);
  });

  it('also reports in density-matrix circuits', () => {
    const c = badCircuit();
    c.steps[3].ops = [op('m', 'MEASURE', [0])];
    const r = simulate(c);
    expect(r.backend).toBe('density');
    expect(r.warnings.map((w) => w.opId)).toEqual(['bad']);
  });
});

describe('hasInvalidAngle', () => {
  it('checks every parameter', () => {
    expect(hasInvalidAngle({ params: [] })).toBe(false);
    expect(hasInvalidAngle({ params: ['pi/4', '2*pi'] })).toBe(false);
    expect(hasInvalidAngle({ params: ['pi/4', ''] })).toBe(true);
    expect(hasInvalidAngle({ params: ['1/0'] })).toBe(true);
  });
});

describe('App', () => {
  beforeEach(() => history.replaceState(null, '', '/'));
  afterEach(cleanup);

  it('marks the gate red and lists the warning for a loaded link', () => {
    history.replaceState(null, '', `/#${toHash(badCircuit())}`);
    const { container } = render(<App />);
    const gate = screen.getByLabelText('RX π/ on q[1], step 3 (invalid angle, skipped)');
    expect(gate.classList.contains('invalid')).toBe(true);
    expect(gate.getAttribute('aria-invalid')).toBe('true');
    expect(container.querySelectorAll('.gate.invalid')).toHaveLength(1);
    const banner = container.querySelector('.sim-warnings')!;
    expect(banner.textContent).toContain('1 gate was skipped');
    expect(banner.textContent).toContain('Step 3, RX on q[1]: invalid angle pi/');
  });

  it('Fix… opens the angle editor, and a valid angle clears the warning', () => {
    history.replaceState(null, '', `/#${toHash(badCircuit())}`);
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Fix…' }));
    const input = screen.getByRole('dialog').querySelector('input')!;
    expect(input.value).toBe('pi/');
    fireEvent.change(input, { target: { value: 'pi/2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(container.querySelector('.sim-warnings')).toBeNull();
    expect(container.querySelector('.gate.invalid')).toBeNull();
  });

  it('shows no banner for a valid circuit', () => {
    const { container } = render(<App />);
    expect(container.querySelector('.sim-warnings')).toBeNull();
  });
});
