// Recompute the trail (line strip) of each orb of the crystal clock from the record the function
// really got, and compare with the line strips really sent. Build: ROM 2.30.
//
//   orb function 0x00235630   record: [+0] head index, [+8] ring-full flag, 50 entries of 0x20
//   bytes from +0x10, each x, y, z floats then r, g, b ints at +0x10
//
// node verify_orbs.mjs <trace.jsonl>
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { pick, range, pc, BUILD_NAME, ROWS } from './builds.mjs';
import { GifPath } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/gif.js';
import { REG } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/registers.js';

// The orb function and the sprites' fade ramp, per build.
const A = pick({ rom: { orb: 0x00235630, ramp: 0x00297410 }, hdd: { orb: 0x00239078, ramp: 0x002b61b0 } });
export const ORB = A.orb;
// The second range is the sprites' fade ramp: length, value, changed, state.
export const PROBES = [{ pc: pc(A.orb), ranges: ['a0:0x650', range(A.ramp, 0x10)] }];

const bits = new DataView(new ArrayBuffer(4));
const f = (x) => {
  const near = Math.fround(x);
  if (Math.abs(near) <= Math.abs(x) || !Number.isFinite(near)) return near;
  bits.setFloat32(0, near);
  bits.setUint32(0, bits.getUint32(0) - 1);
  return bits.getFloat32(0);
};
const toInt = (x) => (x >= 2147483647 ? 2147483647 : x <= -2147483648 ? -2147483648 : Math.trunc(x));
/** Signed division by a power of two that rounds toward zero, as the compiler wrote it. */
const shift = (value, by) => (value < 0 ? value + (1 << by) - 1 : value) >> by;
// What the code puts above the colour: 0xFE00 << 42, which makes the Q field 0x03F80000. It is not 1.0.
const Q_ONE = 0xfe00n << 42n;

/** RGBAQ and XYZ of every point of the trail, newest first. */
export function expectTrail(record) {
  const head = record.readInt32LE(0);
  const full = record.readInt32LE(8) !== 0;
  const count = full ? 49 : Math.max(0, head - 1);
  const points = [];
  for (let i = 0; i < count; i++) {
    const index = full ? (head + 100 - i) % 50 : head - i;
    const step = full ? i : Math.trunc((i * 50) / (head - 1));
    const entry = 0x10 + index * 0x20;
    let t = toInt(f(128 - f(step * 3)));
    if (t < 0) t = 0;
    const r = record.readInt32LE(entry + 0x10), g = record.readInt32LE(entry + 0x14), b = record.readInt32LE(entry + 0x18);
    // Red falls with the fourth power of the fade, green with its square, blue linearly.
    const red = shift(Math.imul(shift(Math.imul(shift(Math.imul(Math.imul(r, t), t), 7), t), 7), t), 14);
    const green = shift(Math.imul(Math.imul(g, t), t), 14);
    const blue = shift(Math.imul(b, t), 7);
    const rgbaq = BigInt.asUintN(64, BigInt(red) | (BigInt(green) << 8n) | (BigInt(blue) << 16n) | (BigInt(t >> 1) << 24n) | Q_ONE);
    const x = toInt(f(f(record.readFloatLE(entry) + 2048) * 16));
    const y = toInt(f(f(record.readFloatLE(entry + 4) + 2048) * 16));
    const z = toInt(f(record.readFloatLE(entry + 8) * 16));
    points.push({ rgbaq, xyz: BigInt.asUintN(64, BigInt(x) | (BigInt(y) << 16n) | (BigInt(z) << 32n)) });
  }
  return { head, full, points };
}

const asFloat = (u32) => { bits.setUint32(0, u32 >>> 0); return bits.getFloat32(0); };
// Size of the sprites per unit of depth (HDD OSD D_0036FC98; the ROM 2.30 image holds the same bits).
const DEPTH_TO_SIZE = asFloat(0x36da1a93);
const SCREEN = [640, ROWS];

/**
 * The four sprites at the head of the trail: a glow and a disc, to the frame and then to the
 * second target. Corners are the newest point plus or minus half the size, moved to the screen
 * centre, in 1/16 pixel; the rectangle helper then adds the GS offset of the screen's corner.
 */
export function expectSprites(record, ramp) {
  // The ramp steps once at the start of every call, then scales the four alphas.
  let [length, value, , state] = ramp ? [0, 4, 8, 12].map((o) => ramp.readInt32LE(o)) : [1, 1, 0, 2];
  if (state === 1) value += 1; else if (state === 3) value -= 1;
  const faded = (alpha) => Math.trunc((value * alpha) / length);
  const head = record.readInt32LE(0);
  const entry = 0x10 + head * 0x20;
  const [x, y, z] = [0, 4, 8].map((o) => record.readFloatLE(entry + o));
  const [r, g, b, a] = [0x10, 0x14, 0x18, 0x1c].map((o) => record.readInt32LE(entry + o));
  const size = f(z * DEPTH_TO_SIZE);
  const half = SCREEN.map((n) => Math.trunc(n / 2));
  const corners = (factor) => {
    const hw = f(size * factor), hh = f(hw * 0.5);
    const at = (centre, delta, middle) => toInt(f(f(f(centre + delta) + middle) * 16)) + (0x800 - middle) * 16;
    return [[at(x, -hw, half[0]), at(y, -hh, half[1])], [at(x, hw, half[0]), at(y, hh, half[1])]];
  };
  const colour = (cr, cg, cb, ca) => BigInt.asUintN(64, BigInt(cr) | (BigInt(cg) << 8n) | (BigInt(cb) << 16n) | (BigInt(ca) << 24n) | (0x3f800000n << 32n));
  const xyzf = ([px, py]) => BigInt.asUintN(64, BigInt(px & 0xffff) | (BigInt(py & 0xffff) << 16n));
  const sprite = (factor, rgbaq) => ({ rgbaq, xyz: corners(factor).map(xyzf) });
  return [sprite(30, colour(r, g, b, faded(a))), sprite(4.5, colour(0x80, 0x80, 0x80, faded(0x80))), sprite(30, colour(r, g, b, faded(0x80))), sprite(4.5, colour(0xff, 0xff, 0xff, faded(0x80)))];
}

/** The sprites sent between two packet indices: PRIM 0x156 and a colour, then two UV and XYZF2 pairs. */
function sprites(trace, from, to) {
  const found = [];
  for (let at = from; at + 1 < to; at++) {
    const head = [...new GifPath().feed(trace.packets[at].bytes)].filter((event) => event.kind === 'write');
    if (head.length !== 2 || head[0].reg !== REG.PRIM || head[0].value !== 0x156n || head[1].reg !== REG.RGBAQ) continue;
    const body = [...new GifPath().feed(trace.packets[at + 1].bytes)].filter((event) => event.kind === 'write');
    if (body.length !== 4 || body[0].reg !== REG.UV || body[2].reg !== REG.UV) continue;
    found.push({ rgbaq: head[1].value, uv: [body[0].value, body[2].value], xyz: [body[1].value, body[3].value] });
  }
  return found;
}

/** RGBAQ and position pairs of a packet that holds nothing else but such pairs; null otherwise. */
function strip(packet) {
  const points = [];
  let colour = null;
  for (const event of new GifPath().feed(packet.bytes)) {
    if (event.kind !== 'write') continue;
    if (event.reg === REG.RGBAQ) colour = event.value;
    else if ([REG.XYZ2, REG.XYZF2].includes(event.reg) && colour !== null) { points.push({ rgbaq: colour, xyz: event.value }); colour = null; }
    else return null;
  }
  return points.length >= 2 ? points : null;
}

export function verify(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const result = { calls: 0, strips: 0, points: [0, 0], colours: [0, 0], stripsPerCall: {}, modes: { full: 0, filling: 0 }, sprites: { count: [0, 0], colour: [0, 0], corners: [0, 0], uv: [0, 0] }, ramp: {}, problems: [] };
  const problem = (text) => { if (result.problems.length < 12) result.problems.push(text); };
  const hits = trace.probes.filter((probe) => probe.pc === ORB && !probe.preroll);
  hits.forEach((probe, n) => {
    const record = probe.mem[0].bytes;
    if (!record) { problem('an orb record was not readable'); return; }
    const end = n + 1 < hits.length ? hits[n + 1].at : trace.packets.length;
    const expected = expectTrail(record);
    result.calls += 1;
    result.modes[expected.full ? 'full' : 'filling'] += 1;
    let found = 0;
    for (let at = probe.at; at < end; at++) {
      const sent = strip(trace.packets[at]);
      if (!sent || sent.length !== expected.points.length) continue;
      found += 1;
      result.strips += 1;
      sent.forEach((point, i) => {
        result.points[1] += 1;
        result.colours[1] += 1;
        if (point.xyz === expected.points[i].xyz) result.points[0] += 1;
        else problem(`call ${n} point ${i} position: sent 0x${point.xyz.toString(16)}, computed 0x${expected.points[i].xyz.toString(16)}`);
        if (point.rgbaq === expected.points[i].rgbaq) result.colours[0] += 1;
        else problem(`call ${n} point ${i} colour: sent 0x${point.rgbaq.toString(16)}, computed 0x${expected.points[i].rgbaq.toString(16)}`);
      });
    }
    result.stripsPerCall[found] = (result.stripsPerCall[found] ?? 0) + 1;
    const ramp = probe.mem[1]?.bytes ?? null;
    if (ramp) { const state = ramp.readInt32LE(12); result.ramp[state] = (result.ramp[state] ?? 0) + 1; }
    const wanted = expectSprites(record, ramp), sent = sprites(trace, probe.at, end);
    result.sprites.count[1] += 1;
    // The last orb of a frame is followed by other sprites; the orb's own are the first four.
    if (sent.length >= 4) result.sprites.count[0] += 1;
    else problem(`call ${n}: ${sent.length} sprites sent`);
    sent.slice(0, 4).forEach((sprite, i) => {
      const tally = (name, ok, text) => { result.sprites[name][1] += 1; if (ok) result.sprites[name][0] += 1; else problem(`call ${n} sprite ${i} ${name}: ${text()}`); };
      tally('colour', sprite.rgbaq === wanted[i].rgbaq, () => `sent 0x${sprite.rgbaq.toString(16)}, computed 0x${wanted[i].rgbaq.toString(16)}`);
      tally('corners', sprite.xyz[0] === wanted[i].xyz[0] && sprite.xyz[1] === wanted[i].xyz[1], () => `sent ${sprite.xyz.map((v) => v.toString(16))}, computed ${wanted[i].xyz.map((v) => v.toString(16))}`);
      tally('uv', sprite.uv[0] === 0n && sprite.uv[1] === 0x3f003f0n, () => `sent ${sprite.uv.map((v) => v.toString(16))}`);
    });
  });
  return result;
}

if (process.argv[1] && process.argv[1].endsWith('verify_orbs.mjs')) {
  const result = verify(process.argv[2]);
  console.log(`build: ${BUILD_NAME}`);
  console.log(`orb calls probed: ${result.calls} (ring full: ${result.modes.full}, still filling: ${result.modes.filling})   line strips compared: ${result.strips}`);
  console.log(`  strips found per call: ${JSON.stringify(result.stripsPerCall)}`);
  console.log(`  positions ${result.points[0]} of ${result.points[1]} equal`);
  console.log(`  colours   ${result.colours[0]} of ${result.colours[1]} equal`);
  for (const text of result.problems) console.log(`  ! ${text}`);
  for (const [name, [equal, total]] of Object.entries(result.sprites)) console.log(`  sprites: ${name} ${equal} of ${total} equal`);
  console.log(`  fade ramp state at the calls (0 hidden, 1 rising, 2 shown, 3 falling): ${JSON.stringify(result.ramp)}`);
  const whole = result.strips > 0 && result.points[0] === result.points[1] && result.colours[0] === result.colours[1] && !result.stripsPerCall[0]
    && Object.values(result.sprites).every(([equal, total]) => total > 0 && equal === total);
  console.log(`verdict: ${whole ? `FOUND ${result.strips} line strips and ${result.sprites.colour[1]} sprites, every value equal` : 'PARTIAL the formulas do not reproduce everything'}`);
  process.exit(whole ? 0 : 3);
}
