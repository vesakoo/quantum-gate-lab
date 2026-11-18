import type { MatrixSpec } from './gateDocs';
import { KetText } from './KetView';

/** A bracketed matrix with an optional label (`CX =`), scalar and row labels. */
export function MatrixView({ m, label }: { m: MatrixSpec; label?: string }) {
  const n = m.rows[0]?.length ?? 0;
  return (
    <span className="matrix-row">
      {label ? <span className="matrix-label">{label}</span> : null}
      {m.scalar ? <span className="matrix-scalar">{m.scalar}</span> : null}
      {m.rowLabels ? (
        <span className="matrix-rowlabels" aria-hidden="true">
          {m.rowLabels.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </span>
      ) : null}
      <span className="matrix" role="table" style={{ gridTemplateColumns: `repeat(${n}, auto)` }}>
        {m.rows.map((row, r) => (
          <span key={r} role="row" className="matrix-r">
            {row.map((e, c) => (
              <span key={c} role="cell">
                <KetText text={e} />
              </span>
            ))}
          </span>
        ))}
      </span>
    </span>
  );
}

export default MatrixView;
