// tools/gen-sample.mjs
// Deterministically generates the sample intersection scene into data/.
// Run: `node tools/gen-sample.mjs`
// Output file is exported by core's buildScene so both node bench and the
// browser consume the exact same geometry.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildScene, canonicalSegments, intersectSurfaces, analyzeTris } from '../src/core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'data');
mkdirSync(outDir, { recursive: true });

const RES = 40;
const scene = buildScene(RES);

// Deterministic: compute the AABB fast slice and serialize both surfaces + stats.
const stats = analyzeTris(scene.isoA, scene.isoB, 'aabb', 2e-3);

const payload = {
  source: 'gen-sample.mjs',
  generatedAt: 'deterministic', // no timestamp: byte-identical across runs
  resolution: RES,
  isoA: scene.isoA,
  isoB: scene.isoB,
  stats,
};

const file = join(outDir, 'sample-scene.json');
writeFileSync(file, JSON.stringify(payload));
console.log(`wrote ${file}`);
console.log(`  isoA=${scene.isoA.length} tris, isoB=${scene.isoB.length} tris`);
console.log(`  totalPairs=${stats.totalPairs}, candidates=${stats.candidatePairs}`);
console.log(`  reduction=${(stats.reduction * 100).toFixed(2)}%, segCount=${stats.segCount}, bit-identical=${stats.identical}`);