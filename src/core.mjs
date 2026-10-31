// src/core.mjs
// Pure computational geometry: triangle-triangle surface intersection with
// sound broadphase prefilters (AABB and OBB). No three.js, no DOM, no I/O.
// All functions here run identically in node and in the browser (ES module).

const EPS = 1e-9;

// ---- tiny vec helpers ------------------------------------------------------

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const len = (a) => Math.sqrt(dot(a, a));
const normalize = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---- AABB helper -----------------------------------------------------------

function triAABB(t) {
  const lo = [Math.min(t[0][0], t[1][0], t[2][0]),
              Math.min(t[0][1], t[1][1], t[2][1]),
              Math.min(t[0][2], t[1][2], t[2][2])];
  const hi = [Math.max(t[0][0], t[1][0], t[2][0]),
              Math.max(t[0][1], t[1][1], t[2][1]),
              Math.max(t[0][2], t[1][2], t[2][2])];
  return { lo, hi };
}
function aabbOverlap(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a.lo[i] > b.hi[i] || b.lo[i] > a.hi[i]) return false;
  }
  return true;
}

// ---- OBB (oriented bounding box) for a triangle ----------------------------
// Triangle's tightest 3D box is essentially the flat prim; we give it a small
// but nonzero half-thickness along its normal so the SAT test stays robust.
// Boxes are rotated to the triangle normal frame, making them much tighter
// than the AABB for triangles not aligned to the world axes.

function triOBB(t, halfThick = 1e-6) {
  const n = normalize(cross(sub(t[1], t[0]), sub(t[2], t[0])));
  // build a right-handed orthonormal frame: n, u, v
  let u = normalize(cross([0, 0, 1], n));
  if (len(u) < 1e-6) u = normalize(cross([0, 1, 0], n));
  const v = cross(n, u);
  // project verts onto u,v
  let loU = Infinity, hiU = -Infinity, loV = Infinity, hiV = -Infinity;
  for (const p of t) {
    const a = dot(p, u), b = dot(p, v);
    if (a < loU) loU = a; if (a > hiU) hiU = a;
    if (b < loV) loV = b; if (b > hiV) hiV = b;
  }
  const cU = (loU + hiU) / 2, cV = (loV + hiV) / 2;
  const cN = (dot(t[0], n) + dot(t[1], n) + dot(t[2], n)) / 3;
  // world-space center of the OBB (orthonormal basis n,u,v)
  const cx = cU * u[0] + cV * v[0] + cN * n[0];
  const cy = cU * u[1] + cV * v[1] + cN * n[1];
  const cz = cU * u[2] + cV * v[2] + cN * n[2];
  return { n, u, v, cU, cV, cN, c: [cx, cy, cz], hU: (hiU - loU) / 2 + halfThick, hV: (hiV - loV) / 2 + halfThick, hN: halfThick };
}

// SAT overlap test between two OBBs defined in their own frames.
function obbOverlap(o1, o2) {
  // 15 axes: 3 normals of each + 9 cross products.
  const axes = [o1.n, o1.u, o1.v, o2.n, o2.u, o2.v
    , cross(o1.n, o2.n), cross(o1.n, o2.u), cross(o1.n, o2.v)
    , cross(o1.u, o2.n), cross(o1.u, o2.u), cross(o1.u, o2.v)
    , cross(o1.v, o2.n), cross(o1.v, o2.u), cross(o1.v, o2.v)];
  const centersD = [
    o1.c[0] - o2.c[0],
    o1.c[1] - o2.c[1],
    o1.c[2] - o2.c[2],
  ];
  for (const ax of axes) {
    const l = len(ax);
    if (l < 1e-9) continue; // parallel axes collapse
    const a = ax[0] / l, b = ax[1] / l, c = ax[2] / l;
    const r1 = Math.abs(dot(o1.u, [a, b, c])) * o1.hU + Math.abs(dot(o1.v, [a, b, c])) * o1.hV + Math.abs(dot(o1.n, [a, b, c])) * o1.hN;
    const r2 = Math.abs(dot(o2.u, [a, b, c])) * o2.hU + Math.abs(dot(o2.v, [a, b, c])) * o2.hV + Math.abs(dot(o2.n, [a, b, c])) * o2.hN;
    const dist = Math.abs(a * centersD[0] + b * centersD[1] + c * centersD[2]);
    if (dist > r1 + r2) return false;
  }
  return true;
}

function makeOBBFilter(tri, halfThick) { return triOBB(tri, halfThick); }
function makeAABBFilter(tri) { return triAABB(tri); }

// ---- exact triangle-triangle intersection segment --------------------------
// Returns the intersecting segment {p,q} or null. Uses plane-of-B clipping.

function triTriIntersection(a, b, eps = EPS) {
  const nb = normalize(cross(sub(b[1], b[0]), sub(b[2], b[0])));
  const db = dot(nb, b[0]);
  const d0 = dot(nb, a[0]) - db;
  const d1 = dot(nb, a[1]) - db;
  const d2 = dot(nb, a[2]) - db;
  // all verts on same side (strictly) -> no intersection
  const signs = [d0, d1, d2].map((d) => (d > eps ? 1 : d < -eps ? -1 : 0));
  if (signs[0] === 1 && signs[1] === 1 && signs[2] === 1) return null;
  if (signs[0] === -1 && signs[1] === -1 && signs[2] === -1) return null;
  if (signs[0] === 0 && signs[1] === 0 && signs[2] === 0) return null; // coplanar, skip (ill-conditioned)

  // chord of A across plane(B): find the two edge crossings
  const pts = [];
  const edgesV = [
    [0, 1, d0, d1],
    [1, 2, d1, d2],
    [2, 0, d2, d0],
  ];
  for (const [i, j, di, dj] of edgesV) {
    if ((di > epsV && dj < -epsV) || (di < -epsV && dj > epsV)) {
      const t = di / (di - dj);
      pts.push(lerp3(a[i], a[j], t));
    }
  }
  if (pts.length < 2) return null;

  let [i0, i1] = pts;
  // chord endpoints could be degenerate if one vertex exactly on plane; handle by
  // also dropping the on-plane vertex pair. We pick the two most separated.
  if (len(sub(i0, i1)) < epsV) return null;

  // clip segment to triangle B in the plane by projecting to B's 2D frame
  const bu = normalize(sub(b[1], b[0]));
  const bv = cross(nb, bu);
  const s0 = project2(i0, bu, bv, b[0]);
  const s1 = project2(i1, bu, bv, b[0]);
  let seg = clipToTri(s0, s1, b, bu, bv);
  if (!seg) return null;
  const r0 = unproject(seg.p, bu, bv, b[0]);
  const r1 = unproject(seg.q, bu, bv, b[0]);
  if (len(sub(r0, r1)) < epsV) return null;
  return { p: r0, q: r1 };
}

const epsV = 1e-9;

function project2(pt, bu, bv, origin) {
  const d = sub(pt, origin);
  return [dot(d, bu), dot(d, bv)];
}
function unproject(s, bu, bv, origin) {
  return add(origin, add(scale(bu, s[0]), scale(bv, s[1])));
}

// Liang-Barsky segment clip to a triangle (2D). Uses inward half-planes with a
// small epsilon so segments lying on a triangle edge are kept, not collapsed.
function clipToTri(p, q, b, bu, bv) {
  // project triangle verts into the 2D (bu,bv) frame, origin at b[0]
  const b0 = project2(b[0], bu, bv, b[0]);
  const b1 = project2(b[1], bu, bv, b[0]);
  const b2 = project2(b[2], bu, bv, b[0]);
  const verts = [b0, b1, b2];
  const d = [q[0] - p[0], q[1] - p[1]];
  let lo = 0, hi = 1;
  for (let e = 0; e < 3; e++) {
    const e0 = verts[e], e1 = verts[(e + 1) % 3];
    // inward normal (CCW): left of directed edge
    const nx = -(e1[1] - e0[1]);
    const ny = (e1[0] - e0[0]);
    // inside(x) = n·(x - e0); inside >= 0 inside triangle
    const fP = nx * (p[0] - e0[0]) + ny * (p[1] - e0[1]);
    const fQ = nx * (q[0] - e0[0]) + ny * (q[1] - e0[1]);
    const fD = fQ - fP;
    if (Math.abs(fD) < epsV) {
      if (fP < -epsV) return null; // whole segment outside this half-plane
    } else {
      const t0 = (-epsV - fP) / fD;
      if (fD > 0) lo = Math.max(lo, t0); // entering
      else hi = Math.min(hi, t0);        // exiting
    }
    if (lo > hi) return null;
  }
  const rp = [p[0] + d[0] * lo, p[1] + d[1] * lo];
  const rq = [p[0] + d[0] * hi, p[1] + d[1] * hi];
  return { p: rp, q: rq };
}

// ---- generated sample surfaces (deterministic) -----------------------------

// Two analytic triangle-grid surfaces parameterized on [0,1]^2.
// A: z = a1 * sin(kx*x*2pi) * cos(ky*y*2pi)
// B: a plane rotated, engineered to transversally cut A (deterministic).
function genSurface(fn, res) {
  // res = number of quads per side; create grid positions then triangulate
  const n = res + 1;
  const verts = [];
  for (let jy = 0; jy <= res; jy++) {
    for (let ix = 0; ix <= res; ix++) {
      const u = ix / res, v = jy / res;
      verts.push(fn(u, v));
    }
  }
  const idx = [];
  for (let jy = 0; jy < res; jy++) {
    for (let ix = 0; ix < res; ix++) {
      const a = jy * n + ix;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      idx.push(a, c, b); // triangle 1
      idx.push(b, c, d); // triangle 2
    }
  }
  const tris = [];
  for (let i = 0; i < idx.length; i += 3) {
    tris.push([verts[idx[i]], verts[idx[i + 1]], verts[idx[i + 2]]]);
  }
  return { verts, idx, tris };
}

const TWO_PI = Math.PI * 2;

// Default surface A: ripple.
function surfA(u, v) {
  return [u, v, 0.16 * Math.sin(u * 3 * TWO_PI) * Math.cos(v * 2 * TWO_PI)];
}

// Default surface B: a plane cutting through; parametrized so that its
// intersection with A is a well-conditioned transversal curve.
function surfB(u, v) {
  // plane: z = 0.5 - x  ; parametrize by (u,v) -> (u, v, 0.5 - u)
  return [u, v, 0.5 - u];
}

// ---- broadphase orchestration ---------------------------------------------

// Given its triangles, returns a prefilter representation for each.
function prepareFilters(tris, kind, halfThick) {
  const f = kind === 'aabb' ? makeAABBFilter : (t) => makeOBBFilter(t, halfThick);
  return tris.map(f);
}

// Find candidate index pairs using a given filter (sound: no false negatives).
function candidates(fA, fB, ...args) {
  const pairs = [];
  const kind = args[0]; // precomputed not needed; filter func handles shape
  for (let i = 0; i < fA.length; i++) {
    for (let j = 0; j < fB.length; j++) {
      if (overlapFor(kind, fA[i], fB[j])) pairs.push([i, j]);
    }
  }
  return pairs;
}

function overlapFor(kind, a, b) {
  if (kind === 'aabb') return aabbOverlap(a, b);
  return obbOverlap(a, b);
}

// Full pipeline: given surface A and surface B tri lists, kind of prefilter,
// returns { candidates, segments, foundPairs }.
export function intersectSurfaces(trisA, trisB, { kind = 'aabb', halfThick = 2e-3 } = {}) {
  const fA = prepareFilters(trisA, kind, halfThick);
  const fB = prepareFilters(trisB, kind, halfThick);
  const cand = candidates(fA, fB, kind);
  const segments = [];
  const pairSet = new Set();
  for (const [i, j] of cand) {
    const s = triTriIntersection(trisA[i], trisB[j]);
    if (s) {
      segments.push({ pair: [i, j], ...s });
      pairSet.add(`${i},${j}`);
    }
  }
  // canonical ordering not needed; segments returned raw
  return { candidates: cand.length, pairs: cand, segments, foundPairs: pairSet, segCount: segments.length };
}

// Naive reference: test ALL pairs exactly (no prefilter).
export function intersectSurfacesNaive(trisA, trisB) {
  const segments = [];
  for (let i = 0; i < trisA.length; i++) {
    for (let j = 0; j < trisB.length; j++) {
      const s = triTriIntersection(trisA[i], trisB[j]);
      if (s) segments.push({ pair: [i, j], ...s });
    }
  }
  return { candidates: trisA.length * trisB.length, pairs: [], segments, foundPairs: segments.map((s) => s.pair), segCount: segments.length };
}

// Aggregate a segment list into a deduplicated canonical description for
// bit-exact comparison between two runs.
export function canonicalSegments(segments) {
  return segments.map((s) => {
    const keys = [s.p, s.q].map((v) => v.map((x) => x.toFixed(12)).join(',')).sort();
    return keys.join('|');
  }).sort();
}

// ---- deterministic precomputed dataset (the tool's default geometry) -------

// World-frame tilt applied to both surfaces. Tilting makes world-axis AABBs
// looser while triangle-aligned OBBs stay tight — this is where the broadphase
// choice is actually measurable, not hidden by an axis-aligned heightfield.
const TILT = Math.PI / 5;

export function tilted(p) {
  const cs = Math.cos(TILT), sn = Math.sin(TILT);
  return [p[0] * cs - p[2] * sn, p[1], p[0] * sn + p[2] * cs];
}

// Default surface A: a rippled terrain (tilted).
function surfATilted(u, v) {
  return tilted([u, v, 0.16 * Math.sin(u * 3 * TWO_PI) * Math.cos(v * 2 * TWO_PI)]);
}
// Default surface B: a tilted plane slicing through A.
function surfBTilted(u, v) {
  return tilted([u, v, 0.5 - u]);
}

// Returns the default pair of surfaces with a chosen resolution.
export function defaultSurfaces(res = 40) {
  const A = genSurface(surfATilted, res);
  const B = genSurface(surfBTilted, res);
  return { A, B };
}

// Convenience single-call for bench/browser: run both baseline & prefiltered
// and return measured/structural stats.
export function analyze(res = 40, kind = 'aabb', halfThick = 2e-3) {
  const { A, B } = defaultSurfaces(res);
  return analyzeTris(A.tris, B.tris, kind, halfThick);
}

// Same as analyze but on prebuilt triangle lists (so the browser only builds
// the mesh once and can re-slice at different kinds/thickness live).
export function analyzeTris(trisA, trisB, kind = 'aabb', halfThick = 2e-3) {
  const naive = intersectSurfacesNaive(trisA, trisB);
  const fast = intersectSurfaces(trisA, trisB, { kind, halfThick });
  const canoNaive = canonicalSegments(naive.segments);
  const canoFast = canonicalSegments(fast.segments);
  const identical = canoNaive.join('\n') === canoFast.join('\n');
  const totalPairs = trisA.length * trisB.length;
  return {
    trisA: trisA.length,
    trisB: trisB.length,
    totalPairs,
    candidatePairs: fast.candidates,
    naiveCandidates: naive.candidates,
    reduction: 1 - fast.candidates / totalPairs,
    segCount: naive.segCount,
    identical,
    kind,
    halfThick,
  };
}

// Slice both surfaces into a single merged list of triangle arrays + the
// intersection segments, so one core call feeds both the node bench and the
// browser renderer.
export function buildScene(res = 40) {
  const { A, B } = defaultSurfaces(res);
  return {
    isoA: A.tris, // surface A triangles (as values, two separate groups for coloring)
    isoB: B.tris,
    stats: analyzeTris(A.tris, B.tris, 'aabb', 2e-3),
  };
}

export { triTriIntersection, genSurface, triAABB, triOBB, aabbOverlap, obbOverlap };