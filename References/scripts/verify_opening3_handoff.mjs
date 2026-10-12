// Copy of verify_opening_handoff.mjs that also names the branch each hand-off took (the forced-clock
// exit, the table by the snapshot, the hard-disk ready exit) and counts them, for the captures that stimulate them.
// The previous-was-opening word (0x001F064C) is taken as 0 before the call (the original left it unchecked when
// the call does not set it): every hand-off that executes something leaves 0 there.
//
// The hand-off from the opening intro (HDD OSD 1.10U): opening_transition_to_clock (0x0021AEE0)
// chooses the next module and what to start from the disc state the intro snapshot in stage 2.
// Recomputed from the probed inputs and compared with what the function leaves:
//
//   0x001F0010  what to execute (-1 nothing)      0x001F0648  the next module
//   0x001F064C  1: the module before was the opening
//
//   0x0021AEE0 entry; 0x0021AEFC, 0x0021AF0C, 0x0021AF1C, 0x0021B034, 0x0021B044 after the calls
//   whose results it branches on (v0); 0x0021B088 the exit.
//
// node verify_opening3_handoff.mjs <trace.jsonl>
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { readElf } from './extract_opening_vu1.mjs';

export const PROBES = [
  { pc: '0x0021aee0', ranges: ['0x003700a0:0x4', '0x001f000c:0x4', '0x001f0d58:0x4', '0x00370000:0x4', '0x002b0c60:0x10'] },
  { pc: '0x0021aefc', ranges: [] },
  { pc: '0x0021af0c', ranges: [] },
  { pc: '0x0021af1c', ranges: [] },
  { pc: '0x0021b034', ranges: [] },
  { pc: '0x0021b044', ranges: [] },
  { pc: '0x0021b088', ranges: ['0x001f0010:0x4', '0x001f0648:0x8'] },
];
const [ENTRY, CLOCK_FIRST, READY_A, EXEC_A, READY_B, EXEC_B, EXIT] = PROBES.map((probe) => parseInt(probe.pc, 16));

/** The jump table at 0x00364F60: disc states 0x6A..0x74. */
function byDisc(state, saved) {
  const table = readElf()(0x00364f60, 11 * 4);
  const index = state - 0x6a;
  const target = index >= 0 && index < 11 ? table.readUInt32LE(index * 4) : 0x0021b020;
  switch (target) {
    case 0x0021af6c: return { module: saved > 0 ? 5 : 2 };
    case 0x0021afa0: return { execute: 4 };
    case 0x0021afb4: return { execute: 5 };
    case 0x0021afc8: return { execute: 0 };
    case 0x0021afd8: return { execute: 1 };
    case 0x0021afec: return { execute: 2 };
    case 0x0021b000: return { execute: 3 };
    case 0x0021b014: return { module: 4 };
    case 0x0021b020: return { module: 2 };
    default: throw new Error(`jump table target 0x${target.toString(16)} is not handled`);
  }
}

export function verify(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const result = { calls: [], problems: [] };
  const probes = trace.probes.filter((probe) => !probe.preroll);
  probes.forEach((entry, n) => {
    if (entry.pc !== ENTRY) return;
    const after = {};
    let exit = null;
    for (let k = n + 1; k < probes.length && !exit; k++) { if (probes[k].pc === EXIT) exit = probes[k]; else after[probes[k].pc] = probes[k].gpr[2] | 0; }
    if (!exit) return;
    const [snapshot, disc, saved, counter, camera] = entry.mem.map((range) => range.bytes);
    const before = { module: null, previous: 0 };
    let execute = -1, module = before.module, previous = before.previous, early = false;
    if (after[CLOCK_FIRST] !== 0 && after[READY_A] === 0 && after[EXEC_A] !== 1) { module = 2; previous = 1; early = true; }
    if (!early) {
      const chosen = byDisc(snapshot.readInt32LE(0), saved.readInt32LE(0));
      if (chosen.module !== undefined) module = chosen.module;
      if (chosen.execute !== undefined) execute = chosen.execute;
      if (after[READY_B] !== 0 && after[EXEC_B] === 1) { module = 0; previous = 1; execute = 6; }
      if (execute === -1) previous = 1;
    }
    const hardDisk = !early && after[READY_B] !== 0 && after[EXEC_B] === 1;
    const branch = early ? 'forced-clock exit' : hardDisk ? `hard-disk ready, exec 1 (table said ${JSON.stringify(byDisc(snapshot.readInt32LE(0), saved.readInt32LE(0)))})` : `table, snapshot 0x${snapshot.readInt32LE(0).toString(16)}`;
    const got = { execute: exit.mem[0].bytes.readInt32LE(0), module: exit.mem[1].bytes.readInt32LE(0), previous: exit.mem[1].bytes.readInt32LE(4) };
    const want = { execute, module, previous };
    const bad = Object.keys(want).filter((key) => want[key] !== null && want[key] !== got[key]);
    if (bad.length) result.problems.push(`frame ${entry.frame}: ${bad.map((key) => `${key}: left ${got[key]}, computed ${want[key]}`).join('; ')}`);
    result.calls.push({ frame: entry.frame, counter: counter.readUInt32LE(0), z: camera.readFloatLE(8), snapshot: snapshot.readInt32LE(0), disc: disc.readInt32LE(0),
      firstBoot: after[CLOCK_FIRST], branch, got, written: Object.keys(want).filter((key) => want[key] !== null).length });
  });
  return result;
}

if (process.argv[1] && process.argv[1].endsWith('verify_opening3_handoff.mjs')) {
  const result = verify(process.argv[2]);
  for (const call of result.calls) console.log(`frame ${call.frame} (module counter ${call.counter}, camera z ${call.z}): disc state at the snapshot 0x${call.snapshot.toString(16)}, now 0x${call.disc.toString(16)}; first-boot result ${call.firstBoot}; branch: ${call.branch}; left: execute ${call.got.execute}, module ${call.got.module}, previous-was-opening ${call.got.previous}`);
  for (const text of result.problems) console.log(`  ! ${text}`);
  const whole = result.calls.length > 0 && result.problems.length === 0;
  console.log(`verdict: ${whole ? `FOUND ${result.calls.length} hand-off of the opening, every value it leaves equal` : 'PARTIAL see the lines marked !'}`);
  process.exit(whole ? 0 : 3);
}
