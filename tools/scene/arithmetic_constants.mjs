// The expected values of tests/scene/ArithmeticTest.cpp, computed by the JS model.
// node tools/scene/arithmetic_constants.mjs
// The helpers clock_frame.mjs and clock_camera.mjs do not export (rotations, normalize, dot,
// quotient, root) are copied here line for line; the model is not edited.
import * as cm from '../../References/model/clock_math.mjs';
import { cosf } from '../../References/model/ee_libm.mjs';
import { sineCosine, viewScreen } from '../../References/model/clock_camera.mjs';

const { f, add, sub, floatBits, asFloat, down, s16, sin, cos, apply, mul, unit, toInt, toUnsigned } = cm;
const hex = (x) => `0x${floatBits(x).toString(16).padStart(8, '0')}`;
const fnv = (list) => {
  let h = 0x811c9dc5;
  for (const x of list) { let u = floatBits(x); for (let k = 0; k < 4; k++) { h ^= u & 0xff; h = Math.imul(h, 0x01000193) >>> 0; u >>>= 8; } }
  return `0x${h.toString(16).padStart(8, '0')}`;
};

// clock_frame.mjs
const normalize = (v) => {
  const length = f(Math.sqrt(add(add(f(v[0] * v[0]), f(v[1] * v[1])), f(v[2] * v[2]))));
  const inverse = f(1 / length);
  return [f(v[0] * inverse), f(v[1] * inverse), f(v[2] * inverse)];
};
const dot = (a, b) => add(add(f(a[0] * b[0]), f(a[1] * b[1])), f(a[2] * b[2]));
const rotZ = (m, a) => { const c = cos(a), s = sin(a); return mul(m, [[c, s, 0, 0], [-s, c, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]); };
const rotY = (m, a) => { const c = cos(a), s = sin(a); return mul(m, [[c, 0, -s, 0], [0, 1, 0, 0], [s, 0, c, 0], [0, 0, 0, 1]]); };
const rotX = (m, a) => { const c = cos(a), s = sin(a); return mul(m, [[1, 0, 0, 0], [0, c, s, 0], [0, -s, c, 0], [0, 0, 0, 1]]); };
const move = (m, x, y, z) => [m[0], m[1], m[2], apply(m, [x, y, z, 1])];
// clock_camera.mjs
const root = (x) => { let r = f(Math.sqrt(Math.abs(x))); while (r * r > Math.abs(x)) r = down(r); return r; };
const quotient = (a, b) => { let q = f(a / b); while (q * b > a) q = down(q); return q; };

const out = {};
const table = Array.from({ length: 0x4001 }, (_, i) => sin(i));
out.table = { first: hex(table[0]), one: hex(table[1]), middle: hex(table[0x2000]), last: hex(table[0x4000]), hash: fnv(table) };
out.sincos = [0, 0x4000, 0x8000, -1, 0x2000, -0x2000, 0x6000, 12345, 70000].map((a) => [a, hex(sin(a)), hex(cos(a))]);
const sweep = [];
for (let a = -0x9000; a <= 0x9000; a += 7) sweep.push(sin(a), cos(a));
out.sincosHash = fnv(sweep);

out.cosf = [0, 0.5, 1, -1, 0.7853981, 1.5707964, -1.5707964, 2, 2.5, 3, 3.1415927, -3.1415927, 4, 10, 100, 200, 1e-5, 0.3]
  .map((x) => [hex(Math.fround(x)), hex(cosf(Math.fround(x)))]);
const cosines = [];
for (let i = 0; i <= 20000; i++) cosines.push(cosf(Math.fround(-201 + i * 0.0201)));
out.cosfHash = fnv(cosines);

// The generators of References/lib/ee-float.test.mjs.
let seed = 12345;
const random = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed; };
const single = (lo, hi) => { const e = lo + (random() % (hi - lo + 1)); return asFloat(((random() & 1) << 31) | (e << 23) | (random() & 0x7fffff)); };
const pair = () => {
  const a = single(60, 190);
  const gap = random() % 4 === 0 ? random() % 60 : random() % 30;
  const eb = Math.max(1, Math.min(254, ((floatBits(a) >>> 23) & 0xff) - gap));
  return [a, single(eb, eb)];
};
const sums = [];
for (let i = 0; i < 40000; i++) { const [a, b] = pair(); sums.push(add(a, b), sub(a, b)); }
out.addHash = fnv(sums);
const products = [];
for (let i = 0; i < 20000; i++) {
  const a = single(90, 160), b = single(90, 160);
  products.push(f(a * b), f(a / b), f(Math.sqrt(Math.abs(a))), quotient(Math.abs(a), Math.abs(b)), root(a));
}
out.productHash = fnv(products);

// Results past the singles: infinities, NaN, zero lengths.
out.special = {
  maxTimesTwo: hex(f(3.4028234663852886e38 * 2)),
  maxPlusMax: hex(add(3.4028234663852886e38, 3.4028234663852886e38)),
  cutJustAboveMax: hex(f(3.4028235e38)),
  cutPastMax: hex(f(3.4028236e38)),
  cutMinusPastMax: hex(f(-3.4028236e38)),
  oneOverZero: hex(f(1 / 0)),
  minusOneOverZero: hex(f(-1 / 0)),
  zeroOverZeroIsNaN: Number.isNaN(f(0 / 0)),
  quotientOneZero: hex(quotient(1, 0)),
  normalizeZeroIsNaN: normalize([0, 0, 0]).map(Number.isNaN),
  rootZero: hex(root(0)),
  minNormalHalf: hex(f(1.1754943508222875e-38 * 0.5)),
  minusMinNormalHalf: hex(f(-1.1754943508222875e-38 * 0.5)),
  addOneTiny: hex(add(1, -(2 ** -60))),
  cutOneTiny: hex(f(1 - 2 ** -60)),
};

const chain = [];
for (let i = 0; i < 12; i++) {
  let m = rotY(rotZ(unit(), 21845), 29976);
  m = rotZ(m, s16(Math.trunc((i << 16) / 12) - 0x8000));
  m = move(m, 0, 20, 0);
  m = rotY(m, s16(s16(29976) << 2));
  m = rotX(m, -1234 * i);
  chain.push(...m.flat());
}
out.chainHash = fnv(chain);
out.chainFirst = chain.slice(0, 16).map(hex);
const n = normalize([Math.fround(3.5), Math.fround(-1.25), Math.fround(0.1)]);
out.normalize = n.map(hex);
out.dot = hex(dot(n, [Math.fround(0.3), 2, Math.fround(-7.7)]));
out.sineCosine = [0x3cfdf3b6, 0x3e147ae1, 0, 0xbe147ae1, 0x3fc00000].map((u) => [hex(asFloat(u)), ...sineCosine(asFloat(u)).map(hex)]);
out.screen = viewScreen(512, 1, Math.fround(0.47), 2048, 2048, 1, 16777215, 1, 65536).map((row) => row.map(hex));
out.toInt = [1.5, -1.5, 3e9, -3e9, 0.99, -0.99].map((x) => [hex(Math.fround(x)), toInt(Math.fround(x)), toUnsigned(Math.fround(x))]);
console.log(JSON.stringify(out, null, 1));
