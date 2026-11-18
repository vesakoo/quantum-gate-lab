import { forwardRef, type CSSProperties } from 'react';
import { GATE_DOCS, type DocKey } from './gateDocs';
import type { HereInfo } from './gateCardHere';
import { ControlGlyph, GateBox } from './GateView';
import { KetText } from './KetView';
import MatrixView from './MatrixView';

type Props = {
  id: string;
  docKey: DocKey;
  here: HereInfo | null;
  pinned?: boolean;
  side?: 'right' | 'left';
  style?: CSSProperties;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
};

/** Presentational gate card: static doc plus, for placed items, the "Here" section. */
const GateCard = forwardRef<HTMLDivElement, Props>(function GateCard(
  { id, docKey, here, pinned, side = 'right', style, onPointerEnter, onPointerLeave },
  ref,
) {
  const doc = GATE_DOCS[docKey];
  const glyph =
    docKey === 'ctl:on1' || docKey === 'ctl:on0' ? (
      <ControlGlyph kind={docKey === 'ctl:on1' ? 'on1' : 'on0'} size={22} />
    ) : (
      <GateBox gate={docKey} />
    );
  return (
    <div
      ref={ref}
      role="tooltip"
      id={id}
      className="gate-card"
      data-side={side}
      style={style}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <div className="gate-card-head">
        <span className="gate-card-glyph" aria-hidden="true">
          {glyph}
        </span>
        <strong>{doc.name}</strong>
      </div>
      <p className="gate-card-desc">
        <KetText text={doc.description} />
      </p>
      {doc.basis ? (
        <div className="gate-card-basis">
          {doc.basis.map((b) => (
            <div key={b}>
              <KetText text={b} />
            </div>
          ))}
        </div>
      ) : null}
      {doc.matrix ? <MatrixView m={doc.matrix} /> : null}
      {here ? (
        <div className="gate-card-here">
          <div>Here: {here.position}</div>
          {here.basisOrder ? <div className="gate-card-small">{here.basisOrder}</div> : null}
          {here.angles?.map((a) => (
            <div key={a.name} className={a.valid ? undefined : 'invalid'}>
              {a.name} = {a.text}
            </div>
          ))}
          {here.evaluated ? <MatrixView m={here.evaluated} /> : null}
          {here.invalidNote ? <div className="gate-card-note">{here.invalidNote}</div> : null}
          {here.orphanNote ? <div className="gate-card-note">{here.orphanNote}</div> : null}
          {here.control ? (
            <>
              <div>{here.control.condition}</div>
              <MatrixView m={here.control.block} label={here.control.blockLabel} />
              <div className="gate-card-proj">= {here.control.projector}</div>
              <div className="gate-card-small">{here.control.basisOrder}</div>
            </>
          ) : null}
        </div>
      ) : null}
      {pinned ? <div className="gate-card-small">Pinned · Esc to close</div> : null}
    </div>
  );
});

export default GateCard;
