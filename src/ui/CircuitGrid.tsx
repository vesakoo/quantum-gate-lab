import { memo, useCallback, type ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { Circuit, Step } from '../model/circuit';
import { COL_W, ControlView, GateView, ROW_H, isUnitary } from './GateView';
import { GRID_ID } from './drop';
import OutColumn from './OutColumn';

export type Selection = { kind: 'op'; id: string } | { kind: 'control'; step: number; wire: number } | null;

export const IN_W = 132;
export const OUT_W = 96;
export const HEAD_H = 40;

type Props = {
  circuit: Circuit;
  qubitP1: number[] | null;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onToggleInitial: (wire: number) => void;
  onRemoveQubit: (wire: number) => void;
  onEditAngles: (opId: string) => void;
  /** Rendered under the grid inside the same horizontal scroller (the Bloch strip). */
  children?: ReactNode;
};

const Cell = memo(function Cell({ step, wire }: { step: number; wire: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell:${step}:${wire}` });
  return <div ref={setNodeRef} className={`cell${isOver ? ' over' : ''}`} style={{ top: wire * ROW_H, height: ROW_H }} />;
});

type ColumnProps = {
  step: Step;
  si: number;
  numQubits: number;
  selectedOp: string | null;
  selectedCtl: number | null;
  onSelectOp: (id: string) => void;
  onSelectCtl: (step: number, wire: number) => void;
  onEditAngles: (opId: string) => void;
};

const StepColumn = memo(function StepColumn({
  step, si, numQubits, selectedOp, selectedCtl, onSelectOp, onSelectCtl, onEditAngles,
}: ColumnProps) {
  const active = step.ops.some((o) => isUnitary(o.gate));
  const controlled = active && step.controls.length > 0;
  let line: { top: number; height: number } | null = null;
  if (controlled) {
    const wires = [...step.controls.map((k) => k.wire), ...step.ops.filter((o) => isUnitary(o.gate)).flatMap((o) => o.wires)];
    const lo = Math.min(...wires);
    const hi = Math.max(...wires);
    line = { top: lo * ROW_H + ROW_H / 2, height: (hi - lo) * ROW_H };
  }
  return (
    <div className="step-column" style={{ gridColumn: si + 2, gridRow: `2 / span ${numQubits}`, height: numQubits * ROW_H }}>
      {Array.from({ length: numQubits }, (_, w) => <Cell key={w} step={si} wire={w} />)}
      {line ? <div className="control-line" style={{ left: COL_W / 2 - 1, top: line.top, height: line.height }} /> : null}
      {step.ops.map((op) => (
        <GateView
          key={op.id}
          op={op}
          step={si}
          controlled={controlled && isUnitary(op.gate)}
          selected={selectedOp === op.id}
          onSelect={onSelectOp}
          onEditAngles={onEditAngles}
        />
      ))}
      {step.controls.map((k) => (
        <ControlView
          key={k.wire}
          step={si}
          wire={k.wire}
          kind={k.kind}
          active={active}
          selected={selectedCtl === k.wire}
          onSelect={onSelectCtl}
        />
      ))}
    </div>
  );
});

export default function CircuitGrid({
  circuit, qubitP1, selection, onSelect, onToggleInitial, onRemoveQubit, onEditAngles, children,
}: Props) {
  const n = circuit.numQubits;
  const steps = circuit.steps;
  // stable callbacks so memoized step columns only re-render when their step changes
  const onSelectOp = useCallback((id: string) => onSelect({ kind: 'op', id }), [onSelect]);
  const onSelectCtl = useCallback((step: number, wire: number) => onSelect({ kind: 'control', step, wire }), [onSelect]);
  // the whole circuit area is a no-op drop target, so a drop on a step header, the In/Out
  // columns or the Bloch strip does not count as "off the grid" (which deletes)
  const { setNodeRef } = useDroppable({ id: GRID_ID });
  return (
    <div ref={setNodeRef} className="circuit-scroll" onClick={() => onSelect(null)}>
      <div
        className="circuit"
        style={{
          gridTemplateColumns: `${IN_W}px repeat(${steps.length}, ${COL_W}px) ${OUT_W}px`,
          gridTemplateRows: `${HEAD_H}px repeat(${n}, ${ROW_H}px)`,
        }}
      >
        <div className="corner corner-in" style={{ gridColumn: 1, gridRow: 1 }}>
          <span className="corner-tr">Step</span>
          <span className="corner-bl">In</span>
        </div>
        {steps.map((_, si) => (
          <div key={si} role="columnheader" className="step-head" style={{ gridColumn: si + 2, gridRow: 1 }}>
            {si + 1}
          </div>
        ))}
        <div className="corner corner-out" style={{ gridColumn: steps.length + 2, gridRow: 1 }}>
          <span className="corner-tl">Step</span>
          <span className="corner-br">Out</span>
        </div>

        <div className="in-column" style={{ gridColumn: 1, gridRow: `2 / span ${n}` }}>
          {Array.from({ length: n }, (_, w) => (
            <div className="in-row" key={w} style={{ height: ROW_H }}>
              <button
                type="button"
                className="remove-qubit"
                aria-label={`Remove q[${w}]`}
                title={`Remove q[${w}] and every gate or control on it`}
                disabled={n <= 1}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveQubit(w);
                }}
              >
                ×
              </button>
              <span className="qubit-label">{`q[${w}]`}</span>
              <button
                type="button"
                className="init-box"
                aria-label={`Initial state of q[${w}]`}
                title="Click to toggle |0⟩ / |1⟩"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleInitial(w);
                }}
              >
                {circuit.initial[w] === 1 ? '|1⟩' : '|0⟩'}
              </button>
              <span className="in-wire" />
            </div>
          ))}
        </div>

        {steps.map((s, si) => (
          <StepColumn
            key={si}
            step={s}
            si={si}
            numQubits={n}
            selectedOp={selection?.kind === 'op' && s.ops.some((o) => o.id === selection.id) ? selection.id : null}
            selectedCtl={selection?.kind === 'control' && selection.step === si ? selection.wire : null}
            onSelectOp={onSelectOp}
            onSelectCtl={onSelectCtl}
            onEditAngles={onEditAngles}
          />
        ))}

        <div style={{ gridColumn: steps.length + 2, gridRow: `2 / span ${n}` }}>
          <OutColumn numQubits={n} qubitP1={qubitP1} />
        </div>
      </div>
      {children}
    </div>
  );
}

