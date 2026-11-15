import type { Bloch } from '../sim/backend';
import { COL_W } from './GateView';
import MiniBloch from './MiniBloch';

export const STRIP_ROW_H = 48;

/** `s` indexes SimResult.bloch: 0 = input, k = after (1-based) step k. */
export type BlochSel = { qubit: number; s: number };

export const blochLabel = (qubit: number, s: number) => (s === 0 ? `q[${qubit}] input` : `q[${qubit}] after step ${s}`);

type Props = {
  bloch: Bloch[][];
  numQubits: number;
  numSteps: number;
  inW: number;
  outW: number;
  selected: BlochSel | null;
  onSelect: (sel: BlochSel) => void;
};

/**
 * One row of mini Bloch spheres per qubit, laid out on the same column template as the
 * circuit grid (In column = input state, then one column per step) so they line up and
 * scroll together.
 */
export default function BlochStrip({ bloch, numQubits, numSteps, inW, outW, selected, onSelect }: Props) {
  // the result may briefly lag a structural edit while the worker catches up
  const cols = Math.min(numSteps + 1, bloch.length);
  const rows = Math.min(numQubits, bloch[0]?.length ?? 0);
  return (
    <section
      className="bloch-strip"
      aria-label="Bloch spheres"
      style={{
        gridTemplateColumns: `${inW}px repeat(${numSteps}, ${COL_W}px) ${outW}px`,
        gridAutoRows: `${STRIP_ROW_H}px`,
      }}
    >
      {Array.from({ length: rows }, (_, q) =>
        Array.from({ length: cols }, (_, s) => (
          <div
            key={`${q}:${s}`}
            className={s === 0 ? 'bloch-cell bloch-in' : 'bloch-cell'}
            style={{ gridRow: q + 1, gridColumn: s + 1 }}
          >
            {/* visual-only label (CSS ::before); the sphere buttons carry the accessible name */}
            {s === 0 ? <span className="qubit-label strip-label" data-label={`q[${q}]`} aria-hidden="true" /> : null}
            <MiniBloch
              bloch={bloch[s][q]}
              label={blochLabel(q, s)}
              selected={selected?.qubit === q && selected.s === s}
              onClick={() => onSelect({ qubit: q, s })}
            />
          </div>
        )),
      )}
    </section>
  );
}
