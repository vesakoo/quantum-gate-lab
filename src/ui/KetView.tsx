import { Fragment, useMemo, useState } from 'react';
import { formatKet, globalPhase } from './ket';
import UpdatingBadge from './UpdatingBadge';

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
  /** 'density' after MEASURE/RESET: the global phase of the recovered state is arbitrary. */
  backend: 'statevector' | 'density';
  stale?: boolean;
};

export default function KetView({ amplitudes, purity, numQubits, backend, stale = false }: Props) {
  const [all, setAll] = useState(false);
  const [copied, setCopied] = useState(false);
  const ket = useMemo(
    () => (amplitudes ? formatKet(amplitudes, numQubits, { maxTerms: all ? Infinity : SHORT }) : null),
    [amplitudes, numQubits, all],
  );
  const phase = useMemo(() => (amplitudes && backend === 'statevector' ? globalPhase(amplitudes) : null), [amplitudes, backend]);
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
        {stale ? <UpdatingBadge /> : null}
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
          <p className="ket" role="math" aria-label="Output state in ket notation" title={`|ψ⟩ = ${ket.text}`}>
            |ψ⟩ = <KetText text={ket.text} />
          </p>
          <p className="ket-note">
            {backend === 'density' ? (
              'Global phase unknown after measure/reset'
            ) : phase ? (
              <>
                Global phase <KetText text={phase.text} /> ({phase.degrees}) factored out
              </>
            ) : (
              'Global phase: none'
            )}{' '}
            · q[0] is the leftmost bit
          </p>
          <details className="ket-why">
            <summary>Why can&apos;t it be measured?</summary>
            <p className="ket-note">
              Multiplying the whole state by one phase factor changes no probability or expectation value, so no
              measurement can see it.
            </p>
            <p className="ket-note">
              Its value depends on how the gate matrices are defined: T = diag(1, <KetText text="e^{iπ/4}" />) and
              RZ(π/4) act the same but differ by <KetText text="e^{−iπ/8}" />.
            </p>
            <p className="ket-note">
              It becomes a measurable relative phase when the same gates are controlled by another qubit (phase
              kickback).
            </p>
          </details>
        </>
      ) : (
        <p className="ket ket-mixed">
          Mixed state (purity Tr ρ² = {purity.toFixed(3)}): no single ket describes it — see the probabilities below.
        </p>
      )}
    </section>
  );
}
