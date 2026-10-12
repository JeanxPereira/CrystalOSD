// The background of the clock: sixteen strips of a tube seen from inside.
// Recomputes every register the strip function sends from what it was handed (the two matrices,
// the two angles, the radius, the frame counter, the base grey) and compares bit for bit.
//
//   background   HDD 0x00233338   ticks the grey ramp, sets the grey, draws when the overlay mode is 0
//   strips       HDD 0x002332b0   binds the texture; 16 x (primitive, strip)
//   primitive    HDD 0x00232888   PRIM = 0x1c (strip, shaded, textured, ST) and CLAMP_1 = 0 (repeat)
//   strip        HDD 0x00233110   (view, screen, angle, angle + 0x1000, radius): 33 ring pairs + the closing pair
//
// node verify_background.mjs <trace.jsonl>
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { GifPath } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/gif.js';
import { pick, range, pc, BUILD_NAME } from './builds.mjs';

const A = pick({
  rom: { background: 0x0022f698, strips: 0x0022f610, strip: 0x0022f470, prim: 0x0022eb20, ramp: 0x00296c90, length: 0x002c8904, mode: 0x002c8f6c, greys: 0x002c8f60, counter: 0x002c88f8, constants: 0x002c81b8 },
  hdd: { background: 0x00233338, strips: 0x002332b0, strip: 0x00233110, prim: 0x00232888, ramp: 0x002b5cd0, length: 0x003702e0, mode: 0x00370ab4, greys: 0x00370aa8, counter: 0x003702d4, constants: 0x0036fc14 },
});
export const PROBES = [
  { pc: pc(A.background), ranges: [range(A.ramp, 0x10), range(A.mode, 4), range(A.greys, 0xc), range(A.length, 4)] },
  { pc: pc(A.strips), ranges: [] },
  { pc: pc(A.prim), ranges: [] },
  { pc: pc(A.strip), ranges: ['a0:0x40', 'a1:0x40', range(A.counter, 4), range(A.greys, 0xc), range(A.constants, 0x20)] },
];

const R = { PRIM: 0x00, RGBAQ: 0x01, ST: 0x02, XYZF2: 0x04, CLAMP: 0x08 };
const bits = new DataView(new ArrayBuffer(4));
/** One single-precision operation cut toward zero, as the EE's FPU and VU0 do it. */
export const f = (x) => {
  const near = Math.fround(x);
  if (Math.abs(near) <= Math.abs(x) || !Number.isFinite(near)) return near;
  bits.setFloat32(0, near);
  bits.setUint32(0, bits.getUint32(0) - 1);
  return bits.getFloat32(0);
};
const floatBits = (x) => { bits.setFloat32(0, x); return bits.getUint32(0); };
const asFloat = (u32) => { bits.setUint32(0, u32 >>> 0); return bits.getFloat32(0); };
export const toInt = (x) => (x >= 2147483647 ? 2147483647 : x <= -2147483648 ? -2147483648 : Math.trunc(x));
const big = (x) => BigInt.asUintN(64, BigInt(x));
const vector = (buffer, at) => [0, 4, 8, 12].map((k) => buffer.readFloatLE(at + k));
const matrix = (buffer, at) => [0, 16, 32, 48].map((k) => vector(buffer, at + k));

// The clock's sine: a quarter wave of 0x4001 floats, table[i] = (float) sin(i * (pi / 2) / 16385).
const TABLE = Float32Array.from({ length: 0x4001 }, (_, i) => Math.sin((i * 1.5707963267948966) / 16385));
const s16 = (x) => (x << 16) >> 16;
export const sin = (angle) => { const a = s16(angle); let v = a < 0 ? -a : a; if (v >= 0x4000) v = 0x8000 - v; return a < 0 ? -TABLE[v] : TABLE[v]; };
export const cos = (angle) => sin(s16(angle) + 0x4000);

// sceVu0ApplyMatrix: VMULAx, VMADDAy, VMADDAz, VMADDw.
const apply = (m, v) => [0, 1, 2, 3].map((i) => f(f(f(f(m[0][i] * v[0]) + f(m[1][i] * v[1])) + f(m[2][i] * v[2])) + f(m[3][i] * v[3])));
/** Screen matrix, then every component times 1/w. Returns [vector, 1/w]. */
const project = (screen, v) => { const p = apply(screen, v); const q = f(1 / p[3]); return [p.map((x) => f(x * q)), q]; };
const rgbaq = (r, g, b, q) => big(BigInt(r) | (BigInt(floatBits(q)) << 32n) | (BigInt(b) << 16n) | (BigInt(g) << 8n) | 0x40000000n);
const st = (s, t) => big(BigInt(floatBits(s)) | (BigInt(floatBits(t)) << 32n));
const xyz = (v) => { const [x, y, z] = v.map((c) => BigInt(toInt(c * 16))); return big(x | (y << 16n) | (z << 32n)); };
const coordinate = (u, v, q) => st(f(f(u * 3) * q), f(f(v * 3) * q));

/** The registers one strip sends: RGBAQ, ST, XYZF2 for each vertex, in order. */
function strip(input) {
  const { view, screen, angle0, angle1, radius, counter, greys, K } = input;
  const a = s16(angle0), b = s16(angle1);
  const P0 = [f(radius * sin(a)), f(radius * cos(a)), 0, 1];
  const P1 = [f(radius * sin(b)), f(radius * cos(b)), 0, 1];
  const u0 = f(angle0 / K.turn), u1 = f(angle1 / K.turn);
  const lightA = toInt(f(f(cos(a) + 1) * 10)), lightB = toInt(f(f(cos(b) + 1) * 10));
  const out = [];
  let rings = 0;
  for (let i = 0; i <= 32; i++) {
    const v = f(f(i * 0.03125) + f((counter % 5000) * K.scroll));
    const wobble = f(f(sin(Math.imul(counter, 100) + i * 0x1400) * K.ripple) + 1);
    const n = 32 - i;
    const fall = Math.imul(Math.imul(n, n), n) >> 10;
    const c1 = greys[0] + ((0xe6 * fall) >> 5), c2 = greys[1] + ((0x104 * fall) >> 5), c3 = greys[2] + ((0x104 * fall) >> 5);
    const z = i * 0x4e2 - 0x9c4;
    let V0 = apply(view, [f(P0[0] * wobble), f(P0[1] * wobble), z, P0[3]]);
    let V1 = apply(view, [f(P1[0] * wobble), f(P1[1] * wobble), z, P1[3]]);
    if (V0[2] < K.near || V1[2] < K.near) continue;
    let q0, q1;
    [V0, q0] = project(screen, V0);
    [V1, q1] = project(screen, V1);
    const outside = (x) => Math.abs(f(x - 2000)) > 1000;
    if (outside(V0[0]) || outside(V1[0]) || outside(V0[1]) || outside(V1[1])) continue;
    rings += 1;
    out.push([R.RGBAQ, rgbaq(c1 + lightA, c2 + lightA, c3 + lightA, q0)], [R.ST, coordinate(u0, v, q0)], [R.XYZF2, xyz(V0)],
      [R.RGBAQ, rgbaq(c1 + lightB, c2 + lightB, c3 + lightB, q1)], [R.ST, coordinate(u1, v, q1)], [R.XYZF2, xyz(V1)]);
  }
  // The closing pair: both vertices at the far end of the axis, no light and no fall added.
  const v = f(f((counter % 5000) * K.scrollEnd) + 1);
  const [E0, e0] = project(screen, apply(view, [0, 0, K.far, 1]));
  const [E1, e1] = project(screen, apply(view, [0, 0, K.far, 1]));
  out.push([R.RGBAQ, rgbaq(greys[0], greys[1], greys[2], e0)], [R.ST, coordinate(f(angle0 / K.turnEnd), v, e0)], [R.XYZF2, xyz(E0)],
    [R.RGBAQ, rgbaq(greys[0], greys[1], greys[2], e0)], [R.ST, coordinate(f(angle1 / K.turnEnd), v, e1)], [R.XYZF2, xyz(E1)]);
  return { writes: out, rings };
}

const tally = (table, name, same) => { const entry = (table[name] ??= [0, 0]); entry[1] += 1; if (same) entry[0] += 1; return same; };

export function verify(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const table = {}, problems = [];
  const facts = { rings: new Map(), greys: new Map(), modes: new Map(), constants: new Set(), tags: new Set(), counters: [] };
  const note = (text) => { if (problems.length < 12) problems.push(text); };
  let strips = 0, vertices = 0;

  for (const probe of trace.probes) {
    if (probe.preroll) continue;
    if (probe.pc === A.prim) {
      const sent = [...new GifPath().feed(trace.packets[probe.at]?.bytes ?? Buffer.alloc(0))].filter((event) => event.kind === 'write');
      tally(table, 'PRIM = 0x1c and CLAMP_1 = 0 before each strip', sent.length === 2 && sent[0].reg === R.PRIM && sent[0].value === 0x1cn && sent[1].reg === R.CLAMP && sent[1].value === 0n);
    }
    if (probe.pc !== A.strip) continue;
    const constants = probe.mem[4].bytes;
    const K = { near: constants.readFloatLE(0), turn: constants.readFloatLE(4), scroll: constants.readFloatLE(8), ripple: constants.readFloatLE(0xc),
      scrollEnd: constants.readFloatLE(0x10), turnEnd: constants.readFloatLE(0x14), far: constants.readFloatLE(0x18), radius: constants.readFloatLE(0x1c) };
    facts.constants.add(Object.entries(K).map(([name, value]) => `${name} ${value}`).join(', '));
    const greys = [0, 4, 8].map((o) => probe.mem[3].bytes.readInt32LE(o));
    const counter = probe.mem[2].bytes.readInt32LE(0);
    const radius = asFloat(probe.fpr[12]);
    tally(table, 'radius argument is the constant', floatBits(radius) === floatBits(K.radius));
    const wanted = strip({ view: matrix(probe.mem[0].bytes, 0), screen: matrix(probe.mem[1].bytes, 0), angle0: probe.gpr[6] | 0, angle1: probe.gpr[7] | 0, radius, counter, greys, K });
    const events = [...new GifPath().feed(trace.packets[probe.at]?.bytes ?? Buffer.alloc(0))];
    for (const event of events) if (event.kind === 'tag') facts.tags.add(`flg ${event.flg} nreg ${event.nreg} regs ${event.regs.join(',')} pre ${event.pre}`);
    const sent = events.filter((event) => event.kind === 'write');
    strips += 1;
    vertices += sent.length / 3;
    facts.rings.set(wanted.rings, (facts.rings.get(wanted.rings) ?? 0) + 1);
    if (!tally(table, 'vertices in the strip', sent.length === wanted.writes.length)) note(`strip at packet ${probe.at}: wanted ${wanted.writes.length / 3} vertices, sent ${sent.length / 3}`);
    wanted.writes.forEach(([reg, value], n) => {
      const got = sent[n];
      const name = { [R.RGBAQ]: 'RGBAQ', [R.ST]: 'ST', [R.XYZF2]: 'XYZF2' }[reg];
      if (!tally(table, name, !!got && got.reg === reg && got.value === value)) note(`strip at packet ${probe.at}, write ${n}: ${name} wanted 0x${value.toString(16)}, sent ${got ? `reg ${got.reg} 0x${got.value.toString(16)}` : 'nothing'}`);
    });
  }

  // Per frame: the grey ramp, the grey it gives, and whether the strips are drawn.
  const order = trace.probes.filter((probe) => !probe.preroll && (probe.pc === A.background || probe.pc === A.strip || probe.pc === A.prim));
  let frames = 0;
  order.forEach((probe, at) => {
    if (probe.pc !== A.background) return;
    let end = at + 1;
    while (end < order.length && order[end].pc !== A.background) end += 1;
    if (end === order.length) return; // the last frame may be cut by the end of the trace
    frames += 1;
    const ramp = [0, 4, 8, 12].map((o) => probe.mem[0].bytes.readInt32LE(o));
    let [length, counter, , state] = ramp;
    if (state === 1) { counter += 1; if (counter === length) state = 2; } else if (state === 3) { counter -= 1; if (counter === 0) state = 0; }
    const before = [0, 4, 8].map((o) => probe.mem[2].bytes.readInt32LE(o));
    const grey = state !== 0 ? Array(3).fill(Math.trunc((counter * 0x28) / length)) : before;
    const mode = probe.mem[1].bytes.readInt32LE(0);
    const key = `mode ${mode}, grey ramp of ${ramp[0]} in state ${state}: grey`;
    const seen = facts.greys.get(key) ?? { low: grey[0], high: grey[0], n: 0 };
    facts.greys.set(key, { low: Math.min(seen.low, grey[0]), high: Math.max(seen.high, grey[0]), n: seen.n + 1 });
    const inside = order.slice(at + 1, end);
    const drawn = inside.filter((other) => other.pc === A.strip);
    tally(table, 'sixteen strips when the mode is 0, none otherwise', drawn.length === (mode === 0 ? 16 : 0) && inside.filter((other) => other.pc === A.prim).length === drawn.length);
    drawn.forEach((other, k) => {
      tally(table, 'strip k covers angles k * 0x1000 to (k + 1) * 0x1000', other.gpr[6] === k * 0x1000 && other.gpr[7] === (k + 1) * 0x1000);
      tally(table, 'grey = ramp counter * 40 / length', [0, 4, 8].every((o, c) => other.mem[3].bytes.readInt32LE(o) === grey[c]));
    });
    // The grey the next frame starts from is the one this frame computed.
    const next = order[end];
    tally(table, 'grey kept for the next frame', [0, 4, 8].every((o, c) => next.mem[2].bytes.readInt32LE(o) === grey[c]));
    if (drawn.length) facts.counters.push(drawn[0].mem[2].bytes.readInt32LE(0));
  });
  for (let n = 1; n < facts.counters.length; n++) tally(table, 'frame counter one more each frame', facts.counters[n] === facts.counters[n - 1] + 1);
  return { table, problems, facts, strips, vertices, frames };
}

if (process.argv[1] && process.argv[1].endsWith('verify_background.mjs')) {
  const result = verify(process.argv[2]);
  console.log(`build: ${BUILD_NAME}`);
  console.log(`frames: ${result.frames}   strips: ${result.strips}   vertices sent: ${result.vertices}`);
  console.log(`  ${Object.entries(result.table).map(([name, [equal, total]]) => `${name} ${equal}/${total}`).join('\n  ')}`);
  console.log(`  ring pairs kept per strip (of 33): ${[...result.facts.rings].sort((a, b) => a[0] - b[0]).map(([rings, n]) => `${rings} x${n}`).join(', ')}`);
  console.log(`  frame counter: ${result.facts.counters[0]} .. ${result.facts.counters.at(-1)}`);
  for (const [text, seen] of result.facts.greys) console.log(`  ${text} ${seen.low}${seen.high !== seen.low ? `..${seen.high}` : ''}  x${seen.n}`);
  for (const text of result.facts.constants) console.log(`  constants: ${text}`);
  for (const text of result.facts.tags) console.log(`  tag: ${text}`);
  for (const problem of result.problems) console.log(`  ! ${problem}`);
  const good = result.strips > 0 && Object.values(result.table).every(([equal, total]) => equal === total) && result.problems.length === 0;
  console.log(`verdict: ${result.strips === 0 ? (result.frames ? 'EMPTY the background ran and drew no strip' : 'NOT FOUND no background call in the trace') : good ? `FOUND ${result.strips} strips, ${result.vertices} vertices, every value equal` : 'PARTIAL see the lines marked'}`);
  process.exit(good ? 0 : 3);
}
