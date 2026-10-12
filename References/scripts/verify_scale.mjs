// The scene scale eases toward a target: recompute each frame's step from what the function
// read and compare with what it wrote. Build: ROM 2.30 (function 0x0022e910, HDD func_00232640).
// node verify_scale.mjs <trace.jsonl>
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { pick, range, pc, BUILD_NAME } from './builds.mjs';

// The easing function, the function called after it, scale, target, factor, and (HDD OSD only)
// the flag that says the time record has been filled: while it is 0 HDD OSD keeps the scale at 0.
const A = pick({
  rom: { ease: 0x0022e910, next: 0x0022eb10, scale: 0x0028a340, target: 0x002c88ac, factor: 0x002c81b4, filled: null },
  hdd: { ease: 0x00232640, next: 0x00232878, scale: 0x002b2170, target: 0x00370294, factor: 0x0036fc10, filled: 0x00370324 },
});
export const PROBES = [
  { pc: pc(A.ease), ranges: [range(A.scale, 4), range(A.target, 4), range(A.factor, 4)].concat(A.filled ? [range(A.filled, 4)] : []) },
  { pc: pc(A.next), ranges: [range(A.scale, 4)] },
];
const bits = new DataView(new ArrayBuffer(4));
const f = (x) => {
  const near = Math.fround(x);
  if (Math.abs(near) <= Math.abs(x) || !Number.isFinite(near)) return near;
  bits.setFloat32(0, near);
  bits.setUint32(0, bits.getUint32(0) - 1);
  return bits.getFloat32(0);
};

if (process.argv[1] && process.argv[1].endsWith('verify_scale.mjs')) {
  const probes = readTrace(process.argv[2]).probes;
  let equal = 0, total = 0, moved = 0;
  const shown = [];
  for (let n = 0; n + 1 < probes.length; n++) {
    if (probes[n].pc !== A.ease || probes[n + 1].pc !== A.next) continue;
    const [scale, target, factor] = probes[n].mem.slice(0, 3).map((entry) => entry.bytes.readFloatLE(0));
    const filled = A.filled ? probes[n].mem[3].bytes.readInt32LE(0) !== 0 : true;
    const want = filled ? f(f(f(target - scale) * factor) + scale) : 0;
    const got = probes[n + 1].mem[0].bytes.readFloatLE(0);
    total += 1;
    if (Object.is(want, got)) equal += 1;
    if (got !== scale) moved += 1;
    if (shown.length < 4) shown.push(`frame ${probes[n].frame}: scale ${scale} -> ${got}, target ${target}, factor ${factor}`);
  }
  console.log(`build: ${BUILD_NAME}`);
  for (const line of shown) console.log(line);
  console.log(`steps ${equal} of ${total} equal; the scale moved in ${moved}`);
  console.log(`verdict: ${total > 0 && equal === total && moved > 0 ? 'FOUND every step equal' : 'PARTIAL'}`);
  process.exit(total > 0 && equal === total && moved > 0 ? 0 : 3);
}
