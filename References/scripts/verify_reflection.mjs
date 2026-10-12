// Recompute the reflection-mapped faces of the crystal clock's extra passes, and the edge term F
// of the refracted faces, from the inputs the code really got; compare with what was really
// sent or passed on. Build: ROM 2.30.
//
//   reflection emitter 0x002333b8  face record + rod record + aa  ->  PRIM, RGBAQ, four UV and XYZ
//   refraction wrapper 0x00232da0 -> 0x002329f8                    ->  F handed to the emitter
//
// node verify_reflection.mjs <trace.jsonl>
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { pick, range, pc, BUILD, BUILD_NAME } from './builds.mjs';
import { GifPath } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/gif.js';
import { REG } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/registers.js';

const A = pick({
  rom: { reflected: 0x002333b8, refracted: 0x002329f8, field: 0x0028a348, screen: 0x001f0c50 },
  hdd: { reflected: 0x00236e20, refracted: 0x002365d0, field: 0x002b2178, screen: 0x001f0cb4 },
});
export const REFLECTED = A.reflected;
export const REFRACTED = A.refracted;
export const PROBES = [
  { pc: pc(A.reflected), ranges: ['a0:0x160', 'a1:0xd0'] },
  { pc: pc(A.refracted), ranges: ['v0:0x20', '*v0+0x4:0xc0', '*v0+0x10:0x160', range(A.field, 4), range(A.screen, 8)] },
];

const bits = new DataView(new ArrayBuffer(4));
/** One single-precision operation cut toward zero. */
const f = (x) => {
  const near = Math.fround(x);
  if (Math.abs(near) <= Math.abs(x) || !Number.isFinite(near)) return near;
  bits.setFloat32(0, near);
  bits.setUint32(0, bits.getUint32(0) - 1);
  return bits.getFloat32(0);
};
const floatBits = (x) => { bits.setFloat32(0, x); return bits.getUint32(0); };
const asFloat = (u32) => { bits.setUint32(0, u32 >>> 0); return bits.getFloat32(0); };
const vector = (buffer, at) => [0, 4, 8, 12].map((k) => buffer.readFloatLE(at + k));

// sceVu0Normalize as the ROM has it: x*x, + y*y, + z*z; Q = sqrt; Q = 1 / that; xyz * Q.
const normalize = (v) => {
  const length = f(Math.sqrt(f(f(f(v[0] * v[0]) + f(v[1] * v[1])) + f(v[2] * v[2]))));
  const inverse = f(1 / length);
  return [f(v[0] * inverse), f(v[1] * inverse), f(v[2] * inverse)];
};
// sceVu0InnerProduct: the three products, then x + y, then + z.
const dot = (a, b) => f(f(f(a[0] * b[0]) + f(a[1] * b[1])) + f(a[2] * b[2]));
/** libgcc's float to unsigned as the ROM has it: nothing below zero, otherwise cut. */
const toUnsigned = (x) => (x > 0 ? Math.trunc(x) >>> 0 : 0);

/** The edge term the refraction wrapper hands on: 1 - |dot(normalize(view position of vertex 0), normal)|. */
export function edgeTerm(face) {
  const d = dot(normalize(vector(face, 0)), vector(face, 0x140));
  return f(1 - (d < 0 ? -d : d));
}

export function expectReflected(face, rod, aa) {
  const normal = vector(face, 0x140);
  const rgba = (rod.readInt32LE(0xc0) | (rod.readInt32LE(0xc4) << 8) | (rod.readInt32LE(0xc8) << 16) | (rod.readInt32LE(0xcc) << 24)) >>> 0;
  const vertices = [];
  for (let k = 0; k < 4; k++) {
    const at = k * 0x50;
    const eye = normalize(vector(face, at));
    const d = dot(eye, normal);
    const twice = f(d + d);
    const amount = twice < 0 ? -twice : twice;
    const r = [0, 1].map((i) => f(eye[i] + f(normal[i] * amount)));
    const u = toUnsigned(f(f(r[0] + 1) * 512));
    const v = toUnsigned(f(f(r[1] + 1) * 256));
    vertices.push({
      uv: BigInt(u) | (BigInt(v) << 16n),
      xyz: BigInt.asUintN(64, BigInt(face.readInt32LE(at + 0x30)) | (BigInt(face.readInt32LE(at + 0x34)) << 16n) | (BigInt(face.readInt32LE(at + 0x38)) << 32n)),
    });
  }
  return { prim: aa ? 0x194 : 0x114, rgba, vertices };
}

function facesOf(packet) {
  const faces = [];
  let current = null;
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
  const result = { edge: [0, 0], faces: 0, fields: { prim: [0, 0], rgba: [0, 0], uv: [0, 0], xyz: [0, 0] }, problems: [], uvRange: [Infinity, -Infinity, Infinity, -Infinity] };
  const problem = (text) => { if (result.problems.length < 12) result.problems.push(text); };

  const groups = new Map();
  for (const probe of trace.probes) {
    if (probe.pc === REFRACTED) {
      const face = probe.mem[2]?.bytes;
      if (!face) continue;
      const expected = edgeTerm(face);
      result.edge[1] += 1;
      if (floatBits(expected) === probe.fpr[12]) result.edge[0] += 1;
      else problem(`edge term: emitter got ${asFloat(probe.fpr[12])}, computed ${expected}`);
    } else if (probe.pc === REFLECTED) {
      const key = `${probe.preroll}:${probe.at}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(probe);
    }
  }

  const lists = { true: trace.preroll, false: trace.packets };
  for (const [key, group] of groups) {
    const [preroll, at] = key.split(':');
    const packet = lists[preroll][Number(at)];
    if (!packet) continue;
    const sent = facesOf(packet);
    if (sent.length !== group.length) { problem(`packet ${key}: ${group.length} emitter calls, ${sent.length} faces sent`); continue; }
    group.forEach((probe, index) => {
      const [face, rod] = probe.mem.map((range) => range.bytes);
      if (!face || !rod) { problem(`packet ${key} face ${index}: a probed range was not readable`); return; }
      const expected = expectReflected(face, rod, probe.gpr[6]);
      const actual = sent[index];
      result.faces += 1;
      const check = (name, same, describe) => {
        result.fields[name][1] += 1;
        if (same) result.fields[name][0] += 1; else problem(`packet ${key} face ${index} ${name}: ${describe()}`);
      };
      check('prim', actual.prim === expected.prim, () => `sent 0x${actual.prim.toString(16)}, computed 0x${expected.prim.toString(16)}`);
      check('rgba', actual.rgba === expected.rgba, () => `sent 0x${(actual.rgba ?? 0).toString(16)}, computed 0x${expected.rgba.toString(16)}`);
      for (let k = 0; k < 4; k++) {
        check('uv', actual.uv[k] === expected.vertices[k].uv, () => `vertex ${k} sent 0x${(actual.uv[k] ?? 0n).toString(16)}, computed 0x${expected.vertices[k].uv.toString(16)}`);
        check('xyz', actual.xyz[k] === expected.vertices[k].xyz, () => `vertex ${k} xyz differs`);
        const u = Number(expected.vertices[k].uv & 0xffffn) / 16, v = Number(expected.vertices[k].uv >> 16n) / 16;
        result.uvRange = [Math.min(result.uvRange[0], u), Math.max(result.uvRange[1], u), Math.min(result.uvRange[2], v), Math.max(result.uvRange[3], v)];
      }
    });
  }
  return result;
}

if (process.argv[1] && process.argv[1].endsWith('verify_reflection.mjs')) {
  const result = verify(process.argv[2]);
  console.log(`edge term F of refracted faces: ${result.edge[0]} of ${result.edge[1]} equal`);
  console.log(`reflected faces compared: ${result.faces}`);
  for (const [name, [same, total]] of Object.entries(result.fields)) console.log(`  ${name.padEnd(5)} ${same} of ${total} equal`);
  console.log(`  texels addressed: U ${result.uvRange[0].toFixed(2)}..${result.uvRange[1].toFixed(2)}, V ${result.uvRange[2].toFixed(2)}..${result.uvRange[3].toFixed(2)}`);
  for (const text of result.problems) console.log(`  ! ${text}`);
  const whole = result.edge[0] === result.edge[1] && result.edge[1] > 0 && result.faces > 0 && Object.values(result.fields).every(([same, total]) => same === total);
  console.log(`verdict: ${whole ? `FOUND ${result.faces} reflected faces and ${result.edge[1]} edge terms, every value equal` : 'PARTIAL the formulas do not reproduce everything'}`);
  process.exit(whole ? 0 : 3);
}
