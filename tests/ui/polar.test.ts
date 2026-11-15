import { describe, expect, it } from 'vitest';
import { blochFrom } from '../../src/sim/backend';
import { blochPolar, formatRadians, withDegrees } from '../../src/ui/polar';

const PI = Math.PI;

describe('formatRadians', () => {
  it('snaps multiples of π/12 to π fractions', () => {
    expect(formatRadians(0)).toBe('0');
    expect(formatRadians(PI)).toBe('π');
    expect(formatRadians(PI / 2)).toBe('π/2');
    expect(formatRadians(PI / 4)).toBe('π/4');
    expect(formatRadians((3 * PI) / 4)).toBe('3π/4');
    expect(formatRadians((3 * PI) / 2)).toBe('3π/2');
    expect(formatRadians((5 * PI) / 12)).toBe('5π/12');
    expect(formatRadians(PI / 2 + 1e-9)).toBe('π/2');
    expect(formatRadians(-PI / 4)).toBe('−π/4');
    expect(formatRadians((-3 * PI) / 4)).toBe('−3π/4');
  });
  it('prints other angles as radians with 3 decimals', () => {
    expect(formatRadians(1)).toBe('1.000');
  });
  it('withDegrees appends degrees', () => {
    expect(withDegrees(PI / 2)).toBe('π/2 (90.0°)');
    expect(withDegrees(1)).toBe('1.000 (57.3°)');
  });
});

describe('blochPolar', () => {
  it('|0⟩: θ = 0, φ undefined at the pole', () => {
    expect(blochPolar(blochFrom(0, 0, 1))).toEqual({ r: 1, theta: 0, phi: null });
  });
  it('|1⟩: θ = π, φ undefined', () => {
    const p = blochPolar(blochFrom(0, 0, -1));
    expect(p.theta).toBeCloseTo(PI, 9);
    expect(p.phi).toBeNull();
  });
  it('equator states give θ = π/2 and φ from +x', () => {
    const cases: [number, number, number][] = [
      [1, 0, 0],
      [0, 1, PI / 2],
      [-1, 0, PI],
      [0, -1, (3 * PI) / 2],
    ];
    for (const [x, y, phi] of cases) {
      const p = blochPolar(blochFrom(x, y, 0));
      expect(p.theta).toBeCloseTo(PI / 2, 9);
      expect(p.phi).toBeCloseTo(phi, 9);
    }
  });
  it('fully mixed (r = 0): no direction', () => {
    expect(blochPolar(blochFrom(0, 0, 0))).toEqual({ r: 0, theta: null, phi: null });
  });
  it('a shorter vector keeps its direction', () => {
    const p = blochPolar(blochFrom(0, 0.5, 0));
    expect(p.r).toBeCloseTo(0.5, 9);
    expect(p.theta).toBeCloseTo(PI / 2, 9);
    expect(p.phi).toBeCloseTo(PI / 2, 9);
  });
});
