import { GATE_INFO, type GateId } from '../sim/gates';
import type { Circuit, Op, Step } from './circuit';
import { normalizeSteps } from './edit';

const MAX_QUBITS = 10;
export const MAX_STEPS = 500;
export const MAX_PARAM_LENGTH = 200;

export type ParseResult = { ok: true; circuit: Circuit } | { ok: false; error: string };

export function toJSON(c: Circuit): string {
  return JSON.stringify(c);
}

const fail = (error: string): ParseResult => ({ ok: false, error });
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseCircuit(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('Invalid JSON');
  }
  if (!isObj(raw)) return fail('Circuit must be an object');
  const { numQubits, initial, steps } = raw;
  if (typeof numQubits !== 'number' || !Number.isInteger(numQubits) || numQubits < 1 || numQubits > MAX_QUBITS)
    return fail(`numQubits must be an integer from 1 to ${MAX_QUBITS}`);
  if (!Array.isArray(initial) || initial.length !== numQubits || initial.some((b) => b !== 0 && b !== 1))
    return fail('initial must be an array of 0/1, one per qubit');
  if (!Array.isArray(steps)) return fail('steps must be an array');
  if (steps.length > MAX_STEPS) return fail(`At most ${MAX_STEPS} steps are supported`);

  const ids = new Set<string>();
  const outSteps: Step[] = [];
  for (let si = 0; si < steps.length; si++) {
    const s = steps[si];
    if (!isObj(s) || !Array.isArray(s.ops) || !Array.isArray(s.controls)) return fail(`Step ${si}: bad shape`);
    const used = new Set<number>();
    const claim = (w: number): boolean => (used.has(w) ? false : (used.add(w), true));
    const ops: Op[] = [];
    let nonUnitary = false;
    for (const o of s.ops) {
      if (!isObj(o)) return fail(`Step ${si}: bad op`);
      const { id, gate, wires, params } = o;
      if (typeof id !== 'string' || id === '') return fail(`Step ${si}: op needs a string id`);
      if (ids.has(id)) return fail(`Step ${si}: duplicate op id ${id}`);
      ids.add(id);
      if (typeof gate !== 'string' || !Object.prototype.hasOwnProperty.call(GATE_INFO, gate))
        return fail(`Step ${si}: unknown gate ${String(gate)}`);
      const info = GATE_INFO[gate as GateId];
      if (!Array.isArray(wires) || wires.length !== info.arity) return fail(`Step ${si}: ${gate} needs ${info.arity} wire(s)`);
      for (const w of wires) {
        if (typeof w !== 'number' || !Number.isInteger(w) || w < 0 || w >= numQubits)
          return fail(`Step ${si}: wire ${String(w)} out of range`);
        if (!claim(w)) return fail(`Step ${si}: wire ${w} used more than once`);
      }
      if (!Array.isArray(params) || params.length !== info.params.length || params.some((p) => typeof p !== 'string'))
        return fail(`Step ${si}: ${gate} needs ${info.params.length} string param(s)`);
      if (params.some((p: string) => p.length > MAX_PARAM_LENGTH))
        return fail(`Step ${si}: angle parameters are limited to ${MAX_PARAM_LENGTH} characters`);
      if (info.kind !== 'unitary') nonUnitary = true;
      ops.push({ id, gate: gate as GateId, wires: wires.slice(), params: params.slice() });
    }
    const controls: Step['controls'] = [];
    for (const k of s.controls) {
      if (!isObj(k) || (k.kind !== 'on1' && k.kind !== 'on0')) return fail(`Step ${si}: bad control`);
      const w = k.wire;
      if (typeof w !== 'number' || !Number.isInteger(w) || w < 0 || w >= numQubits)
        return fail(`Step ${si}: control wire ${String(w)} out of range`);
      if (!claim(w)) return fail(`Step ${si}: wire ${w} used more than once`);
      controls.push({ wire: w, kind: k.kind });
    }
    if (nonUnitary && controls.length > 0) return fail(`Step ${si}: controls cannot share a step with measure/reset/barrier`);
    outSteps.push({ ops, controls });
  }
  // every loaded circuit (file or URL hash) gets the editor's step invariants
  return { ok: true, circuit: normalizeSteps({ numQubits, initial: initial.slice() as (0 | 1)[], steps: outSteps }) };
}

export function toHash(c: Circuit): string {
  const bytes = new TextEncoder().encode(toJSON(c));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromHash(hash: string): ParseResult {
  try {
    const h = hash.replace(/^#/, '');
    if (!/^[A-Za-z0-9_-]*$/.test(h)) return fail('Invalid hash encoding');
    const b64 = h.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return parseCircuit(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return fail('Invalid hash encoding');
  }
}
