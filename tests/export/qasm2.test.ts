import { describe, expect, it } from 'vitest';
import { toQasm2 } from '../../src/export/qasm2';
import { circ, lowered, on0, on1, op } from './helpers';

const URL = 'https://example.test/#abc';
function code(...a: Parameters<typeof circ>): string {
  const r = toQasm2(lowered(circ(...a)), URL);
  if (!r.ok) throw new Error(r.message);
  return r.code;
}
/** Gate lines only (after the creg line, without comments). */
const gateLines = (s: string) =>
  s.slice(s.indexOf('creg')).split('\n').slice(1).map((l) => l.replace(/\s*\/\/.*$/, '')).filter(Boolean);

describe('toQasm2', () => {
  it('Bell', () => {
    const s = code(2, [[[op('H', [0])]], [[op('X', [1])], [on1(0)]]]);
    expect(s).toContain('OPENQASM 2.0;\ninclude "qelib1.inc";');
    expect(gateLines(s)).toEqual(['h q[0];', 'cx q[0],q[1];', 'measure q -> c;']);
  });

  it('header', () => {
    const s = code(1, []);
    expect(s.split('\n')[1]).toContain(URL);
    expect(s).toContain("// Uses Qiskit's qelib1.inc (sx, sxdg, p, cp, csx)");
    expect(s).toContain('// Bit order:');
  });

  it('hollow control sandwich', () => {
    expect(gateLines(code(2, [[[op('X', [1])], [on0(0)]]]))).toEqual(['x q[0];', 'cx q[0],q[1];', 'x q[0];', 'measure q -> c;']);
  });

  it('controlled S is cp(pi/2)', () => {
    expect(code(2, [[[op('S', [1])], [on1(0)]]])).toContain('cp(pi/2) q[0],q[1];');
    expect(code(2, [[[op('Tdg', [1])], [on1(0)]]])).toContain('cp(-pi/4) q[0],q[1];');
  });

  it('Toffoli', () => {
    expect(code(3, [[[op('X', [2])], [on1(0), on1(1)]]])).toContain('ccx q[0],q[1],q[2];');
  });

  it('iSWAP defines its gate once', () => {
    const s = code(2, [[[op('ISWAP', [0, 1])]], [[op('ISWAP', [1, 0])]]]);
    expect(s.match(/^gate iswap /gm)).toHaveLength(1);
    expect(gateLines(s).filter((l) => l.startsWith('iswap '))).toEqual(['iswap q[0],q[1];', 'iswap q[1],q[0];']);
  });

  it('√SWAP defines sqswap', () => {
    const s = code(2, [[[op('SQSWAP', [0, 1])]]]);
    expect(s).toMatch(/^gate sqswap a,b \{ cx b,a; csx a,b; cx b,a; \}$/m);
    expect(s).toContain('sqswap q[0],q[1];');
  });

  it('B on reversed wires', () => {
    expect(gateLines(code(3, [[[op('B', [2, 0])]]])).slice(0, 2)).toEqual(['h q[2];', 'cx q[2],q[0];']);
  });

  it('refusal', () => {
    const r = toQasm2(lowered(circ(3, [[[]], [[]], [[op('H', [2])], [on1(0), on1(1)]]])), URL);
    expect(r).toEqual({ ok: false, message: 'Step 3: H with 2 controls has no OpenQASM 2.0 gate. Use the Qiskit tab.' });
    const r2 = toQasm2(lowered(circ(3, [[[op('ISWAP', [1, 2])], [on1(0)]]])), URL);
    expect(r2).toEqual({ ok: false, message: 'Step 1: iSWAP with 1 control has no OpenQASM 2.0 gate. Use the Qiskit tab.' });
  });

  it('reversed SWAP', () => {
    expect(code(3, [[[op('SWAP', [2, 0])]]])).toContain('swap q[2],q[0];');
  });

  it('u3', () => {
    expect(code(1, [[[op('U', [0], ['pi/2', '0', 'pi'])]]])).toContain('u3(pi/2,0,pi) q[0];');
  });

  it('initial ones and measure/reset/barrier', () => {
    const s = code(2, [[[op('MEASURE', [0]), op('RESET', [1])]], [[op('BARRIER', [0])]]], [0, 1]);
    expect(gateLines(s)).toEqual(['x q[1];', 'measure q[0] -> c[0];', 'reset q[1];', 'barrier q[0];']);
  });

  it('empty circuit', () => {
    const s = code(3, []);
    expect(s).toContain('qreg q[3];\ncreg c[3];');
    expect(gateLines(s)).toEqual(['measure q -> c;']);
  });
});
