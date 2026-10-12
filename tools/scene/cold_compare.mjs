// The leaves of two start JSONs, side by side: piece, leaf, value in each, and whether they are equal.
// node cold_compare.mjs <a.json> <b.json>          only the leaves that differ, then the totals
// node cold_compare.mjs <a.json> <b.json> --all    every leaf
// A piece is a top-level key of the JSON (the pieces of References/scripts/start_origins.mjs); the totals count leaves the way
// start_origins.mjs --fields does (3813 leaves in the four start files).
import fs from 'node:fs';

export const leavesOf = (value, path = '', out = new Map()) => {
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) leavesOf(v, path ? (Array.isArray(value) ? `${path}[${k}]` : `${path}.${k}`) : k, out);
  } else out.set(path, value);
  return out;
};

export const splitLeaf = (path) => {
  const cut = path.search(/[.[]/);
  return cut < 0 ? [path, ''] : [path.slice(0, cut), path.slice(cut)];
};

export const compareLeaves = (a, b) => {
  const left = leavesOf(a);
  const right = leavesOf(b);
  const rows = [];
  for (const path of new Set([...left.keys(), ...right.keys()])) {
    const [piece, leaf] = splitLeaf(path);
    const x = left.get(path);
    const y = right.get(path);
    rows.push({ piece, leaf, a: x, b: y, equal: JSON.stringify(x) === JSON.stringify(y) });
  }
  return rows;
};

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const [fa, fb, flag] = process.argv.slice(2);
  if (!fa || !fb) {
    console.error('usage: node cold_compare.mjs <a.json> <b.json> [--all]');
    process.exit(2);
  }
  const rows = compareLeaves(JSON.parse(fs.readFileSync(fa, 'utf8')), JSON.parse(fs.readFileSync(fb, 'utf8')));
  let different = 0;
  for (const r of rows) {
    if (!r.equal) different++;
    if (!r.equal || flag === '--all') console.log(`${r.piece}\t${r.leaf}\t${JSON.stringify(r.a)}\t${JSON.stringify(r.b)}\t${r.equal ? '=' : '!'}`);
  }
  console.log(`${rows.length} leaves, ${different} differ`);
}
