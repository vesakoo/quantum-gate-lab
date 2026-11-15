import type { Circuit } from '../model/circuit';
import { simulate } from './simulate';

export type SimRequest = { id: number; circuit: Circuit };
export type SimResponse = { id: number; result?: ReturnType<typeof simulate>; error?: string };

const ctx = self as unknown as { onmessage: ((e: MessageEvent<SimRequest>) => void) | null; postMessage(m: SimResponse): void };

ctx.onmessage = (e) => {
  const { id, circuit } = e.data;
  try {
    ctx.postMessage({ id, result: simulate(circuit) });
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
