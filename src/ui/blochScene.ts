import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Bloch } from '../sim/backend';

export type BlochScene = { update: (b: Bloch) => void; dispose: () => void };

/**
 * Bloch (x, y, z) → three.js world. Matches the mini-sphere projection:
 * up (+Y) = +z, screen-right (+X) = +y, toward the viewer (+Z) = +x.
 */
const world = (x: number, y: number, z: number) => new THREE.Vector3(y, z, x);

const ARROW = 0xff2020;
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
  return new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}

/** Mounts a rotatable Bloch sphere into `host`. Returns null when WebGL is unavailable. */
export function createBlochScene(host: HTMLElement): BlochScene | null {
  if (typeof WebGLRenderingContext === 'undefined') return null;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
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

  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(2, 3, 4);
  scene.add(dir);

  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(d: T) => (disposables.push(d), d);

  const sphere = new THREE.Mesh(
    track(new THREE.SphereGeometry(1, 48, 32)),
    track(new THREE.MeshPhongMaterial({ color: 0x9fc4ee, transparent: true, opacity: 0.18, depthWrite: false })),
  );
  scene.add(sphere);

  const ex = world(1, 0, 0);
  const ey = world(0, 1, 0);
  const ez = world(0, 0, 1);
  for (const c of [circle(ex, ey, 0x4a6080, 0.9), circle(ex, ez, 0x4a6080, 0.45), circle(ey, ez, 0x4a6080, 0.45)]) {
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
    scene.add(new THREE.Line(geo, track(new THREE.LineBasicMaterial({ color: 0x555555 }))));
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

  // Solid shaft + cone (WebGL lines are always 1 px), unlit and drawn last without depth test,
  // so neither the translucent sphere nor an axis line can hide or dim it.
  const arrowMat = track(new THREE.MeshBasicMaterial({ color: ARROW, depthTest: false }));
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

  const render = () => {
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
        head.scale.set(1, h, 1);
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
