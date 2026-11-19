import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import css from '../../src/ui/styles.css?raw';
import sceneSrc from '../../src/ui/blochScene.ts?raw';
import { parseColor, themeTokens } from './contrastMath';

// capture what createBlochScene is called with, but keep the real readBlochStyle
const created: { style: unknown; dispose: ReturnType<typeof vi.fn> }[] = [];
vi.mock('../../src/ui/blochScene', async (orig) => {
  const real = await orig<typeof import('../../src/ui/blochScene')>();
  return {
    ...real,
    createBlochScene: (_host: HTMLElement, style: unknown) => {
      const dispose = vi.fn();
      created.push({ style, dispose });
      return { update: () => {}, dispose };
    },
  };
});

const { readBlochStyle } = await import('../../src/ui/blochScene');
const { default: BlochPanel } = await import('../../src/ui/BlochPanel');
const { default: ThemeToggle } = await import('../../src/ui/ThemeToggle');
const { THEME_KEY } = await import('../../src/ui/theme');

const hex = (v: string) => {
  const [r, g, b] = parseColor(v);
  return (r << 16) | (g << 8) | b;
};
const expected = (theme: 'light' | 'dark') => {
  const t = themeTokens(css, theme);
  return {
    mode: theme === 'light' ? 'lit' : 'flat',
    colors: {
      sphere: hex(t['--sphere']),
      outline: hex(t['--bloch-outline']),
      circle: hex(t['--bloch-circle']),
      axis: hex(t['--bloch-axis']),
      arrow: hex(t['--arrow']),
    },
  };
};

let style: HTMLStyleElement;
beforeEach(() => {
  style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  localStorage.clear();
  created.length = 0;
});
afterEach(() => {
  cleanup();
  style.remove();
  delete document.documentElement.dataset.theme;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const bloch = { x: 0, y: 0, z: 1, length: 1, mixed: false, probs: { zero: 1, one: 0, plus: 0.5, minus: 0.5, plusI: 0.5, minusI: 0.5 } };

describe('readBlochStyle', () => {
  it.each(['light', 'dark'] as const)('reads the %s tokens', (theme) => {
    document.documentElement.dataset.theme = theme;
    expect(readBlochStyle()).toEqual(expected(theme));
  });

  it("light theme keeps today's sphere colours", () => {
    document.documentElement.dataset.theme = 'light';
    expect(readBlochStyle()).toEqual({ mode: 'lit', colors: expect.objectContaining({ sphere: 0x9fc4ee, circle: 0x4a6080, axis: 0x555555, arrow: 0xff2020 }) });
  });

  it('forced colours use the flat mode with system colours', () => {
    document.documentElement.dataset.theme = 'light';
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('forced-colors'), addEventListener() {}, removeEventListener() {} }));
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
      const cs = real(el);
      const probe = el as HTMLElement;
      if (probe.dataset?.probe === 'canvastext') return { ...cs, color: 'rgb(255, 255, 255)', getPropertyValue: cs.getPropertyValue.bind(cs) } as CSSStyleDeclaration;
      if (probe.dataset?.probe === 'canvas') return { ...cs, color: 'rgb(0, 0, 0)', getPropertyValue: cs.getPropertyValue.bind(cs) } as CSSStyleDeclaration;
      return cs;
    });
    expect(readBlochStyle()).toEqual({ mode: 'flat', colors: { sphere: 0x000000, outline: 0xffffff, circle: 0xffffff, axis: 0xffffff, arrow: 0xffffff } });
  });
});

describe('BlochPanel and the theme', () => {
  it('re-creates the scene when the theme changes', async () => {
    vi.stubGlobal('WebGLRenderingContext', function WebGLRenderingContext() {});
    localStorage.setItem(THEME_KEY, 'dark');
    document.documentElement.dataset.theme = 'dark';
    render(
      <>
        <ThemeToggle />
        <BlochPanel qubit={0} step={0} bloch={bloch as never} onClose={() => {}} />
      </>,
    );
    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0].style).toEqual(expected('dark'));
    fireEvent.click(screen.getByRole('button', { name: /switch to light theme/i }));
    await waitFor(() => expect(created).toHaveLength(2));
    expect(created[0].dispose).toHaveBeenCalledTimes(1);
    expect(created[1].style).toEqual(expected('light'));
  });
});

describe('scene construction', () => {
  it('uses no colour literals', () => {
    expect(sceneSrc.match(/0x[0-9a-fA-F]{6}\b/g) ?? []).toEqual([]);
  });

  it.each(['lit', 'flat'] as const)('%s mode uses only the given colours', async (mode) => {
    const real = await vi.importActual<typeof import('../../src/ui/blochScene')>('../../src/ui/blochScene');
    vi.stubGlobal('WebGLRenderingContext', function WebGLRenderingContext() {});
    let scene: THREE.Scene | null = null;
    const renderer = {
      domElement: document.createElement('canvas'),
      setPixelRatio() {},
      setSize() {},
      render(sc: THREE.Scene) {
        scene = sc;
      },
      dispose() {},
      forceContextLoss() {},
    } as unknown as THREE.WebGLRenderer;
    const colors = { sphere: 0x111111, outline: 0x222222, circle: 0x333333, axis: 0x444444, arrow: 0x555555 };
    const host = document.createElement('div');
    const s = real.createBlochScene(host, { mode, colors }, { renderer });
    s!.update(bloch as never);
    expect(scene).not.toBeNull();
    const allowed = new Set(Object.values(colors));
    const mats: THREE.Material[] = [];
    let lights = 0;
    let rings = 0;
    scene!.traverse((o) => {
      if ((o as THREE.Light).isLight) lights++;
      if ((o as THREE.Mesh).geometry instanceof THREE.RingGeometry) rings++;
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) mats.push(m);
    });
    for (const m of mats) {
      const c = (m as THREE.MeshBasicMaterial).color;
      if (c) expect(allowed.has(c.getHex()), `${m.type} 0x${c.getHex().toString(16)}`).toBe(true);
    }
    if (mode === 'flat') {
      expect(lights).toBe(0);
      expect(rings).toBe(1);
      expect(mats.some((m) => m.type === 'MeshPhongMaterial')).toBe(false);
      for (const m of mats) if (m.type === 'LineBasicMaterial') expect(m.opacity).toBe(1);
    } else {
      expect(lights).toBe(2);
      expect(rings).toBe(0);
      const ph = mats.find((m) => m.type === 'MeshPhongMaterial')!;
      expect(ph.opacity).toBeCloseTo(0.18);
      expect(mats.filter((m) => m.type === 'LineBasicMaterial' && m.transparent).map((m) => m.opacity).sort()).toEqual([0.45, 0.45, 0.9]);
    }
    s!.dispose();
  });

  it('dark 3D labels sit on an opaque backing', () => {
    expect(parseColor(themeTokens(css, 'dark')['--bloch-label-bg'])[3]).toBe(1);
    const rule = /\.bloch3d-label\.state\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/background:\s*var\(--bloch-label-bg\)/);
  });
});
