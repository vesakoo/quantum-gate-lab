import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Circuit } from '../model/circuit';
import { lower } from '../export/lower';
import { toQasm2 } from '../export/qasm2';
import { toQiskit } from '../export/qiskit';
import { GATE_INFO } from '../sim/gates';

type Props = { circuit: Circuit; shareUrl: string; onClose: () => void };

const TABS = [
  { id: 'qiskit', label: 'Qiskit', file: 'circuit.py', type: 'text/x-python' },
  { id: 'qasm', label: 'OpenQASM 2.0', file: 'circuit.qasm', type: 'text/plain' },
] as const;

/** Export dialog: the circuit as Qiskit Python or OpenQASM 2.0, with Copy and Download. */
export default function ExportDialog({ circuit, shareUrl, onClose }: Props) {
  const uid = useId();
  const [tab, setTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => tabRefs.current[0]?.focus(), []);

  /** Per tab: the code, or the message shown instead of it. */
  const results = useMemo((): { code?: string; message?: string }[] => {
    const l = lower(circuit);
    if (!l.ok) {
      const e = l.error;
      const msg = `Fix the angle of ${GATE_INFO[e.gate].label} on ${e.wires.map((w) => `q[${w}]`).join(', ')}, step ${e.step + 1} before exporting.`;
      return [{ message: msg }, { message: msg }];
    }
    const q = toQasm2(l.value, shareUrl);
    return [{ code: toQiskit(l.value, shareUrl) }, q.ok ? { code: q.code } : { message: q.message }];
  }, [circuit, shareUrl]);

  const select = (i: number) => {
    setTab(i);
    setCopied(false);
    tabRefs.current[i]?.focus();
  };
  const current = results[tab];
  const t = TABS[tab];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(current.code!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* the code stays selectable in the panel */
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([current.code!], { type: t.type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = t.file;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        className="angle-dialog export-dialog"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          e.stopPropagation();
        }}
      >
        <h3 id={`${uid}-title`}>Export circuit</h3>
        <div role="tablist" aria-label="Format" className="export-tabs">
          {TABS.map((x, i) => (
            <button
              key={x.id}
              ref={(el) => (tabRefs.current[i] = el)}
              type="button"
              role="tab"
              id={`${uid}-tab-${x.id}`}
              aria-selected={i === tab}
              aria-controls={`${uid}-panel`}
              tabIndex={i === tab ? 0 : -1}
              onClick={() => select(i)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  e.preventDefault();
                  select((i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length);
                }
              }}
            >
              {x.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${t.id}`} className="export-panel">
          {current.code !== undefined ? (
            <>
              <pre className="export-code" tabIndex={0} aria-label={`${t.label} code`}>
                {current.code}
              </pre>
              <div className="dialog-buttons">
                <button type="button" onClick={copy}>{copied ? 'Copied!' : 'Copy'}</button>
                <button type="button" onClick={download}>Download</button>
              </div>
            </>
          ) : (
            <p className="export-message">{current.message}</p>
          )}
        </div>
        <div className="dialog-buttons export-close">
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
