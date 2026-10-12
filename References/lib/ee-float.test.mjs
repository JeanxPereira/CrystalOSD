// node --test References/lib/
// The float operations against an exact oracle (BigInt rationals), and against results the EE
// produced in real captures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { f, add, sub, mul, div, sqrt, floatBits, asFloat, MAX, MIN_NORMAL } from './ee-float.mjs';
import { loadTrace } from './trace.mjs';

// ---- the oracle: a single as m * 2^e with BigInt m, and the cut of an exact rational ----

function exact(x) {
  const u = floatBits(x);
  const sign = u >>> 31 ? -1n : 1n;
  const exponent = (u >>> 23) & 0xff;
  const fraction = BigInt(u & 0x7fffff);
  if (exponent === 0) return { m: 0n, e: 0 };
  return { m: sign * ((1n << 23n) | fraction), e: exponent - 150 };
}
const bitLength = (n) => (n === 0n ? 0 : n.toString(2).length);
/** The single nearest zero of p / q (q > 0), saturated and flushed as the EE does. */
function cut(p, q, negativeZero = false) {
  if (p === 0n) return negativeZero ? -0 : 0;
  const negative = p < 0n;
  let a = negative ? -p : p;
  // Scale so the integer quotient carries at least 26 bits.
  let shift = 26 - (bitLength(a) - bitLength(q));
  const scaled = shift >= 0 ? (a << BigInt(shift)) / q : a / (q << BigInt(-shift));
  const length = bitLength(scaled);
  const drop = length - 24;
  const mantissa = drop > 0 ? scaled >> BigInt(drop) : scaled << BigInt(-drop);
  const exponent = drop - shift;
  const top = length - 1 - shift;
  let value;
  if (top > 127) value = MAX;
  else if (top < -126) value = 0;
  else value = Number(mantissa) * 2 ** exponent;
  if (value === 0) return negative ? -0 : 0;
  return negative ? -value : value;
}
function oracleAdd(a, b) {
  const x = exact(a), y = exact(b);
  const e = Math.min(x.e, y.e);
  const p = (x.m << BigInt(x.e - e)) + (y.m << BigInt(y.e - e));
  if (p === 0n) return Object.is(a, -0) && Object.is(b, -0) ? -0 : 0;
  return e >= 0 ? cut(p << BigInt(e), 1n) : cut(p, 1n << BigInt(-e));
}
function oracleMul(a, b) {
  const x = exact(a), y = exact(b);
  const p = x.m * y.m, e = x.e + y.e;
  const negativeZero = (a < 0 || Object.is(a, -0)) !== (b < 0 || Object.is(b, -0));
  if (p === 0n) return negativeZero ? -0 : 0;
  return e >= 0 ? cut(p << BigInt(e), 1n) : cut(p, 1n << BigInt(-e));
}
function oracleDiv(a, b) {
  const x = exact(a), y = exact(b);
  let p = x.m, q = y.m;
  if (q < 0n) { p = -p; q = -q; }
  const e = x.e - y.e;
  return e >= 0 ? cut(p << BigInt(e), q) : cut(p, q << BigInt(-e));
}
function isqrt(n) {
  if (n < 2n) return n;
  let x = BigInt(Math.floor(Math.sqrt(Number(n))));
  while (x * x > n) x -= 1n;
  while ((x + 1n) * (x + 1n) <= n) x += 1n;
  return x;
}
function oracleSqrt(a) {
  const x = exact(Math.abs(a));
  if (x.m === 0n) return 0;
  let m = x.m, e = x.e;
  if (e % 2 !== 0) { m <<= 1n; e -= 1; }
  // sqrt(m * 2^e) = sqrt(m * 2^60) * 2^(e/2 - 30)
  const root = isqrt(m << 60n);
  const half = e / 2 - 30;
  return half >= 0 ? cut(root << BigInt(half), 1n) : cut(root, 1n << BigInt(-half));
}

// ---- random singles: normal values with nearby and distant exponents ----

let seed = 12345;
const random = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed; };
function single(exponentLow = 1, exponentHigh = 254) {
  const exponent = exponentLow + (random() % (exponentHigh - exponentLow + 1));
  return asFloat(((random() & 1) << 31) | (exponent << 23) | (random() & 0x7fffff));
}
function pair() {
  const a = single(60, 190);
  const gap = random() % 4 === 0 ? random() % 60 : random() % 30;
  const ea = (floatBits(a) >>> 23) & 0xff;
  const eb = Math.max(1, Math.min(254, ea - gap));
  return [a, single(eb, eb)];
}
const same = (x, y) => Object.is(x, y) || (x === 0 && y === 0 && Object.is(x, y));

test('add and sub equal the exact sum cut toward zero', () => {
  for (let i = 0; i < 40000; i++) {
    const [a, b] = pair();
    assert.ok(same(add(a, b), oracleAdd(a, b)), `add(${a}, ${b}): ${add(a, b)} vs ${oracleAdd(a, b)}`);
    assert.ok(same(sub(a, b), oracleAdd(a, -b)), `sub(${a}, ${b})`);
  }
});

test('the old helper f(a + b) loses an addend far below the other; add does not', () => {
  const a = 1, b = -(2 ** -60);
  assert.equal(f(a + b), 1);
  assert.equal(add(a, b), asFloat(0x3f7fffff));
});

test('mul, div and sqrt equal the exact results cut toward zero', () => {
  for (let i = 0; i < 20000; i++) {
    const a = single(90, 160), b = single(90, 160);
    assert.ok(same(mul(a, b), oracleMul(a, b)), `mul(${a}, ${b})`);
    assert.ok(same(div(a, b), oracleDiv(a, b)), `div(${a}, ${b}): ${div(a, b)} vs ${oracleDiv(a, b)}`);
    assert.ok(same(sqrt(a), oracleSqrt(a)), `sqrt(${a})`);
  }
});

test('no denormals and no infinities', () => {
  assert.ok(Object.is(mul(MIN_NORMAL, 0.5), 0));
  assert.ok(Object.is(mul(-MIN_NORMAL, 0.5), -0));
  assert.equal(mul(MAX, 2), MAX);
  assert.equal(add(MAX, MAX), MAX);
  assert.equal(div(1, 0), MAX);
  assert.equal(div(-1, 0), -MAX);
});

// Results the EE produced: the camera's approach offset times its factor each frame, and the
// position plus the offset, from the boot captures of both builds.
const CAPTURES = 'D:/CodingProjects/Watson/Runtime/captures';
for (const [name, camera, builder, done] of [
  ['hddosd-110U-boot-approach', 0x00225f38, 0x00238dc0, 0x00225ff8],
  ['rom-0230A-boot-approach', 0x00221610, 0x00235360, 0x002216d0],
  ['rom-0230E-pal-boot-approach', 0x00221610, 0x00235360, 0x002216d0],
]) {
  const file = `${CAPTURES}/${name}.trace.jsonl`;
  test(`the EE's own results in ${name}`, { skip: !fs.existsSync(file) && !fs.existsSync(`${file}.gz`) }, () => {
    const probes = loadTrace(file).probes;
    let steps = 0;
    for (let n = 0; n + 2 < probes.length; n++) {
      if (probes[n].pc !== camera || probes[n + 1].pc !== builder || probes[n + 2].pc !== done) continue;
      const offset = probes[n].mem[0].bytes.readFloatLE(0);
      const factor = probes[n].mem[2].bytes.readFloatLE(0);
      const z = probes[n].mem[1].bytes.readFloatLE(8);
      assert.ok(Object.is(probes[n + 2].mem[0].bytes.readFloatLE(0), mul(offset, factor)), `frame ${probes[n].frame}`);
      assert.ok(Object.is(probes[n + 1].mem[0].bytes.readFloatLE(8), add(z, offset)), `frame ${probes[n].frame}`);
      steps += 1;
    }
    assert.ok(steps > 100);
  });
}
