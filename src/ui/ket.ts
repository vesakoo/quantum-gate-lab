import { basisLabel } from './ProbabilityChart';
import { formatRadians } from './polar';

/** Amplitudes with |a|² below this are treated as zero. */
const ZERO2 = 1e-10;
/** Tolerance for recognising exact magnitudes² (p/q) and phases (multiples of π/12). */
const TOL = 1e-7;
const PHASE_STEP = Math.PI / 12;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * Denominators tried for |a|² = p/q, smallest first. Only "nice" ones (powers of two, which gates
 * like H produce, plus 3, 6 and 12): with every q up to 64, generic values such as 0.3 came out as
 * √30/10 and arbitrary angles could hit a fraction by coincidence.
 */
const DENOMS: number[] = [1, 2, 3, 4, 6, 8, 12, 16, 32, 64, 128, 256, 512, 1024];

/** Splits v = s²·r with r square-free; returns [s, r]. */
function splitSquare(v: number): [number, number] {
  let s = 1;
  let r = v;
  for (let f = 2; f * f <= r; f++) {
    while (r % (f * f) === 0) {
      r /= f * f;
      s *= f;
    }
  }
  return [s, r];
}

/** `a√r` (or `a`, `√r`, `1`). */
function surd(a: number, r: number): string {
  if (r === 1) return String(a);
  return a === 1 ? `√${r}` : `${a}√${r}`;
}

type Frac = { num: string; den: string };

/** √(p/q) as num/den with square factors pulled out, e.g. 1/8 → 1/(2√2), 3/4 → √3/2. Null if not found. */
export function symbolicSqrt(m2: number): Frac | null {
  if (!(m2 > 0) || m2 > 1 + TOL) return null;
  for (const q of DENOMS) {
    const p = Math.round(m2 * q);
    if (p <= 0 || Math.abs(m2 - p / q) > TOL) continue;
    const g = gcd(p, q);
    let [a, pr] = splitSquare(p / g);
    let [b, qr] = splitSquare(q / g);
    if (qr > 1 && (a > 1 || pr > 1)) {
      // rationalise unless the numerator is 1 (keep the usual 1/√2, 1/(2√2)): √3/(2√2) → √6/4
      const [c, r] = splitSquare(pr * qr);
      a *= c;
      pr = r;
      b *= qr;
      qr = 1;
      const h = gcd(a, b);
      a /= h;
      b /= h;
    }
    const den = surd(b, qr);
    return { num: surd(a, pr), den: b > 1 && qr > 1 ? `(${den})` : den };
  }
  return null;
}

type Phase = { neg: boolean; unit: string } | null;

/** Phase φ as a sign plus one of '', 'i', 'e^{i3π/4}', … with φ in (−π, π]; null if not a multiple of π/12. */
function symbolicPhase(phi: number): Phase {
  const k = Math.round(phi / PHASE_STEP);
  if (Math.abs(phi - k * PHASE_STEP) > 1e-6) return null;
  let kk = ((k % 24) + 24) % 24; // φ = kk·π/12 in [0, 2π)
  if (kk > 12) kk -= 24; // (−π, π]
  // only −1 and −i become a sign; other phases stay e^{iφ} so they match the φ shown in the Bloch panel
  if (kk === 0) return { neg: false, unit: '' };
  if (kk === 12) return { neg: true, unit: '' };
  if (kk === 6) return { neg: false, unit: 'i' };
  if (kk === -6) return { neg: true, unit: 'i' };
  const r = formatRadians(kk * PHASE_STEP); // e.g. π/4, −π/4, 5π/12
  const exp = r.startsWith('−') ? `−i${r.slice(1)}` : `i${r}`;
  return { neg: false, unit: `e^{${exp}}` };
}

const dec = (v: number): string => {
  const s = v.toFixed(3);
  return s === '-0.000' ? '0.000' : s;
};

/** A coefficient c of a term, split into sign and body; body '' means 1. */
type Coef = { neg: boolean; body: string };

/** Coefficient whose magnitude is known to be 1 (phase only). */
function phaseOnly(re: number, im: number): Coef {
  const phi = Math.atan2(im, re);
  const ph = symbolicPhase(phi);
  if (ph) return { neg: ph.neg, body: ph.unit };
  return { neg: false, body: phi < 0 ? `e^{−i${dec(-phi)}}` : `e^{i${dec(phi)}}` };
}

function general(re: number, im: number): Coef {
  const m = Math.hypot(re, im);
  const ph = symbolicPhase(Math.atan2(im, re));
  const mag = symbolicSqrt(m * m);
  if (ph && mag) {
    const { num, den } = mag;
    let body: string;
    if (ph.unit === '') body = den === '1' ? num : `${num}/${den}`;
    else if (num === '1') body = den === '1' ? ph.unit : ph.unit === 'i' ? `i/${den}` : `${ph.unit}/${den}`;
    else if (ph.unit === 'i') body = den === '1' ? `i${num}` : `i${num}/${den}`;
    else body = `${den === '1' ? num : `${num}/${den}`}·${ph.unit}`;
    return { neg: ph.neg, body: body === '1' ? '' : body };
  }
  if (ph) {
    const body = ph.unit === '' ? dec(m) : ph.unit === 'i' ? `${dec(m)}i` : `${dec(m)}·${ph.unit}`;
    return { neg: ph.neg, body };
  }
  const sign = im < 0 ? '−' : '+';
  return { neg: false, body: `(${dec(re)} ${sign} ${dec(Math.abs(im))}i)` };
}

/** `c|b⟩`, with a fraction coefficient parenthesised so `(1/2)|01⟩` reads unambiguously. */
function termBody(c: Coef, label: string): string {
  const b = c.body;
  // a '/' outside an exponent's braces means a fraction
  const wrap = b.replace(/\{[^}]*\}/g, '').includes('/') && !b.startsWith('(') ? `(${b})` : b;
  return `${wrap}|${label}⟩`;
}

/**
 * Amplitudes (interleaved re/im) of the single-qubit state cos(θ/2)|0⟩ + e^{iφ}·sin(θ/2)|1⟩;
 * φ = null (at a pole) counts as 0.
 */
export function qubitAmplitudes(theta: number, phi: number | null): number[] {
  const a = Math.cos(theta / 2);
  const b = Math.sin(theta / 2);
  const p = phi ?? 0;
  return [a, 0, b * Math.cos(p), b * Math.sin(p)];
}

export type KetOptions = {
  /** At most this many terms are written out; longer sums are elided with `…`. */
  maxTerms?: number;
};

export type KetForm = {
  /** e.g. `(|00⟩ + |11⟩)/√2` */
  text: string;
  /** Number of non-zero terms. */
  terms: number;
};

/**
 * Dirac (ket) form of a pure state with the global phase dropped (the first non-zero amplitude is
 * made real and positive). Known amplitudes are written symbolically (1/√2, ½, i, e^{iπ/4} …), others
 * as 3-decimal numbers. When all terms have the same magnitude 1/√k it is factored out.
 * `amp` holds 2^n amplitudes interleaved re/im; q[0] is the leftmost bit of each label.
 */
export function formatKet(amp: ArrayLike<number>, n: number, { maxTerms = 8 }: KetOptions = {}): KetForm {
  const size = amp.length / 2;
  const idx: number[] = [];
  for (let i = 0; i < size; i++) if (amp[2 * i] ** 2 + amp[2 * i + 1] ** 2 > ZERO2) idx.push(i);
  if (idx.length === 0) return { text: '0', terms: 0 };

  // drop the global phase: rotate so the first amplitude is real positive
  const f = idx[0];
  const f0 = Math.hypot(amp[2 * f], amp[2 * f + 1]);
  const cr = amp[2 * f] / f0;
  const ci = -amp[2 * f + 1] / f0;
  const rot = idx.map((i): [number, number] => {
    const re = amp[2 * i], im = amp[2 * i + 1];
    return [re * cr - im * ci, re * ci + im * cr];
  });

  const k = idx.length;
  if (k === 1) return { text: `|${basisLabel(f, n)}⟩`, terms: 1 };

  const mags2 = rot.map(([re, im]) => re * re + im * im);
  const total = mags2.reduce((s, v) => s + v, 0);
  const uniform = mags2.every((v) => Math.abs(v - total / k) < TOL) && Math.abs(total - 1) < 1e-6;
  const coefs = rot.map(([re, im]) => (uniform ? phaseOnly(re, im) : general(re, im)));

  const parts = idx.map((i, j) => ({ c: coefs[j], label: basisLabel(i, n) }));
  const shown: ({ c: Coef; label: string } | null)[] =
    k > maxTerms ? [...parts.slice(0, Math.max(1, maxTerms - 2)), null, parts[k - 1]] : parts;

  let sum = '';
  shown.forEach((p, j) => {
    if (p === null) {
      sum += ' + …';
      return;
    }
    const body = termBody(p.c, p.label);
    if (j === 0) sum += p.c.neg ? `−${body}` : body;
    else sum += p.c.neg ? ` − ${body}` : ` + ${body}`;
  });

  if (!uniform) return { text: sum, terms: k };
  const [s, r] = splitSquare(k);
  const den = r === 1 ? String(s) : s === 1 ? `√${r}` : `(${s}√${r})`;
  return { text: `(${sum})/${den}`, terms: k };
}

/** One complex number in the same symbolic style as the ket (`1/√2`, `−i`, `e^{iπ/4}`), `0` when negligible. */
export function formatComplex(re: number, im: number): string {
  if (re * re + im * im < ZERO2) return '0';
  const c = general(re, im);
  const body = c.body === '' ? '1' : c.body;
  return c.neg ? `−${body}` : body;
}
