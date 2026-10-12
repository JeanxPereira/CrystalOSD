// The split rod and the texture offsets of every textured face, in the main rod function and in
// the extra passes: recompute the two pieces' records and every (ds, dt) handed to the textured
// emitter, and compare with what the code really passed. Build: ROM 2.30.
//
//   0x00233f60  main rod function (HDD module_clock_237A28)   a0 rod, f12 t
//   0x00234a68  extra passes      (HDD module_clock_2384C8)   a0 rod, a1 pass, f12 t
//   0x002335e8  transform         (HDD func_00237010)         a3 face array, t0 rod record
//   0x00232e38  textured emitter  (HDD func_00236A20)         a0 face, a1 colour, f12 ds, f13 dt
//
// node verify_rod_pieces.mjs <trace.jsonl>
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { pick, pc, BUILD_NAME } from './builds.mjs';

// Main rod function, extra passes, transform, textured emitter, per build.
const A = pick({ rom: [0x00233f60, 0x00234a68, 0x002335e8, 0x00232e38], hdd: [0x00237a28, 0x002384c8, 0x00237010, 0x00236a20] });
export const PROBES = [
  { pc: pc(A[0]), ranges: ['a0:0xe0'] },
  { pc: pc(A[1]), ranges: ['a0:0xe0'] },
  { pc: pc(A[2]), ranges: ['t0:0xe0'] },
  { pc: pc(A[3]), ranges: ['a0:0x160'] },
];
const [MAIN, EXTRA, TRANSFORM, TEXTURED] = A;

const bits = new DataView(new ArrayBuffer(4));
const f = (x) => {
  const near = Math.fround(x);
  if (Math.abs(near) <= Math.abs(x) || !Number.isFinite(near)) return near;
  bits.setFloat32(0, near);
  bits.setUint32(0, bits.getUint32(0) - 1);
  return bits.getFloat32(0);
};
const asFloat = (u32) => { bits.setUint32(0, u32 >>> 0); return bits.getFloat32(0); };
const same = (a, b) => Object.is(a, b);
const TENTH = Math.fround(0.1);
const vector = (buffer, at) => [0, 4, 8, 12].map((k) => buffer.readFloatLE(at + k));
const apply = (m, v) => [0, 1, 2, 3].map((i) => f(f(f(f(m[0][i] * v[0]) + f(m[1][i] * v[1])) + f(m[2][i] * v[2])) + f(m[3][i] * v[3])));

export function verify(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const checks = {};
  const problems = [];
  const check = (name, ok, text) => {
    checks[name] ??= [0, 0];
    checks[name][1] += 1;
    if (ok) checks[name][0] += 1;
    else if (problems.length < 14) problems.push(`${name}: ${text()}`);
    return ok;
  };
  const forms = {};
  let call = null;
  for (const probe of trace.probes) {
    if (probe.pc === MAIN || probe.pc === EXTRA) {
      const rod = probe.mem[0].bytes;
      call = rod && { extra: probe.pc === EXTRA, rod, at: probe.gpr[4], t: asFloat(probe.fpr[12]), pass: probe.gpr[5], transforms: [], frame: probe.frame };
      continue;
    }
    if (!call) continue;
    const s = call.rod.readFloatLE(0x6c);
    const split = call.t > 0;
    if (probe.pc === TRANSFORM) {
      const record = probe.mem[0].bytes;
      if (!record) continue;
      const n = call.transforms.length;
      call.transforms.push({ array: probe.gpr[7], at: probe.gpr[8], record });
      const where = () => `frame ${call.frame} rod ${call.rod.readInt32LE(0)} ${call.extra ? `extra pass ${call.pass}` : 'main'}`;
      if (n === 0) check('first transform is the rod itself', probe.gpr[8] === call.at, where);
      else if (!split) continue;                 // transforms that follow a whole rod belong to other callers
      else if (n === 1) {
        check('piece A: length scale = t * s', same(record.readFloatLE(0x6c), f(call.t * s)), () => `${where()}: ${record.readFloatLE(0x6c)} against ${f(call.t * s)}`);
        check('piece A: matrix is the rod\'s', record.subarray(0x20, 0x60).equals(call.rod.subarray(0x20, 0x60)), where);
      } else if (n === 2) {
        check('piece B: length scale = (1 - t) * s', same(record.readFloatLE(0x6c), f(f(1 - call.t) * s)), () => `${where()}: ${record.readFloatLE(0x6c)} against ${f(f(1 - call.t) * s)}`);
        const m = [0, 16, 32, 48].map((k) => vector(call.rod, 0x20 + k));
        const moved = apply(m, [0, f(f(s * 26) * call.t), 0, 1]);
        check('piece B: moved along its axis by s * 26 * t', [0, 1, 2, 3].every((c) => same(record.readFloatLE(0x50 + c * 4), moved[c])) && record.subarray(0x20, 0x50).equals(call.rod.subarray(0x20, 0x50)),
          () => `${where()}: row ${vector(record, 0x50)} against ${moved}`);
      }
      continue;
    }
    if (probe.pc !== TEXTURED) continue;
    const face = probe.mem[0].bytes;
    if (!face) continue;
    // The piece is the last transform into the array this face record lies in.
    let owner = null, index = -1;
    call.transforms.forEach((entry, n) => {
      const offset = probe.gpr[4] - entry.array;
      if (entry.array && offset >= 0 && offset % 0x160 === 0 && offset / 0x160 < 16) { owner = { ...entry, n }; index = offset / 0x160; }
    });
    if (!owner) continue;
    const piece = !split ? 'whole' : owner.n === 1 ? 'A' : 'B';
    const where = () => `frame ${call.frame} rod ${call.rod.readInt32LE(0)} ${call.extra ? `extra pass ${call.pass}` : 'main'} piece ${piece} face ${index}`;
    check('split rod is transformed three times, a whole one once', call.transforms.length === (split ? 3 : 1), where);
    check('colour pointer', probe.gpr[5] === owner.at + (call.extra ? 0xd0 : 0xa0), () => `${where()}: 0x${probe.gpr[5].toString(16)}`);
    check('side of the face', (face.readInt32LE(0x150) !== 0) === call.extra, where);
    if (piece === 'A') check('piece A draws faces 8 and up', index >= 8, where);
    if (piece === 'B') check('piece B draws every face but 8 and 9', index !== 8 && index !== 9, where);

    const ds = asFloat(probe.fpr[12]), dt = asFloat(probe.fpr[13]);
    const phase = f(call.rod.readInt32LE(0) * TENTH);
    const stepped = f(phase + f(index * TENTH));
    const pair = [call.rod.readFloatLE(0xb0), call.rod.readFloatLE(0xb4)];
    const lift = piece === 'B' ? f(f(call.t * s) + f(call.t * s)) : 0;
    const plain = [stepped, piece === 'B' ? f(stepped + lift) : stepped];
    const paired = [f(stepped + pair[0]), piece === 'B' ? f(f(stepped + pair[1]) + lift) : f(stepped + pair[1])];
    const isPlain = same(ds, plain[0]) && same(dt, plain[1]);
    const isPaired = same(ds, paired[0]) && same(dt, paired[1]);
    const form = isPlain && isPaired ? 'either' : isPlain ? 'phase + i * 0.1' : isPaired ? 'phase + i * 0.1 + rod pair' : 'neither';
    const key = `${call.extra ? `extra pass ${call.pass}` : 'main'}, piece ${piece}: ${form}`;
    forms[key] = (forms[key] ?? 0) + 1;
    check('offsets follow one of the two forms', form !== 'neither', () => `${where()}: ds ${ds} dt ${dt}; plain ${plain}; paired ${paired}`);
    if (call.extra) check('extra pass 0 has no pair, pass 1 has it', call.pass === 0 ? isPlain : isPaired, () => `${where()}: ${form}`);
  }
  return { checks, problems, forms };
}

if (process.argv[1] && process.argv[1].endsWith('verify_rod_pieces.mjs')) {
  const result = verify(process.argv[2]);
  console.log(`build: ${BUILD_NAME}`);
  let whole = Object.keys(result.checks).length > 0;
  for (const [name, [equal, total]] of Object.entries(result.checks)) {
    console.log(`  ${name.padEnd(58)} ${equal} of ${total}`);
    if (equal !== total) whole = false;
  }
  for (const [key, count] of Object.entries(result.forms).sort()) console.log(`  ${String(count).padStart(5)}  ${key}`);
  for (const text of result.problems) console.log(`  ! ${text}`);
  console.log(`verdict: ${whole ? 'FOUND every piece and every offset as read' : 'PARTIAL the reading does not reproduce everything'}`);
  process.exit(whole ? 0 : 3);
}
