/**
 * Volume gate (PRD G5 / R-03): the whole shipped payload must stay under 20 KB
 * gzip. Run after `vite build`; exits non-zero so CI can block a regression.
 *
 * Usage: node scripts/size-gate.mjs [budgetBytes]
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET = Number(process.argv[2] ?? 20_000);
const dist = join(process.cwd(), 'dist');

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

let total = 0;
const rows = [];
for (const file of walk(dist)) {
  const raw = readFileSync(file);
  // Only text-ish assets count: images would be measured by their own bytes.
  const gzip = /\.(js|css|html|svg|json|webmanifest)$/.test(file)
    ? gzipSync(raw).length
    : raw.length;
  total += gzip;
  rows.push({ file: file.slice(dist.length + 1), raw: raw.length, gzip });
}

rows.sort((a, b) => b.gzip - a.gzip);
for (const row of rows) {
  console.log(
    `${String(row.gzip).padStart(7)} B gzip  ${String(row.raw).padStart(8)} B raw  ${row.file}`,
  );
}

const headroom = BUDGET - total;
console.log(
  `\ntotal ${total} B gzip / budget ${BUDGET} B (${headroom >= 0 ? `${headroom} B headroom` : `${-headroom} B OVER`})`,
);

if (statSync(dist).isDirectory() && total > BUDGET) {
  console.error('FAIL: bundle exceeds the PRD G5 budget');
  process.exit(1);
}
console.log('PASS: within the G5 volume budget');
