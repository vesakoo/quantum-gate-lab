import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyCircuit, type Circuit } from '../../src/model/circuit';
import type { CardTarget } from '../../src/ui/gateCardHere';
import { GateCardProvider, placeCard, useGateCardTrigger } from '../../src/ui/gateCardContext';

function Trigger({ label, target, pinnable, describedBy }: { label: string; target: CardTarget; pinnable?: boolean; describedBy?: string }) {
  const p = useGateCardTrigger(target, { pinnable, describedBy });
  return (
    <button type="button" {...p}>
      {label}
    </button>
  );
}

function Harness({ circuit }: { circuit: Circuit }) {
  return (
    <DndContext>
      <GateCardProvider circuit={circuit}>
        <Trigger label="H" target={{ kind: 'palette', gate: 'H' }} pinnable describedBy="dnd-help" />
        <Trigger label="X" target={{ kind: 'palette', gate: 'X' }} pinnable />
        <Trigger label="op" target={{ kind: 'op', opId: 'g1' }} />
        <p>outside</p>
      </GateCardProvider>
    </DndContext>
  );
}

const withOp = () => {
  const c = emptyCircuit(1, 1);
  c.steps[0].ops = [{ id: 'g1', gate: 'Z', wires: [0], params: [] }];
  return c;
};
const btn = (name: string) => screen.getByRole('button', { name });
const tip = () => screen.queryByRole('tooltip');
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('placeCard', () => {
  const rect = (l: number, t: number, r: number, b: number) =>
    ({ left: l, top: t, right: r, bottom: b, width: r - l, height: b - t, x: l, y: t, toJSON() {} }) as DOMRect;
  const vp = { width: 1000, height: 800 };
  it('right side when there is room', () => {
    expect(placeCard(rect(100, 100, 140, 140), { width: 300, height: 200 }, vp)).toEqual({ left: 150, top: 100, side: 'right' });
  });
  it('flips left near the right edge', () => {
    const p = placeCard(rect(860, 100, 900, 140), { width: 300, height: 200 }, vp);
    expect(p.side).toBe('left');
    expect(p.left).toBe(860 - 10 - 300);
  });
  it('clamps to the viewport', () => {
    expect(placeCard(rect(100, 750, 140, 790), { width: 300, height: 200 }, vp).top).toBe(800 - 8 - 200);
  });
});

describe('GateCardProvider', () => {
  it('opens after 400 ms hover', () => {
    render(<Harness circuit={withOp()} />);
    fireEvent.pointerEnter(btn('H'));
    advance(399);
    expect(tip()).toBeNull();
    advance(1);
    expect(tip()!.textContent).toContain('Hadamard');
  });

  it('leave closes after grace; entering the card keeps it', () => {
    render(<Harness circuit={withOp()} />);
    fireEvent.pointerEnter(btn('H'));
    advance(400);
    fireEvent.pointerLeave(btn('H'));
    advance(149);
    expect(tip()).not.toBeNull();
    fireEvent.pointerEnter(tip()!);
    advance(500);
    expect(tip()).not.toBeNull();
    fireEvent.pointerLeave(tip()!);
    advance(150);
    expect(tip()).toBeNull();
  });

  it('switches immediately', () => {
    render(<Harness circuit={withOp()} />);
    fireEvent.pointerEnter(btn('H'));
    advance(400);
    fireEvent.pointerLeave(btn('H'));
    fireEvent.pointerEnter(btn('X'));
    expect(tip()!.textContent).toContain('Pauli-X');
  });

  it('keyboard focus opens', () => {
    render(<Harness circuit={withOp()} />);
    fireEvent.focus(btn('H'));
    expect(tip()!.textContent).toContain('Hadamard');
    fireEvent.blur(btn('H'));
    expect(tip()).toBeNull();
  });

  it('pointer focus does not open', () => {
    render(<Harness circuit={withOp()} />);
    fireEvent.pointerDown(btn('op'));
    fireEvent.focus(btn('op'));
    expect(tip()).toBeNull();
  });

  it('click pins in palette', () => {
    render(<Harness circuit={withOp()} />);
    fireEvent.click(btn('H'));
    expect(tip()!.textContent).toContain('Pinned');
    fireEvent.pointerLeave(btn('H'));
    advance(1000);
    expect(tip()).not.toBeNull();
    fireEvent.pointerEnter(btn('X'));
    advance(1000);
    expect(tip()!.textContent).toContain('Hadamard');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(tip()).toBeNull();
    fireEvent.click(btn('op'));
    expect(tip()).toBeNull();
  });

  it('click on the pinned trigger or outside closes it', () => {
    render(<Harness circuit={withOp()} />);
    fireEvent.click(btn('H'));
    fireEvent.click(btn('H'));
    expect(tip()).toBeNull();
    fireEvent.click(btn('H'));
    fireEvent.pointerDown(screen.getByText('outside'));
    expect(tip()).toBeNull();
  });

  it('escape is consumed', () => {
    const seen = vi.fn();
    window.addEventListener('keydown', seen);
    render(<Harness circuit={withOp()} />);
    fireEvent.focus(btn('H'));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(tip()).toBeNull();
    expect(seen).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(seen).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', seen);
  });

  it('aria-describedby', () => {
    render(<Harness circuit={withOp()} />);
    expect(btn('H').getAttribute('aria-describedby')).toBe('dnd-help');
    fireEvent.focus(btn('H'));
    const ids = btn('H').getAttribute('aria-describedby')!.split(' ');
    expect(ids).toContain(tip()!.id);
    expect(ids).toContain('dnd-help');
  });

  it('placed target shows Here', () => {
    render(<Harness circuit={withOp()} />);
    fireEvent.pointerEnter(btn('op'));
    advance(400);
    expect(tip()!.textContent).toContain('Here: on q[0], step 1');
  });

  it('stale target closes', () => {
    const { rerender } = render(<Harness circuit={withOp()} />);
    fireEvent.pointerEnter(btn('op'));
    advance(400);
    expect(tip()).not.toBeNull();
    rerender(<Harness circuit={emptyCircuit(1, 1)} />);
    expect(tip()).toBeNull();
  });
});
