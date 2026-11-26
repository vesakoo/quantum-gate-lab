import { Fragment, useMemo } from 'react';
import type { Circuit } from '../model/circuit';
import { circuitMatrices, MAX_MATRIX_QUBITS } from '../model/matrices';
import type { MatrixSpec } from './gateDocs';
import { matrixSpec, vectorSpec } from './matrixText';
import MatrixView from './MatrixView';

const Op = ({ children }: { children: string }) => <span className="matrix-op">{children}</span>;

function Term({ m, caption }: { m: MatrixSpec; caption?: string }) {
  return (
    <span className="matrix-term">
      <MatrixView m={m} />
      {caption ? <span className="matrix-caption">{caption}</span> : null}
    </span>
  );
}

/** The circuit as written-out step matrices, their product, and the product applied to the input (≤ 4 qubits). */
export default function MatrixProductView({ circuit }: { circuit: Circuit }) {
  const data = useMemo(() => {
    const cm = circuitMatrices(circuit);
    if (!cm) return null;
    return {
      cm,
      factors: cm.factors.map((f) => ({ step: f.step, spec: matrixSpec(f.m) })).reverse(),
      product: matrixSpec(cm.product),
      input: vectorSpec(cm.input),
      output: vectorSpec(cm.output),
    };
  }, [circuit]);

  return (
    <section className="matrix-view">
      <header>
        <h2>Circuit as matrices</h2>
      </header>
      {data ? (
        <>
          <div className="matrix-product" role="group" aria-label="Circuit matrix product">
            {data.factors.length === 0 ? (
              <>
                <Op>U = I =</Op>
                <Term m={data.product} />
              </>
            ) : (
              <>
                <Op>U =</Op>
                {data.factors.map((f, i) => (
                  <Fragment key={f.step}>
                    {i > 0 ? <Op>·</Op> : null}
                    <Term m={f.spec} caption={`step ${f.step + 1}`} />
                  </Fragment>
                ))}
                {data.factors.length > 1 ? (
                  <>
                    <Op>=</Op>
                    <Term m={data.product} />
                  </>
                ) : null}
              </>
            )}
          </div>
          <div className="matrix-product" role="group" aria-label="Circuit matrix applied to the input">
            <Op>{`U·|${data.cm.initial.join('')}⟩ =`}</Op>
            <Term m={data.product} />
            <Op>·</Op>
            <Term m={data.input} />
            <Op>=</Op>
            <Term m={data.output} />
          </div>
          {data.cm.stoppedAt ? (
            <p className="ket-note">
              {data.cm.stoppedAt.kind === 'measure' ? 'Measurement' : 'Reset'} at step {data.cm.stoppedAt.step + 1} — the
              formula ends before that step, including its other gates.
            </p>
          ) : null}
          {data.cm.invalidAngles ? <p className="ket-note">Gates with invalid angles act as I in the simulation.</p> : null}
        </>
      ) : (
        <p className="ket-note">Matrices are written out up to {MAX_MATRIX_QUBITS} qubits</p>
      )}
    </section>
  );
}
