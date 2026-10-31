// main.js — rendering & interaction only.
// It consumes the pure core (src/core.mjs) output; it never re-implements the
// geometry/pipeline. Uses three.js via the importmap.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  defaultSurfaces, analyzeTris, intersectSurfaces, intersectSurfacesNaive,
} from './src/core.mjs';

const RES = 40;
const { A, B } = defaultSurfaces(RES);
const trisA = A.tris;
const trisB = B.tris;

// ---- scene setup ----
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1117);
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 20);
camera.position.set(2.2, 2.0, 2.6);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('app').appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xffffff, 0x202020, 0.6));
const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(1, 2, 1);
scene.add(dir);

// ---- build mesh helpers ----
function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function buildBufferGeometry(tris) {
  const pos = new Float32Array(tris.length * 9);
  const nrm = new Float32Array(tris.length * 9);
  const geo = new THREE.BufferGeometry();
  tris.forEach((t, idx) => {
    const base = idx * 9;
    pos[base] = t[0][0]; pos[base + 1] = t[0][1]; pos[base + 2] = t[0][2];
    pos[base + 3] = t[1][0]; pos[base + 4] = t[1][1]; pos[base + 5] = t[1][2];
    pos[base + 6] = t[2][0]; pos[base + 7] = t[2][1]; pos[base + 8] = t[2][2];
    const e1 = [t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]];
    const e2 = [t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]];
    const n = norm([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]);
    nrm[base] = n[0]; nrm[base + 1] = n[1]; nrm[base + 2] = n[2];
    nrm[base + 3] = n[0]; nrm[base + 4] = n[1]; nrm[base + 5] = n[2];
    nrm[base + 6] = n[0]; nrm[base + 7] = n[1]; nrm[base + 8] = n[2];
  });
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return geo;
}

const matA = new THREE.MeshStandardMaterial({ color: 0x58a6ff, wireframe: false, transparent: true, opacity: 0.85, metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide });
const meshA = new THREE.Mesh(buildBufferGeometry(trisA), matA);
const matB = new THREE.MeshStandardMaterial({ color: 0xc678dd, wireframe: false, transparent: true, opacity: 0.55, metalness: 0.1, roughness: 0.7, side: THREE.DoubleSide });
const meshB = new THREE.Mesh(buildBufferGeometry(trisB), matB);
scene.add(meshA); scene.add(meshB);

const wireA = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(buildBufferGeometry(trisA).attributes.position.array, 3))), new THREE.LineBasicMaterial({ color: 0x58a6ff, transparent: true, opacity: 0.15 }));
scene.add(wireA);
const wireB = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(buildBufferGeometry(trisB).attributes.position.array, 3))), new THREE.LineBasicMaterial({ color: 0xc678dd, transparent: true, opacity: 0.1 }));
scene.add(wireB);
scene.add(new THREE.GridHelper(2, 20, 0x30363d, 0x30363d));

// ---- intersection curve ----
const curveMat = new THREE.LineBasicMaterial({ color: 0x3fb950, linewidth: 2 });
let curveLine = null;
function drawIntersection(segments) {
  const pts = [];
  for (const s of segments) {
    pts.push(new THREE.Vector3(s.p[0], s.p[1], s.p[2]));
    pts.push(new THREE.Vector3(s.q[0], s.q[1], s.q[2]));
  }
  if (curveLine) { scene.remove(curveLine); curveLine.geometry.dispose(); }
  if (pts.length < 2) return;
  curveLine = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), curveMat);
  scene.add(curveLine);
}

// ---- panel + recompute ----
const kindSel = document.getElementById('kind');
function fmt(n) { return Number(n).toFixed(2); }

function recompute() {
  const kind = kindSel.value;
  let stats, segments;
  if (kind === 'naive') {
    const r = intersectSurfacesNaive(trisA, trisB);
    stats = { totalPairs: r.candidates, exactTests: r.candidates, reduction: 0, segCount: r.segCount, identical: true };
    segments = r.segments;
  } else {
    const r = analyzeTris(trisA, trisB, kind, 2e-3);
    const full = intersectSurfaces(trisA, trisB, { kind, halfThick: 2e-3 });
    stats = { totalPairs: r.totalPairs, exactTests: r.candidatePairs, reduction: r.reduction * 100, segCount: r.segCount, identical: r.identical };
    segments = full.segments;
  }
  document.getElementById('total').textContent = stats.totalPairs.toLocaleString();
  document.getElementById('cand').textContent = stats.exactTests.toLocaleString();
  document.getElementById('reduction').textContent = fmt(stats.reduction);
  document.getElementById('segs').textContent = stats.segCount;
  document.getElementById('identical').textContent = stats.identical ? 'YES' : 'no';
  drawIntersection(segments);
}

kindSel.addEventListener('change', recompute);
recompute();

// ---- render loop ----
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});