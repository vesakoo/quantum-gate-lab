import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyCircuit, type Op } from '../../src/model/circuit';
import { toHash } from '../../src/model/serialize';
import App from '../../src/ui/App';

// jsdom has no PointerEvent: without it clientX/isPrimary are dropped and dnd-kit's sensor never starts a drag
const hadPointerEvent = 'PointerEvent' in window;
beforeAll(() => {
  if (hadPointerEvent) return;
  class PE extends MouseEvent {
    isPrimary: boolean;
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.isPrimary = init.isPrimary ?? true;
      this.pointerId = init.pointerId ?? 1;
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PE;
});
afterAll(() => {
  if (!hadPointerEvent) delete (window as unknown as { PointerEvent?: unknown }).PointerEvent;
});

const tip = () => screen.queryByRole('tooltip');
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

function load(build: (c: ReturnType<typeof emptyCircuit>) => void, n = 2) {
  const c = emptyCircuit(n, 4);
  build(c);
  history.replaceState(null, '', `/#${toHash(c)}`);
  return render(<App />);
}
const cnot = (c: ReturnType<typeof emptyCircuit>) => {
  const x: Op = { id: 'x1', gate: 'X', wires: [1], params: [] };
  c.steps[1] = { ops: [x], controls: [{ wire: 0, kind: 'on1' }] };
};
const palette = () => within(document.querySelector('.palette') as HTMLElement);

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  history.replaceState(null, '', '/');
});

describe('gate card in the app', () => {
  it('palette hover shows the card', () => {
    load(() => {});
    const h = palette().getByLabelText('H');
    expect(h.getAttribute('title')).toBeNull();
    fireEvent.pointerEnter(h);
    advance(400);
    expect(tip()!.textContent).toContain('Hadamard');
  });

  it('grid gate shows Here', () => {
    load(cnot);
    const x = screen.getByLabelText(/^X on q\[1\], step 2/);
    expect(x.getAttribute('title')).toBeNull();
    fireEvent.pointerEnter(x);
    advance(400);
    expect(tip()!.textContent).toContain('CX =');
    expect(tip()!.textContent).toContain('Here: on q[1], step 2');
  });

  it('control dot shows Here', () => {
    load(cnot);
    fireEvent.pointerEnter(screen.getByLabelText('Control on q[0], step 2'));
    advance(400);
    expect(tip()!.textContent).toContain('applied only when q[0] = 1');
  });

  it('escape closes card first, then deselects', () => {
    const { container } = load(cnot);
    const x = screen.getByLabelText(/^X on q\[1\], step 2/);
    fireEvent.click(x);
    expect(container.querySelector('.selection')).not.toBeNull();
    fireEvent.pointerEnter(x);
    advance(400);
    expect(tip()).not.toBeNull();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(tip()).toBeNull();
    expect(container.querySelector('.selection')).not.toBeNull();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(container.querySelector('.selection')).toBeNull();
  });

  it('no card while dragging', () => {
    load(cnot);
    const h = palette().getByLabelText('H');
    fireEvent.pointerEnter(h);
    advance(400);
    expect(tip()).not.toBeNull();
    fireEvent.pointerDown(h, { clientX: 10, clientY: 10, button: 0, isPrimary: true });
    fireEvent.pointerMove(document, { clientX: 40, clientY: 40 });
    expect(tip()).toBeNull();
    fireEvent.pointerEnter(screen.getByLabelText(/^X on q\[1\], step 2/));
    advance(1000);
    expect(tip()).toBeNull();
    fireEvent.pointerUp(document, { clientX: 40, clientY: 40 });
    // dnd-kit swallows the next click on window until a timer after the drag ends; let it run
    advance(50);
  });

  it('card follows circuit edits', () => {
    load((c) => {
      c.steps[0].ops = [{ id: 'r1', gate: 'RX', wires: [0], params: ['pi/2'] }];
    }, 1);
    const g = () => screen.getByLabelText(/^RX .*on q\[0\], step 1/);
    fireEvent.pointerEnter(g());
    advance(400);
    expect(tip()!.textContent).toContain('−i/√2');
    fireEvent.pointerLeave(g());
    advance(200);
    fireEvent.doubleClick(g());
    const input = screen.getByRole('dialog').querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'pi' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'OK' }));
    fireEvent.pointerEnter(g());
    advance(400);
    expect(tip()!.textContent).toContain('θ = π');
    expect(tip()!.textContent).not.toContain('√2');
  });
});
