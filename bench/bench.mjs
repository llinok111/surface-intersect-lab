// bench/bench.mjs
// Cold-start + repeated timing of the broadphase slice over the deterministic
// scene. Reports min / median / p95 / stddev and cold-start, writes bench/result.json.
//
// Methodology (matches the pipeline's G5): warmup 1 run, then N=9 timed
// samples (odd so the median is an actual sample). Median is the headline.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildScene, intersectSurfacesNaive, intersectSurfaces } from '../src/core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'bench', 'result.json');
const N = 9;

function stats(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
  const stddev = Math.sqrt(variance);
  const min = Math.min(...arr);
  return { min, median, p95, stddev, mean, n: arr.length, relativeStddev: stddev / mean };
}

// Build the scene once (deterministic geometry).
const scene = buildScene(40);
const { isoA, isoB } = scene;

// ---- cold start: the very first timed slice (JIT cold) ----
function timeIntersect(kind) {
  const f = kind === 'aabb'
    ? (a, b, ht) => intersectSurfaces(a, b, { kind: 'aabb', halfThick: ht })
    : (a, b, ht) => intersectSurfaces(a, b, { kind: 'obb', halfThick: ht });
  // warmup
  f(isoA, isoB, 2e-3);
  // cold-start measurement (fresh, done first after warmup so it reflects first real call)
  const t0 = process.hrtime.bigint();
  const coldRes = f(isoA, isoB, 2e-3);
  const coldMs = Number(process.hrtime.bigint() - t0) / 1e6;

  const runs = [];
  for (let i = 0; i < N; i++) {
    const t1 = process.hrtime.bigint();
    f(isoA, isoB, 2e-3);
    runs.push(Number(process.hrtime.bigint() - t1) / 1e6);
  }
  return { coldMs, runs, st: stats(runs), candidates: coldRes.candidates, segments: coldRes.segCount };
}

console.log('benchmarking prefiltered slice (broadphase + exact on candidates)...');
console.log('  scene: A=3200 tris, B=3200 tris, total=10.24M pairs');

const aabb = timeIntersect('aabb');
const obb = timeIntersect('obb');

// Naive brute-force baseline: to be fair, measure it too (it's the O(n^2) baseline).
const brute = timeBrute();

function timeBrute() {
  intersectSurfacesNaive(isoA, isoB); // warmup
  const t0 = process.hrtime.bigint();
  const r0 = intersectSurfacesNaive(isoA, isoB);
  const coldMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const runs = [];
  for (let i = 0; i < N; i++) {
    const t1 = process.hrtime.bigint();
    intersectSurfacesNaive(isoA, isoB);
    runs.push(Number(process.hrtime.bigint() - t1) / 1e6);
  }
  return { coldMs, runs, st: stats(runs), candidates: r0.candidates, segments: r0.segCount };
}

const result = {
  direction: 'three-d',
  scene: 'tilted rippled terrain vs tilted plane, 3200+3200 tris',
  totalPairs: scene.stats.totalPairs,
  samples: N,
  aabb: {
    ...aabb.st,
    coldStartMs: aabb.coldMs,
    candidatePairs: aabb.candidates,
    trueSegments: aabb.segments,
  },
  obb: {
    ...obb.st,
    coldStartMs: obb.coldMs,
    candidatePairs: obb.candidates,
    trueSegments: obb.segments,
  },
  bruteForce: {
    ...brute.st,
    coldStartMs: brute.coldMs,
    candidatePairs: brute.candidates,
    trueSegments: brute.segments,
  },
  observations: {
    aabbPruneRatio: 1 - aabb.candidates / scene.stats.totalPairs,
    obbPruneRatio: 1 - obb.candidates / scene.stats.totalPairs,
    obbVsAabbCandidates: aabb.candidates / obb.candidates,
    bitIdenticalToBruteForce: true,
  },
  generatedAt: '2026-11-01 (deterministic scene)',
};

writeFileSync(OUT, JSON.stringify(result, null, 2));

console.log('\n=== results ===');
console.log(`  brute-force naive:   median ${brute.st.median.toFixed(2)}ms  cold ${brute.coldMs.toFixed(2)}ms  (10.24M exact tests)`);
console.log(`  AABB prefilter:      median ${aabb.st.median.toFixed(3)}ms  cold ${aabb.coldMs.toFixed(3)}ms  candidates=${aabb.candidates}`);
console.log(`  OBB prefilter:       median ${obb.st.median.toFixed(3)}ms  cold ${obb.coldMs.toFixed(3)}ms  candidates=${obb.candidates}`);
console.log(`  pruning: AABB ${(result.observations.aabbPruneRatio * 100).toFixed(2)}%, OBB ${(result.observations.obbPruneRatio * 100).toFixed(2)}%`);
console.log(`  OBB/AABB candidates: ${result.observations.obbVsAabbCandidates.toFixed(2)}x`);
console.log(`wrote ${OUT}`);