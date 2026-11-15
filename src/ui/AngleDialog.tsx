import { useEffect, useId, useRef, useState } from 'react';
import { parseAngle } from '../sim/angle';
import { GATE_INFO, type GateId } from '../sim/gates';

type Props = {
  gate: GateId;
  params: string[];
  onOk: (params: string[]) => void;
  onCancel: () => void;
};

export default function AngleDialog({ gate, params, onOk, onCancel }: Props) {
  const info = GATE_INFO[gate];
  const [values, setValues] = useState<string[]>(() => info.params.map((_, i) => params[i] ?? ''));
  const uid = useId();
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    first.current?.focus();
    first.current?.select();
  }, []);

  const parsed = values.map((v) => parseAngle(v));
  const valid = parsed.every((v) => v !== null && Number.isFinite(v));
  const submit = () => {
    if (valid) onOk(values.map((v) => v.trim()));
  };

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        className="angle-dialog"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          else if (e.key === 'Enter') submit();
          e.stopPropagation();
        }}
      >
        <h3 id={`${uid}-title`}>{info.label} — {info.params.length > 1 ? 'angles' : 'angle'}</h3>
        {info.params.map((p, i) => {
          const v = parsed[i];
          const bad = v === null || !Number.isFinite(v);
          return (
            <div className="angle-field" key={p}>
              <label htmlFor={`${uid}-${i}`}>{p}</label>
              <input
                id={`${uid}-${i}`}
                ref={i === 0 ? first : undefined}
                value={values[i]}
                spellCheck={false}
                aria-invalid={bad}
                onChange={(e) => {
                  const next = values.slice();
                  next[i] = e.target.value;
                  setValues(next);
                }}
              />
              {bad ? (
                <p role="alert" className="angle-error">Invalid angle</p>
              ) : (
                <span className="angle-value">= {(v as number).toFixed(4)} rad</span>
              )}
            </div>
          );
        })}
        <p className="angle-hint">Numbers and expressions with pi, e.g. pi/4, -3*pi/2</p>
        <div className="dialog-buttons">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" onClick={submit} disabled={!valid}>OK</button>
        </div>
      </div>
    </div>
  );
}
