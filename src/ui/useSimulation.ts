import { useEffect, useMemo, useRef, useState } from 'react';
import type { Circuit } from '../model/circuit';
import { simulate, type SimResult } from '../sim/simulate';
import type { SimRequest, SimResponse } from '../sim/worker';

const HAS_WORKER = typeof Worker !== 'undefined';

/**
 * Simulates `c` in a Web Worker, ignoring stale responses by request id.
 * Without Worker support (e.g. jsdom) — or if the worker fails — simulates synchronously.
 */
export function useSimulation(c: Circuit): SimResult | null {
  const [failed, setFailed] = useState(!HAS_WORKER);
  const [result, setResult] = useState<SimResult | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const latest = useRef(c);
  latest.current = c;

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
      if (e.data.id !== reqId.current) return;
      if (e.data.result) setResult(e.data.result);
    };
    w.onerror = () => setFailed(true);
    workerRef.current = w;
    const id = ++reqId.current;
    w.postMessage({ id, circuit: latest.current } satisfies SimRequest);
    return () => {
      w.terminate();
      if (workerRef.current === w) workerRef.current = null;
    };
  }, [failed]);

  useEffect(() => {
    const w = workerRef.current;
    if (failed || !w) return;
    const id = ++reqId.current;
    w.postMessage({ id, circuit: c } satisfies SimRequest);
  }, [c, failed]);

  const sync = useMemo(() => (failed ? simulate(c) : null), [c, failed]);
  return failed ? sync : result;
}
