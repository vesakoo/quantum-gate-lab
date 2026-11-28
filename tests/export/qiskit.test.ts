import { describe, expect, it } from 'vitest';
import { toQiskit } from '../../src/export/qiskit';
import { circ, lowered, on0, on1, op } from './helpers';

const URL = 'https://example.test/#abc';
const q = (...a: Parameters<typeof circ>) => toQiskit(lowered(circ(...a)), URL);

describe('toQiskit', () => {
  it('CNOT', () => {
    const s = q(2, [[[op('H', [0])]], [[op('X', [1])], [on1(0)]]]);
    expect(s).toContain('qc.h(0)\n');
    expect(s).toContain('qc.cx(0, 1)\n');
    expect(s).toContain('qc.measure(range(2), range(2))  # added: hardware returns counts only after measurement');
  });

  it('ctrl_state is little-endian', () => {
    const s = q(3, [[[op('H', [2])], [on0(0), on1(1)]]]);
    expect(s).toContain("qc.append(HGate().control(2, ctrl_state='10'), [0, 1, 2])");
    expect(s).toContain('from qiskit.circuit.library import HGate');
  });

  it('reversed CX keeps roles', () => {
    expect(q(3, [[[op('X', [0])], [on1(2)]]])).toContain('qc.cx(2, 0)\n');
  });

  it('Toffoli uses ccx', () => {
    expect(q(3, [[[op('X', [2])], [on1(0), on1(1)]]])).toContain('qc.ccx(0, 1, 2)\n');
  });

  it('angles', () => {
    const s = q(2, [[[op('RZ', [1], ['3*π/4'])]], [[op('U', [0], ['pi/2', '0', 'pi'])]]]);
    expect(s).toContain('qc.rz(3*pi/4, 1)\n');
    expect(s).toContain('qc.u(pi/2, 0, pi, 0)\n');
    expect(s).toContain('from math import pi');
  });

  it('B and √SWAP', () => {
    const b = q(3, [[[op('B', [2, 0])]]]);
    expect(b).toContain('qc.h(2)\nqc.cx(2, 0)\n');
    const sq = q(2, [[[op('SQSWAP', [0, 1])]], [[op('SQSWAP', [1, 0])]]]);
    expect(sq.match(/^SQSWAP = /gm)).toHaveLength(1);
    expect(sq).toContain('qc.append(SQSWAP, [0, 1])\n');
    expect(sq).toContain('qc.append(SQSWAP, [1, 0])\n');
  });

  it('controlled B uses the BELL helper', () => {
    const s = q(3, [[[op('B', [1, 2])], [on1(0)]]]);
    expect(s).toMatch(/^BELL = /m);
    expect(s).toContain("qc.append(BELL.control(1, ctrl_state='1'), [0, 1, 2])");
  });

  it('initial ones', () => {
    const s = q(2, [[[op('H', [1])]]], [1, 0]);
    expect(s.indexOf('qc.x(0)')).toBeGreaterThan(-1);
    expect(s.indexOf('qc.x(0)')).toBeLessThan(s.indexOf('qc.h(1)'));
    expect(s).toContain("Lab |10⟩ is Qiskit key '01'");
  });

  it('empty circuit', () => {
    const s = q(3, []);
    const after = s.slice(s.indexOf('qc = QuantumCircuit(3, 3)\n') + 'qc = QuantumCircuit(3, 3)\n'.length);
    expect(after.trim()).toBe('qc.measure(range(3), range(3))  # added: hardware returns counts only after measurement');
  });

  it('own measure, no extra', () => {
    const s = q(1, [[[op('MEASURE', [0])]], [[op('H', [0])]]]);
    expect(s).toContain('qc.measure(0, 0)\n');
    expect(s).not.toContain('range(');
  });

  it('bit-order example is informative for symmetric inputs', () => {
    expect(q(3, [])).toContain("Lab |100⟩ (q[0] = 1) is Qiskit key '001'");
  });

  it('share URL in header', () => {
    expect(q(1, []).split('\n')[1]).toContain(URL);
  });
});
