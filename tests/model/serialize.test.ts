import { describe, it, expect } from 'vitest';
import { emptyCircuit, type Circuit } from '../../src/model/circuit';
import { toJSON, parseCircuit, toHash, fromHash } from '../../src/model/serialize';

function reference(): Circuit {
  const c = emptyCircuit(4, 12);
  c.initial = [0, 0, 1, 0];
  const op = (id: string, gate: any, wires: number[], params: string[] = []) => ({ id, gate, wires, params });
  c.steps[1].ops = [op('a', 'B', [1, 2])];
  c.steps[3].ops = [op('b', 'H', [1]), op('c', 'H', [2])];
  c.steps[4].ops = [op('d', 'X', [2])]; c.steps[4].controls = [{ wire: 1, kind: 'on1' }];
  c.steps[5].ops = [op('e', 'H', [1]), op('f', 'H', [2])];
  c.steps[7].ops = [op('g', 'T', [2])]; c.steps[7].controls = [{ wire: 1, kind: 'on1' }];
  c.steps[9].ops = [op('h', 'S', [2])]; c.steps[9].controls = [{ wire: 1, kind: 'on0' }];
  c.steps[10].ops = [op('i', 'S', [2])]; c.steps[10].controls = [{ wire: 1, kind: 'on1' }];
  c.steps[11].ops = [op('j', 'RZ', [0], ['π/2'])];
  return c;
}

describe('serialize', () => {
  it('round-trips JSON and hash (unicode)', () => {
    const c = reference();
    const j = parseCircuit(toJSON(c));
    expect(j.ok && j.circuit).toEqual(c);
    const h = fromHash(toHash(c));
    expect(h.ok && h.circuit).toEqual(c);
    expect(toHash(c)).toMatch(/^[A-Za-z0-9_-]*$/);
  });
  const bad = (r: any) => { expect(r.ok).toBe(false); expect(r.error.length).toBeGreaterThan(0); };
  it('rejects bad input', () => {
    bad(parseCircuit('{'));
    bad(parseCircuit('null'));
    bad(fromHash('!!!'));
    const mod = (f: (c: any) => void) => { const c: any = reference(); f(c); return parseCircuit(JSON.stringify(c)); };
    bad(mod(c => { c.steps[0].ops = [{ id: 'z', gate: 'X', wires: [7], params: [] }]; }));
    bad(mod(c => { c.steps[0].ops = [{ id: 'z', gate: 'Q', wires: [0], params: [] }]; }));
    bad(mod(c => { c.steps[0].ops = [{ id: 'z', gate: 'U', wires: [0], params: ['1', '2'] }]; }));
    bad(mod(c => { c.steps[0].ops = [{ id: 'z', gate: 'SWAP', wires: [1, 1], params: [] }]; }));
    bad(mod(c => { c.steps[0].ops = [{ id: 'z', gate: 'X', wires: [1], params: [] }, { id: 'y', gate: 'H', wires: [1], params: [] }]; }));
    bad(mod(c => { c.steps[0].ops = [{ id: 'z', gate: 'X', wires: [1], params: [] }]; c.steps[0].controls = [{ wire: 1, kind: 'on1' }]; }));
    bad(mod(c => { c.steps[0].ops = [{ id: 'z', gate: 'MEASURE', wires: [1], params: [] }]; c.steps[0].controls = [{ wire: 2, kind: 'on1' }]; }));
    bad(mod(c => { c.numQubits = 11; }));
    bad(mod(c => { c.initial = [0, 0]; }));
    bad(mod(c => { c.steps[0].ops = [{ id: 'a', gate: 'X', wires: [0], params: [] }]; })); // duplicate id 'a'
  });
});
