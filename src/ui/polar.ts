import type { Bloch } from '../sim/backend';

const EPS = 1e-6;
const STEP = Math.PI / 12;

export type Polar = {
  /** Vector length (1 for a pure state). */
  r: number;
  /** Polar angle from +z, in [0, π]; null when r = 0. */
  theta: number | null;
  /** Azimuth from +x toward +y, in [0, 2π); null when r = 0 or at a pole. */
  phi: number | null;
};

/** Spherical coordinates of a Bloch vector. */
export function blochPolar(b: Bloch): Polar {
  const r = b.length;
  if (r < EPS) return { r, theta: null, phi: null };
  const theta = Math.acos(Math.min(1, Math.max(-1, b.z / r)));
  if (Math.hypot(b.x, b.y) < EPS * r) return { r, theta, phi: null };
  let phi = Math.atan2(b.y, b.x);
  if (phi < 0) phi += 2 * Math.PI;
  if (phi > 2 * Math.PI - EPS) phi = 0;
  return { r, theta, phi };
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Radians as a π fraction when it is a multiple of π/12 (`π/2`, `3π/4`), else 3 decimals. */
export function formatRadians(rad: number): string {
  const k = Math.round(rad / STEP);
  if (Math.abs(rad - k * STEP) > EPS) return rad.toFixed(3);
  if (k === 0) return '0';
  const g = gcd(Math.abs(k), 12);
  const num = k / g;
  const den = 12 / g;
  const head = num === 1 ? 'π' : num === -1 ? '−π' : `${num}π`;
  return den === 1 ? head : `${head}/${den}`;
}

/** `π/2 (90.0°)` */
export function withDegrees(rad: number): string {
  return `${formatRadians(rad)} (${((rad * 180) / Math.PI).toFixed(1)}°)`;
}

/**
 * The pure state in Euler form, global phase dropped:
 * cos(θ/2)|0⟩ + e^{iφ}·sin(θ/2)|1⟩. Phases 0 and π become plain + / −.
 */
export function eulerState(theta: number, phi: number | null): string {
  const a = Math.cos(theta / 2);
  const b = Math.sin(theta / 2);
  if (b < 5e-4) return '|0⟩';
  if (a < 5e-4) return '|1⟩';
  const p = phi ?? 0;
  const amp0 = `${a.toFixed(3)}|0⟩`;
  const amp1 = `${b.toFixed(3)}|1⟩`;
  if (Math.abs(p) < EPS) return `${amp0} + ${amp1}`;
  if (Math.abs(p - Math.PI) < EPS) return `${amp0} − ${amp1}`;
  return `${amp0} + e^{i${formatRadians(p)}}·${amp1}`;
}
