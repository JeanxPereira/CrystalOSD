// The view matrix, bit for bit: recompute what the view matrix builder leaves behind from the
// position, direction, up vector and rotation it was handed, with the library's own arithmetic
// (libvu0, VU0 macro mode: every multiply and every add cut toward zero on its own).
//
//   builder                HDD module_clock_238DC0   ROM 0x00235360
//   sceVu0RotMatrixX/Y/Z   HDD 0x0027B288/330/1E0    ROM 0x002734A8/400/550
//   _sceVu0ecossin         HDD 0x0027B168            ROM 0x002735F8   (S5432 at 0x0032C9C0 / 0x002AE2D0)
//   sceVu0ApplyMatrix      HDD 0x0027AE18            ROM 0x002738E8
//   sceVu0CameraMatrix     HDD 0x0027B450            ROM 0x002732D8
//   sceVu0OuterProduct     HDD 0x0027AE90            ROM 0x00273880
//   sceVu0Normalize        HDD 0x0027AED8            ROM 0x0027381C
//   sceVu0TransMatrix      HDD 0x0027B098            ROM 0x002736F0
//   sceVu0InversMatrix     HDD 0x0027AF60            ROM 0x00273768
//
// node verify_view_matrix.mjs <trace.jsonl> ...
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { pick, pc, BUILD_NAME } from './builds.mjs';

// The builder's entry, and the instruction after its last call (the result pointer is still in s5).
const A = pick({ rom: { builder: 0x00235360, built: 0x0023541c }, hdd: { builder: 0x00238dc0, built: 0x00238e7c } });
export const PROBES = [
  { pc: pc(A.builder), ranges: ['a1:0x10', 'a2:0x10', 'a3:0x10', 't0:0x10'] },
  { pc: pc(A.built), ranges: ['s5:0x40', 'sp:0x70'] },
];

const bits = new DataView(new ArrayBuffer(4));
const down = (x) => { bits.setFloat32(0, x); bits.setUint32(0, bits.getUint32(0) - 1); return bits.getFloat32(0); };
/** A double result cut toward zero to single precision. */
const f = (x) => {
  const near = Math.fround(x);
  return Math.abs(near) <= Math.abs(x) || !Number.isFinite(near) ? near : down(near);
};
/** Square root cut toward zero (vsqrt takes the absolute value). */
const root = (x) => { let r = f(Math.sqrt(Math.abs(x))); while (r * r > Math.abs(x)) r = down(r); return r; };
/** Quotient of two positive floats cut toward zero. */
const quotient = (a, b) => { let q = f(a / b); while (q * b > a) q = down(q); return q; };
const asFloat = (u32) => { bits.setUint32(0, u32); return bits.getFloat32(0); };

// S5432: the four coefficients of _sceVu0ecossin, as x, y, z, w. The same words in both builds.
const S = [0x362e9c14, 0xb94fb21f, 0x3c08873e, 0xbe2aaaa4].map(asFloat);
const HALF_PI = asFloat(0x3fc90fdb);

/** _sceVu0ecossin behind sceVu0RotMatrix*: [sine, cosine] of an angle in radians. */
export function sineCosine(angle) {
  const negative = angle < 0;
  const t = negative ? f(HALF_PI + angle) : f(HALF_PI - angle);
  const t2 = f(t * t);
  let v = S.map((c) => f(f(c * t) * t2));            // S * t^3
  for (const i of [0, 1, 2]) v[i] = f(v[i] * t2);    // x, y, z: t^5
  let sum = f(t + v[3]);
  for (const i of [0, 1]) v[i] = f(v[i] * t2);       // x, y: t^7
  sum = f(sum + v[2]);
  v[0] = f(v[0] * t2);                               // x: t^9
  sum = f(sum + v[1]);
  sum = f(sum + v[0]);
  const cosine = f(0 + sum);                         // sin(pi/2 -+ angle)
  const q = f(0 + root(f(1 - f(cosine * cosine))));
  return [negative ? f(0 - q) : f(0 + q), cosine];
}

/** rows[0] * v.x + rows[1] * v.y + rows[2] * v.z + rows[3] * v.w, as vmulax / vmadday / vmaddaz / vmaddw. */
const combine = (rows, v) => [0, 1, 2, 3].map((i) => f(f(f(f(rows[0][i] * v[0]) + f(rows[1][i] * v[1])) + f(rows[2][i] * v[2])) + f(rows[3][i] * v[3])));
const rotate = (rows, m) => m.map((row) => combine(rows, row));
const rotX = (m, a) => { const [s, c] = sineCosine(a); return rotate([[1, 0, 0, 0], [0, c, s, 0], [0, f(0 - s), c, 0], [0, 0, 0, 1]], m); };
const rotY = (m, a) => { const [s, c] = sineCosine(a); return rotate([[c, 0, f(0 - s), 0], [0, 1, 0, 0], [s, 0, c, 0], [0, 0, 0, 1]], m); };
const rotZ = (m, a) => { const [s, c] = sineCosine(a); return rotate([[c, s, 0, 0], [f(0 - s), c, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]], m); };

/** sceVu0OuterProduct: vopmula then vopmsub; w is cleared. */
const outer = (a, b) => [f(f(a[1] * b[2]) - f(b[1] * a[2])), f(f(a[2] * b[0]) - f(b[2] * a[0])), f(f(a[0] * b[1]) - f(b[0] * a[1])), 0];
/** sceVu0Normalize: x*x + y*y, + z*z; Q = sqrt; Q = 1 / that; xyz * Q; w is cleared. */
const normalize = (v) => {
  const length = f(0 + root(f(f(f(v[0] * v[0]) + f(v[1] * v[1])) + f(v[2] * v[2]))));
  const q = quotient(1, length);
  return [f(v[0] * q), f(v[1] * q), f(v[2] * q), 0];
};

/** What the builder computes: the rotation, the three rotated vectors, the view matrix. */
export function build(position, direction, up, rotation) {
  let m = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  m = rotZ(rotY(rotX(m, rotation[0]), rotation[1]), rotation[2]);
  const zd = combine(m, direction), yd = combine(m, up), p = combine(m, position);
  // sceVu0CameraMatrix
  const x = normalize(outer(yd, zd));
  const z = normalize(zd);
  const y = outer(z, x);
  const t = [f(0 + p[0]), f(0 + p[1]), f(0 + p[2]), 1];
  // sceVu0InversMatrix: the upper three rows transposed with w cleared, the last row turned back.
  const rows = [0, 1, 2].map((i) => [x[i], y[i], z[i], 0]);
  const back = [0, 1, 2].map((i) => f(0 - f(f(f(rows[0][i] * t[0]) + f(rows[1][i] * t[1])) + f(rows[2][i] * t[2]))));
  return { rotation: m, zd, yd, p, view: [...rows, [...back, t[3]]] };
}

const vector = (bytes, at = 0) => [0, 4, 8, 12].map((k) => bytes.readFloatLE(at + k));
const matrix = (bytes, at = 0) => [0, 1, 2, 3].map((r) => vector(bytes, at + r * 16));

export function verify(files) {
  const count = { calls: 0, rotation: [0, 0], vectors: [0, 0], view: [0, 0] };
  const distinct = new Set(), problems = [];
  let sample = null;
  const same = (got, want) => got.flat().every((x, i) => Object.is(x, want.flat()[i]));
  for (const file of files) {
    const probes = readTrace(file).probes;
    for (let n = 0; n + 1 < probes.length; n++) {
      const entry = probes[n], exit = probes.slice(n + 1).find((probe) => probe.pc === A.built || probe.pc === A.builder);
      if (entry.pc !== A.builder || !exit || exit.pc !== A.built) continue;
      if (entry.mem.some((m) => !m.bytes) || exit.mem.some((m) => !m.bytes)) continue;
      const [position, direction, up, rotation] = entry.mem.map((m) => vector(m.bytes));
      const want = build(position, direction, up, rotation);
      const stack = exit.mem[1].bytes;
      count.calls += 1;
      distinct.add(exit.mem[0].bytes.toString('hex'));
      const checks = [
        ['rotation', matrix(stack, 0), want.rotation],
        ['vectors', [vector(stack, 0x40), vector(stack, 0x50), vector(stack, 0x60)], [want.zd, want.yd, want.p]],
        ['view', matrix(exit.mem[0].bytes), want.view],
      ];
      for (const [name, got, expected] of checks) {
        count[name][1] += 1;
        if (same(got, expected)) count[name][0] += 1;
        else if (problems.length < 6) problems.push(`frame ${entry.frame} ${name}:\n    written  ${got.flat().join(' ')}\n    computed ${expected.flat().join(' ')}`);
      }
      sample ??= { frame: entry.frame, position, direction, up, rotation, view: want.view };
    }
  }
  return { count, distinct: distinct.size, problems, sample };
}

if (process.argv[1] && process.argv[1].endsWith('verify_view_matrix.mjs')) {
  const result = verify(process.argv.slice(2));
  console.log(`build: ${BUILD_NAME}   builder calls: ${result.count.calls}   distinct view matrices: ${result.distinct}`);
  if (result.sample) {
    const s = result.sample;
    console.log(`  first call, frame ${s.frame}: position ${s.position.join(', ')}  direction ${s.direction.join(', ')}  up ${s.up.join(', ')}  rotation ${s.rotation.join(', ')}`);
    for (const angle of s.rotation.slice(0, 3)) console.log(`  angle ${angle}: sine, cosine = ${sineCosine(angle).join(', ')}`);
    for (const row of s.view) console.log('  ' + row.map((x) => String(x).padStart(24)).join(''));
  }
  let whole = result.count.calls > 0;
  for (const name of ['rotation', 'vectors', 'view']) {
    console.log(`  ${name.padEnd(10)} ${result.count[name][0]} of ${result.count[name][1]} equal`);
    if (result.count[name][0] !== result.count[name][1]) whole = false;
  }
  for (const text of result.problems) console.log(`  ! ${text}`);
  console.log(`verdict: ${whole ? `FOUND ${result.count.calls} view matrices (${result.distinct} distinct), every element equal bit for bit` : 'PARTIAL the reading does not reproduce the view matrix'}`);
  process.exit(whole ? 0 : 3);
}
