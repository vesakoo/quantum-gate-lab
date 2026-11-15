import { useEffect, useMemo, useRef, useState } from 'react';
import type { Circuit } from '../model/circuit';
import { simulate, type SimResult } from '../sim/simulate';
import type { SimRequest, SimResponse } from '../sim/worker';

export type Simulation = {
  result: SimResult | null;
  /** A request is running in the worker, or a newer circuit is waiting for it. */
  computing: boolean;
};

/**
 * Simulates `c` in a Web Worker. At most one request is in flight; while it runs, only the newest
 * circuit is kept and posted when the reply arrives (intermediate edits are skipped).
 * Without Worker support (e.g. jsdom) — or if the worker fails — simulates synchronously.
 */
export function useSimulation(c: Circuit): Simulation {
  const [failed, setFailed] = useState(() => typeof Worker === 'undefined');
  const [result, setResult] = useState<SimResult | null>(null);
  const [computing, setComputing] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const inFlight = useRef<number | null>(null);
  const pending = useRef<Circuit | null>(null);
  const lastPosted = useRef<Circuit | null>(null);
  const latest = useRef(c);
  latest.current = c;

  const post = (w: Worker, circuit: Circuit) => {
    const id = ++reqId.current;
    inFlight.current = id;
    lastPosted.current = circuit;
    w.postMessage({ id, circuit } satisfies SimRequest);
  };

  useEffect(() => {
    if (failed) return;
    let w: Worker;
    try {
      w = new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' });
    } catch {
      setFailed(true);
      return;
    }
    w.onmessage = (e: MessageEvent<SimResponse>) => {
      if (e.data.id !== inFlight.current) return;
      inFlight.current = null;
      const next = pending.current;
      pending.current = null;
      if (next) post(w, next);
      if (e.data.result) setResult(e.data.result);
      setComputing(next !== null);
    };
    w.onerror = () => setFailed(true);
    workerRef.current = w;
    pending.current = null;
    post(w, latest.current);
    setComputing(true);
    return () => {
      w.terminate();
      inFlight.current = null;
      pending.current = null;
      lastPosted.current = null;
      if (workerRef.current === w) workerRef.current = null;
    };
  }, [failed]);

  useEffect(() => {
    const w = workerRef.current;
    if (failed || !w) return;
    if (inFlight.current !== null) {
      // replace any older queued circuit; posting it now would make the worker run it too
      pending.current = c === lastPosted.current ? null : c;
      return;
    }
    if (c === lastPosted.current) return;
    post(w, c);
    setComputing(true);
  }, [c, failed]);

  const sync = useMemo(() => (failed ? simulate(c) : null), [c, failed]);
  return failed ? { result: sync, computing: false } : { result, computing };
}
