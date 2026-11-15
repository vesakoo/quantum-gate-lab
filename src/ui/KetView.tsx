import { Fragment, useMemo, useState } from 'react';
import { formatKet } from './ket';

const SHORT = 8;

/** Renders `e^{iπ/4}` as e<sup>iπ/4</sup>; the rest is plain text. */
export function KetText({ text }: { text: string }) {
  const parts = text.split(/e\^\{([^}]*)\}/);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <Fragment key={i}>
            e<sup>{p}</sup>
          </Fragment>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

type Props = {
  /** Final pure state, interleaved re/im; null for a mixed state. */
  amplitudes: number[] | null;
  purity: number;
  numQubits: number;
  stale?: boolean;
};

export default function KetView({ amplitudes, purity, numQubits, stale = false }: Props) {
  const [all, setAll] = useState(false);
  const [copied, setCopied] = useState(false);
  const ket = useMemo(
    () => (amplitudes ? formatKet(amplitudes, numQubits, { maxTerms: all ? Infinity : SHORT }) : null),
    [amplitudes, numQubits, all],
  );
  const onCopy = async () => {
    if (!ket) return;
    try {
      await navigator.clipboard.writeText(`|ψ⟩ = ${ket.text}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable: the text can still be selected */
    }
  };
  return (
    <section className={stale ? 'ket-view stale' : 'ket-view'} aria-busy={stale || undefined}>
      <header>
        <h2>Output state</h2>
        {ket ? (
          <div className="ket-actions">
            {ket.terms > SHORT ? (
              <label>
                <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
                Show all {ket.terms} terms
              </label>
            ) : null}
            <button type="button" onClick={onCopy}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        ) : null}
      </header>
      {ket ? (
        <>
          <p className="ket" aria-label="Output state in ket notation" title={`|ψ⟩ = ${ket.text}`}>
            |ψ⟩ = <KetText text={ket.text} />
          </p>
          <p className="ket-note">Global phase dropped · q[0] is the leftmost bit</p>
        </>
      ) : (
        <p className="ket ket-mixed">
          Mixed state (purity Tr ρ² = {purity.toFixed(3)}): no single ket describes it — see the probabilities below.
        </p>
      )}
    </section>
  );
}
