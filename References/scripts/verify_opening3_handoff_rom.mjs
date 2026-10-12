// Copy of verify_opening_handoff_rom.mjs that also names the branch each hand-off took (the forced-clock
// exit, the hard-disk ready branch, the table by the snapshot) and counts them, reads the jump table
// 0x002C41A0 from the ROM image instead of listing its states, and takes the exec word at the exit for the
// ready branch (the function loops on it while it is 0). For the captures that stimulate the branches.
//
// The opening's hand-off on ROM 2.30 (0x002164A8, called by the module's thread 0x002161C8 after
// the scene loop; other code than HDD OSD's opening_transition_to_clock), on a raw ROM trace: what
// it leaves in execute_app_type (0x001F0014), the current module (0x001F05E8) and the
// previous-was-opening word (0x001F05EC), recomputed from the state at its entry. Read:
//
//   execute = -1
//   if the clock is forced (0x002058E0: 0x0027B394 == 0) and the disk is not ready and exec != 1:
//       module 2, previous 1, return
//   if the disk is ready (0x00205910: 0x0027B398 != 0): previous 1; loop while exec (0x0027B39C) is 0
//       (module 0, execute -1); exec 1: module 0, execute 6; any other: module 2, previous 1
//   switch on the disc state kept at the snapshot (0x002C86A8), table 0x002C41A0 (0x6A..0x75):
//       0x216634: execute 2   0x216620: execute 1   0x216610: execute 0   0x2165FC: execute 5
//       0x2165E8: execute 4   0x216648: execute 3   0x21665C: module 4
//       0x2165B4: module 5 when the CDDA count (0x001F0CF8) is positive, else module 2
//       0x216668 and anything outside the table: module 2
//   if execute is still -1: previous 1
//
//   0x002164A8  entry      0x00216698  the common return
//
// node verify_opening3_handoff_rom.mjs <raw ROM trace.jsonl>
import { dataPath } from '../lib/data.mjs';
import fs from 'node:fs';
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);

export const PROBES = [
  { pc: '0x002164a8', ranges: ['0x002c86a8:0x4', '0x001f0010:0x4', '0x001f0cf8:0x4', '0x002c8600:0x4', '0x00288e30:0x10', '0x0027b394:0xc', '0x001f05e8:0x8'] },
  { pc: '0x00216698', ranges: ['0x001f0014:0x4', '0x001f05e8:0x8', '0x0027b394:0xc'] },
];
const [ENTRY, EXIT] = PROBES.map((probe) => parseInt(probe.pc, 16));
const image = () => fs.readFileSync(dataPath('dumps/rom-0230A-clock-ee-00100000.bin'));

/** The jump table at 0x002C41A0: disc states 0x6A..0x75. */
function byDisc(state, saved) {
  const index = (state - 0x6a) >>> 0;
  const target = index < 12 ? image().readUInt32LE(0x002c41a0 - 0x00100000 + index * 4) : 0x00216668;
  switch (target) {
    case 0x002165b4: return { module: saved > 0 ? 5 : 2 };
    case 0x002165e8: return { execute: 4 };
    case 0x002165fc: return { execute: 5 };
    case 0x00216610: return { execute: 0 };
    case 0x00216620: return { execute: 1 };
    case 0x00216634: return { execute: 2 };
    case 0x00216648: return { execute: 3 };
    case 0x0021665c: return { module: 4 };
    case 0x00216668: return { module: 2 };
    default: throw new Error(`jump table target 0x${target.toString(16)} is not handled`);
  }
}

export function handoff({ snapshot, cdda, shouldEnter, ready, exec, execAtExit, module: module0, previous: previous0 }) {
  let execute = -1, module = module0, previous = previous0;
  if (shouldEnter === 0 && ready === 0 && exec !== 1) return { execute, module: 2, previous: 1, branch: 'forced-clock exit' };
  let branch = `table, snapshot 0x${snapshot.toString(16)}`;
  if (ready !== 0) {
    previous = 1;
    if (execAtExit === 1) { module = 0; execute = 6; branch = 'hard-disk ready, exec 1'; } else { module = 2; previous = 1; branch = `hard-disk ready, exec ${execAtExit}`; }
  }
  const choice = byDisc(snapshot, cdda);
  if (choice.module !== undefined) module = choice.module;
  if (choice.execute !== undefined) execute = choice.execute;
  if (ready !== 0) branch += ` (then the table: ${JSON.stringify(choice)})`;
  if (execute === -1) previous = 1;
  return { execute, module, previous, branch };
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
    const input = { snapshot: snapshot.readInt32LE(0), cdda: cdda.readInt32LE(0), shouldEnter: boot.readInt32LE(0), ready: boot.readInt32LE(4), exec: boot.readInt32LE(8), execAtExit: exit.mem[2] ? exit.mem[2].bytes.readInt32LE(8) : boot.readInt32LE(8), module: before.readInt32LE(0), previous: before.readInt32LE(4) };
    const want = handoff(input);
    const got = { execute: exit.mem[0].bytes.readInt32LE(0), module: exit.mem[1].bytes.readInt32LE(0), previous: exit.mem[1].bytes.readInt32LE(4) };
    const bad = ['execute', 'module', 'previous'].filter((key) => want[key] !== got[key]);
    if (bad.length) result.problems.push(`frame ${entry.frame}: ${bad.map((key) => `${key}: left ${got[key]}, computed ${want[key]}`).join('; ')}`);
    result.calls.push({ frame: entry.frame, counter: counter.readUInt32LE(0), z: camera.readFloatLE(8), snapshot: input.snapshot, disc: disc.readInt32LE(0), branch: want.branch, got });
  });
  return result;
}

if (process.argv[1] && process.argv[1].endsWith('verify_opening3_handoff_rom.mjs')) {
  const result = verify(process.argv[2]);
  for (const call of result.calls) console.log(`frame ${call.frame} (module counter ${call.counter}, camera z ${call.z}): disc state at the snapshot 0x${call.snapshot.toString(16)}, now 0x${call.disc.toString(16)}; branch: ${call.branch}; left: execute ${call.got.execute}, module ${call.got.module}, previous-was-opening ${call.got.previous}`);
  for (const text of result.problems) console.log(`  ! ${text}`);
  const whole = result.calls.length > 0 && result.problems.length === 0;
  console.log(`verdict: ${whole ? `FOUND ${result.calls.length} hand-off of the opening on ROM 2.30, every value it leaves equal` : 'PARTIAL see the lines marked !'}`);
  process.exit(whole ? 0 : 3);
}
