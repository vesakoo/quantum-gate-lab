/** Safe arithmetic parser for angle expressions (numbers, pi/π, + - * /, parentheses). */
export function parseAngle(expr: string): number | null {
  const s = expr;
  let i = 0;
  const ws = () => {
    while (i < s.length && /\s/.test(s[i])) i++;
  };

  function expression(): number | null {
    let v = term();
    if (v === null) return null;
    for (;;) {
      ws();
      const op = s[i];
      if (op !== '+' && op !== '-') return v;
      i++;
      const r = term();
      if (r === null) return null;
      v = op === '+' ? v + r : v - r;
    }
  }

  function term(): number | null {
    let v = factor();
    if (v === null) return null;
    for (;;) {
      ws();
      const op = s[i];
      if (op !== '*' && op !== '/') return v;
      i++;
      const r = factor();
      if (r === null) return null;
      v = op === '*' ? v * r : v / r;
    }
  }

  function factor(): number | null {
    ws();
    const ch = s[i];
    if (ch === '-' || ch === '+') {
      i++;
      const v = factor();
      return v === null ? null : ch === '-' ? -v : v;
    }
    if (ch === '(') {
      i++;
      const v = expression();
      ws();
      if (v === null || s[i] !== ')') return null;
      i++;
      return v;
    }
    if (ch === 'π') {
      i++;
      return Math.PI;
    }
    if (s.startsWith('pi', i)) {
      i += 2;
      return Math.PI;
    }
    const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(s.slice(i));
    if (!m) return null;
    i += m[0].length;
    return Number(m[0]);
  }

  const v = expression();
  ws();
  if (v === null || i !== s.length || !Number.isFinite(v)) return null;
  return v;
}
