import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyCircuit, type Circuit } from '../model/circuit';
import { fromHash, toHash, type ParseResult } from '../model/serialize';

/** A failed load from the URL hash; a new object per failure so repeats are reported again. */
export type LoadError = { message: string };

function fromLocation(): ParseResult | null {
  const h = location.hash.replace(/^#/, '');
  return h ? fromHash(h) : null;
}

const loadError = (r: ParseResult | null): LoadError | null =>
  r && !r.ok ? { message: `Could not load the circuit from the link: ${r.error}` } : null;

export function useCircuit(): {
  circuit: Circuit;
  dispatch: (edit: (c: Circuit) => Circuit) => void;
  replace: (c: Circuit) => void;
  loadError: LoadError | null;
} {
  const [initial] = useState(fromLocation);
  const [circuit, setCircuit] = useState<Circuit>(() => (initial?.ok ? initial.circuit : emptyCircuit()));
  const [error, setError] = useState<LoadError | null>(() => loadError(initial));
  // The URL hash mirrors the circuit only after the first edit, so a bad or truncated link stays
  // in the address bar (for the user to fix) instead of being replaced by the empty circuit.
  const edited = useRef(false);

  useEffect(() => {
    if (!edited.current) return;
    const hash = `#${toHash(circuit)}`;
    if (location.hash !== hash) history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
  }, [circuit]);

  useEffect(() => {
    // A pasted link (hash typed into the address bar) loads that circuit; a bad one is reported.
    const onHash = () => {
      const r = fromLocation();
      if (r?.ok) {
        setCircuit(r.circuit);
        setError(null);
      } else setError(loadError(r));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const dispatch = useCallback((edit: (c: Circuit) => Circuit) => {
    edited.current = true;
    setCircuit((prev) => edit(prev));
  }, []);
  const replace = useCallback((c: Circuit) => {
    edited.current = true;
    setCircuit(c);
  }, []);
  return { circuit, dispatch, replace, loadError: error };
}
