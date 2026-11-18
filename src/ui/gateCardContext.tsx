import {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore,
  type FocusEvent, type MouseEvent, type PointerEvent, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useDndMonitor } from '@dnd-kit/core';
import type { Circuit } from '../model/circuit';
import GateCard from './GateCard';
import { cardHere, docKey, type CardTarget } from './gateCardHere';

export const OPEN_DELAY = 400;
export const CLOSE_GRACE = 150;
/** Focus this soon after a pointer press came from the mouse, not the keyboard. */
const POINTER_FOCUS_MS = 300;
const GAP = 10;
const MARGIN = 8;
const CARD_ID = 'gate-card';

/** Card position next to the trigger: right side if it fits, else left; clamped into the viewport. */
export function placeCard(
  trigger: DOMRect,
  card: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number; side: 'right' | 'left' } {
  let side: 'right' | 'left' = 'right';
  let left = trigger.right + GAP;
  if (left + card.width > viewport.width - MARGIN) {
    side = 'left';
    left = Math.max(MARGIN, trigger.left - GAP - card.width);
  }
  const top = Math.max(MARGIN, Math.min(trigger.top, viewport.height - MARGIN - card.height));
  return { left, top, side };
}

const keyOf = (t: CardTarget): string => {
  switch (t.kind) {
    case 'palette': return `palette:${t.gate}`;
    case 'palette-control': return `palette-control:${t.ctl}`;
    case 'op': return `op:${t.opId}`;
    case 'control': return `control:${t.step}:${t.wire}`;
  }
};

type Open = { target: CardTarget; key: string; anchor: HTMLElement; pinned: boolean };

type Ctx = {
  /** Open-card key as a tiny store, so only the triggers whose own "am I open" flips re-render. */
  subscribe: (cb: () => void) => () => void;
  getKey: () => string | null;
  enter: (t: CardTarget, el: HTMLElement, buttons: number) => void;
  leave: () => void;
  focus: (t: CardTarget, el: HTMLElement) => void;
  blur: (key: string) => void;
  togglePin: (t: CardTarget, el: HTMLElement) => void;
};

const GateCardCtx = createContext<Ctx | null>(null);

export function GateCardProvider({ circuit, children }: { circuit: Circuit; children: ReactNode }) {
  const [open, setOpenState] = useState<Open | null>(null);
  const openRef = useRef<Open | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout>>();
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const dragging = useRef(false);
  const lastPointerDown = useRef(-Infinity);
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; side: 'right' | 'left' } | null>(null);

  const listeners = useRef(new Set<() => void>());
  const setOpen = useCallback((o: Open | null) => {
    const changed = openRef.current?.key !== o?.key;
    openRef.current = o;
    setOpenState(o);
    if (changed) listeners.current.forEach((l) => l());
  }, []);
  const clearTimers = () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
  };
  const close = useCallback(() => {
    clearTimers();
    setOpen(null);
  }, [setOpen]);

  useDndMonitor({
    onDragStart: () => {
      dragging.current = true;
      close();
    },
    onDragEnd: () => void (dragging.current = false),
    onDragCancel: () => void (dragging.current = false),
  });

  const ctx = useMemo<Ctx>(() => {
    const show = (t: CardTarget, el: HTMLElement, pinned = false) => {
      clearTimers();
      setOpen({ target: t, key: keyOf(t), anchor: el, pinned });
    };
    return {
      subscribe(cb) {
        listeners.current.add(cb);
        return () => void listeners.current.delete(cb);
      },
      getKey: () => openRef.current?.key ?? null,
      enter(t, el, buttons) {
        // a pressed button means a click or drag is starting: never open from that
        if (dragging.current || buttons !== 0) return;
        const cur = openRef.current;
        if (cur?.pinned) return;
        clearTimers();
        if (cur) show(t, el);
        else openTimer.current = setTimeout(() => show(t, el), OPEN_DELAY);
      },
      leave() {
        clearTimeout(openTimer.current);
        const cur = openRef.current;
        if (!cur || cur.pinned) return;
        clearTimeout(closeTimer.current);
        closeTimer.current = setTimeout(() => setOpen(null), CLOSE_GRACE);
      },
      focus(t, el) {
        if (dragging.current || openRef.current?.pinned) return;
        if (performance.now() - lastPointerDown.current < POINTER_FOCUS_MS) return;
        show(t, el);
      },
      blur(key) {
        const cur = openRef.current;
        if (cur && !cur.pinned && cur.key === key) close();
      },
      togglePin(t, el) {
        const cur = openRef.current;
        if (cur?.pinned && cur.key === keyOf(t)) close();
        else show(t, el, true);
      },
    };
  }, [setOpen, close]);

  // pointer presses: remember them (to tell mouse focus from keyboard focus) and close on outside presses
  useEffect(() => {
    const onDown = (e: Event) => {
      lastPointerDown.current = performance.now();
      clearTimeout(openTimer.current);
      const cur = openRef.current;
      const t = e.target as Node | null;
      if (cur && t && !cur.anchor.contains(t) && !cardRef.current?.contains(t)) close();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [close]);

  // while open: Escape closes only the card (capture phase, so App's handler never sees it); scrolling closes it
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close();
    };
    const onScroll = (e: Event) => {
      if (cardRef.current?.contains(e.target as Node)) return;
      if (!openRef.current?.pinned) close();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, close]);

  useEffect(() => () => clearTimers(), []);

  const dk = open ? docKey(circuit, open.target) : null;
  useEffect(() => {
    if (open && dk === null) close();
  }, [open, dk, close]);

  useLayoutEffect(() => {
    if (!open || !cardRef.current) {
      setPos(null);
      return;
    }
    const r = cardRef.current.getBoundingClientRect();
    setPos(placeCard(open.anchor.getBoundingClientRect(), r, { width: window.innerWidth, height: window.innerHeight }));
  }, [open, circuit]);

  const card =
    open && dk ? (
        <GateCard
          ref={cardRef}
          id={CARD_ID}
          docKey={dk}
          here={cardHere(circuit, open.target)}
          pinned={open.pinned}
          side={pos?.side}
          style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
          onPointerEnter={() => clearTimeout(closeTimer.current)}
          onPointerLeave={ctx.leave}
        />
    ) : null;

  return (
    <GateCardCtx.Provider value={ctx}>
      {children}
      {card ? createPortal(card, document.body) : null}
    </GateCardCtx.Provider>
  );
}

const noSubscribe = () => () => {};

type TriggerProps = {
  onPointerEnter?: (e: PointerEvent<HTMLElement>) => void;
  onPointerLeave?: (e: PointerEvent<HTMLElement>) => void;
  onFocus?: (e: FocusEvent<HTMLElement>) => void;
  onBlur?: (e: FocusEvent<HTMLElement>) => void;
  onClick?: (e: MouseEvent<HTMLElement>) => void;
  'aria-describedby'?: string;
  'data-card-trigger'?: string;
};

/**
 * Props for an element that shows the gate card: hover (after OPEN_DELAY) or keyboard focus opens it;
 * `pinnable` adds click-to-pin. `describedBy` is the element's existing aria-describedby (dnd-kit's),
 * which is kept. Spread these after dnd-kit's attributes. Outside a provider only `describedBy` passes through.
 */
export function useGateCardTrigger(
  target: CardTarget,
  opts: { pinnable?: boolean; describedBy?: string } = {},
): TriggerProps {
  const ctx = useContext(GateCardCtx);
  const key = keyOf(target);
  const isOpen = useSyncExternalStore(ctx?.subscribe ?? noSubscribe, () => (ctx ? ctx.getKey() === key : false));
  if (!ctx) return opts.describedBy ? { 'aria-describedby': opts.describedBy } : {};
  const ids = [isOpen ? CARD_ID : null, opts.describedBy].filter(Boolean).join(' ');
  return {
    onPointerEnter: (e) => ctx.enter(target, e.currentTarget, e.buttons ?? 0),
    onPointerLeave: () => ctx.leave(),
    onFocus: (e) => ctx.focus(target, e.currentTarget),
    onBlur: () => ctx.blur(key),
    ...(opts.pinnable ? { onClick: (e: MouseEvent<HTMLElement>) => ctx.togglePin(target, e.currentTarget) } : {}),
    ...(ids ? { 'aria-describedby': ids } : {}),
    'data-card-trigger': key,
  };
}
