import { useState } from 'react';
import UpdatingBadge from './UpdatingBadge';

export function basisLabel(index: number, n: number): string {
  return index.toString(2).padStart(n, '0');
}

/** Indices of rows to show; hides probabilities that round to 0.0 %. */
export function visibleRows(probs: number[], hideZero: boolean): number[] {
  const rows: number[] = [];
  probs.forEach((p, i) => {
    if (!hideZero || p >= 5e-4) rows.push(i);
  });
  return rows;
}

const ROW = 20;
const LABEL_W = 12; // chars handled via px below
const LEFT = 16 + LABEL_W * 8;
const PLOT_W = 600;
const RIGHT = 70;
const TOP = 6;

function pct(p: number): string {
  const v = Math.max(0, Math.min(1, p)) * 100;
  const s = v.toFixed(1);
  return `${s === '-0.0' ? '0.0' : s} %`;
}

type Props = {
  probabilities: number[];
  /** Qubit count of the result the probabilities belong to (used for the basis labels). */
  numQubits: number;
  /** The result belongs to an older circuit (dimmed). */
  stale?: boolean;
};

export default function ProbabilityChart({ probabilities, numQubits, stale = false }: Props) {
  const [hideZero, setHideZero] = useState(false);
  const rows = visibleRows(probabilities, hideZero);
  const plotH = rows.length * ROW;
  const height = TOP + plotH + 26;
  const x = (v: number) => LEFT + (v / 100) * PLOT_W;
  const ticks = Array.from({ length: 11 }, (_, i) => i * 10);
  return (
    <section className={stale ? 'prob-chart stale' : 'prob-chart'} aria-busy={stale || undefined}>
      <header>
        <h2>Output probabilities</h2>
        {stale ? <UpdatingBadge /> : null}
        <label>
          <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
          Hide 0% rows
        </label>
      </header>
      <div className="prob-scroll">
        <svg width={LEFT + PLOT_W + RIGHT} height={height} role="img" aria-label="Output probabilities chart">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={TOP} y2={TOP + plotH} className="chart-grid" />
              <text x={x(t)} y={TOP + plotH + 16} textAnchor="middle" fontSize="11" className="chart-tick">
                {t}
              </text>
            </g>
          ))}
          {rows.map((idx, r) => {
            const p = Math.max(0, probabilities[idx]);
            const y = TOP + r * ROW;
            return (
              <g key={idx}>
                <text x={LEFT - 8} y={y + 14} textAnchor="end" fontSize="12" fontFamily="ui-monospace, Menlo, Consolas, monospace" className="chart-label">
                  {basisLabel(idx, numQubits)}
                </text>
                <rect x={LEFT} y={y + 2} width={Math.max(0, p * PLOT_W)} height={ROW - 4} className="chart-bar" />
                <text x={x(p * 100) + 6} y={y + 14} fontSize="11" className="chart-value">
                  {pct(p)}
                </text>
              </g>
            );
          })}
          <line x1={LEFT} x2={LEFT} y1={TOP} y2={TOP + plotH} className="chart-axis" />
        </svg>
      </div>
    </section>
  );
}
