// Recompute, from the inputs they really got, what the crystal clock's transform and textured
// emitter produce, and compare with what they really produced. Build: ROM 2.30.
//
//   transform  0x002335e8  rod record + two matrices + vertex arrays  ->  face records
//   textured   0x00232e38  face record + colour + two offsets         ->  ST, RGBAQ, XYZ sent
//
// Face records are taken where an emitter is about to use them, so every record compared is one
// that was drawn. The trace must carry PROBES.
//
// node verify_rod.mjs <trace.jsonl>
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { pick, range, pc, BUILD, BUILD_NAME } from './builds.mjs';
import { GifPath } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/gif.js';
import { REG } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/registers.js';

const A = pick({
  rom: { transform: 0x002335e8, refracted: 0x002329f8, afterG: 0x00232aa4, textured: 0x00232e38, rod: [0x00233f60, 0x00234a68], field: 0x0028a348, screen: 0x001f0c50 },
  hdd: { transform: 0x00237010, refracted: 0x002365d0, afterG: 0x00236678, textured: 0x00236a20, rod: [0x00237a28, 0x002384c8], field: 0x002b2178, screen: 0x001f0cb4 },
});
export const TRANSFORM = A.transform;
export const REFRACTED = A.refracted;
export const TEXTURED = A.textured;
// The main rod function, whose calls are the ones whose arguments this script knows how to explain.
const ROD_FUNCTION = A.rod;
const REFRACTED_FROM = () => true;
const fromRodFunction = (probe) => probe.gpr[31] >= ROD_FUNCTION[0] && probe.gpr[31] < ROD_FUNCTION[1];

export const PROBES = [
  { pc: pc(A.transform), ranges: ['t0:0xc0', '*t0+0x64:0x40', '*t0+0x60:0x40', '*t0+0x8:0x400', '*t0+0xc:0x100', '*t0+0x10:0x400'] },
  { pc: pc(A.refracted), ranges: ['v0:0x20', '*v0+0x4:0xc0', '*v0+0x10:0x160', range(A.field, 4), range(A.screen, 8)] },
  { pc: pc(A.afterG) },
  { pc: pc(A.textured), ranges: ['a0:0x160', 'a1:0x10', 'a1+0xffffff60:0xc0'] },
];

const bits = new DataView(new ArrayBuffer(4));
const nearest = Math.fround;
/** One single-precision operation cut toward zero, as the EE's FPU and VU0 do it. */
const chop = (x) => {
  const near = Math.fround(x);
  if (Math.abs(near) <= Math.abs(x) || !Number.isFinite(near)) return near;
  bits.setFloat32(0, near);
  bits.setUint32(0, bits.getUint32(0) - 1);
  return bits.getFloat32(0);
};
const floatBits = (x) => { bits.setFloat32(0, x); return bits.getUint32(0); };
const asFloat = (u32) => { bits.setUint32(0, u32 >>> 0); return bits.getFloat32(0); };
const toInt = (x) => (x >= 2147483647 ? 2147483647 : x <= -2147483648 ? -2147483648 : Math.trunc(x));

const vector = (buffer, at) => [0, 4, 8, 12].map((k) => buffer.readFloatLE(at + k));
const matrix = (buffer, at) => [0, 16, 32, 48].map((k) => vector(buffer, at + k));

/** The arithmetic under test, with the rounding of each step as a parameter. */
function model(f) {
  // sceVu0ApplyMatrix: VMULAx, VMADDAy, VMADDAz, VMADDw.
  const apply = (m, v) => [0, 1, 2, 3].map((i) => f(f(f(f(m[0][i] * v[0]) + f(m[1][i] * v[1])) + f(m[2][i] * v[2])) + f(m[3][i] * v[3])));
  const scale = (v, s) => v.map((x) => f(x * s));
  const sub = (a, b) => a.map((x, i) => f(x - b[i]));

  function transform(input) {
    const { rod, first, second, positions, normals, coordinates } = input;
    const local = matrix(rod, 0x20);
    const M = local.map((column) => apply(first, column));
    const sx = rod.readFloatLE(0x68), sy = rod.readFloatLE(0x6c), sz = rod.readFloatLE(0x70);

    let centre = apply(second, apply(M, [0, 0, 0, 1]));
    centre = scale(centre, f(1 / centre[3]));
    const out = { cx: f(centre[0] - 2048), cy: f(centre[1] - 2048), faces: [] };

    const count = rod.readInt32LE(4);
    for (let i = 0; i < count; i++) {
      const face = { normal: apply(M, vector(normals, 16 * i)), vertices: [] };
      for (let k = 0; k < 4; k++) {
        const p = vector(positions, 64 * i + 16 * k);
        const view = apply(M, [f(p[0] * sx), f(p[1] * sy), f(p[2] * sz), 1]);
        let screen = apply(second, view);
        const q = f(1 / screen[3]);
        screen = scale(screen, q);
        const st = vector(coordinates, 64 * i + 16 * k);
        face.vertices.push({ view, screen, q, ints: screen.map((x) => toInt(x * 16)), s: st[0], t: f(st[1] * sy) });
      }
      const e2 = sub(face.vertices[2].screen, face.vertices[0].screen);
      const e1 = sub(face.vertices[1].screen, face.vertices[0].screen);
      face.flag = f(f(e2[0] * e1[1]) - f(e2[1] * e1[0])) > 0 ? 0 : 1;
      out.faces.push(face);
    }
    return out;
  }

  /** ST, RGBAQ and XYZ of the four vertices of a textured face. */
  function textured(face, colour, ds, dt) {
    const rgba = BigInt.asUintN(32, BigInt(colour.readInt32LE(0) | (colour.readInt32LE(4) << 8) | (colour.readInt32LE(8) << 16) | (colour.readInt32LE(12) << 24)));
    const out = [];
    for (let k = 0; k < 4; k++) {
      const at = k * 0x50;
      const q = face.readFloatLE(at + 0x40);
      const s = f(f(face.readFloatLE(at + 0x10) + ds) * q);
      const t = f(f(face.readFloatLE(at + 0x14) + dt) * q);
      out.push({
        st: BigInt(floatBits(s)) | (BigInt(floatBits(t)) << 32n),
        rgbaq: rgba | (BigInt(face.readUInt32LE(at + 0x40)) << 32n),
        xyz: BigInt.asUintN(64, BigInt(face.readInt32LE(at + 0x30)) | (BigInt(face.readInt32LE(at + 0x34)) << 16n) | (BigInt(face.readInt32LE(at + 0x38)) << 32n)),
      });
    }
    return out;
  }
  return { transform, textured };
}

/** Compare a computed face with the 0x160 bytes the emitter was handed. Returns field -> [equal, total]. */
function compareFace(computed, record, tally) {
  const count = (name, same) => { tally[name] ??= [0, 0]; tally[name][1] += 1; if (same) tally[name][0] += 1; return same; };
  const sameFloats = (values, at) => values.every((x, i) => floatBits(x) === record.readUInt32LE(at + 4 * i));
  let whole = true;
  computed.vertices.forEach((vertex, k) => {
    const at = k * 0x50;
    whole = count('view position', sameFloats(vertex.view, at)) && whole;
    whole = count('s, t', sameFloats([vertex.s, vertex.t], at + 0x10)) && whole;
    whole = count('screen position', sameFloats(vertex.screen, at + 0x20)) && whole;
    whole = count('integer x, y, z', vertex.ints.slice(0, 3).every((x, i) => x === record.readInt32LE(at + 0x30 + 4 * i))) && whole;
    whole = count('q', floatBits(vertex.q) === record.readUInt32LE(at + 0x40)) && whole;
  });
  whole = count('normal', sameFloats(computed.normal, 0x140)) && whole;
  whole = count('side flag', computed.flag === record.readInt32LE(0x150)) && whole;
  return whole;
}

function facesOf(packet) {
  const faces = [];
  let current = null;
  for (const event of new GifPath().feed(packet.bytes)) {
    if (event.kind !== 'write') continue;
    if (event.reg === REG.PRIM) { current = { prim: Number(event.value), st: [], rgbaq: [], xyz: [], uv: 0 }; faces.push(current); }
    else if (!current) continue;
    else if (event.reg === REG.ST) current.st.push(event.value);
    else if (event.reg === REG.RGBAQ) current.rgbaq.push(event.value);
    else if (event.reg === REG.UV) current.uv += 1;
    else if ([REG.XYZ2, REG.XYZF2, REG.XYZ3, REG.XYZF3].includes(event.reg)) current.xyz.push(event.value);
  }
  return faces;
}

export function verify(traceFile, f = chop) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const { transform, textured } = model(f);
  const result = { transforms: 0, faceRecords: 0, wholeFaces: 0, fields: {}, centres: [0, 0], texturedFaces: 0, texturedFields: {}, packetsSkipped: 0, offsets: {}, problems: [] };
  const problem = (text) => { if (result.problems.length < 12) result.problems.push(text); };

  // Last transform per face array, in file order; then each emitter call checks the record it was handed.
  const lastByArray = new Map();
  // The centre the emitters are handed comes from the call that asked for it: a split rod's pieces
  // are transformed with throwaway outputs (the three output pointers are one address).
  let centre = null;
  const texturedByPacket = new Map();
  for (const probe of trace.probes) {
    if (probe.pc === TRANSFORM) {
      const [rod, first, second, positions, normals, coordinates] = probe.mem.map((range) => range.bytes);
      const array = probe.gpr[7];
      if (array === 0) continue;
      if (!rod || !first || !second || !positions || !normals || !coordinates) { problem(`transform at frame ${probe.frame}: a probed range was not readable`); continue; }
      result.transforms += 1;
      const computed = transform({ rod, first: matrix(first, 0), second: matrix(second, 0), positions, normals, coordinates });
      lastByArray.set(array, { computed, seen: new Set() });
      if (probe.gpr[4] !== probe.gpr[5]) centre = { cx: computed.cx, cy: computed.cy, checked: false };
      continue;
    }
    let address, record, cx, cy;
    if (probe.pc === REFRACTED) {
      const frame = probe.mem[0].bytes;
      record = probe.mem[2].bytes;
      if (!frame || !record) continue;
      address = frame.readUInt32LE(0x10);
      cx = frame.readFloatLE(0);
      cy = frame.readFloatLE(8);
    } else if (probe.pc === TEXTURED) {
      record = probe.mem[0].bytes;
      address = probe.gpr[4];
      if (!record) continue;
      const key = `${probe.preroll}:${probe.at}`;
      if (!texturedByPacket.has(key)) texturedByPacket.set(key, []);
      texturedByPacket.get(key).push(probe);
    } else continue;

    // Which transform filled this record: the array whose base is the nearest at or below it.
    let owner = null, base = 0;
    for (const [array, entry] of lastByArray) if (array <= address && array > base && (address - array) % 0x160 === 0 && (address - array) / 0x160 < entry.computed.faces.length) { owner = entry; base = array; }
    if (!owner) continue;                       // filled before the trace began
    const index = (address - base) / 0x160;
    if (cx !== undefined && centre && REFRACTED_FROM(probe)) {
      // The rod function scales the centre by 0.9 before handing it on.
      const expectX = f(centre.cx * nearest(0.9)), expectY = f(centre.cy * nearest(0.9));
      if (!centre.checked) {
        centre.checked = true;
        result.centres[1] += 1;
        if (floatBits(expectX) === floatBits(cx) && floatBits(expectY) === floatBits(cy)) result.centres[0] += 1;
        else problem(`centre: emitter got (${cx}, ${cy}), computed (${expectX}, ${expectY})`);
      }
    }
    if (owner.seen.has(index)) continue;        // the same record is handed to several passes
    owner.seen.add(index);
    result.faceRecords += 1;
    if (compareFace(owner.computed.faces[index], record, result.fields)) result.wholeFaces += 1;
    else problem(`face record ${index} of the array at 0x${base.toString(16)} (frame ${probe.frame}) differs from the computed one`);
  }

  // Textured emitter: what was sent against what the formula gives.
  const lists = { true: trace.preroll, false: trace.packets };
  const tally = (name, same) => { result.texturedFields[name] ??= [0, 0]; result.texturedFields[name][1] += 1; if (same) result.texturedFields[name][0] += 1; return same; };
  for (const [key, group] of texturedByPacket) {
    const [preroll, at] = key.split(':');
    const packet = lists[preroll][Number(at)];
    if (!packet) continue;
    const sent = facesOf(packet).filter((face) => face.uv === 0);
    if (sent.length !== group.length || facesOf(packet).length !== group.length) { result.packetsSkipped += 1; continue; }
    group.forEach((probe, index) => {
      const [record, colour, rod] = probe.mem.map((range) => range.bytes);
      if (!colour) { problem(`textured face: colour not readable`); return; }
      const ds = asFloat(probe.fpr[12]);
      const dt = asFloat(probe.fpr[13]);
      const expected = textured(record, colour, ds, dt);
      const actual = sent[index];
      result.texturedFaces += 1;
      tally('PRIM 0x54', actual.prim === 0x54);
      for (let k = 0; k < 4; k++) {
        if (!tally('ST', actual.st[k] === expected[k].st)) problem(`textured ST: sent 0x${(actual.st[k] ?? 0n).toString(16)}, computed 0x${expected[k].st.toString(16)}`);
        tally('RGBAQ', actual.rgbaq[k] === expected[k].rgbaq);
        tally('XYZ', actual.xyz[k] === expected[k].xyz);
      }
      // Where the offsets come from: phase + i * 0.1, the second pass adding the rod's own pair.
      if (rod && fromRodFunction(probe)) {
        const phase = f(rod.readInt32LE(0) * nearest(0.1));
        const own = [rod.readFloatLE(0xb0), rod.readFloatLE(0xb4)];
        let kind = 'neither form';
        for (let i = 0; i < 32 && kind === 'neither form'; i++) {
          const stepped = f(phase + f(i * nearest(0.1)));
          if (floatBits(stepped) === floatBits(ds) && floatBits(stepped) === floatBits(dt)) kind = 'phase + i * 0.1';
          else if (floatBits(f(stepped + own[0])) === floatBits(ds) && floatBits(f(stepped + own[1])) === floatBits(dt)) kind = 'phase + i * 0.1 + rod pair';
        }
        result.offsets[kind] = (result.offsets[kind] ?? 0) + 1;
      } else {
        result.offsets['not from the main rod function, not explained here'] = (result.offsets['not from the main rod function, not explained here'] ?? 0) + 1;
      }
    });
  }
  return result;
}

if (process.argv[1] && process.argv[1].endsWith('verify_rod.mjs')) {
  const rounding = process.argv[3] === 'nearest' ? nearest : chop;
  const result = verify(process.argv[2], rounding);
  const line = (name, [same, total]) => console.log(`  ${name.padEnd(18)} ${same} of ${total} equal`);
  console.log(`build: ${BUILD_NAME}   rounding: ${rounding === chop ? 'toward zero' : 'to nearest'}`);
  console.log(`transform calls probed: ${result.transforms}   face records compared: ${result.faceRecords}   equal in every field: ${result.wholeFaces}`);
  for (const [name, pair] of Object.entries(result.fields)) line(name, pair);
  line('rod centre', result.centres);
  console.log(`textured faces compared: ${result.texturedFaces}   packets skipped (another emitter writes into them): ${result.packetsSkipped}`);
  for (const [name, pair] of Object.entries(result.texturedFields)) line(name, pair);
  console.log(`  offsets: ${Object.entries(result.offsets).map(([kind, count]) => `${count} ${kind}`).join(', ')}`);
  for (const text of result.problems) console.log(`  ! ${text}`);
  const pairs = [...Object.values(result.fields), ...Object.values(result.texturedFields), result.centres];
  const whole = pairs.every(([same, total]) => same === total) && result.faceRecords > 0 && result.texturedFaces > 0;
  console.log(`verdict: ${whole ? `FOUND ${result.faceRecords} face records and ${result.texturedFaces} textured faces, every value equal` : 'PARTIAL the formulas do not reproduce everything'}`);
  process.exit(whole ? 0 : 3);
}
