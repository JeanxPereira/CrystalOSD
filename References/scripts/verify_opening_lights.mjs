// The four light orbs of the opening intro (HDD OSD 1.10U, OpeningDrawLights 0x0021F5F8): their
// centres, the four sprites pairs each one draws (the current position and the three before it),
// and their trails, recomputed from the state at the function's entry and compared with the
// packets it sent, write by write.
//
//   0x0021F5F8  entry: the module's variables, the lights' matrices and rings, their tables
//   0x0021F6DC  after cosf, 0x0021F770 after sinf: f0 = the library's result (four of each a frame)
//
// node verify_opening_lights.mjs <trace.jsonl>
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { GifPath } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/gif.js';
import { f } from '../model/clock_frame.mjs';

// The matrix block in the scratchpad (D_00370058) and the scratch vectors (D_0037005C) are fixed.
export const PROBES = [
  { pc: '0x0021f5f8', ranges: ['0x00370000:0xc0', '0x00370a74:0x4', '0x0036fa0c:0x10', '0x003db8a0:0x400', '0x003dbca0:0x2000', '0x002b0e30:0x110', '0x002b0c20:0x20', '0x70000060:0x100'] },
  { pc: '0x0021f6dc' },
  { pc: '0x0021f770' },
];
const [ENTRY, AFTER_COS, AFTER_SIN] = PROBES.map((probe) => parseInt(probe.pc, 16));
const REG = { PRIM: 0, RGBAQ: 1, ST: 2, XYZF2: 4, XYZF3: 0xc, ALPHA: 0x42, PABE: 0x49 };

const bits = new DataView(new ArrayBuffer(4));
export const floatBits = (x) => { bits.setFloat32(0, x); return bits.getUint32(0); };
const asFloat = (u32) => { bits.setUint32(0, u32 >>> 0); return bits.getFloat32(0); };
export const toInt = (x) => (x >= 2147483647 ? 2147483647 : x <= -2147483648 ? -2147483648 : Math.trunc(x));
const toUnsigned = (x) => (x > 0 ? Math.trunc(x) : 0);
export const vector = (buffer, at) => [0, 4, 8, 12].map((k) => buffer.readFloatLE(at + k));
export const matrix = (buffer, at) => [0, 16, 32, 48].map((k) => vector(buffer, at + k));
export const apply = (m, v) => [0, 1, 2, 3].map((i) => f(f(f(f(m[0][i] * v[0]) + f(m[1][i] * v[1])) + f(m[2][i] * v[2])) + f(m[3][i] * v[3])));
export const mul = (a, b) => b.map((row) => apply(a, row));
const mod128 = (x) => x - (((x < 0 ? x + 127 : x) >> 7) << 7);
export const pack = (x, y, z) => BigInt.asUintN(64, BigInt(x) | (BigInt(y) << 16n) | (BigInt(z) << 32n));

/** sprTransformVertex (0x0021C068): through the matrix, divided by w, to 12.4 integers; z loses its fraction. */
export function transformVertex(m, v) {
  const p = apply(m, v);
  const q = f(1 / p[3]);
  const ints = [toInt(f(p[0] * q) * 16), toInt(f(p[1] * q) * 16), toInt(f(p[2] * q) * 16) >> 4, 16];
  return { ints, q };
}

/** sceVu0ClipAll (0x0027BA70): 1 when no vertex is strictly inside min..max in x, y (scaled by w) and w. */
export function clipAll(min, max, m, vertices) {
  for (const v of vertices) {
    const p = apply(m, v);
    const d = [f(p[0] - f(min[0] * p[3])), f(p[1] - f(min[1] * p[3])), f(p[3] - min[3]), f(f(max[0] * p[3]) - p[0]), f(f(max[1] * p[3]) - p[1]), f(max[3] - p[3])];
    if (d.every((x) => x > 0)) return 0;
  }
  return 1;
}

export function expected(input) {
  const { vars, phase, constants, history, rings, tables, clip, block, cosines, sines } = input;
  const counter = vars.readInt32LE(0);
  let head = vars.readInt32LE(0xb0), tail = vars.readInt32LE(0xac);
  const alphas = [vars.readInt32LE(0xb8), vars.readInt32LE(0xbc)];
  const ring = Buffer.from(rings);
  const slots = [...Array(4).keys()].map((i) => [...Array(4).keys()].map((n) => matrix(history, i * 0x100 + n * 0x40)));
  const colours = [...Array(4).keys()].map((i) => vector(tables, i * 0x10));
  const corners = (pair) => [...Array(4).keys()].map((n) => vector(tables, 0x40 + pair * 0x40 + n * 0x10));
  const coordinates = [...Array(4).keys()].map((n) => vector(tables, 0xc0 + n * 0x10));
  const origin = vector(tables, 0x100);
  const [min, max] = [vector(clip, 0), vector(clip, 0x10)];
  const base = matrix(block, 0), toScreen = matrix(block, 0xc0);
  const [ka, kb, kc, kd] = [0, 4, 8, 12].map((k) => constants.readFloatLE(k));

  const sprites = [], centres = [], angles = [];
  for (let i = 0; i < 4; i++) {
    const a = f(f(f(f(counter + phase + 17 * i) * ka) * f(i + 10)) * kb);
    const b = f(f(f(f(counter + phase + 15 * i) * kc) * f(i + 10)) * kd);
    angles.push(a, b);
    const cosine = cosines[i], sine = sines[i];
    for (let n = 0; n < 4; n++) {
      let m;
      if (n === 3) {
        const centre = [f(f(10 - i) * cosine), f(f(i + 3) * sine), f(f(cosine * 12) + 88)];
        centres.push(centre);
        const moved = [base[0], base[1], base[2], [f(base[3][0] + centre[0]), f(base[3][1] + centre[1]), f(base[3][2] + centre[2]), base[3][3]]];
        m = mul(toScreen, moved);
        slots[i][3] = m;
      } else {
        slots[i][n] = slots[i][n + 1];
        m = slots[i][n];
      }
      // The ring's head entry is rewritten by each of the four; the last (the current position) stays.
      transformVertex(m, origin).ints.forEach((x, k) => ring.writeInt32LE(x, i * 0x800 + head * 16 + k * 4));
      const writes = [];
      for (let pair = 0; pair < 2; pair++) {
        writes.push([REG.PABE, 0n], [REG.ALPHA, 0x8000000048n], [REG.PRIM, 0x5cn]);
        const quad = corners(pair);
        if (clipAll(min, max, m, quad) !== 0) continue;
        const alpha = Math.trunc((alphas[pair] * (n + 1)) / 5);
        quad.forEach((corner, k) => {
          const { ints, q } = transformVertex(m, corner);
          const s = f(coordinates[k][0] * q), t = f(coordinates[k][1] * q);
          const colour = colours[i % 4];
          const rgb = pair === 0 ? (toUnsigned(f(colour[0] * 0.5)) | (toUnsigned(f(colour[1] * 0.5)) << 8) | (toUnsigned(f(colour[2] * 0.5)) << 16)) : 0x808080;
          writes.push([REG.RGBAQ, BigInt.asUintN(64, BigInt(rgb) | (BigInt(alpha) << 24n) | (BigInt(floatBits(q)) << 32n))],
            [REG.ST, BigInt(floatBits(s)) | (BigInt(floatBits(t)) << 32n)], [REG.XYZF2, pack(ints[0], ints[1], ints[2])]);
        });
      }
      sprites.push(writes);
    }
  }

  // The rings step once a frame; a full ring pushes its tail on.
  head = mod128(head + 1);
  if (head === tail) tail = mod128(tail + 1);

  // The trails: a line strip from the newest entry back, a vertex at every eighth entry.
  const trails = [];
  for (let i = 0; i < 4; i++) {
    const writes = [[REG.PRIM, 0x18an]];
    const end = mod128(tail + 1);
    let at = mod128(head + 127);
    const length = mod128(head - (end - 127));
    let previousY = 0;
    for (let step = 0; at !== end; step++, at = mod128(at + 127)) {
      const level = Math.trunc(((length - step) << 6) / length);
      if ((step & 7) !== 0) continue;
      const colour = colours[i];
      const channel = (c) => toInt(f(f(c * f(level)) * 0.0078125));
      writes.push([REG.RGBAQ, BigInt.asUintN(64, BigInt(channel(colour[0])) | (BigInt(channel(colour[1])) << 8n) | (BigInt(channel(colour[2])) << 16n) | (BigInt(level << 1) << 24n))]);
      const [x, y, z] = [0, 4, 8].map((k) => ring.readInt32LE(i * 0x800 + at * 16 + k));
      const before = previousY;
      const sx = f((x >> 4) - 0x6c0), sy = f((y >> 4) - 0x790);
      previousY = sy;
      // A vertex off the picture, or one whose predecessor was, is sent without drawing.
      const hidden = z < 5 || sx < 0 || 640 < sx || sy < 0 || 224 < sy || before < 0 || 640 < before;
      writes.push([hidden ? REG.XYZF3 : REG.XYZF2, pack(x, y, z)]);
    }
    trails.push(writes);
  }
  return { sprites, trails, centres, angles };
}

export function verify(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const result = { frames: 0, sprites: [0, 0], spriteWrites: [0, 0], trails: [0, 0], trailWrites: [0, 0], drawn: 0, clipped: 0, hidden: 0, library: { count: 0, worst: 0 }, problems: [] };
  const problem = (text) => { if (result.problems.length < 14) result.problems.push(text); };
  const writesOf = (packet) => [...new GifPath().feed(packet.bytes)].filter((event) => event.kind === 'write');

  const entries = trace.probes.filter((probe) => probe.pc === ENTRY && !probe.preroll);
  entries.forEach((entry, n) => {
    const next = entries[n + 1];
    const until = next ? next.at : trace.packets.length;
    const inside = (probe) => !probe.preroll && probe.at >= entry.at && probe.at <= until && trace.probes.indexOf(probe) > trace.probes.indexOf(entry) && (!next || trace.probes.indexOf(probe) < trace.probes.indexOf(next));
    const cosines = trace.probes.filter((probe) => probe.pc === AFTER_COS && inside(probe)).map((probe) => asFloat(probe.fpr[0]));
    const sines = trace.probes.filter((probe) => probe.pc === AFTER_SIN && inside(probe)).map((probe) => asFloat(probe.fpr[0]));
    if (cosines.length !== 4 || sines.length !== 4) return;      // the trace was cut inside this call
    const [vars, phase, constants, history, rings, tables, clip, block] = entry.mem.map((range) => range.bytes);
    if (entry.mem.some((range) => !range.bytes)) { problem(`frame ${entry.frame}: a probed range was not readable`); return; }
    const model = expected({ vars, phase: phase.readInt32LE(0), constants, history, rings, tables, clip, block, cosines, sines });

    // The packets of this call: the sprite packets begin with PABE, the trails with PRIM 0x18A.
    const sent = [];
    for (let at = entry.at; at < until && sent.length < 40; at++) {
      const writes = writesOf(trace.packets[at]);
      if (writes.length === 0) continue;
      if (writes[0].reg === REG.PABE || (writes[0].reg === REG.PRIM && writes[0].value === 0x18an)) sent.push(writes);
      if (sent.length === 21) break;
    }
    if (sent.length !== 21) { if (next) problem(`frame ${entry.frame}: ${sent.length} packets of the lights found, 21 expected`); return; }
    result.frames += 1;
    model.angles.forEach((angle, k) => {
      const got = k % 2 === 0 ? cosines[k >> 1] : sines[k >> 1];
      const near = Math.fround(k % 2 === 0 ? Math.cos(angle) : Math.sin(angle));
      result.library.count += 1;
      result.library.worst = Math.max(result.library.worst, Math.abs(floatBits(got) - floatBits(near)));
    });
    const compare = (expectedWrites, got, tally, writeTally, label) => {
      tally[1] += 1;
      writeTally[1] += expectedWrites.length;
      let equal = got.length === expectedWrites.length, first = null;
      expectedWrites.forEach(([reg, value], w) => {
        if (got[w] && got[w].reg === reg && got[w].value === value) writeTally[0] += 1; else { equal = false; first ??= w; }
      });
      if (equal) tally[0] += 1;
      else problem(`frame ${entry.frame} ${label}: ${got.length} writes sent, ${expectedWrites.length} computed${first === null ? '' : `; write ${first}: sent ${got[first] ? `reg 0x${got[first].reg.toString(16)} = 0x${got[first].value.toString(16)}` : 'nothing'}, computed reg 0x${expectedWrites[first][0].toString(16)} = 0x${expectedWrites[first][1].toString(16)}`}`);
    };
    model.sprites.forEach((writes, k) => {
      compare(writes, sent[k], result.sprites, result.spriteWrites, `light ${k >> 2} sprite pair ${k & 3}`);
      const quads = (writes.length - 6) / 12;
      result.drawn += quads; result.clipped += 2 - quads;
    });
    // sent[16] is the blend state before the trails.
    model.trails.forEach((writes, k) => {
      compare(writes, sent[17 + k], result.trails, result.trailWrites, `light ${k} trail`);
      result.hidden += writes.filter(([reg]) => reg === REG.XYZF3).length;
    });
  });
  return result;
}

if (process.argv[1] && process.argv[1].endsWith('verify_opening_lights.mjs')) {
  const result = verify(process.argv[2]);
  console.log(`frames compared: ${result.frames}`);
  console.log(`  sprite packets equal: ${result.sprites[0]} of ${result.sprites[1]} (writes ${result.spriteWrites[0]} of ${result.spriteWrites[1]}); quads drawn ${result.drawn}, left out by the clip test ${result.clipped}`);
  console.log(`  trail packets equal: ${result.trails[0]} of ${result.trails[1]} (writes ${result.trailWrites[0]} of ${result.trailWrites[1]}); vertices sent without drawing ${result.hidden}`);
  console.log(`  cosf and sinf (probed) against the nearest singles of the true values: ${result.library.count} results, farthest ${result.library.worst} steps`);
  for (const text of result.problems) console.log(`  ! ${text}`);
  const whole = result.frames > 0 && result.problems.length === 0;
  console.log(`verdict: ${whole ? `FOUND ${result.frames} frames of the opening's lights, every write equal` : 'PARTIAL see the lines marked !'}`);
  process.exit(whole ? 0 : 3);
}
