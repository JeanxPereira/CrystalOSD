// Recompute the refracted faces of the crystal clock from the inputs the emitter really got, and
// compare with what was really sent to the GS. Build: ROM 2.30 (BIOS 0230AC20080220).
//
// The trace must carry these probes (see PROBES below): the emitter's entry, with the caller's
// frame, the rod record, the face record and the screen globals; and the instruction after its
// one call to the function g, to take g's result as an input rather than assume it.
//
// node verify_refraction.mjs <trace.jsonl>      prints what agreed and the first disagreements
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { pick, range, pc, BUILD, BUILD_NAME } from './builds.mjs';
import { GifPath } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/gif.js';
import { REG } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/registers.js';

// The emitter, the instruction after its cosine call, the field word and the screen size, per build.
const A = pick({
  rom: { emitter: 0x002329f8, afterG: 0x00232aa4, field: 0x0028a348, screen: 0x001f0c50 },
  hdd: { emitter: 0x002365d0, afterG: 0x00236678, field: 0x002b2178, screen: 0x001f0cb4 },
});
export const EMITTER = A.emitter;
export const AFTER_G = A.afterG;
export const PROBES = [
  { pc: pc(A.emitter), ranges: ['v0:0x20', '*v0+0x4:0xc0', '*v0+0x10:0x160', range(A.field, 4), range(A.screen, 8)] },
  { pc: pc(A.afterG) },
];

const bits = new DataView(new ArrayBuffer(4));
/**
 * One single-precision operation as the EE does it: the result is cut toward zero, not rounded
 * to nearest. `x` is the operation's result computed in double precision, which holds the sum or
 * product of two singles exactly in the ranges met here.
 */
const f = (x) => {
  const near = Math.fround(x);
  if (Math.abs(near) <= Math.abs(x) || !Number.isFinite(near)) return near;
  bits.setFloat32(0, near);
  bits.setUint32(0, bits.getUint32(0) - 1);       // one step toward zero, for either sign
  return bits.getFloat32(0);
};
const asFloat = (u32) => { bits.setUint32(0, u32 >>> 0); return bits.getFloat32(0); };
/** cvt.w.s and VU ftoi: toward zero, saturating. */
const toInt = (x) => (x >= 2147483647 ? 2147483647 : x <= -2147483648 ? -2147483648 : Math.trunc(x));

// The constants as stored in the binary, which are the nearest singles.
const C09 = Math.fround(0.9), C099 = Math.fround(0.99), C095 = Math.fround(0.95);

/** What the emitter writes for one face: PRIM, RGBAQ and four UV and XYZ values. */
export function expectFace(input) {
  const { F, cx, cy, add, rod, face, field, screenW, screenH, g } = input;
  const strength = rod.readFloatLE(0x90);
  let bright = toInt(f(f(f(f(f(strength * 10) * F) * F) * F) * F));
  if (C09 < F) {
    if (g === undefined) return { error: 'F is above 0.9 and no g result was probed' };
    const fade = f(f(1 - g) * f(0.5));
    bright = toInt(f(f(bright) * fade));
  }
  const prim = C099 < F ? 0x114 : 0x194;
  const channel = (offset) => { const value = bright + rod.readInt32LE(offset) + add; return value < 0x100 ? value : 0xff; };
  const rgba = ((channel(0x80) | (channel(0x84) << 8) | (channel(0x88) << 16) | 0x80000000) >>> 0);

  const nx = face.readFloatLE(0x140);
  const ny = face.readFloatLE(0x144);
  const R = rod.readFloatLE(0xb8);
  const halfW = f(Math.trunc(screenW / 2));
  const halfH = f(Math.trunc(screenH / 2));
  const half = f(f(field) * f(0.5));
  const vertices = [];
  for (let k = 0; k < 4; k++) {
    const at = k * 0x50;
    const q = face.readFloatLE(at + 0x40);
    const push = f(f(f(nx * 1000) * q) * R);
    const u = f(f(f(f(f(face.readFloatLE(at + 0x20) - 2048) - cx) * C095) + cx) - push);
    const lift = f(f(f(ny * 500) * q) * R);
    const v = f(f(f(f(f(face.readFloatLE(at + 0x24) - 2048) - cy) * C095) + cy) - lift);
    let ui, vi;
    if (BUILD === 'hdd') {
      // HDD OSD: the 12.4 integers are clamped to the screen; nothing is added.
      const clampTo = (value, top) => Math.min(Math.max(value, 0), top);
      ui = clampTo(toInt(f(f(halfW + u) * 16)), screenW * 16);
      vi = clampTo(toInt(f(f(f(halfH + v) - half) * 16)), screenH * 16);
    } else {
      const wrapped = f(f(halfW + u) + 1024);
      const U = wrapped < 1024 ? 1024 : wrapped;
      const V = f(f(f(halfH + v) + 256) - half);
      ui = toInt(f(U * 16));
      vi = toInt(f(V * 16));
    }
    const uv = BigInt.asUintN(64, BigInt(ui) | (BigInt(vi) << 16n));
    const xyz = BigInt.asUintN(64, BigInt(face.readInt32LE(at + 0x30)) | (BigInt(face.readInt32LE(at + 0x34)) << 16n) | (BigInt(face.readInt32LE(at + 0x38)) << 32n));
    // Where the HDD OSD build would send something else: it clamps to the screen instead.
    const plainU = f(halfW + u);
    const plainV = f(f(halfH + v) - half);
    // HDD OSD clamps the 12.4 integers to 0..screenW*16 and 0..screenH*16. Where U is negative
    // this build floors it to the same texel, so only the other three sides can differ.
    const side = plainU < 0 ? 'left' : plainU > screenW ? 'right' : plainV < 0 ? 'top' : plainV > screenH ? 'bottom' : null;
    const clamp = (value, top) => Math.min(Math.max(value, 0), top);
    const differs = clamp(toInt(f(plainU * 16)), screenW * 16) !== ui - 1024 * 16 || clamp(toInt(f(plainV * 16)), screenH * 16) !== vi - 256 * 16;
    vertices.push({ uv, xyz, side, differs, plainU, plainV });
  }
  return { prim, rgba, vertices };
}

/** The faces a PATH2 packet really carries: each PRIM write, the RGBAQ after it, then UV and XYZ pairs. */
function facesOf(packet) {
  const faces = [];
  let current = null;
  // The packet is VIF1 DIRECT data: GIF bytes as the GS receives them.
  for (const event of new GifPath().feed(packet.bytes)) {
    if (event.kind !== 'write') continue;
    if (event.reg === REG.PRIM) { current = { prim: Number(event.value), rgba: null, uv: [], xyz: [] }; faces.push(current); }
    else if (!current) continue;
    else if (event.reg === REG.RGBAQ) current.rgba = Number(event.value & 0xffffffffn);
    else if (event.reg === REG.UV) current.uv.push(event.value);
    else if ([REG.XYZ2, REG.XYZF2, REG.XYZ3, REG.XYZF3].includes(event.reg)) current.xyz.push(event.value);
  }
  return faces;
}

export function verify(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const result = { probes: 0, faces: 0, agreed: { prim: 0, rgba: 0, uv: 0, xyz: 0 }, checked: { prim: 0, rgba: 0, uv: 0, xyz: 0 }, problems: [], aboveFade: 0, clampedU: 0, sides: {}, differs: 0, vertices: 0, farthest: 0 };

  // Emitter probes in file order, each with the g result that followed it, if any.
  const calls = [];
  for (const probe of trace.probes) {
    if (probe.pc === EMITTER) calls.push({ probe, g: undefined });
    else if (probe.pc === AFTER_G && calls.length > 0) calls[calls.length - 1].g = asFloat(probe.fpr[0]);
  }
  result.probes = calls.length;

  const lists = { true: trace.preroll, false: trace.packets };
  const byPacket = new Map();
  for (const call of calls) {
    const key = `${call.probe.preroll}:${call.probe.at}`;
    if (!byPacket.has(key)) byPacket.set(key, []);
    byPacket.get(key).push(call);
  }

  for (const [key, group] of byPacket) {
    const [preroll, at] = key.split(':');
    const packet = lists[preroll][Number(at)];
    if (!packet) { result.problems.push(`probes before packet ${key}, which the trace does not hold (the trace was stopped first)`); continue; }
    const sent = facesOf(packet);
    if (sent.length !== group.length) { result.problems.push(`packet ${key}: ${group.length} emitter calls, ${sent.length} faces sent`); continue; }
    group.forEach((call, index) => {
      const [frame, rod, face, fieldBytes, screen] = call.probe.mem.map((range) => range.bytes);
      if (!frame || !rod || !face || !fieldBytes || !screen) { result.problems.push(`packet ${key} face ${index}: a probed range was not readable`); return; }
      const F = asFloat(call.probe.fpr[12]);
      const input = {
        F, cx: frame.readFloatLE(0), cy: frame.readFloatLE(8), add: frame.readInt32LE(0xc), rod, face,
        field: fieldBytes.readInt32LE(0), screenW: screen.readInt32LE(0), screenH: screen.readInt32LE(4), g: call.g,
      };
      const expected = expectFace(input);
      if (expected.error) { result.problems.push(`packet ${key} face ${index}: ${expected.error}`); return; }
      const actual = sent[index];
      result.faces += 1;
      if (C09 < F) result.aboveFade += 1;
      const check = (name, same, describe) => {
        result.checked[name] += 1;
        if (same) result.agreed[name] += 1;
        else if (result.problems.length < 12) result.problems.push(`packet ${key} face ${index} ${name}: ${describe()}`);
      };
      check('prim', actual.prim === expected.prim, () => `sent 0x${actual.prim.toString(16)}, computed 0x${expected.prim.toString(16)} (F ${F})`);
      check('rgba', actual.rgba === expected.rgba, () => `sent 0x${(actual.rgba ?? 0).toString(16)}, computed 0x${expected.rgba.toString(16)} (F ${F})`);
      for (let k = 0; k < 4; k++) {
        check('uv', actual.uv[k] === expected.vertices[k].uv, () => `vertex ${k} sent 0x${(actual.uv[k] ?? 0n).toString(16)}, computed 0x${expected.vertices[k].uv.toString(16)}`);
        check('xyz', actual.xyz[k] === expected.vertices[k].xyz, () => `vertex ${k} sent 0x${(actual.xyz[k] ?? 0n).toString(16)}, computed 0x${expected.vertices[k].xyz.toString(16)}`);
        if ((expected.vertices[k].uv & 0xffffn) === 1024n * 16n) result.clampedU += 1;
        result.vertices += 1;
        const { side, differs, plainU, plainV } = expected.vertices[k];
        if (side) result.sides[side] = (result.sides[side] ?? 0) + 1;
        if (differs) {
          result.differs += 1;
          result.farthest = Math.max(result.farthest, plainU - input.screenW, -plainV, plainV - input.screenH);
        }
      }
    });
  }
  return result;
}

if (process.argv[1] && process.argv[1].endsWith('verify_refraction.mjs')) {
  const result = verify(process.argv[2]);
  console.log(`emitter calls probed: ${result.probes}   faces compared: ${result.faces}   with F above 0.9: ${result.aboveFade}   vertices at the U floor: ${result.clampedU}`);
  for (const name of ['prim', 'rgba', 'uv', 'xyz']) console.log(`  ${name.padEnd(5)} ${result.agreed[name]} of ${result.checked[name]} equal`);
  console.log(`coordinates outside the screen, by side: ${JSON.stringify(result.sides)}`);
  // On ROM 2.30, how far its unclamped lookups stray from what HDD OSD's clamp gives.
  if (BUILD === 'rom') console.log(`vertices where HDD OSD 1.10U's clamp would send another coordinate (by its code as read; not measured there): ${result.differs} of ${result.vertices}, farthest ${result.farthest.toFixed(2)} texels out`);
  for (const problem of result.problems) console.log(`  ! ${problem}`);
  const whole = ['prim', 'rgba', 'uv', 'xyz'].every((name) => result.agreed[name] === result.checked[name]) && result.problems.length === 0 && result.faces > 0;
  console.log(`verdict: ${whole ? `FOUND ${result.faces} faces of the emitter at ${pc(EMITTER)} (${BUILD_NAME}), every value equal` : 'PARTIAL the formula does not reproduce what was sent'}`);
  process.exit(whole ? 0 : 3);
}
