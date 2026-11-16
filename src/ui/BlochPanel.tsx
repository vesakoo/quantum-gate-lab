import { useEffect, useRef } from 'react';
import type { Bloch } from '../sim/backend';
import { blochLabel } from './BlochStrip';
import type { BlochScene } from './blochScene';
import { formatKet, qubitAmplitudes } from './ket';
import { KetText } from './KetView';
import { blochPolar, eulerRows, withDegrees } from './polar';

type Props = {
  qubit: number;
  /** Index into SimResult.bloch: 0 = input state, k = after (1-based) step k. */
  step: number;
  bloch: Bloch;
  onClose: () => void;
};

const fmt = (v: number) => (Math.abs(v) < 5e-4 ? 0 : v).toFixed(3);
const pct = (p: number) => `${(p * 100).toFixed(1)} %`;

/** Side panel: large rotatable three.js Bloch sphere (when WebGL exists) plus the full numbers. */
export default function BlochPanel({ qubit, step, bloch, onClose }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<BlochScene | null>(null);
  const latest = useRef(bloch);
  latest.current = bloch;

  useEffect(() => {
    // jsdom (tests) and WebGL-less browsers: numbers only, never load three.js
    if (typeof WebGLRenderingContext === 'undefined') return;
    let cancelled = false;
    import('./blochScene')
      .then(({ createBlochScene }) => {
        if (cancelled || !host.current) return;
        const s = createBlochScene(host.current);
        if (!s) return;
        scene.current = s;
        s.update(latest.current);
      })
      .catch(() => {
        /* numbers only */
      });
    return () => {
      cancelled = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    scene.current?.update(bloch);
  }, [bloch]);

  const title = blochLabel(qubit, step);
  const polar = blochPolar(bloch);
  const probs: [string, number][] = [
    ['|0⟩', bloch.probs.zero],
    ['|1⟩', bloch.probs.one],
    ['|+⟩', bloch.probs.plus],
    ['|−⟩', bloch.probs.minus],
    ['|i⟩', bloch.probs.plusI],
    ['|−i⟩', bloch.probs.minusI],
  ];

  return (
    <aside className="bloch-panel" aria-label={`Bloch sphere ${title}`}>
      <header className="bloch-panel-head">
        <h2>{title}</h2>
        <button type="button" className="bloch-close" aria-label="Close Bloch panel" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="bloch3d" ref={host} aria-hidden="true" />
      <p className="bloch-hint">Drag to rotate · up = z, right = y, toward you = x</p>
      {bloch.mixed ? (
        <p className="bloch-mixed">
          <strong>entangled / mixed</strong> — the arrow is shorter than the radius
        </p>
      ) : null}
      <dl className="bloch-coords">
        <dt>x</dt>
        <dd data-testid="bloch-x">{fmt(bloch.x)}</dd>
        <dt>y</dt>
        <dd data-testid="bloch-y">{fmt(bloch.y)}</dd>
        <dt>z</dt>
        <dd data-testid="bloch-z">{fmt(bloch.z)}</dd>
        <dt>length</dt>
        <dd data-testid="bloch-length">{fmt(bloch.length)}</dd>
      </dl>
      <p className="bloch-subhead">Polar (Euler) form</p>
      <dl className="bloch-coords bloch-polar">
        <dt>θ</dt>
        <dd data-testid="bloch-theta">{polar.theta === null ? '—' : withDegrees(polar.theta)}</dd>
        <dt>φ</dt>
        <dd data-testid="bloch-phi">{polar.phi === null ? '—' : withDegrees(polar.phi)}</dd>
      </dl>
      {bloch.mixed ? (
        <p className="bloch-euler" data-testid="bloch-euler-mixed">
          mixed state (r = {fmt(polar.r)}): no single |ψ⟩; θ and φ give the arrow&apos;s direction
        </p>
      ) : (
        <>
          <p className="bloch-euler" data-testid="bloch-euler-formula">
            |ψ⟩ = <KetText text="cos(θ/2)|0⟩ + e^{iφ}·sin(θ/2)|1⟩" />
          </p>
          <table className="bloch-euler-table" data-testid="bloch-euler-table">
            <thead>
              <tr>
                <td />
                <th scope="col">
                  <KetText text="r·e^{iφ}" />
                </th>
                <th scope="col">Re + i·Im</th>
              </tr>
            </thead>
            <tbody>
              {eulerRows(polar.theta ?? 0, polar.phi).map((row) => (
                <tr key={row.name} data-testid={`euler-${row.name}`}>
                  <th scope="row">{row.name}</th>
                  <td>
                    <KetText text={row.polar} />
                  </td>
                  <td>{row.rect}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="bloch-euler" data-testid="bloch-euler">
            |ψ⟩ = <KetText text={formatKet(qubitAmplitudes(polar.theta ?? 0, polar.phi), 1).text} />
          </p>
        </>
      )}
      <table className="bloch-probs">
        <caption>Measurement probabilities</caption>
        <tbody>
          {probs.map(([name, p]) => (
            <tr key={name} data-testid={`prob-${name}`}>
              <th scope="row">{name}</th>
              <td className="bar">
                <span style={{ width: `${p * 100}%` }} />
              </td>
              <td className="num">{pct(p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </aside>
  );
}
