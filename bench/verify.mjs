// bench/verify.mjs
// Behavioral assertions over the core module. All numbers are computed at
// runtime from the real geometry — nothing is hard-coded from a previous run.
// Exit 0 on success, 1 on any failure.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeTris, canonicalSegments,
  buildScene, intersectSurfaces, intersectSurfacesNaive,
} from '../src/core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataFile = join(__dirname, '..', 'data', 'sample-scene.json');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('  ok:', msg);
  }
}

console.log('== structural ==');
const s = buildScene(40);
assert(s.isoA.length === 3200, `A has 3200 tris (got ${s.isoA.length})`);
assert(s.isoB.length === 3200, `B has 3200 tris (got ${s.isoB.length})`);
assert(s.stats.totalPairs === 10240000, `10.24M total pairs (got ${s.stats.totalPairs})`);
assert(s.stats.identical === true, 'AABB slice is bit-identical to brute force');
assert(s.stats.segCount > 0, `has real intersection segments (got ${s.stats.segCount})`);

console.log('== soundness: prefilter never drops a true segment ==');
const naive = intersectSurfacesNaive(s.isoA, s.isoB);
assert(naive.segCount === s.stats.segCount, `candidate filter finds same ${s.stats.segCount} segments`);

console.log('== soundness: brute force and filtered are bit-identical ==');
const canoN = canonicalSegments(naive.segments);
for (const kind of ['aabb', 'obb']) {
  const fast = intersectSurfaces(s.isoA, s.isoB, { kind, halfThick: 2e-3 });
  const canoF = canonicalSegments(fast.segments);
  assert(canoN.join('\n') === canoF.join('\n'), `${kind} output bit-identical to brute force`);
  console.log(`    (${kind}: ${fast.candidates} candidates)`);
}

console.log('== prefilter actually prunes ==');
assert(s.stats.candidatePairs < s.stats.totalPairs, 'candidates < total pairs');
const reduction = s.stats.candidatePairs / s.stats.totalPairs;
assert(reduction < 0.01, `prunes ≥99% of pairs (ratio=${reduction.toFixed(6)})`);

console.log('== per-triangle comparator still exact ==');
// Two deliberately crossing triangles must yield a segment; two disjoint must not.
const { triTriIntersection } = await import('../src/core.mjs');
const crossA = [[0, 0, 0], [1, 0, 0], [0, 1, 0]];
const crossB = [[0, 0, -1], [1, 0, 0.5], [0, 1, -1]];
const seg = triTriIntersection(crossA, crossB);
assert(seg !== null, 'simple crossing pair yields a segment');
const disjointB = [[2, 2, 2], [3, 2, 2], [2, 3, 2]];
assert(triTriIntersection(crossA, disjointB) === null, 'disjoint pair yields null');

console.log('== dataset file is the same deterministic geometry ==');
const disk = JSON.parse(readFileSync(dataFile, 'utf8'));
const diskNaive = intersectSurfacesNaive(disk.isoA, disk.isoB);
const canoDisk = canonicalSegments(diskNaive.segments);
assert(canoDisk.join('\n') === canoN.join('\n'), 'data/sample-scene.json matches in-memory build');

console.log('== exact numbers actually observed ==');
console.log('  segments:', naive.segCount);
console.log('  candidatePairs:', s.stats.candidatePairs, '/', s.stats.totalPairs);
console.log('  reduction:', (s.stats.reduction * 100).toFixed(3) + '%');
console.log('  bit-identical:', s.stats.identical);

if (process.exitCode !== 1) {
  console.log('ALL CHECKS PASSED');
  process.exit(0);
} else {
  console.error('CHECKS FAILED');
  process.exit(1);
}