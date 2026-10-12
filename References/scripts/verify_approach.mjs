// The camera's approach: an offset added to the camera's z decays by a factor every frame.
// Recompute each step and the position handed to the view matrix builder. Build: ROM 2.30
// (0x00221610, HDD module_clock_225F38; 0x00235360, HDD module_clock_238DC0).
// node verify_approach.mjs <trace.jsonl>
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { pick, range, pc, BUILD_NAME } from './builds.mjs';

// Camera set-up, the view matrix builder it calls, its return; the offset, the position, the factor.
const A = pick({
  rom: { camera: 0x00221610, builder: 0x00235360, done: 0x002216d0, offset: 0x002c8f20, position: 0x0028a360, factor: 0x002c8110 },
  hdd: { camera: 0x00225f38, builder: 0x00238dc0, done: 0x00225ff8, offset: 0x00370a80, position: 0x002b2190, factor: 0x0036fb90 },
});
export const PROBES = [
  { pc: pc(A.camera), ranges: [range(A.offset, 4), range(A.position, 0x10), range(A.factor, 4)] },
  { pc: pc(A.builder), ranges: ['a1:0x10'] },
  { pc: pc(A.done), ranges: [range(A.offset, 4)] },
];
const bits = new DataView(new ArrayBuffer(4));
const f = (x) => {
  const near = Math.fround(x);
  if (Math.abs(near) <= Math.abs(x) || !Number.isFinite(near)) return near;
  bits.setFloat32(0, near);
  bits.setUint32(0, bits.getUint32(0) - 1);
  return bits.getFloat32(0);
};

if (process.argv[1] && process.argv[1].endsWith('verify_approach.mjs')) {
  const probes = readTrace(process.argv[2]).probes;
  const count = { position: [0, 0], decay: [0, 0] };
  const shown = [];
  let moving = 0;
  for (let n = 0; n + 2 < probes.length; n++) {
    if (probes[n].pc !== A.camera || probes[n + 1].pc !== A.builder || probes[n + 2].pc !== A.done) continue;
    const offset = probes[n].mem[0].bytes.readFloatLE(0);
    const base = probes[n].mem[1].bytes;
    const factor = probes[n].mem[2].bytes.readFloatLE(0);
    const handed = probes[n + 1].mem[0].bytes;
    const z = f(base.readFloatLE(8) + offset);
    count.position[1] += 1;
    if (handed.readFloatLE(0) === base.readFloatLE(0) && handed.readFloatLE(4) === base.readFloatLE(4) && Object.is(handed.readFloatLE(8), z)) count.position[0] += 1;
    const next = probes[n + 2].mem[0].bytes.readFloatLE(0);
    count.decay[1] += 1;
    if (Object.is(next, f(offset * factor))) count.decay[0] += 1;
    if (Math.abs(offset) > 1e-3) moving += 1;
    if (shown.length < 3 || (moving === 60 && shown.length < 4)) shown.push(`frame ${probes[n].frame}: offset ${offset} -> ${next} (factor ${factor}); camera z ${handed.readFloatLE(8)}`);
  }
  console.log(`build: ${BUILD_NAME}`);
  for (const line of shown) console.log(line);
  console.log(`camera position handed on: ${count.position[0]} of ${count.position[1]} equal`);
  console.log(`offset decay: ${count.decay[0]} of ${count.decay[1]} equal; frames with the offset above 0.001: ${moving}`);
  const whole = count.decay[1] > 0 && count.position[0] === count.position[1] && count.decay[0] === count.decay[1] && moving > 0;
  console.log(`verdict: ${whole ? 'FOUND every step equal' : 'PARTIAL'}`);
  process.exit(whole ? 0 : 3);
}
