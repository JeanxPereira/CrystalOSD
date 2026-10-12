// Which 0x6150 / 0x6140 sound commands the clock module queues at its start, at its set-up and on a disc-state change,
// recomputed from the words the senders read and compared entry for entry with the enqueue probe.
//
// HDD OSD 1.10U: sound_handler_queue_cmd 0x00200C00 (a0..a3, ra, head), module_clock_thread_proc 0x00225D30 (jal 0x00225D50),
// func_002324C8 0x002324C8 (the set-up pair), and the clock thread's loop in clock_input_check_handler_p6_p7_tgt 0x002259B8
// (loop top 0x00225A28; the returns of func_0022FEF8, func_0022FF28 and func_0022FF98 at 0x00225A44, 0x00225A90, 0x00225AA0,
// 0x00225AD4; the sound branch at 0x00225B04, where the mode word is returned). The model (model/sound_senders.mjs) predicts each
// iteration's next state (D_00370A7C, D_002B2174) and its commands; the next iteration's loop top must show that state and the
// enqueue probe the commands, in order, with the same ra. The 0x8070 send at the clock start is not queued by the EE
// (pad_sound_handler_thread_proc sends it directly) and is not compared.
// CLOCK_BUILD=hdd node verify_sound_clock_senders.mjs <trace.jsonl>... [sounds=<n>]  (n: the 0x6150/0x6140 commands the capture queues, a positive control)
import { readTraceFor, probesOf } from '../lib/trace.mjs';
import { BUILD, BUILD_NAME, range, pc } from './builds.mjs';
import { Stats } from '../lib/sound_menu_stats.mjs';
import { clockStart, clockSetup, discLoop, ringTemporary, ringTemporaryA2 } from '../model/sound_senders.mjs';

export const PROBES = [
  { pc: pc(0x00200c00), ranges: [range(0x001f0a5c, 8)] },
  { pc: pc(0x00225d50), ranges: [] },
  { pc: pc(0x002324c8), ranges: [range(0x002ad22c, 4)] },
  { pc: pc(0x00225a28), ranges: [range(0x001f000c, 4), range(0x00370a7c, 4), range(0x002b2174, 4), range(0x001f0d58, 4), range(0x00365500, 0x2c)] },
  { pc: pc(0x00225a44), ranges: [] },
  { pc: pc(0x00225a90), ranges: [] },
  { pc: pc(0x00225aa0), ranges: [] },
  { pc: pc(0x00225ad4), ranges: [] },
  { pc: pc(0x00225b04), ranges: [range(0x00365530, 0x28)] },
];
const [ENQUEUE, START, SETUP, TOP, FEF8, FF28, FEF8B, FF98, SOUND] = PROBES.map((_, i) => i);
const COMMANDS = new Set([0x6150, 0x6140]);

const u16 = (n) => n & 0xffff;
const word = (record, slot, address) => {
  const base = Number(PROBES[record.probe].ranges[slot].split(':')[0]);
  return record.mem[slot].bytes.readUInt32LE(address - base);
};
const table = (record, slot, address, entries) => Array.from({ length: entries }, (_, i) => word(record, slot, address + 4 * i));
const hex = (v) => `0x${v.toString(16)}`;

export function verify(files, expectSounds) {
  const failures = [];
  const check = (ok, what) => { if (!ok) failures.push(what); return 1; };
  let compared = 0;
  const stats = new Stats();
  const timing = [];
  const modelled = { start: 0, setup: 0, forced: 0, discSounds: 0, loops: 0, soundBranches: 0, flagSet: 0 };

  for (const file of files) {
    const trace = readTraceFor(file, PROBES);
    if (!trace.complete) throw new Error(`${file}: ${trace.reason}`);
    const groups = probesOf(trace, PROBES);
    const kind = new Map();
    groups.forEach((records, i) => records.forEach((r) => kind.set(r, i)));
    const records = trace.probes.filter((r) => kind.has(r)).filter((r) => !r.preroll);
    for (const r of records) r.probe = kind.get(r);

    let frame = null;
    let iteration = null;
    let previous = null;
    let startAt = null;
    let setupAt = null;

    const closeIteration = () => {
      if (!iteration) return;
      const it = iteration;
      iteration = null;
      const t = it.top;
      const input = {
        disc: word(t, 0, 0x001f000c), last: word(t, 1, 0x00370a7c), flag: word(t, 2, 0x002b2174), d58: word(t, 3, 0x001f0d58),
        compareTable: table(t, 4, 0x00365500, 11), mode: it.mode, soundTable: it.soundTable,
        fef8: it.returns.fef8, ff28: it.returns.ff28, fef8b: it.returns.fef8b, ff98: it.returns.ff98,
      };
      const out = discLoop(input);
      modelled.loops += 1;
      for (const name of out.calls) compared += check(it.returns[name] !== undefined, { why: 'callee not reached', file, frame: it.number, name });
      for (const name of ['fef8', 'ff28', 'fef8b', 'ff98']) compared += check(out.calls.includes(name) || it.returns[name] === undefined, { why: 'callee reached but not modelled', file, frame: it.number, name });
      compared += check(out.soundBranch === it.sawSound, { why: 'sound branch', file, frame: it.number, want: out.soundBranch, got: it.sawSound });
      if (out.soundBranch) modelled.soundBranches += 1;
      if (previous && previous.number + 1 === it.number) {
        compared += check(previous.out.last === input.last, { why: 'last-seen state D_00370A7C', file, frame: it.number, want: previous.out.last, got: input.last });
        compared += check(previous.out.flag === input.flag, { why: 'change flag D_002B2174', file, frame: it.number, want: previous.out.flag, got: input.flag });
      }
      if (out.flag === 1 && input.flag === 0) modelled.flagSet += 1;
      previous = { number: it.number, out };
      it.frameWant.push(...out.sounds.map((c) => ({ ...c, site: 'disc state' })));
      modelled.discSounds += out.sounds.length;
    };

    const flush = () => {
      if (!frame) return;
      closeIteration();
      const want = frame.want;
      const got = frame.got;
      const same = want.length === got.length;
      compared += check(same, { why: 'count', file, frame: frame.number, want: want.map((w) => [hex(w.a0), w.a1, hex(w.ra)]), got: got.map((g) => [hex(g.a0), g.a1, hex(g.ra)]) });
      if (same) {
        want.forEach((w, i) => {
          const g = got[i];
          compared += check(g.a0 === w.a0, { why: 'a0', file, frame: frame.number, i, want: w.a0, got: g.a0 });
          compared += check(g.a1 === w.a1, { why: 'a1', file, frame: frame.number, i, want: w.a1, got: g.a1 });
          const wantA2 = w.a2 === 'ring' ? ringTemporaryA2(got[i - 1].head) : w.a2;
          const wantA3 = w.a3 === 'ring' ? ringTemporary(got[i - 1].head) : w.a3;
          compared += check(g.a2 === wantA2, { why: 'a2', file, frame: frame.number, i, want: wantA2, got: g.a2 });
          compared += check(g.a3 === wantA3, { why: 'a3', file, frame: frame.number, i, want: wantA3, got: g.a3 });
          compared += check(g.ra === w.ra, { why: 'ra', file, frame: frame.number, i, site: w.site, want: w.ra, got: g.ra });
          stats.sent(`${w.site} ${hex(w.a0)},${w.a1}`, w.a2, w.a3 === 'ring' ? 'ring' : 'literal', g);
        });
      }
      stats.predicted += want.length;
      stats.observed += got.length;
      frame = null;
    };

    for (const r of records) {
      const k = r.probe;
      if (!frame || frame.id !== r.frame) {
        flush();
        frame = { id: r.frame, number: r.captureFrame, want: [], got: [] };
        stats.frame(file, r.captureFrame);
      }
      if (k === ENQUEUE) {
        const a0 = u16(r.gpr[4]);
        const entry = { a0, a1: u16(r.gpr[5]), a2: u16(r.gpr[6]), a3: u16(r.gpr[7]), ra: r.gpr[31] >>> 0, head: r.mem[0].bytes.readUInt32LE(4) };
        if (COMMANDS.has(a0)) {
          frame.got.push(entry);
          if (entry.ra === 0x00225d58) startAt = r.captureFrame;
          if (entry.ra === 0x00232620) setupAt = r.captureFrame;
        } else stats.otherCommand(a0);
      } else if (k === START) {
        frame.want.push(...clockStart().map((c) => ({ ...c, site: 'clock start' })));
        modelled.start += 1;
      } else if (k === SETUP) {
        const sounds = clockSetup({ word: word(r, 0, 0x002ad22c) });
        frame.want.push(...sounds.map((c, i) => ({ ...c, site: i === 0 ? 'set-up first' : 'set-up second' })));
        if (sounds.length) modelled.setup += 1;
        else modelled.forced += 1;
      } else if (k === TOP) {
        closeIteration();
        iteration = { top: r, number: r.captureFrame, returns: {}, mode: undefined, soundTable: undefined, sawSound: false, frameWant: frame.want };
      } else if (iteration) {
        if (k === FEF8) iteration.returns.fef8 = r.gpr[2] >>> 0;
        else if (k === FF28) iteration.returns.ff28 = r.gpr[2] >>> 0;
        else if (k === FEF8B) iteration.returns.fef8b = r.gpr[2] >>> 0;
        else if (k === FF98) iteration.returns.ff98 = r.gpr[2] >>> 0;
        else if (k === SOUND) {
          iteration.sawSound = true;
          iteration.mode = r.gpr[2] >>> 0;
          iteration.soundTable = table(r, 0, 0x00365530, 10);
        }
      }
    }
    flush();
    if (startAt !== null && setupAt !== null) timing.push({ file, startAt, setupAt, gap: setupAt - startAt });
  }
  if (expectSounds !== undefined) compared += check(stats.observed === expectSounds, { why: 'commands observed in the capture', want: expectSounds, got: stats.observed });
  return { compared, failures, stats, timing, modelled };
}

if (process.argv[1] && process.argv[1].endsWith('verify_sound_clock_senders.mjs')) {
  if (BUILD !== 'hdd') throw new Error('verify_sound_clock_senders.mjs reads the HDD OSD 1.10U: run with CLOCK_BUILD=hdd');
  const argv = process.argv.slice(2);
  const expected = argv.find((a) => a.startsWith('sounds='));
  const r = verify(argv.filter((a) => a !== expected), expected === undefined ? undefined : Number(expected.slice(7)));
  console.log(`build: ${BUILD_NAME}`);
  const s = r.stats;
  console.log(`frames ${s.frames.size}; 0x6150/0x6140 commands predicted ${s.predicted}, observed ${s.observed}; other commands ignored: ${[...s.other].map(([k, v]) => `${k} x${v}`).join(', ') || 'none'}`);
  console.log(`loop iterations ${r.modelled.loops}, sound branches ${r.modelled.soundBranches}, flag raised ${r.modelled.flagSet}x, disc sounds ${r.modelled.discSounds}, clock starts ${r.modelled.start}, set-ups ${r.modelled.setup}, set-ups skipped (word 0x002AD22C zero) ${r.modelled.forced}`);
  for (const [site, count] of [...s.sites].sort()) console.log(`  ${site}: ${count}`);
  for (const [key, set] of [...s.a3].sort()) console.log(`  a3 ${key}: ${[...set].map(hex).join(' ')}`);
  for (const [key, set] of [...s.ra].sort()) console.log(`  ra ${key}: ${[...set].map(hex).join(' ')}`);
  for (const t of r.timing) console.log(`  start -> set-up gap: ${t.gap} frames (capture frames ${t.startAt} and ${t.setupAt})`);
  if (r.compared === 0) throw new Error('compared nothing: not a verifier');
  console.log(`compared ${r.compared} items, ${r.failures.length} differ`);
  for (const f of r.failures.slice(0, 10)) console.log(JSON.stringify(f));
  console.log(r.failures.length === 0 ? `verdict: FOUND ${r.compared} items equal` : `verdict: PARTIAL ${r.failures.length} of ${r.compared} differ`);
  process.exit(r.failures.length === 0 ? 0 : 1);
}
