import { memo } from 'react';
import type { Bloch } from '../sim/backend';

/** Foreshortening of the x axis (toward the viewer) in the oblique projection. */
const K = 0.35;

/**
 * Oblique projection of the Bloch vector into SVG coordinates (y grows downward):
 * up = +z, screen-right = +y, +x points toward the viewer and is drawn down-left.
 */
export function projectBloch(b: Bloch, r: number): { px: number; py: number } {
  return { px: r * (b.y - K * b.x), py: r * (-b.z + K * b.x) };
}

const pct = (p: number) => `${(p * 100).toFixed(1)} %`;

export function blochTitle(b: Bloch): string {
  const head = `x ${b.x.toFixed(2)}, y ${b.y.toFixed(2)}, z ${b.z.toFixed(2)} · P(1) ${pct(b.probs.one)}`;
  return b.mixed ? `${head} · entangled / mixed (length ${b.length.toFixed(2)})` : head;
}

type Props = {
  bloch: Bloch;
  /** Accessible name, e.g. `q[0] after step 3`. */
  label?: string;
  size?: number;
  onClick?: () => void;
  selected?: boolean;
};

/** Small clickable SVG Bloch sphere (circle, dashed equator, red arrow + tip dot). */
const MiniBloch = memo(function MiniBloch({ bloch, label = 'Bloch sphere', size = 40, onClick, selected = false }: Props) {
  const c = size / 2;
  const r = c - 3;
  const { px, py } = projectBloch(bloch, r);
  const tip = Math.hypot(px, py) > 0.5;
  const cls = `mini-bloch${bloch.mixed ? ' mixed' : ''}${selected ? ' selected' : ''}`;
  const svg = (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={c} cy={c} r={r} className="mb-sphere" />
      <ellipse cx={c} cy={c} rx={r} ry={r * K} className="mb-equator" />
      {tip ? <line x1={c} y1={c} x2={c + px} y2={c + py} className="mb-arrow" /> : null}
      <circle cx={c + px} cy={c + py} r={2.2} className="mb-tip" />
    </svg>
  );
  return (
    <button
      type="button"
      className={cls}
      aria-label={label}
      aria-pressed={selected}
      title={`${label}: ${blochTitle(bloch)}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {svg}
    </button>
  );
});

export default MiniBloch;
