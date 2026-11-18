import { useState, type ReactNode } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { ControlKind } from '../model/circuit';
import { GATE_INFO, type GateId } from '../sim/gates';
import { ControlGlyph, GateBox, type DragData } from './GateView';
import { useGateCardTrigger } from './gateCardContext';
import type { CardTarget } from './gateCardHere';

const QUICK: GateId[] = ['H', 'X', 'Y', 'Z', 'S', 'T', 'SX', 'B'];
const MORE: GateId[] = ['Sdg', 'Tdg', 'SXdg', 'I', 'RX', 'RY', 'RZ', 'P', 'U', 'ISWAP', 'SQSWAP', 'MEASURE', 'RESET', 'BARRIER'];


function PaletteItem({ id, data, name, target, children }: {
  id: string; data: DragData; name: string; target: CardTarget; children: ReactNode;
}) {
  const d = useDraggable({ id, data });
  const card = useGateCardTrigger(target, { pinnable: true, describedBy: d.attributes['aria-describedby'] });
  return (
    <div
      ref={d.setNodeRef}
      {...d.attributes}
      {...d.listeners}
      {...card}
      aria-label={name}
      className={`palette-item${d.isDragging ? ' dragging' : ''}`}
    >
      {children}
    </div>
  );
}

function GateItem({ gate }: { gate: GateId }) {
  const name = gate === 'BARRIER' ? 'Barrier' : GATE_INFO[gate].label;
  return (
    <PaletteItem id={`palette:${gate}`} data={{ type: 'palette', gate }} name={name} target={{ kind: 'palette', gate }}>
      <GateBox gate={gate} />
    </PaletteItem>
  );
}

function ControlItem({ kind }: { kind: ControlKind }) {
  const name = kind === 'on1' ? 'Control' : 'Anti-control';
  return (
    <PaletteItem id={`palette-control:${kind}`} data={{ type: 'palette-control', kind }} name={name} target={{ kind: 'palette-control', ctl: kind }}>
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
