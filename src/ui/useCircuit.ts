import { useCallback, useEffect, useState } from 'react';
import { emptyCircuit, type Circuit } from '../model/circuit';
import { fromHash, toHash } from '../model/serialize';

function fromLocation(): Circuit | null {
  const h = location.hash.replace(/^#/, '');
  if (!h) return null;
  const r = fromHash(h);
  return r.ok ? r.circuit : null;
}

export function useCircuit(): {
  circuit: Circuit;
  dispatch: (edit: (c: Circuit) => Circuit) => void;
  replace: (c: Circuit) => void;
} {
  const [circuit, setCircuit] = useState<Circuit>(() => fromLocation() ?? emptyCircuit());

  useEffect(() => {
    const hash = `#${toHash(circuit)}`;
    if (location.hash !== hash) history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
  }, [circuit]);

  useEffect(() => {
    // A pasted link (hash typed into the address bar) loads that circuit; bad hashes are ignored.
    const onHash = () => {
      const c = fromLocation();
      if (c) setCircuit(c);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const dispatch = useCallback((edit: (c: Circuit) => Circuit) => setCircuit((prev) => edit(prev)), []);
  const replace = useCallback((c: Circuit) => setCircuit(c), []);
  return { circuit, dispatch, replace };
}
