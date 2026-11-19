import { useMemo, useState } from 'react';
import type { Circuit } from '../model/circuit';
import { circuitOperators } from '../model/operators';
import { formatOperators } from './operatorText';

/** The circuit as an unsimplified Dirac operator product, built from the current circuit (never lags the simulation). */
export default function OperatorView({ circuit }: { circuit: Circuit }) {
  const [copied, setCopied] = useState(false);
  const { ops, text } = useMemo(() => {
    const o = circuitOperators(circuit);
    return { ops: o, text: formatOperators(o) };
  }, [circuit]);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable: the text can still be selected */
    }
  };
  const stop = ops.stoppedAt;
  return (
    <section className="operator-view">
      <header>
        <h2>Circuit as operators</h2>
        <div className="ket-actions">
          <button type="button" onClick={onCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </header>
      <p className="ket" role="math" aria-label="Circuit as operators formula">
        {text}
      </p>
      <p className="ket-note">Last step on the left · q[0] is the leftmost factor</p>
      {stop ? (
        <p className="ket-note">
          {stop.kind === 'measure' ? 'Measurement' : 'Reset'} at step {stop.step + 1} — the formula ends before that step, including its other gates.
        </p>
      ) : null}
      {ops.invalidAngles ? <p className="ket-note">Gates with invalid angles act as I in the simulation.</p> : null}
    </section>
  );
}
