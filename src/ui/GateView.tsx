import { memo, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { ControlKind, Op } from '../model/circuit';
import { GATE_INFO, type GateId } from '../sim/gates';

/** Grid geometry (px). Shared with the grid, the Out column and later the Bloch strip. */
export const COL_W = 56;
export const ROW_H = 52;
export const GATE = 40;

export type DragData =
  | { type: 'palette'; gate: GateId }
  | { type: 'palette-control'; kind: ControlKind }
  | { type: 'op'; opId: string }
  | { type: 'op-end'; opId: string; end: 0 | 1 }
  | { type: 'control'; step: number; wire: number };

export const hasAngles = (g: GateId) => GATE_INFO[g].params.length > 0;
export const isUnitary = (g: GateId) => GATE_INFO[g].kind === 'unitary';

/** `pi/4` → `π/4`, whitespace removed. */
export function formatAngle(expr: string): string {
  return expr.replace(/\s+/g, '').replace(/pi/g, 'π');
}

/** Short visible label: gate label plus formatted angles (e.g. `RX π/4`). */
export function opLabel(op: Pick<Op, 'gate' | 'params'>): { label: string; sub: string } {
  const label = op.gate === 'BARRIER' ? 'Barrier' : GATE_INFO[op.gate].label;
  return { label, sub: op.params.map(formatAngle).join(',') };
}

const ctlName = (kind: ControlKind) => (kind === 'on1' ? 'Control' : 'Anti-control');
const centerY = (w: number) => w * ROW_H + ROW_H / 2;
const CX = COL_W / 2;

// ---------- presentational glyphs (palette, drag overlay) ----------

export function SwapGlyph({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="swap-glyph">
      <g stroke="#000" strokeWidth="2.5" strokeLinecap="round">
        <line x1="13" y1="2" x2="27" y2="12" />
        <line x1="27" y1="2" x2="13" y2="12" />
        <line x1="13" y1="28" x2="27" y2="38" />
        <line x1="27" y1="28" x2="13" y2="38" />
        <line x1="20" y1="13" x2="20" y2="27" strokeWidth="1.5" />
      </g>
      <path d="M16.5 17 L20 13 L23.5 17 M16.5 23 L20 27 L23.5 23" fill="none" stroke="#000" strokeWidth="1.5" />
    </svg>
  );
}

export function ControlGlyph({ kind, size = 18 }: { kind: ControlKind; size?: number }) {
  return <span className={`ctl-ball ${kind}`} style={{ width: size, height: size }} aria-hidden="true" />;
}

export function GateBox({ gate, sub }: { gate: GateId; sub?: string }) {
  if (gate === 'SWAP') return <SwapGlyph />;
  const { label } = opLabel({ gate, params: [] });
  return (
    <span className={`gate-box${gate === 'BARRIER' ? ' barrier-box' : ''}`}>
      <span className={label.length > 3 ? 'gate-label small' : 'gate-label'}>{gate === 'BARRIER' ? '┆' : label}</span>
      {sub ? <span className="gate-sub">{sub}</span> : null}
    </span>
  );
}

// ---------- grid items ----------

type GateViewProps = {
  op: Op;
  step: number;
  /** step has controls and ≥1 unitary op, and this op is unitary */
  controlled: boolean;
  selected: boolean;
  onSelect: (opId: string) => void;
  onEditAngles: (opId: string) => void;
};

function useOpDrag(id: string, data: DragData) {
  const d = useDraggable({ id, data });
  return { ref: d.setNodeRef, props: { ...d.attributes, ...d.listeners }, dragging: d.isDragging };
}

function EndHandle({
  op, end, name, style, className, children, onSelect,
}: {
  op: Op; end: 0 | 1; name: string; style: CSSProperties; className: string;
  children?: ReactNode; onSelect: (e: MouseEvent) => void;
}) {
  const d = useOpDrag(`end:${op.id}:${end}`, { type: 'op-end', opId: op.id, end });
  return (
    <div
      ref={d.ref}
      {...d.props}
      aria-label={name}
      title={`Drag to move this end of ${GATE_INFO[op.gate].label}`}
      className={`${className}${d.dragging ? ' dragging' : ''}`}
      style={style}
      onClick={onSelect}
    >
      {children}
    </div>
  );
}

export const GateView = memo(function GateView({ op, step, controlled, selected, onSelect, onEditAngles }: GateViewProps) {
  const { label, sub } = opLabel(op);
  const qs = op.wires.map((w) => `q[${w}]`).join(', ');
  const name = `${label}${sub ? ` ${sub}` : ''} on ${qs}, step ${step + 1}`;
  const d = useOpDrag(`op:${op.id}`, { type: 'op', opId: op.id });
  const select = (e: MouseEvent) => {
    e.stopPropagation();
    onSelect(op.id);
  };
  const edit = hasAngles(op.gate)
    ? (e: MouseEvent) => {
        e.stopPropagation();
        onEditAngles(op.id);
      }
    : undefined;
  const cls = (base: string) =>
    `${base}${controlled ? ' controlled' : ''}${d.dragging ? ' dragging' : ''}`;

  const lo = Math.min(...op.wires);
  const hi = Math.max(...op.wires);
  const sel = selected ? (
    <div
      className="selection"
      style={{ left: CX - GATE / 2 - 5, top: centerY(lo) - GATE / 2 - 5, width: GATE + 10, height: centerY(hi) - centerY(lo) + GATE + 10 }}
    />
  ) : null;

  if (op.wires.length === 1) {
    const w = op.wires[0];
    if (op.gate === 'BARRIER') {
      return (
        <>
          {sel}
          <div
            ref={d.ref}
            {...d.props}
            aria-label={name}
            title="Barrier (visual divider)"
            className={cls('barrier')}
            style={{ left: CX - 8, top: w * ROW_H, width: 16, height: ROW_H }}
            onClick={select}
          />
        </>
      );
    }
    return (
      <>
        {sel}
        <div
          ref={d.ref}
          {...d.props}
          aria-label={name}
          title={name}
          className={cls('gate')}
          style={{ left: CX - GATE / 2, top: centerY(w) - GATE / 2, width: GATE, height: GATE }}
          onClick={select}
          onDoubleClick={edit}
        >
          <span className={label.length > 3 || sub ? 'gate-label small' : 'gate-label'}>{label}</span>
          {sub ? <span className="gate-sub">{sub}</span> : null}
        </div>
      </>
    );
  }

  // two-qubit ops
  const top = centerY(lo);
  const span = centerY(hi) - top;
  if (op.gate === 'B') {
    return (
      <>
        {sel}
        <div
          ref={d.ref}
          {...d.props}
          aria-label={name}
          title={`${name} — the dot marks the H/control end`}
          className={cls('gate b-block')}
          style={{ left: CX - GATE / 2, top: top - GATE / 2, width: GATE, height: span + GATE }}
          onClick={select}
        >
          <span className="gate-label">B</span>
        </div>
        {op.wires.map((w, i) => (
          <EndHandle
            key={i}
            op={op}
            end={i as 0 | 1}
            name={`B ${i === 0 ? 'control' : 'target'} end on q[${w}], step ${step + 1}`}
            className={`b-grip${i === 0 ? ' role' : ''}`}
            style={{ left: CX - 7, top: centerY(w) - 7 }}
            onSelect={select}
          />
        ))}
      </>
    );
  }

  return (
    <>
      {sel}
      <div
        ref={d.ref}
        {...d.props}
        aria-label={name}
        title={name}
        className={cls('connector')}
        style={{ left: CX - 6, top, width: 12, height: span }}
        onClick={select}
      />
      {op.wires.map((w, i) =>
        op.gate === 'SWAP' ? (
          <EndHandle
            key={i}
            op={op}
            end={i as 0 | 1}
            name={`SWAP end on q[${w}], step ${step + 1}`}
            className={`swap-end${controlled ? ' controlled' : ''}`}
            style={{ left: CX - 12, top: centerY(w) - 12 }}
            onSelect={select}
          >
            ×
          </EndHandle>
        ) : (
          <EndHandle
            key={i}
            op={op}
            end={i as 0 | 1}
            name={`${label} end on q[${w}], step ${step + 1}`}
            className={`gate${controlled ? ' controlled' : ''}`}
            style={{ left: CX - GATE / 2, top: centerY(w) - GATE / 2, width: GATE, height: GATE }}
            onSelect={select}
          >
            <span className="gate-label small">{label}</span>
          </EndHandle>
        ),
      )}
    </>
  );
});

export const ControlView = memo(function ControlView({
  step, wire, kind, active, selected, onSelect,
}: {
  step: number; wire: number; kind: ControlKind;
  /** the step has ≥1 unitary op (else the control is an orphan and drawn faded) */
  active: boolean;
  selected: boolean;
  onSelect: (step: number, wire: number) => void;
}) {
  const d = useDraggable({ id: `control:${step}:${wire}`, data: { type: 'control', step, wire } satisfies DragData });
  const name = `${ctlName(kind)} on q[${wire}], step ${step + 1}`;
  return (
    <div
      ref={d.setNodeRef}
      {...d.attributes}
      {...d.listeners}
      aria-label={name}
      title={active ? name : `${name} (no gate in this step — ignored)`}
      className={`ctl-ball ${kind}${active ? ' active' : ' orphan'}${selected ? ' selected' : ''}${d.isDragging ? ' dragging' : ''}`}
      style={{ left: CX - 9, top: centerY(wire) - 9, width: 18, height: 18 }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(step, wire);
      }}
    />
  );
});
