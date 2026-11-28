import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { emptyCircuit, type Circuit, type Op } from '../model/circuit';
import { parseCircuit, toHash, toJSON } from '../model/serialize';
import {
  MAX_QUBITS, addQubit, moveControl, moveOp, moveOpEnd, placeControl, placeGate, removeControl,
  removeOp, removeQubit, setParams, toggleInitial,
} from '../model/edit';
import AngleDialog from './AngleDialog';
import ExportDialog from './ExportDialog';
import BlochPanel from './BlochPanel';
import BlochStrip, { type BlochSel } from './BlochStrip';
import CircuitGrid, { IN_W, OUT_W, type Selection } from './CircuitGrid';
import { dropTarget, gridCollision } from './drop';
import { COL_W, ControlGlyph, GateBox, ROW_H, hasAngles, opLabel, type DragData } from './GateView';
import KetView from './KetView';
import ThemeToggle from './ThemeToggle';
import { GateCardProvider } from './gateCardContext';
import OperatorView from './OperatorView';
import MatrixProductView from './MatrixProductView';
import Palette from './Palette';
import ProbabilityChart from './ProbabilityChart';
import { useCircuit } from './useCircuit';
import { useSimulation } from './useSimulation';
import './styles.css';

function locateOp(c: Circuit, id: string): { si: number; op: Op } | null {
  for (let si = 0; si < c.steps.length; si++) {
    const op = c.steps[si].ops.find((o) => o.id === id);
    if (op) return { si, op };
  }
  return null;
}

export default function App() {
  const { circuit, dispatch, replace, loadError } = useCircuit();
  const { result: sim, computing } = useSimulation(circuit);
  // the worker result may lag a structural edit; never pair it with the new circuit's labels
  const simFresh = sim !== null && sim.numQubits === circuit.numQubits;
  const [selection, setSelection] = useState<Selection>(null);
  const [angleEdit, setAngleEdit] = useState<{ opId: string; isNew: boolean } | null>(null);
  const [dragging, setDragging] = useState<DragData | null>(null);
  const [blochSel, setBlochSel] = useState<BlochSel | null>(null);
  // distance threshold keeps click (select) and double-click (edit angles) working
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragStart = (e: DragStartEvent) => setDragging((e.active.data.current as DragData) ?? null);

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const data = e.active.data.current as DragData | undefined;
    if (!data) return;
    const target = dropTarget(e.over?.id);
    // step headers, In/Out columns and the Bloch strip are a no-op; the palette or off-grid deletes
    if (target.kind === 'grid') return;
    const cell = target.kind === 'cell' ? target : null;
    switch (data.type) {
      case 'palette': {
        if (!cell) return;
        if (!hasAngles(data.gate)) {
          dispatch((c) => placeGate(c, data.gate, cell.step, cell.wire));
          return;
        }
        const next = placeGate(circuit, data.gate, cell.step, cell.wire);
        if (next === circuit) return;
        replace(next);
        const op = next.steps[cell.step].ops.find((o) => o.wires.includes(cell.wire));
        if (op) setAngleEdit({ opId: op.id, isNew: true });
        return;
      }
      case 'palette-control':
        if (cell) dispatch((c) => placeControl(c, data.kind, cell.step, cell.wire));
        return;
      case 'op': {
        if (!cell) {
          dispatch((c) => removeOp(c, data.opId));
          return;
        }
        const found = locateOp(circuit, data.opId);
        if (found && found.op.wires.length > 1) {
          // multi-wire body: move by the drag offset so the grabbed point stays under the pointer
          const ds = Math.round(e.delta.x / COL_W);
          const dw = Math.round(e.delta.y / ROW_H);
          dispatch((c) => moveOp(c, data.opId, found.si + ds, found.op.wires[0] + dw));
        } else {
          dispatch((c) => moveOp(c, data.opId, cell.step, cell.wire));
        }
        return;
      }
      case 'op-end':
        dispatch((c) => (cell ? moveOpEnd(c, data.opId, data.end, cell.wire) : removeOp(c, data.opId)));
        return;
      case 'control':
        dispatch((c) =>
          cell ? moveControl(c, data.step, data.wire, cell.step, cell.wire) : removeControl(c, data.step, data.wire),
        );
        return;
    }
  };

  const [ioError, setIoError] = useState<string | null>(null);
  useEffect(() => {
    // a link loaded from the URL hash (at start-up or pasted) reports its outcome in the banner
    setIoError(loadError ? loadError.message : null);
  }, [loadError]);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const onSave = () => {
    const url = URL.createObjectURL(new Blob([toJSON(circuit)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'circuit.json';
    a.click();
    // revoking synchronously can cancel the download in Safari
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const onLoadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    let text: string;
    try {
      text = await f.text();
    } catch {
      setIoError(`Could not read ${f.name}`);
      return;
    }
    const r = parseCircuit(text);
    if (r.ok) {
      replace(r.circuit);
      setIoError(null);
      setSelection(null);
    } else setIoError(`Could not load ${f.name}: ${r.error}`);
  };
  const shareUrl = (c: Circuit) => `${location.origin}${location.pathname}${location.search}#${toHash(c)}`;
  const onCopyLink = async () => {
    const url = shareUrl(circuit);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setIoError('Could not copy the link; copy it from the address bar.');
    }
  };
  const onClear = () => {
    replace(emptyCircuit());
    setSelection(null);
    setIoError(null);
  };

  const onSelect = useCallback((s: Selection) => setSelection(s), []);
  const onToggleInitial = useCallback((w: number) => dispatch((c) => toggleInitial(c, w)), [dispatch]);
  const onRemoveQubit = useCallback(
    (w: number) => {
      dispatch((c) => removeQubit(c, w));
      setSelection(null);
    },
    [dispatch],
  );
  const onEditAngles = useCallback((opId: string) => setAngleEdit({ opId, isNew: false }), []);
  const onSelectBloch = useCallback((s: BlochSel) => setBlochSel(s), []);
  const closeBloch = useCallback(() => setBlochSel(null), []);
  // the panel follows the circuit; it closes if its qubit or step no longer exists
  const panelBloch = blochSel && simFresh ? (sim.bloch[blochSel.s]?.[blochSel.qubit] ?? null) : null;
  const panelValid = blochSel !== null && blochSel.qubit < circuit.numQubits && blochSel.s <= circuit.steps.length;
  useEffect(() => {
    if (blochSel && !panelValid) setBlochSel(null);
  }, [blochSel, panelValid]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (angleEdit) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'Escape') setSelection(null);
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
        e.preventDefault();
        const s = selection;
        dispatch((c) => (s.kind === 'op' ? removeOp(c, s.id) : removeControl(c, s.step, s.wire)));
        setSelection(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, angleEdit, dispatch]);

  const editing = angleEdit ? locateOp(circuit, angleEdit.opId) : null;
  useEffect(() => {
    if (angleEdit && !editing) setAngleEdit(null); // the op vanished (e.g. its qubit was removed)
  }, [angleEdit, editing]);
  const overlay = (() => {
    if (!dragging) return null;
    switch (dragging.type) {
      case 'palette':
        return <GateBox gate={dragging.gate} />;
      case 'palette-control':
        return <ControlGlyph kind={dragging.kind} size={22} />;
      case 'control': {
        const k = circuit.steps[dragging.step]?.controls.find((x) => x.wire === dragging.wire);
        return k ? <ControlGlyph kind={k.kind} size={22} /> : null;
      }
      case 'op':
      case 'op-end': {
        const f = locateOp(circuit, dragging.opId);
        if (!f) return null;
        if (dragging.type === 'op-end' && f.op.gate === 'SWAP') return <span className="swap-end floating">×</span>;
        return <GateBox gate={f.op.gate} sub={opLabel(f.op).sub} />;
      }
    }
  })();

  return (
    <main className={`app${blochSel ? ' with-panel' : ''}`}>
      <div className="app-main">
        <header className="app-header">
          <h1>Quantum Gate Lab</h1>
          <ThemeToggle />
        </header>
        <DndContext
          sensors={sensors}
          collisionDetection={gridCollision}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDragging(null)}
        >
          <GateCardProvider circuit={circuit}>
          <Palette />
          <CircuitGrid
            circuit={circuit}
            qubitP1={simFresh ? sim.qubitP1 : null}
            selection={selection}
            onSelect={onSelect}
            onToggleInitial={onToggleInitial}
            onRemoveQubit={onRemoveQubit}
            onEditAngles={onEditAngles}
          >
            {sim ? (
              <BlochStrip
                bloch={sim.bloch}
                numQubits={sim.numQubits}
                stale={!simFresh}
                numSteps={circuit.steps.length}
                inW={IN_W}
                outW={OUT_W}
                selected={blochSel}
                onSelect={onSelectBloch}
              />
            ) : null}
          </CircuitGrid>
          </GateCardProvider>
          <DragOverlay dropAnimation={null}>{overlay}</DragOverlay>
        </DndContext>
        <div className="grid-toolbar">
          <button
            type="button"
            onClick={() => dispatch(addQubit)}
            disabled={circuit.numQubits >= MAX_QUBITS}
          >
            Add qubit
          </button>
          <span className="hint">
            Drag gates onto the grid · drag off the grid to delete · click to select, Delete to remove · double-click an
            angle gate to edit it
          </span>
          {computing ? (
            <span className="computing" role="status">
              Computing…
            </span>
          ) : null}
        </div>
        {simFresh && sim.warnings.length > 0 ? (
          <div className="sim-warnings" role="alert">
            <strong>
              {sim.warnings.length === 1 ? '1 gate was' : `${sim.warnings.length} gates were`} skipped (treated as
              identity):
            </strong>
            <ul>
              {sim.warnings.map((w) => (
                <li key={w.opId}>
                  Step {w.step + 1}, {opLabel({ gate: w.gate, params: [] }).label} on{' '}
                  {w.wires.map((q) => `q[${q}]`).join(', ')}: invalid angle <code>{w.param}</code>{' '}
                  <button type="button" onClick={() => onEditAngles(w.opId)}>
                    Fix…
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="io-toolbar">
          <button type="button" onClick={onSave}>Save</button>
          <button type="button" onClick={() => fileRef.current?.click()}>Load</button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            aria-label="Load circuit file"
            hidden
            onChange={onLoadFile}
          />
          <button type="button" onClick={onCopyLink}>{copied ? 'Copied!' : 'Copy link'}</button>
          <button type="button" ref={exportRef} onClick={() => setExporting(true)}>Export…</button>
          <button type="button" onClick={onClear}>Clear</button>
          {ioError ? <span className="error" role="alert">{ioError}</span> : null}
        </div>
        {sim ? (
          <KetView
            amplitudes={sim.amplitudes}
            purity={sim.purity}
            numQubits={sim.numQubits}
            backend={sim.backend}
            stale={!simFresh || computing}
          />
        ) : null}
        {sim ? (
          <ProbabilityChart probabilities={sim.probabilities} numQubits={sim.numQubits} stale={!simFresh || computing} />
        ) : null}
        <OperatorView circuit={circuit} />
        <MatrixProductView circuit={circuit} />
      </div>
      {blochSel && panelValid && panelBloch ? (
        <BlochPanel qubit={blochSel.qubit} step={blochSel.s} bloch={panelBloch} onClose={closeBloch} />
      ) : null}
      {exporting ? (
        <ExportDialog
          circuit={circuit}
          shareUrl={shareUrl(circuit)}
          onClose={() => {
            setExporting(false);
            exportRef.current?.focus();
          }}
        />
      ) : null}
      {editing && angleEdit ? (
        <AngleDialog
          key={angleEdit.opId}
          gate={editing.op.gate}
          params={editing.op.params}
          onOk={(params) => {
            dispatch((c) => setParams(c, angleEdit.opId, params));
            setAngleEdit(null);
          }}
          onCancel={() => {
            if (angleEdit.isNew) dispatch((c) => removeOp(c, angleEdit.opId));
            setAngleEdit(null);
          }}
        />
      ) : null}
    </main>
  );
}
