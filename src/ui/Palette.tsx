import { useState, type ReactNode } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { ControlKind } from '../model/circuit';
import { GATE_INFO, type GateId } from '../sim/gates';
import { ControlGlyph, GateBox, type DragData } from './GateView';

const QUICK: GateId[] = ['H', 'X', 'Y', 'Z', 'S', 'T', 'SX', 'B'];
const MORE: GateId[] = ['Sdg', 'Tdg', 'SXdg', 'I', 'RX', 'RY', 'RZ', 'P', 'U', 'ISWAP', 'SQSWAP', 'MEASURE', 'RESET', 'BARRIER'];

const HINTS: Partial<Record<GateId, string>> = {
  B: 'Bell gate: H on the top (dot) end, then CNOT onto the other end',
  SWAP: 'Swap two qubits',
  MEASURE: 'Measure (dephase: the qubit could be 0 or 1)',
  RESET: 'Reset to |0⟩',
  BARRIER: 'Barrier (visual divider only)',
};

function PaletteItem({ id, data, name, title, children }: {
  id: string; data: DragData; name: string; title: string; children: ReactNode;
}) {
  const d = useDraggable({ id, data });
  return (
    <div
      ref={d.setNodeRef}
      {...d.attributes}
      {...d.listeners}
      aria-label={name}
      title={title}
      className={`palette-item${d.isDragging ? ' dragging' : ''}`}
    >
      {children}
    </div>
  );
}

function GateItem({ gate }: { gate: GateId }) {
  const name = gate === 'BARRIER' ? 'Barrier' : GATE_INFO[gate].label;
  const params = GATE_INFO[gate].params;
  const title = HINTS[gate] ?? (params.length ? `${name}(${params.join(', ')}) — angle asked on drop` : name);
  return (
    <PaletteItem id={`palette:${gate}`} data={{ type: 'palette', gate }} name={name} title={title}>
      <GateBox gate={gate} />
    </PaletteItem>
  );
}

function ControlItem({ kind }: { kind: ControlKind }) {
  const name = kind === 'on1' ? 'Control' : 'Anti-control';
  const title = kind === 'on1' ? 'Control: apply the step only when this qubit is |1⟩' : 'Anti-control: apply the step only when this qubit is |0⟩';
  return (
    <PaletteItem id={`palette-control:${kind}`} data={{ type: 'palette-control', kind }} name={name} title={title}>
      <ControlGlyph kind={kind} size={24} />
    </PaletteItem>
  );
}

/** "Drag gate to circuit" — also the `trash` drop target. */
export default function Palette() {
  const [more, setMore] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: 'trash' });
  return (
    <section ref={setNodeRef} className={`palette${isOver ? ' trash-over' : ''}`} aria-labelledby="palette-title">
      <h2 id="palette-title" className="palette-title">Drag gate to circuit</h2>
      <div className="palette-row">
        {QUICK.map((g) => <GateItem key={g} gate={g} />)}
        <GateItem gate="SWAP" />
        <ControlItem kind="on1" />
        <ControlItem kind="on0" />
        <button type="button" className="more-toggle" aria-expanded={more} onClick={() => setMore((m) => !m)}>
          More gates <span aria-hidden="true">{more ? '▴' : '▾'}</span>
        </button>
      </div>
      {more ? (
        <div className="palette-row more">
          {MORE.map((g) => <GateItem key={g} gate={g} />)}
        </div>
      ) : null}
      {isOver ? <div className="trash-hint">Drop here to delete</div> : null}
    </section>
  );
}
