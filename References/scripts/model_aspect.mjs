// Configuration item 0 (the aspect ratio) in the whole-frame model, from a capture taken with the
// frame verifier's probes and Font_SetLocate's.
//
//   what resets a written item: every frame the clock calls func_00235518 at its end (HDD OSD 1.10U
//     0x00235518; ROM 2.30 0x00231A40, a jump into config_load_clock_osd), which reloads item 0 from
//     the console's settings word unless the configuration is dirty (HDD) and while the gate
//     D_00370300 (ROM 0x002C8920) is 1. A real setting reaches the word by the save of a dirty
//     configuration (config_set_aspect_ratio, HDD 0x00203D50: bits 1..2).
//   what item 0 does to the frame: func_002262C8 sends the two bars when it is 0 or 2 (off for 1);
//     func_00226300 puts the date and the time at row 0x20 instead of 0xE when it is 2;
//     func_00226958 puts the button hints at 0xB6 instead of 0xC8 when it is 2.
//
// This verifier runs the frame verifier under --carry (the model reloads item 0 and the gate from
// its own state, bars included) and compares every row the program gave Font_SetLocate for the date,
// the time and the hints with dateRow and hintRow of clock_rest.mjs.
//
// CLOCK_BUILD=hdd|rom node model_aspect.mjs <trace.jsonl> [--expect <item 0>]
import { readTraceFor } from '../lib/trace.mjs';
import { mergeProbes } from '../lib/trace.mjs';
import { PROBES as FRAME_PROBES, verify } from './verify_frame.mjs';
import { pick, pc, BUILD, BUILD_NAME } from './builds.mjs';
import { Memory } from '../model/clock_memory.mjs';
import { dateRow, hintRow } from '../model/clock_rest.mjs';

const START = pick({ hdd: 0x00225e80, rom: 0x00221558 });
// Font_SetLocate, and the return addresses of the calls that place the date and the time; the hint's
// row is the answer of the function that gives it (HDD func_00226958, ROM 0x002220D8), read at its return.
const SET_LOCATE = pick({ hdd: 0x00212690, rom: 0x0020a418 });
const CALLER = pick({
  hdd: { date: 0x0022645c, time: 0x002264d8 },
  rom: { date: 0x00221b28, time: 0x00221b98 },
});
const HINT_RETURN = pick({ hdd: 0x002269d8, rom: 0x00222158 });
export const PROBES = [{ pc: pc(SET_LOCATE), ranges: [] }, { pc: pc(HINT_RETURN), ranges: [] }];
export const CAPTURE_PROBES = mergeProbes(FRAME_PROBES, PROBES);

if (process.argv[1] && process.argv[1].endsWith('model_aspect.mjs')) {
  const file = process.argv[2];
  // Item 0 the capture is meant to hold in every frame, from its name: the word's ratio 1, 2, 3 (read as 0), bit 3 alone
  // (ROM 2.30's video output, not the ratio), a written item held by the gate, a setting made in the entry.
  const NAMED = { 'aspect0-bit3': 0, aspect1: 1, aspect2: 2, 'aspect2-gate': 2, aspect3: 0, 'aspect-set': 1 };
  const named = NAMED[String(file).split(/[\\/]/).pop().replace(/\.trace\.jsonl$/, '').replace(/^.*-whole2-/, '')];
  const expect = process.argv.includes('--expect') ? Number(process.argv[process.argv.indexOf('--expect') + 1]) : named ?? null;
  const result = { rows: { date: [0, 0], time: [0, 0], hint: [0, 0] }, skipped: 0, items: new Map(), problems: [] };

  const trace = readTraceFor(file, CAPTURE_PROBES);
  if (!trace.complete) throw new Error(`${file}: ${trace.reason}`);
  const probes = trace.probes.filter((probe) => !probe.preroll);
  const starts = probes.map((probe, n) => [probe, n]).filter(([probe]) => probe.pc === START);
  const snapshotAt = (from, to) => new Memory(BUILD, probes.slice(from, to).filter((probe) => probe.pc >= START && probe.pc < START + 0x14).flatMap((probe) => probe.mem ?? []));
  const snapshots = starts.map(([, from], n) => (starts[n + 1] ? snapshotAt(from, starts[n + 1][1]) : null));
  starts.forEach(([start, from], n) => {
    const next = starts[n + 1];
    if (!next) return;
    const memory = snapshots[n], after = snapshots[n + 1];
    const item = memory.int('item0');
    result.items.set(item, (result.items.get(item) ?? 0) + 1);
    // A frame in which item 0 changed (a cancel's reload, before the text) has no single row to expect.
    if (!after || after.int('item0') !== item) { result.skipped += 1; return; }
    for (const record of probes.slice(from, next[1])) {
      let kind, y;
      if (record.pc === HINT_RETURN) { kind = 'hint'; y = record.gpr[2] | 0; }
      else if (record.pc === SET_LOCATE) {
        const ra = record.gpr[31] >>> 0;
        kind = Object.keys(CALLER).find((name) => CALLER[name] === ra);
        y = record.gpr[5] | 0;
      }
      if (!kind) continue;
      const expected = kind === 'hint' ? hintRow(memory) : dateRow(memory);
      result.rows[kind][1] += 1;
      if (y === expected) result.rows[kind][0] += 1;
      else if (result.problems.length < 10) result.problems.push(`frame ${start.frame} ${kind}: Font_SetLocate y ${y}, computed ${expected} (item 0 ${item})`);
    }
  });

  const whole = verify(file, 'carry');
  const bars = Object.entries(whole.kinds).filter(([key]) => /bars/.test(key)).map(([, tally]) => tally.packets[0]).reduce((a, b) => a + b, 0);
  console.log(`build: ${BUILD_NAME}   frames ${whole.frames}   item 0 at the start of a frame: ${[...result.items].map(([item, frames]) => `${item} x ${frames}`).join(', ')}   frames with a change of item 0 inside: ${result.skipped}`);
  console.log(`whole frame, state carried (item 0 and the gate reloaded by the model): ${whole.problems.length === 0 ? 'every packet the model produces equal' : 'DIFFERENT'}; state pieces different: ${Object.keys(whole.state).join(', ') || 'none'}; events: ${Object.keys(whole.events).join(', ') || 'none'}; letterbox bar packets equal: ${bars}`);
  for (const [kind, [equal, total]] of Object.entries(result.rows)) console.log(`  ${kind} row: ${equal} of ${total} equal`);
  for (const problem of [...result.problems, ...whole.problems.slice(0, 6)]) console.log(`  ${problem}`);
  const compared = result.rows.date[1] + result.rows.time[1];
  const equal = result.rows.date[0] + result.rows.time[0] + result.rows.hint[0] === compared + result.rows.hint[1];
  const shown = expect === null || (result.items.size === 1 && result.items.has(expect));
  const clean = whole.problems.length === 0 && Object.keys(whole.state).length === 0 && Object.keys(whole.events).length === 0;
  console.log(`verdict: ${compared > 0 && equal && shown && clean ? 'FOUND' : 'PARTIAL'} ${compared} date and time rows, ${result.rows.hint[1]} hint rows${expect === null ? '' : `, item 0 ${expect} in every frame: ${shown}`}`);
}
