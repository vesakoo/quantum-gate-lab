import { describe, expect, it } from 'vitest';
import { emptyCircuit, type Control, type Op } from '../../src/model/circuit';
import type { GateId } from '../../src/sim/gates';
import { cardHere, docKey } from '../../src/ui/gateCardHere';
import { formatComplex } from '../../src/ui/ket';

let uid = 0;
const op = (gate: GateId, wires: number[], params: string[] = []): Op => ({ id: `h${uid++}`, gate, wires, params });
const on1 = (wire: number): Control => ({ wire, kind: 'on1' });
const on0 = (wire: number): Control => ({ wire, kind: 'on0' });

function circ(n: number, steps: [Op[], Control[]?][]) {
  const c = emptyCircuit(n, Math.max(1, steps.length));
  steps.forEach(([ops, controls = []], s) => (c.steps[s] = { ops, controls }));
  return c;
}
const at = (o: Op) => ({ kind: 'op' as const, opId: o.id });
const S2 = Math.SQRT1_2;

describe('formatComplex', () => {
  it.each([
    [1, 0, '1'],
    [-1, 0, '−1'],
    [0, 1, 'i'],
    [0, -1, '−i'],
    [S2, 0, '1/√2'],
    [0, -S2, '−i/√2'],
    [Math.cos(Math.PI / 4), Math.sin(Math.PI / 4), 'e^{iπ/4}'],
    [1e-12, 0, '0'],
  ])('(%f, %f) → %s', (re, im, s) => {
    expect(formatComplex(re, im)).toBe(s);
  });
});

describe('cardHere', () => {
  it('palette targets have no here', () => {
    const c = circ(1, []);
    expect(cardHere(c, { kind: 'palette', gate: 'H' })).toBeNull();
    expect(docKey(c, { kind: 'palette', gate: 'H' })).toBe('H');
    expect(docKey(c, { kind: 'palette-control', ctl: 'on0' })).toBe('ctl:on0');
  });

  it('single gate position', () => {
    const h = op('H', [1]);
    const c = circ(2, [[[]], [[]], [[h]]]);
    const r = cardHere(c, at(h))!;
    expect(r.position).toBe('on q[1], step 3');
    expect(r.control).toBeUndefined();
    expect(r.evaluated).toBeUndefined();
    expect(docKey(c, at(h))).toBe('H');
  });

  it('two-qubit position', () => {
    const s = op('SWAP', [1, 2]);
    expect(cardHere(circ(3, [[[s]]]), at(s))!.position).toBe('q[1] ↔ q[2], step 1');
  });

  it('evaluated angle', () => {
    const g = op('RX', [0], ['pi/2']);
    const r = cardHere(circ(1, [[[g]]]), at(g))!;
    expect(r.angles).toEqual([{ name: 'θ', text: 'π/2', valid: true }]);
    expect(r.evaluated!.rows).toEqual([
      ['1/√2', '−i/√2'],
      ['−i/√2', '1/√2'],
    ]);
  });

  it('invalid angle', () => {
    const g = op('RX', [0], ['foo']);
    const r = cardHere(circ(1, [[[g]]]), at(g))!;
    expect(r.angles).toEqual([{ name: 'θ', text: 'foo', valid: false }]);
    expect(r.evaluated).toBeUndefined();
    expect(r.invalidNote).toBe('θ = foo is not a valid angle; the simulator treats this gate as I. Double-click to fix.');
  });

  it('cnot block', () => {
    const x = op('X', [1]);
    const k = cardHere(circ(2, [[[x], [on1(0)]]]), at(x))!.control!;
    expect(k.blockLabel).toBe('CX =');
    expect(k.block.rows).toEqual([['I', '0'], ['0', 'X']]);
    expect(k.condition).toBe('applied only when q[0] = 1');
    expect(k.projector).toBe('|0⟩⟨0| ⊗ I + |1⟩⟨1| ⊗ X');
    expect(k.basisOrder).toBe('Basis order: q[0] q[1]');
  });

  it('toffoli block', () => {
    const x = op('X', [2]);
    const k = cardHere(circ(3, [[[x], [on1(1), on1(0)]]]), at(x))!.control!;
    expect(k.blockLabel).toBe('CCX =');
    expect(k.block.rows).toEqual([['I₆', '0'], ['0', 'X']]);
    expect(k.condition).toBe('applied only when q[0] = 1 and q[1] = 1');
    expect(k.projector).toBe('|0⟩⟨0| ⊗ I ⊗ I + |1⟩⟨1| ⊗ |0⟩⟨0| ⊗ I + |1⟩⟨1| ⊗ |1⟩⟨1| ⊗ X');
  });

  it('control below target', () => {
    const x = op('X', [0]);
    const k = cardHere(circ(3, [[[x], [on1(2)]]]), at(x))!.control!;
    expect(k.basisOrder).toBe('Basis order: q[2] q[0] (control first)');
  });

  it('open-control swap', () => {
    const s = op('SWAP', [1, 2]);
    const k = cardHere(circ(3, [[[s], [on0(0)]]]), at(s))!.control!;
    expect(k.blockLabel).toBe('C̄SWAP =');
    expect(k.block.rows).toEqual([['SWAP', '0'], ['0', 'I₄']]);
    expect(k.projector).toBe('|1⟩⟨1| ⊗ I₄ + |0⟩⟨0| ⊗ SWAP');
  });

  it('middle block', () => {
    const x = op('X', [2]);
    const k = cardHere(circ(3, [[[x], [on1(0), on0(1)]]]), at(x))!.control!;
    expect(k.block.rows).toEqual([
      ['I₄', '0', '0'],
      ['0', 'X', '0'],
      ['0', '0', 'I'],
    ]);
    expect(k.condition).toBe('applied only when q[0] = 1 and q[1] = 0');
  });

  it('several targets', () => {
    const h = op('H', [1]);
    const x = op('X', [2]);
    const k = cardHere(circ(3, [[[x, h], [on1(0)]]]), at(x))!.control!;
    expect(k.blockLabel).toBe('C(H ⊗ X) =');
    expect(k.block.rows).toEqual([['I₄', '0'], ['0', 'H ⊗ X']]);
  });

  it('control target', () => {
    const x = op('X', [1]);
    const c = circ(2, [[[x], [on1(0)]]]);
    const r = cardHere(c, { kind: 'control', step: 0, wire: 0 })!;
    expect(r.position).toBe('control on q[0], step 1');
    expect(r.control!.blockLabel).toBe('CX =');
    expect(docKey(c, { kind: 'control', step: 0, wire: 0 })).toBe('ctl:on1');
  });

  it('orphan control', () => {
    const r = cardHere(circ(2, [[[], [on1(0)]]]), { kind: 'control', step: 0, wire: 0 })!;
    expect(r.orphanNote).toBe('No gate in this step — this control is ignored.');
    expect(r.control).toBeUndefined();
  });

  it('invalid angle in controlled step', () => {
    const g = op('RX', [1], ['foo']);
    const r = cardHere(circ(2, [[[g], [on1(0)]]]), at(g))!;
    expect(r.control!.blockLabel).toBe('CRX(foo) =');
    expect(r.control!.block.rows[1][1]).toBe('RX(foo)');
    expect(r.invalidNote).toBeTruthy();
  });

  it('stale target', () => {
    const c = circ(1, []);
    expect(docKey(c, { kind: 'op', opId: 'nope' })).toBeNull();
    expect(cardHere(c, { kind: 'op', opId: 'nope' })).toBeNull();
    expect(docKey(c, { kind: 'control', step: 0, wire: 0 })).toBeNull();
  });

  it('reversed two-qubit gate states its basis order', () => {
    const s = op('SWAP', [2, 0]);
    expect(cardHere(circ(3, [[[s]]]), at(s))!.basisOrder).toBe('Basis order: q[2] q[0] (gate wire order)');
    const t = op('SWAP', [0, 2]);
    expect(cardHere(circ(3, [[[t]]]), at(t))!.basisOrder).toBeUndefined();
  });

  it('basis order suffix names its cause', () => {
    const s = op('SWAP', [3, 1]);
    const k = cardHere(circ(4, [[[s], [on1(0)]]]), at(s))!.control!;
    expect(k.basisOrder).toBe('Basis order: q[0] q[3] q[1] (gate wire order)');
  });
});

