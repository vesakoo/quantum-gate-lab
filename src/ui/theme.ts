import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
export const THEME_KEY = 'qgl-theme';
const LIGHT_QUERY = '(prefers-color-scheme: light)';

/** The remembered choice, or null (nothing stored, invalid value, or storage blocked). */
export function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

/** OS preference: light only when the OS asks for light; dark otherwise (also without matchMedia). */
function osTheme(): Theme {
  const mm = typeof window !== 'undefined' ? window.matchMedia : undefined;
  return typeof mm === 'function' && mm(LIGHT_QUERY).matches ? 'light' : 'dark';
}

/** Stored choice, else the OS preference with dark as the fallback. */
export function initialTheme(): Theme {
  return storedTheme() ?? osTheme();
}

export function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = t;
}

/**
 * Runs in index.html before the first paint, so there is no flash of the wrong theme. Must give the
 * same answer as initialTheme() (a test checks this) and must not depend on the bundle.
 */
export const PREPAINT_SCRIPT =
  "(function(){var t=null;try{t=localStorage.getItem('qgl-theme')}catch(e){}" +
  "if(t!=='light'&&t!=='dark'){var m=window.matchMedia;" +
  "t=typeof m==='function'&&m('(prefers-color-scheme: light)').matches?'light':'dark'}" +
  'document.documentElement.dataset.theme=t})();';

// ---------- one shared store: the <html data-theme> attribute is the source of truth ----------

const subscribers = new Set<() => void>();
const notify = () => subscribers.forEach((f) => f());

function current(): Theme {
  const t = document.documentElement.dataset.theme;
  if (t === 'light' || t === 'dark') return t;
  const init = initialTheme();
  applyTheme(init);
  return init;
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  // follow the OS live while the user has not chosen a theme
  const mm = typeof window.matchMedia === 'function' ? window.matchMedia(LIGHT_QUERY) : null;
  const onOs = () => {
    if (storedTheme() !== null) return;
    applyTheme(osTheme());
    notify();
  };
  mm?.addEventListener?.('change', onOs);
  return () => {
    subscribers.delete(cb);
    mm?.removeEventListener?.('change', onOs);
  };
}

/** Choose a theme: remembered (when storage allows), applied, then every user re-renders. */
export function setTheme(t: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* storage blocked: the choice still applies for this page */
  }
  applyTheme(t);
  notify();
}

/** The current theme, shared by every component that uses it. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const t = useSyncExternalStore(subscribe, current, () => 'dark' as Theme);
  return [t, useCallback(setTheme, [])];
}
