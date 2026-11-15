import { describe, it, expect } from 'vitest';
import { emptyCircuit, type Circuit } from '../../src/model/circuit';
import {
  placeGate, placeControl, moveOp, moveOpEnd, moveControl, removeOp, removeControl,
  setParams, toggleInitial, addQubit, removeQubit, normalizeSteps,
} from '../../src/model/edit';

const idOf = (c: Circuit, s: number, i = 0) => c.steps[s].ops[i].id;

describe('edit', () => {
  it('rejects placing on an occupied cell (same object)', () => {
    const c = placeGate(emptyCircuit(), 'X', 2, 1);
    expect(placeGate(c, 'H', 2, 1)).toBe(c);
    const c2 = placeControl(c, 'on1', 2, 0);
    expect(placeGate(c2, 'H', 2, 0)).toBe(c2);
    expect(placeControl(c2, 'on0', 2, 1)).toBe(c2);
  });
  it('does not mutate input', () => {
    const c = emptyCircuit();
    const snap = JSON.stringify(c);
    placeGate(c, 'X', 0, 0);
    expect(JSON.stringify(c)).toBe(snap);
  });
  it('MEASURE/RESET/BARRIER vs controls', () => {
    let c = placeControl(emptyCircuit(), 'on1', 3, 0);
    expect(placeGate(c, 'MEASURE', 3, 1)).toBe(c);
    c = placeGate(emptyCircuit(), 'RESET', 3, 1);
    expect(placeControl(c, 'on1', 3, 0)).toBe(c);
    expect(placeGate(placeGate(emptyCircuit(), 'BARRIER', 1, 0), 'MEASURE', 1, 1).steps[1].ops).toHaveLength(2);
  });
  it('SWAP on last wire', () => {
    expect(placeGate(emptyCircuit(), 'SWAP', 0, 3).steps[0].ops[0].wires).toEqual([2, 3]);
    expect(placeGate(emptyCircuit(), 'SWAP', 0, 1).steps[0].ops[0].wires).toEqual([1, 2]);
  });
  it('default params', () => {
    expect(placeGate(emptyCircuit(), 'RX', 0, 0).steps[0].ops[0].params).toEqual(['pi/2']);
    expect(placeGate(emptyCircuit(), 'U', 0, 0).steps[0].ops[0].params).toEqual(['pi/2', '0', 'pi']);
  });
  it('unique ids', () => {
    let c = emptyCircuit();
    c = placeGate(c, 'X', 0, 0); c = placeGate(c, 'X', 1, 0);
    expect(idOf(c, 0)).not.toBe(idOf(c, 1));
  });
  it('moveOpEnd preserves role order', () => {
    const c = placeGate(emptyCircuit(), 'B', 1, 1);
    const m = moveOpEnd(c, idOf(c, 1), 0, 3);
    expect(m.steps[1].ops[0].wires).toEqual([3, 2]);
    expect(moveOpEnd(c, idOf(c, 1), 0, 2)).toBe(c);
    const c3 = placeGate(c, 'X', 1, 0);
    expect(moveOpEnd(c3, idOf(c, 1), 0, 0)).toBe(c3);
  });
  it('moveOp moves whole op keeping offset', () => {
    const c = placeGate(emptyCircuit(), 'B', 1, 0);
    const m = moveOp(c, idOf(c, 1), 4, 2);
    expect(m.steps[1].ops).toHaveLength(0);
    expect(m.steps[4].ops[0].wires).toEqual([2, 3]);
    expect(moveOp(c, idOf(c, 1), 4, 3)).toBe(c); // out of range
    const x = placeGate(c, 'X', 4, 3);
    expect(moveOp(x, idOf(c, 1), 4, 2)).toBe(x);
    // moving within same step onto own wires is fine
    expect(moveOp(c, idOf(c, 1), 1, 1).steps[1].ops[0].wires).toEqual([1, 2]);
  });
  it('moveOp rejects MEASURE into step with controls', () => {
    let c = placeGate(emptyCircuit(), 'MEASURE', 0, 0);
    c = placeControl(c, 'on1', 2, 1);
    expect(moveOp(c, idOf(c, 0), 2, 0)).toBe(c);
  });
  it('moveControl, removeControl, removeOp, setParams, toggleInitial', () => {
    let c = placeControl(emptyCircuit(), 'on0', 1, 1);
    const m = moveControl(c, 1, 1, 3, 2);
    expect(m.steps[3].controls).toEqual([{ wire: 2, kind: 'on0' }]);
    expect(m.steps[1].controls).toEqual([]);
    expect(removeControl(m, 3, 2).steps[3].controls).toEqual([]);
    expect(removeControl(m, 3, 0)).toBe(m);
    c = placeGate(emptyCircuit(), 'RZ', 0, 0);
    expect(setParams(c, idOf(c, 0), ['pi']).steps[0].ops[0].params).toEqual(['pi']);
    expect(removeOp(c, idOf(c, 0)).steps[0].ops).toEqual([]);
    expect(removeOp(c, 'nope')).toBe(c);
    expect(toggleInitial(c, 2).initial).toEqual([0, 0, 1, 0]);
    expect(toggleInitial(toggleInitial(c, 2), 2).initial).toEqual([0, 0, 0, 0]);
  });
  it('removeQubit', () => {
    let c = placeGate(emptyCircuit(), 'B', 0, 1);
    c = placeGate(c, 'X', 1, 3);
    c = placeControl(c, 'on1', 2, 1);
    c = placeControl(c, 'on0', 2, 2);
    c = toggleInitial(c, 3);
    const r = removeQubit(c, 1);
    expect(r.numQubits).toBe(3);
    expect(r.initial).toEqual([0, 0, 1]);
    expect(r.steps[0].ops).toEqual([]);
    expect(r.steps[1].ops[0].wires).toEqual([2]);
    expect(r.steps[2].controls).toEqual([{ wire: 1, kind: 'on0' }]);
    expect(removeQubit(emptyCircuit(1), 0).numQubits).toBe(1);
  });
  it('addQubit', () => {
    expect(addQubit(emptyCircuit()).numQubits).toBe(5);
    expect(addQubit(emptyCircuit()).initial).toHaveLength(5);
    const c = emptyCircuit(10);
    expect(addQubit(c)).toBe(c);
  });
  it('step growth and shrink', () => {
    const c = placeGate(emptyCircuit(), 'X', 11, 0);
    expect(c.steps.length).toBe(13);
    expect(removeOp(c, idOf(c, 11)).steps.length).toBe(12);
    expect(normalizeSteps(emptyCircuit(4, 20)).steps.length).toBe(12);
  });
});
