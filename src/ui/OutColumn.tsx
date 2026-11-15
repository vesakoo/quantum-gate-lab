import { ROW_H } from './GateView';

function MeterIcon() {
  return (
    <svg width="30" height="22" viewBox="0 0 30 22" aria-hidden="true" className="meter-icon">
      <rect x="0.75" y="0.75" width="28.5" height="20.5" rx="2" fill="#fff" stroke="#000" strokeWidth="1.5" />
      <path d="M5 17 A10 10 0 0 1 25 17" fill="none" stroke="#000" strokeWidth="1.5" />
      <line x1="15" y1="17" x2="21" y2="7" stroke="#000" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Per-qubit meter + output box: cyan fill = P(1), digit = most likely value. */
export default function OutColumn({ numQubits, qubitP1 }: { numQubits: number; qubitP1: number[] | null }) {
  return (
    <div className="out-column">
      {Array.from({ length: numQubits }, (_, q) => {
        const p = qubitP1?.[q] ?? 0;
        const bit = p >= 0.5 - 1e-9 ? 1 : 0;
        return (
          <div className="out-row" key={q} style={{ height: ROW_H }}>
            <MeterIcon />
            <div
              className="out-box"
              aria-label={`q[${q}] output`}
              title={`q[${q}]: P(1) = ${(p * 100).toFixed(1)} %`}
            >
              <div className="out-fill" style={{ width: `${p * 100}%` }} />
              <span className="out-digit">{bit}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
