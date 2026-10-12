// The expected values of tests/scene/ArithmeticTest.cpp and tests/scene/opening/Vu0Test.cpp, computed by the JS model:
// opening-libm.mjs (sinf, cosf) and opening-lib.mjs (exact add, sub, quotient, root and the libvu0 routines), on fixed
// inputs. No Sony data: every input is a constant of this file or a seeded pseudo-random single.
// The models read the hddosd.elf of the data home (CRYSTALOSD_DATA).
//   node tools/scene/opening_vectors.mjs [out.json] [random sine count]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REFERENCES = new URL('../../References', import.meta.url).href;
const lib = await import(`${REFERENCES}/model/opening-lib.mjs`);
const { sinf, cosf } = await import(`${REFERENCES}/model/opening-libm.mjs`);
const { clipAll } = await import(`${REFERENCES}/scripts/verify_opening_lights_v2.mjs`);

const { f, add, sub, quotient, root, asBits, asFloat, mulMatrix, rotMatrix, transMatrix, subVector, cameraMatrix, viewScreenMatrix, sineCosine, unit } = lib;
const fr = (v) => (Array.isArray(v) ? v.map(fr) : typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fr(x)])) : Math.fround(v));
const hex = (x) => `0x${asBits(x).toString(16).padStart(8, '0')}`;
const hexes = (list) => list.flat().map(hex);

let seed = 0x1234567;
const next = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0);
const unitRandom = () => next() / 4294967296;
const single = (low, high) => Math.fround((unitRandom() * 2 - 1) * (low + unitRandom() * (high - low)));
const vector = (scale) => [0, 1, 2, 3].map(() => single(0, scale));
const matrix = (scale) => [0, 1, 2, 3].map(() => vector(scale));

const PI = Math.fround(Math.PI), HALF_PI = Math.fround(Math.PI / 2);
const sinArguments = [
  0, -0, 1e-9, -1e-9, Math.fround(HALF_PI - 1e-7), HALF_PI, PI, Math.fround(2 * PI), 2.6, -2.6, 0.5, -0.5, 1, -1, 3, 4, 5, 6, 10, 50,
  Math.fround(HALF_PI - 0.003), Math.fround(HALF_PI + 0.003), Math.fround(HALF_PI - 0.006), Math.fround(HALF_PI + 0.006), Math.fround(HALF_PI * 3 - 0.004),
  Math.fround(100 * HALF_PI), Math.fround(-100 * HALF_PI), Math.fround(127 * HALF_PI), asFloat(0x43490f7f), asFloat(0x43490f80),
  asFloat(0xc3490f80), asFloat(0x3f490fd8), asFloat(0x3f490fd9), asFloat(0x4016cbe3), asFloat(0x4016cbe4),
];
for (let k = 1; k <= 64; k++) sinArguments.push(Math.fround(k * HALF_PI), Math.fround(-k * HALF_PI + 1e-5));

const randomSines = Number(process.argv[3] ?? 160);
for (let i = 0; i < randomSines; i++) sinArguments.push(Math.fround((unitRandom() * 2 - 1) * 200));

const out = {
  note: 'bit patterns of single-precision values; produced by tools/scene/opening_vectors.mjs from References/model/opening-lib.mjs and opening-libm.mjs',
  sinCos: sinArguments.map(fr).map((x) => ({ x: hex(x), sin: hex(sinf(x)), cos: hex(cosf(x)) })),
};

const sums = [[1, 1e-22], [1, -1e-22], [-1, 1e-22], [-1, -1e-22], [1.5, 1e-30], [1.5, -1e-30], [3.4028234663852886e38, 1e30], [3.4028234663852886e38, 3.4028234663852886e38], [1, 0], [0, 0], [-0, -0], [1, -1]];
for (let i = 0; i < 80; i++) {
  const a = single(0, 1e3), small = i % 3 === 0 ? 1e-22 * (1 + unitRandom()) : single(0, 1e3);
  sums.push([a, Math.fround(small)]);
}
out.sums = sums.map(([a, b]) => ({ a: hex(Math.fround(a)), b: hex(Math.fround(b)), add: hex(add(Math.fround(a), Math.fround(b))), sub: hex(sub(Math.fround(a), Math.fround(b))) }));

const quotients = [[1, 3], [7, 3], [-7, 3], [7, -3], [1, 0], [-1, 0], [1, -0], [-1, -0], [0, 0], [-0, 0], [0, 1], [1, 1], [10, 3], [2, 3], [1, 65536]];
for (let i = 0; i < 60; i++) quotients.push([single(0, 1e4), single(0, 1e4)]);
out.quotients = quotients.map(([a, b]) => ({ a: hex(Math.fround(a)), b: hex(Math.fround(b)), q: hex(quotient(Math.fround(a), Math.fround(b))) }));

const roots = [0, 1, 2, 3, 4, 0.5, 1e-10, 12345.678, -4, -2];
for (let i = 0; i < 60; i++) roots.push(Math.abs(single(0, 1e4)));
out.roots = roots.map((x) => ({ x: hex(Math.fround(x)), r: hex(root(Math.fround(x))) }));

const angleSets = fr([[0.5, -1.25, 2], [Math.fround(HALF_PI - 0.003), 3.1, -0.1], [PI, -PI, Math.fround(HALF_PI + 0.004)], [0, 0, 0], [100, -57.5, 12.25]]);
for (let i = 0; i < 4; i++) angleSets.push([single(0, 6), single(0, 6), single(0, 6)]);
out.sineCosine = angleSets.flat().map((a) => { const [s, c] = sineCosine(a); return { angle: hex(a), sine: hex(s), cosine: hex(c) }; });
out.rotMatrix = angleSets.map((angles, i) => {
  const m = i % 2 === 0 ? unit() : matrix(2);
  const rot = [...angles, 0];
  return { m: hexes(m), angles: hexes(rot), out: hexes(rotMatrix(m, rot)) };
});

out.mulMatrix = [0, 1, 2, 3, 4, 5].map(() => { const a = matrix(8), b = matrix(8); return { a: hexes(a), b: hexes(b), out: hexes(mulMatrix(a, b)) }; });
out.transMatrix = [0, 1, 2, 3].map(() => { const m = matrix(8), t = vector(1e3); return { m: hexes(m), t: hexes([t]), out: hexes(transMatrix(m, t)) }; });
out.subVector = [0, 1, 2, 3].map(() => { const a = vector(100), b = vector(100); return { a: hexes([a]), b: hexes([b]), out: hexes([subVector(a, b)]) }; });
out.cameraMatrix = fr([
  { p: [0, 0, 0, 1], z: [0, 0, 1, 0], y: [0, 1, 0, 0] },
  { p: [1.5, -2.25, 0, 1], z: [0.25, 0, 3, 0], y: [0, 1, 0, 0] },
  { p: [0, 0, 0, 1], z: [0, 0, 0, 0], y: [0, 1, 0, 0] },
  { p: [3, 4, -50, 1], z: [0.3, -0.2, 0.9, 0], y: [0.1, 0.9, -0.05, 0] },
  { p: [-120.5, 33.25, 7, 1], z: [1, 2, 3, 0], y: [0, 1, 0, 0] },
]).map(({ p, z, y }) => ({ p: hexes([p]), z: hexes([z]), y: hexes([y]), out: hexes(cameraMatrix(p, z, y)) }));
out.viewScreenMatrix = [
  [1024, 1, 0.5625, 2048, 2048, 1, 16777215, 1, 65536],
  [1024, 1, 0.469, 2048, 2048, 1, 16777215, 1, 65536],
  [1024, 1, 1, 2048, 2048, 1, 8388607, 1, 65536],
  [512, 0.75, 0.5, 1000, 800, 10, 1000, 2, 4096],
].map((args) => ({ args: args.map((x) => hex(Math.fround(x))), out: hexes(viewScreenMatrix(...args.map(Math.fround))) }));

const normal = (l) => l.map((x) => f(x * -1));
const normalize = (v) => { const length = root(add(add(f(v[0] * v[0]), f(v[1] * v[1])), f(v[2] * v[2]))); const q = quotient(1, length); return [f(v[0] * q), f(v[1] * q), f(v[2] * q), 0]; };
const normalLight = (l0, l1, l2) => { const rows = [l0, l1, l2].map((l) => normalize(normal(l))); rows.push([0, 0, 0, 1]); return [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => rows[c][r])); };
out.normalLightMatrix = fr([
  [[0, 0, 1, 0], [0, 1, 0, 0], [1, 0, 0, 0]],
  [[0.5, 0.5, -0.5, 0], [-0.25, 0.75, 0.5, 0], [0.1, -0.9, 0.3, 0]],
  [[0, 0, 0, 0], [1, 1, 1, 0], [-3, 2, 1, 0]],
]).map(([l0, l1, l2]) => ({ l0: hexes([l0]), l1: hexes([l1]), l2: hexes([l2]), out: hexes(normalLight(l0, l1, l2)) }));

const cube = fr([-1.8, 1.8].flatMap((x) => [-1.8, 1.8].flatMap((y) => [-1.8, 1.8].map((z) => [x, y, z, 1]))));
const clipCases = fr([
  { min: [-1, -1, 0, 0.5], max: [1, 1, 0, 100], m: unit(), vertices: [[0.5, 0.5, 0, 2]] },
  { min: [-1, -1, 0, 0.5], max: [1, 1, 0, 100], m: unit(), vertices: [[5, 5, 0, 2], [0.5, 0.5, 0, 200]] },
  { min: [-1, -1, 0, 0.5], max: [1, 1, 0, 100], m: unit(), vertices: [[0.5, 0.5, 0, 2], [5, 5, 0, 2]] },
  { min: [-2048, -2048, 0, 1], max: [2048, 2048, 0, 65536], m: matrix(3), vertices: cube },
  { min: [-2048, -2048, 0, 1], max: [2048, 2048, 0, 65536], m: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 1], [0, 0, 20, 1]], vertices: cube },
  { min: [-2048, -2048, 0, 1], max: [2048, 2048, 0, 65536], m: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 1], [0, 0, -20, 1]], vertices: cube },
]);
out.clipAll = clipCases.map(({ min, max, m, vertices }) => ({ min: hexes([min]), max: hexes([max]), m: hexes(m), vertices: hexes(vertices), clipped: clipAll(min, max, m, vertices) }));

const target = process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../../tests/scene/opening/vu0_vectors.json');
fs.writeFileSync(target, `${JSON.stringify(out)}\n`);
console.log(`${Object.entries(out).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `${k} ${v.length}`).join(', ')} in ${target}`);
