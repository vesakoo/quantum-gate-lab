import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyCircuit, type Circuit } from '../../src/model/circuit';
import { simulate } from '../../src/sim/simulate';
import type { SimRequest, SimResponse } from '../../src/sim/worker';
import App from '../../src/ui/App';
import { useSimulation } from '../../src/ui/useSimulation';

class FakeWorker {
  static last: FakeWorker | null = null;
  posted: SimRequest[] = [];
  onmessage: ((e: MessageEvent<SimResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeWorker.last = this;
  }
  postMessage(m: SimRequest) {
    this.posted.push(m);
  }
  terminate() {}
  /** Answer the request with the given id. */
  reply(id: number) {
    const req = this.posted.find((p) => p.id === id)!;
    this.onmessage?.({ data: { id, result: simulate(req.circuit) } } as MessageEvent<SimResponse>);
  }
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const chartLabels = (root: Element) =>
  Array.from(root.querySelectorAll('.prob-chart text'), (t) => t.textContent ?? '');

const withQubits = (n: number): Circuit => emptyCircuit(n, 12);

describe('useSimulation (worker)', () => {
  it('keeps one request in flight and posts only the newest pending circuit', () => {
    vi.stubGlobal('Worker', FakeWorker);
    const { result, rerender } = renderHook(({ c }) => useSimulation(c), { initialProps: { c: withQubits(1) } });
    const w = FakeWorker.last!;
    expect(w.posted).toHaveLength(1);
    expect(result.current.computing).toBe(true);
    expect(result.current.result).toBeNull();

    rerender({ c: withQubits(2) });
    rerender({ c: withQubits(3) });
    const c4 = withQubits(4);
    rerender({ c: c4 });
    expect(w.posted).toHaveLength(1); // nothing new while one is in flight

    act(() => w.reply(w.posted[0].id));
    expect(w.posted).toHaveLength(2);
    expect(w.posted[1].circuit).toBe(c4); // 2 and 3 were skipped
    expect(result.current.result?.numQubits).toBe(1);
    expect(result.current.computing).toBe(true);

    act(() => w.reply(w.posted[1].id));
    expect(w.posted).toHaveLength(2);
    expect(result.current.result?.numQubits).toBe(4);
    expect(result.current.computing).toBe(false);

    rerender({ c: withQubits(5) });
    expect(w.posted).toHaveLength(3);
    expect(result.current.computing).toBe(true);
  });

  it('falls back to synchronous simulation without Worker', () => {
    vi.stubGlobal('Worker', undefined);
    const { result } = renderHook(() => useSimulation(withQubits(2)));
    expect(result.current.result?.numQubits).toBe(2);
    expect(result.current.computing).toBe(false);
  });
});

describe('App with a lagging worker result', () => {
  it('labels stale results by their own qubit count and dims them', () => {
    vi.stubGlobal('Worker', FakeWorker);
    history.replaceState(null, '', '/');
    const { container } = render(<App />);
    const w = FakeWorker.last!;
    act(() => w.reply(w.posted[0].id));
    expect(screen.getByLabelText(/^q\[0\] output/)).toHaveTextContent('0');
    expect(chartLabels(container)).toContain('0000');

    fireEvent.click(screen.getByRole('button', { name: 'Remove q[3]' }));
    expect(w.posted).toHaveLength(2);
    // old 4-qubit result: chart keeps 4-bit labels, strip keeps 4 rows, both dimmed; Out is blank
    const chart = container.querySelector('.prob-chart')!;
    expect(chart.classList.contains('stale')).toBe(true);
    expect(chartLabels(container)).toContain('0000');
    expect(container.querySelector('.bloch-strip')?.classList.contains('stale')).toBe(true);
    expect(screen.getByLabelText(/^q\[0\] output/)).toHaveTextContent('');
    expect(screen.getByText('Computing…')).toBeInTheDocument();

    act(() => w.reply(w.posted[1].id));
    expect(container.querySelector('.prob-chart')?.classList.contains('stale')).toBe(false);
    expect(chartLabels(container)).toContain('000');
    expect(chartLabels(container)).not.toContain('0000');
    expect(screen.getByLabelText(/^q\[0\] output/)).toHaveTextContent('0');
    expect(screen.queryByText('Computing…')).not.toBeInTheDocument();
  });
});
