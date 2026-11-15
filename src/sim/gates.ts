import { mat, matMul, type Mat } from './complex';

export type GateId =
  | 'I' | 'X' | 'Y' | 'Z' | 'H' | 'S' | 'Sdg' | 'T' | 'Tdg' | 'SX' | 'SXdg'
  | 'RX' | 'RY' | 'RZ' | 'P' | 'U' | 'SWAP' | 'ISWAP' | 'SQSWAP' | 'B'
  | 'MEASURE' | 'RESET' | 'BARRIER';

type Info = {
  label: string;
  arity: 1 | 2;
  params: string[];
  kind: 'unitary' | 'measure' | 'reset' | 'barrier';
  quick: boolean;
};

const u = (label: string, arity: 1 | 2 = 1, params: string[] = [], quick = false): Info => ({
  label, arity, params, kind: 'unitary', quick,
});

export const GATE_INFO: Record<GateId, Info> = {
  I: u('I'),
  X: u('X', 1, [], true),
  Y: u('Y', 1, [], true),
  Z: u('Z', 1, [], true),
  H: u('H', 1, [], true),
  S: u('S', 1, [], true),
  Sdg: u('S†'),
  T: u('T', 1, [], true),
  Tdg: u('T†'),
  SX: u('SX', 1, [], true),
  SXdg: u('SX†'),
  RX: u('RX', 1, ['θ']),
  RY: u('RY', 1, ['θ']),
  RZ: u('RZ', 1, ['θ']),
  P: u('P', 1, ['λ']),
  U: u('U', 1, ['θ', 'φ', 'λ']),
  SWAP: u('SWAP', 2, [], true),
  ISWAP: u('iSWAP', 2),
  SQSWAP: u('√SWAP', 2),
  B: u('B', 2, [], true),
  MEASURE: { label: 'M', arity: 1, params: [], kind: 'measure', quick: false },
  RESET: { label: '|0⟩', arity: 1, params: [], kind: 'reset', quick: false },
  BARRIER: { label: 'BARRIER', arity: 1, params: [], kind: 'barrier', quick: false },
};

type C = [number, number];
const R = Math.SQRT1_2;
const cis = (a: number): C => [Math.cos(a), Math.sin(a)];
const Z0: C = [0, 0];
const O: C = [1, 0];

function bell(): Mat {
  // CNOT(wire0 -> wire1) . (H ⊗ I); local index = 2*b0 + b1
  const hi = mat([
    [[R, 0], Z0, [R, 0], Z0],
    [Z0, [R, 0], Z0, [R, 0]],
    [[R, 0], Z0, [-R, 0], Z0],
    [Z0, [R, 0], Z0, [-R, 0]],
  ]);
  const cnot = mat([
    [O, Z0, Z0, Z0],
    [Z0, O, Z0, Z0],
    [Z0, Z0, Z0, O],
    [Z0, Z0, O, Z0],
  ]);
  return matMul(cnot, hi);
}

export function gateMatrix(id: GateId, params: number[] = []): Mat {
  const [a = 0, b = 0, c = 0] = params;
  switch (id) {
    case 'I': return mat([[O, Z0], [Z0, O]]);
    case 'X': return mat([[Z0, O], [O, Z0]]);
    case 'Y': return mat([[Z0, [0, -1]], [[0, 1], Z0]]);
    case 'Z': return mat([[O, Z0], [Z0, [-1, 0]]]);
    case 'H': return mat([[[R, 0], [R, 0]], [[R, 0], [-R, 0]]]);
    case 'S': return mat([[O, Z0], [Z0, [0, 1]]]);
    case 'Sdg': return mat([[O, Z0], [Z0, [0, -1]]]);
    case 'T': return mat([[O, Z0], [Z0, cis(Math.PI / 4)]]);
    case 'Tdg': return mat([[O, Z0], [Z0, cis(-Math.PI / 4)]]);
    case 'SX': return mat([[[0.5, 0.5], [0.5, -0.5]], [[0.5, -0.5], [0.5, 0.5]]]);
    case 'SXdg': return mat([[[0.5, -0.5], [0.5, 0.5]], [[0.5, 0.5], [0.5, -0.5]]]);
    case 'RX': {
      const co = Math.cos(a / 2), si = Math.sin(a / 2);
      return mat([[[co, 0], [0, -si]], [[0, -si], [co, 0]]]);
    }
    case 'RY': {
      const co = Math.cos(a / 2), si = Math.sin(a / 2);
      return mat([[[co, 0], [-si, 0]], [[si, 0], [co, 0]]]);
    }
    case 'RZ': return mat([[cis(-a / 2), Z0], [Z0, cis(a / 2)]]);
    case 'P': return mat([[O, Z0], [Z0, cis(a)]]);
    case 'U': {
      const co = Math.cos(a / 2), si = Math.sin(a / 2);
      const l = cis(c), p = cis(b), pl = cis(b + c);
      return mat([
        [[co, 0], [-si * l[0], -si * l[1]]],
        [[si * p[0], si * p[1]], [co * pl[0], co * pl[1]]],
      ]);
    }
    case 'SWAP':
      return mat([[O, Z0, Z0, Z0], [Z0, Z0, O, Z0], [Z0, O, Z0, Z0], [Z0, Z0, Z0, O]]);
    case 'ISWAP': {
      const i: C = [0, 1];
      return mat([[O, Z0, Z0, Z0], [Z0, Z0, i, Z0], [Z0, i, Z0, Z0], [Z0, Z0, Z0, O]]);
    }
    case 'SQSWAP': {
      const p: C = [0.5, 0.5], m: C = [0.5, -0.5];
      return mat([[O, Z0, Z0, Z0], [Z0, p, m, Z0], [Z0, m, p, Z0], [Z0, Z0, Z0, O]]);
    }
    case 'B': return bell();
    default:
      throw new Error(`gateMatrix: ${id} is not a unitary gate`);
  }
}
