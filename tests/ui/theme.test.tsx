import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import html from '../../index.html?raw';
import css from '../../src/ui/styles.css?raw';
import ThemeToggle from '../../src/ui/ThemeToggle';
import { PREPAINT_SCRIPT, THEME_KEY, initialTheme, useTheme } from '../../src/ui/theme';

type Pref = 'light' | 'dark' | 'none' | 'missing';
let listeners: ((e: { matches: boolean }) => void)[] = [];
let pref: Pref = 'none';

/** Mocks matchMedia; `pref` is read at call time so tests can flip it and fire the listeners. */
function mockOs(p: Pref) {
  pref = p;
  listeners = [];
  if (p === 'missing') {
    vi.stubGlobal('matchMedia', undefined); // jsdom has no matchMedia at all
    return;
  }
  vi.stubGlobal('matchMedia', (q: string) => ({
    get matches() {
      return pref === 'light' ? q.includes('light') : pref === 'dark' ? q.includes('dark') : false;
    },
    media: q,
    addEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.push(l),
    removeEventListener: (_: string, l: (e: { matches: boolean }) => void) => (listeners = listeners.filter((x) => x !== l)),
  }));
}
const osChanges = (p: Pref) => {
  pref = p;
  act(() => listeners.slice().forEach((l) => l({ matches: p === 'light' })));
};

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const theme = () => document.documentElement.dataset.theme;

describe('initialTheme', () => {
  it.each([
    ['stored light wins', 'light', 'dark', 'light'],
    ['stored dark wins', 'dark', 'light', 'dark'],
    ['garbage falls back to OS light', 'blue', 'light', 'light'],
    ['OS light', null, 'light', 'light'],
    ['OS dark', null, 'dark', 'dark'],
    ['no preference → dark', null, 'none', 'dark'],
    ['no matchMedia → dark', null, 'missing', 'dark'],
  ] as const)('%s', (_n, stored, os, want) => {
    if (stored) localStorage.setItem(THEME_KEY, stored);
    mockOs(os as Pref);
    expect(initialTheme()).toBe(want);
  });

  it('storage read errors fall back to the OS rule', () => {
    mockOs('light');
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(initialTheme()).toBe('light');
  });
});

describe('pre-paint script', () => {
  it('sits in <head> as a classic blocking script before any stylesheet', () => {
    const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
    expect(head).toContain(PREPAINT_SCRIPT);
    const tag = head.slice(head.lastIndexOf('<script', head.indexOf(PREPAINT_SCRIPT)), head.indexOf(PREPAINT_SCRIPT));
    expect(tag).not.toMatch(/type=["']module["']|\bdefer\b|\basync\b/);
    const link = head.indexOf('<link rel="stylesheet"');
    if (link >= 0) expect(head.indexOf(PREPAINT_SCRIPT)).toBeLessThan(link);
  });

  it.each([
    ['light', 'dark'],
    [null, 'light'],
    [null, 'dark'],
    [null, 'none'],
    [null, 'missing'],
  ] as const)('matches initialTheme (stored %s, OS %s)', (stored, os) => {
    if (stored) localStorage.setItem(THEME_KEY, stored);
    mockOs(os as Pref);
    new Function(PREPAINT_SCRIPT)();
    expect(theme()).toBe(initialTheme());
  });
});

describe('ThemeToggle', () => {
  it('stores and applies the choice', () => {
    mockOs('dark');
    render(<ThemeToggle />);
    const b = screen.getByRole('button', { name: /switch to light theme/i });
    expect(b.hasAttribute('aria-pressed')).toBe(false);
    expect(theme()).toBe('dark');
    fireEvent.click(b);
    expect(theme()).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    expect(screen.getByRole('button', { name: /switch to dark theme/i })).toBeTruthy();
  });

  it('a storage write error still switches the theme', () => {
    mockOs('dark');
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: /switch to light theme/i }));
    expect(theme()).toBe('light');
  });

  it('follows the OS only without a stored choice', () => {
    mockOs('dark');
    render(<ThemeToggle />);
    expect(theme()).toBe('dark');
    osChanges('light');
    expect(theme()).toBe('light');
    fireEvent.click(screen.getByRole('button', { name: /switch to dark theme/i }));
    expect(theme()).toBe('dark');
    osChanges('light');
    expect(theme()).toBe('dark');
  });

  it('shares state between components', () => {
    mockOs('dark');
    function Show() {
      const [t] = useTheme();
      return <span data-testid="show">{t}</span>;
    }
    render(
      <>
        <ThemeToggle />
        <Show />
      </>,
    );
    expect(screen.getByTestId('show').textContent).toBe('dark');
    fireEvent.click(screen.getByRole('button', { name: /switch to light theme/i }));
    expect(screen.getByTestId('show').textContent).toBe('light');
  });

  it('has a target of at least 24 × 24 px', () => {
    const rule = /\.theme-toggle\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(parseFloat(/min-height:\s*([\d.]+)px/.exec(rule)?.[1] ?? '0')).toBeGreaterThanOrEqual(24);
    expect(parseFloat(/min-width:\s*([\d.]+)px/.exec(rule)?.[1] ?? '0')).toBeGreaterThanOrEqual(24);
  });
});
