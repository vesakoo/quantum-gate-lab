import '@testing-library/jest-dom/vitest';

// Node ≥ 22 defines its own experimental global `localStorage` (a plain object without methods unless
// started with --localstorage-file), which shadows jsdom's. Give tests a working in-memory Storage.
if (typeof globalThis.localStorage?.clear !== 'function') {
  class MemoryStorage {
    private m = new Map<string, string>();
    get length() {
      return this.m.size;
    }
    clear() {
      this.m.clear();
    }
    getItem(k: string) {
      return this.m.has(k) ? this.m.get(k)! : null;
    }
    key(i: number) {
      return [...this.m.keys()][i] ?? null;
    }
    removeItem(k: string) {
      this.m.delete(k);
    }
    setItem(k: string, v: string) {
      this.m.set(k, String(v));
    }
  }
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true });
}
