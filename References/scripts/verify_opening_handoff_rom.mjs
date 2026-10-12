// The opening's hand-off on ROM 2.30 (0x002164A8, called by the module's thread 0x002161C8 after
// the scene loop; other code than HDD OSD's opening_transition_to_clock), on a raw ROM trace: what
// it leaves in execute_app_type (0x001F0014), the current module (0x001F05E8) and the
// previous-was-opening word (0x001F05EC), recomputed from the state at its entry. Read:
//
//   execute = -1
//   if the clock is forced (0x002058E0: 0x0027B394 == 0) and the disk is not ready and exec != 1:
//       module 2, previous 1, return
//   if the disk is ready: previous 1; wait while exec is 0 (module 0, execute -1);
//       exec 1: module 0, execute 6;  any other: module 2, previous 1
//   switch on the disc state kept at the snapshot (0x002C86A8), table 0x002C41A0 (0x6A..0x75):
//       0x6A, 0x6B: execute 2   0x6C, 0x6D: execute 1   0x6E: execute 0   0x6F: execute 5
//       0x70: execute 4   0x73, 0x75: execute 3   0x74: module 4
//       0x72: module 5 when the CDDA count (0x001F0CF8) is positive, else module 2
//       0x71 and anything else: module 2
//   if execute is still -1: previous 1
//
//   0x002164A8  entry      0x00216698  the common return
//
// node verify_opening_handoff_rom.mjs <raw ROM trace.jsonl>
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);

export const PROBES = [
  { pc: '0x002164a8', ranges: ['0x002c86a8:0x4', '0x001f0010:0x4', '0x001f0cf8:0x4', '0x002c8600:0x4', '0x00288e30:0x10', '0x0027b394:0xc', '0x001f05e8:0x8'] },
  { pc: '0x00216698', ranges: ['0x001f0014:0x4', '0x001f05e8:0x8'] },
];
const [ENTRY, EXIT] = PROBES.map((probe) => parseInt(probe.pc, 16));

export function handoff({ snapshot, cdda, shouldEnter, ready, exec, module: module0, previous: previous0 }) {
  let execute = -1, module = module0, previous = previous0;
  if (shouldEnter === 0 && ready === 0 && exec !== 1) return { execute, module: 2, previous: 1 };
  if (ready !== 0) {
    previous = 1;
    if (exec === 1) { module = 0; execute = 6; } else { module = 2; previous = 1; }
  }
  const byState = { 0x6a: ['e', 2], 0x6b: ['e', 2], 0x6c: ['e', 1], 0x6d: ['e', 1], 0x6e: ['e', 0], 0x6f: ['e', 5], 0x70: ['e', 4], 0x73: ['e', 3], 0x75: ['e', 3], 0x74: ['m', 4] };
  const choice = snapshot === 0x72 ? ['m', cdda > 0 ? 5 : 2] : byState[snapshot] ?? ['m', 2];
  if (choice[0] === 'e') execute = choice[1]; else module = choice[1];
  if (execute === -1) previous = 1;
  return { execute, module, previous };
}

export function verify(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const result = { calls: [], problems: [] };
  const probes = trace.probes.filter((probe) => !probe.preroll);
  probes.forEach((entry, n) => {
    if (entry.pc !== ENTRY) return;
    const exit = probes.slice(n + 1).find((probe) => probe.pc === EXIT);
    if (!exit) return;
    const [snapshot, disc, cdda, counter, camera, boot, before] = entry.mem.map((range) => range.bytes);
    const input = { snapshot: snapshot.readInt32LE(0), cdda: cdda.readInt32LE(0), shouldEnter: boot.readInt32LE(0), ready: boot.readInt32LE(4), exec: boot.readInt32LE(8), module: before.readInt32LE(0), previous: before.readInt32LE(4) };
    const want = handoff(input);
    const got = { execute: exit.mem[0].bytes.readInt32LE(0), module: exit.mem[1].bytes.readInt32LE(0), previous: exit.mem[1].bytes.readInt32LE(4) };
    const bad = Object.keys(want).filter((key) => want[key] !== got[key]);
    if (bad.length) result.problems.push(`frame ${entry.frame}: ${bad.map((key) => `${key}: left ${got[key]}, computed ${want[key]}`).join('; ')}`);
    result.calls.push({ frame: entry.frame, counter: counter.readUInt32LE(0), z: camera.readFloatLE(8), snapshot: input.snapshot, disc: disc.readInt32LE(0), got });
  });
  return result;
}

if (process.argv[1] && process.argv[1].endsWith('verify_opening_handoff_rom.mjs')) {
  const result = verify(process.argv[2]);
  for (const call of result.calls) console.log(`frame ${call.frame} (module counter ${call.counter}, camera z ${call.z}): disc state at the snapshot 0x${call.snapshot.toString(16)}, now 0x${call.disc.toString(16)}; left: execute ${call.got.execute}, module ${call.got.module}, previous-was-opening ${call.got.previous}`);
  for (const text of result.problems) console.log(`  ! ${text}`);
  const whole = result.calls.length > 0 && result.problems.length === 0;
  console.log(`verdict: ${whole ? `FOUND ${result.calls.length} hand-off of the opening on ROM 2.30, every value it leaves equal` : 'PARTIAL see the lines marked !'}`);
  process.exit(whole ? 0 : 3);
}
