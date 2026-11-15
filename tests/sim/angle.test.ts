import { describe, it, expect } from 'vitest';
import { parseAngle } from '../../src/sim/angle';

describe('parseAngle', () => {
  it('parses valid expressions', () => {
    expect(parseAngle('pi/4')).toBeCloseTo(Math.PI / 4);
    expect(parseAngle('-3*pi/2')).toBeCloseTo(-3 * Math.PI / 2);
    expect(parseAngle('π')).toBeCloseTo(Math.PI);
    expect(parseAngle('(1+1)*pi')).toBeCloseTo(2 * Math.PI);
    expect(parseAngle('0.5')).toBe(0.5);
    expect(parseAngle('1e-3')).toBe(0.001);
    expect(parseAngle('  pi / 2 ')).toBeCloseTo(Math.PI / 2);
  });
  it('rejects invalid input', () => {
    for (const s of ['', 'abc', 'pi pi', '2**3', 'alert(1)', '(pi']) expect(parseAngle(s), s).toBeNull();
  });
  it('returns null instead of overflowing the stack on deep nesting', () => {
    const deep = '('.repeat(100000) + '1' + ')'.repeat(100000);
    expect(() => parseAngle(deep)).not.toThrow();
    expect(parseAngle(deep)).toBeNull();
  });
});
