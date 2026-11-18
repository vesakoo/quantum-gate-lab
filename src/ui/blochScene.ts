import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Bloch } from '../sim/backend';

export type BlochScene = { update: (b: Bloch) => void; dispose: () => void };

/** Scene colours (0xRRGGBB), read from the theme tokens. */
export type BlochColors = { sphere: number; outline: number; circle: number; axis: number; arrow: number };
/**
 * 'lit': today's light sphere (lit, translucent; kept by the user's choice). 'flat': unlit,
 * full-contrast lines and a silhouette outline (dark theme and forced colours).
 */
export type BlochStyle = { mode: 'lit' | 'flat'; colors: BlochColors };

function toHex(v: string): number {
  const s = v.trim();
  const m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return parseInt(m[1], 16);
  const r = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(s);
  if (r) return (Number(r[1]) << 16) | (Number(r[2]) << 8) | Number(r[3]);
  throw new Error(`blochScene: unsupported colour "${v}"`);
}

/** System colour (e.g. CanvasText) as resolved by the browser, via a probe element. */
function systemColor(name: 'CanvasText' | 'Canvas'): number {
  const probe = document.createElement('span');
  probe.dataset.probe = name.toLowerCase();
  probe.style.color = name;
  document.body.appendChild(probe);
  const c = window.getComputedStyle(probe).color;
  probe.remove();
  return toHex(c);
}

/** The scene style for the current theme, from the CSS tokens on `root`. */
export function readBlochStyle(root: Element = document.documentElement): BlochStyle {
  const forced = typeof window.matchMedia === 'function' && window.matchMedia('(forced-colors: active)').matches;
  if (forced) {
    const ink = systemColor('CanvasText');
    return { mode: 'flat', colors: { sphere: systemColor('Canvas'), outline: ink, circle: ink, axis: ink, arrow: ink } };
  }
  const cs = window.getComputedStyle(root);
  const token = (n: string) => toHex(cs.getPropertyValue(n));
  return {
    mode: (root as HTMLElement).dataset?.theme === 'light' ? 'lit' : 'flat',
    colors: {
      sphere: token('--sphere'),
      outline: token('--bloch-outline'),
      circle: token('--bloch-circle'),
      axis: token('--bloch-axis'),
      arrow: token('--arrow'),
    },
  };
}

/**
 * Bloch (x, y, z) → three.js world. Matches the mini-sphere projection:
 * up (+Y) = +z, screen-right (+X) = +y, toward the viewer (+Z) = +x.
 */
const world = (x: number, y: number, z: number) => new THREE.Vector3(y, z, x);

const ON_TOP = 10;
const UP = new THREE.Vector3(0, 1, 0);

function label(text: string, cls: string): CSS2DObject {
  const el = document.createElement('div');
  el.className = `bloch3d-label ${cls}`;
  el.textContent = text;
  return new CSS2DObject(el);
}

function circle(axisA: THREE.Vector3, axisB: THREE.Vector3, color: number, opacity: number): THREE.LineLoop {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 96; i++) {
    const t = (i / 96) * Math.PI * 2;
    pts.push(axisA.clone().multiplyScalar(Math.cos(t)).add(axisB.clone().multiplyScalar(Math.sin(t))));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = opacity < 1 ? new THREE.LineBasicMaterial({ color, transparent: true, opacity }) : new THREE.LineBasicMaterial({ color });
  return new THREE.LineLoop(geo, mat);
}

/** Mounts a rotatable Bloch sphere into `host`. Returns null when WebGL is unavailable. */
export function createBlochScene(
  host: HTMLElement,
  { mode, colors }: BlochStyle,
  /** tests inject a stub renderer (no WebGL in jsdom) */
  opts: { renderer?: THREE.WebGLRenderer } = {},
): BlochScene | null {
  if (typeof WebGLRenderingContext === 'undefined') return null;
  const flat = mode === 'flat';
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = opts.renderer ?? new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return null;
  }
  const size = () => Math.max(120, host.clientWidth || 300);
  let s = size();
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(s, s);
  renderer.domElement.className = 'bloch3d-canvas';
  host.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.setSize(s, s);
  labels.domElement.className = 'bloch3d-labels';
  host.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  // slightly above and to the right, so +x (toward the viewer) reads down-left like the mini spheres
  camera.position.copy(new THREE.Vector3(0.35, 0.35, 1).normalize().multiplyScalar(5.6));
  camera.lookAt(0, 0, 0);

  if (!flat) {
    // white light (the default colour), as today
    scene.add(new THREE.AmbientLight(undefined, 0.9));
    const dir = new THREE.DirectionalLight(undefined, 1.2);
    dir.position.set(2, 3, 4);
    scene.add(dir);
  }

  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(d: T) => (disposables.push(d), d);

  const sphere = new THREE.Mesh(
    track(new THREE.SphereGeometry(1, 48, 32)),
    track(
      flat
        ? new THREE.MeshBasicMaterial({ color: colors.sphere, transparent: true, opacity: 0.55, depthWrite: false })
        : new THREE.MeshPhongMaterial({ color: colors.sphere, transparent: true, opacity: 0.18, depthWrite: false }),
    ),
  );
  scene.add(sphere);

  const ex = world(1, 0, 0);
  const ey = world(0, 1, 0);
  const ez = world(0, 0, 1);
  const [eq, mer] = flat ? [1, 1] : [0.9, 0.45];
  for (const c of [circle(ex, ey, colors.circle, eq), circle(ex, ez, colors.circle, mer), circle(ey, ez, colors.circle, mer)]) {
    track(c.geometry);
    track(c.material as THREE.Material);
    scene.add(c);
  }

  const axes: [THREE.Vector3, string, string, string][] = [
    [ex, 'x', '|+⟩', '|−⟩'],
    [ey, 'y', '|i⟩', '|−i⟩'],
    [ez, 'z', '|0⟩', '|1⟩'],
  ];
  for (const [v, name, plus, minus] of axes) {
    const geo = track(new THREE.BufferGeometry().setFromPoints([v.clone().multiplyScalar(-1.25), v.clone().multiplyScalar(1.25)]));
    scene.add(new THREE.Line(geo, track(new THREE.LineBasicMaterial({ color: colors.axis }))));
    const axisLabel = label(name, 'axis');
    axisLabel.position.copy(v.clone().multiplyScalar(1.42));
    scene.add(axisLabel);
    const p = label(plus, 'state');
    p.position.copy(v.clone().multiplyScalar(1.16));
    scene.add(p);
    const m = label(minus, 'state');
    m.position.copy(v.clone().multiplyScalar(-1.16));
    scene.add(m);
  }

  // Solid shaft + cone (WebGL lines are always 1 px), unlit and without depth test. three.js draws
  // opaque objects before transparent ones and sorts by renderOrder only within each list, so the
  // arrow is flagged transparent (at full opacity) to land after the translucent sphere and circles.
  const arrowMat = track(
    new THREE.MeshBasicMaterial({ color: colors.arrow, transparent: true, opacity: 1, depthTest: false, depthWrite: false }),
  );
  const shaftGeo = track(new THREE.CylinderGeometry(0.025, 0.025, 1, 16));
  shaftGeo.translate(0, 0.5, 0);
  const headGeo = track(new THREE.ConeGeometry(0.07, 1, 20));
  headGeo.translate(0, 0.5, 0);
  const shaft = new THREE.Mesh(shaftGeo, arrowMat);
  const head = new THREE.Mesh(headGeo, arrowMat);
  shaft.renderOrder = ON_TOP;
  head.renderOrder = ON_TOP;
  const arrow = new THREE.Group();
  arrow.add(shaft, head);
  scene.add(arrow);
  const tipDot = new THREE.Mesh(track(new THREE.SphereGeometry(0.04, 16, 12)), arrowMat);
  tipDot.renderOrder = ON_TOP;
  scene.add(tipDot);

  const controls = new OrbitControls(camera, labels.domElement);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.enableDamping = false;

  // flat mode: a silhouette outline, re-placed each frame where a perspective camera sees the
  // sphere's edge (distance r²/D toward the camera, radius r·√(1 − r²/D²); unit sphere)
  let ring: THREE.Mesh | null = null;
  if (flat) {
    ring = new THREE.Mesh(
      track(new THREE.RingGeometry(1, 1.03, 96)),
      track(new THREE.MeshBasicMaterial({ color: colors.outline, side: THREE.DoubleSide })),
    );
    scene.add(ring);
  }

  const render = () => {
    if (ring) {
      const d = camera.position.length();
      ring.position.copy(camera.position.clone().normalize().multiplyScalar(1 / d));
      const k = Math.sqrt(1 - 1 / (d * d));
      ring.scale.set(k, k, 1);
      ring.lookAt(camera.position);
    }
    renderer.render(scene, camera);
    labels.render(scene, camera);
  };
  controls.addEventListener('change', render);

  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => {
      const n = size();
      if (n === s) return;
      s = n;
      renderer.setSize(s, s);
      labels.setSize(s, s);
      render();
    });
    ro.observe(host);
  }

  return {
    update(b) {
      const v = world(b.x, b.y, b.z);
      const len = v.length();
      tipDot.position.copy(v);
      if (len < 1e-6) {
        arrow.visible = false;
      } else {
        arrow.visible = true;
        arrow.quaternion.setFromUnitVectors(UP, v.clone().normalize());
        const h = Math.min(0.18, len * 0.45);
        shaft.scale.set(1, len - h, 1);
        head.position.y = len - h;
        const w = Math.min(1, h / 0.18); // narrow the cone with its length, as ArrowHelper did
        head.scale.set(w, h, w);
      }
      render();
    },
    dispose() {
      ro?.disconnect();
      controls.removeEventListener('change', render);
      controls.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      labels.domElement.remove();
    },
  };
}
