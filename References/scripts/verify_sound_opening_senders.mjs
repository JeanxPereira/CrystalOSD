// Which 0x6150 / 0x6140 sound commands the opening queues (BootOpening and BootIllegal), at its thread start and at stage 2 of
// OpeningProcessInner, recomputed from the words the senders read and compared entry for entry with the enqueue probe.
//
// HDD OSD 1.10U: sound_handler_queue_cmd 0x00200C00 (a0..a3, ra, head), opening_thread_set_vars_2 0x0021AE78 (word 0x001F0648), the
// stage-2 handler 0x0021F0F8 of OpeningProcessInner (counter D_00370000, D_00370090, D_00370094, words 0x002AD22C.., disc word
// 0x001F000C, jtbl_00365470). The model (model/sound_senders.mjs) predicts the commands of each call; the enqueue must show the same
// list in order with the same ra, a0, a1, a2, a3 (a2/a3 asserted where the model derives them: ring temporaries, the entry registers,
// the register carried into the handler). The 6150 (6,0,0xF) of stage 6 is sceSdRemote direct, not queued, and is not compared.
// Reports the counter D_00370000 of each call that queues, for checking the native Timeline.
// CLOCK_BUILD=hdd node verify_sound_opening_senders.mjs <trace.jsonl>... [sounds=<n>]  (n: 0x6150/0x6140 commands observed, a positive control)
import { readTraceFor, probesOf } from '../lib/trace.mjs';
import { BUILD, BUILD_NAME, FPS, range, pc } from './builds.mjs';
import { Stats } from '../lib/sound_menu_stats.mjs';
import { openingStart, openingStage2, ringTemporary, ringTemporaryA2 } from '../model/sound_senders.mjs';

export const PROBES = [
  { pc: pc(0x00200c00), ranges: [range(0x001f0a5c, 8)] },
  { pc: pc(0x0021ae78), ranges: [range(0x001f0648, 4)] },
  { pc: pc(0x0021f0f8), ranges: [range(0x00370000, 4), range(0x00370090, 8), range(0x002ad22c, 0xc), range(0x001f000c, 4), range(0x00365470, 0x28)] },
  { pc: pc(0x0021ef00), ranges: [range(0x00370000, 4)] },
];
const [ENQUEUE, START, STAGE2, ENTRY] = PROBES.map((_, i) => i);
const COMMANDS = new Set([0x6150, 0x6140]);

const u16 = (n) => n & 0xffff;
const hex = (v) => `0x${v.toString(16)}`;
const word = (record, slot, address) => {
  const base = Number(PROBES[record.probe].ranges[slot].split(':')[0]);
  return record.mem[slot].bytes.readUInt32LE(address - base);
};

export function verify(files, expectSounds) {
  const failures = [];
  const check = (ok, what) => { if (!ok) failures.push(what); return 1; };
  let compared = 0;
  const stats = new Stats();
  const modelled = { starts: 0, startCommands: 0, stage2: 0, stage2Commands: 0 };
  const queued = [];
  const entries = [];

  for (const file of files) {
    const trace = readTraceFor(file, PROBES);
    if (!trace.complete) throw new Error(`${file}: ${trace.reason}`);
    const groups = probesOf(trace, PROBES);
    const kind = new Map();
    groups.forEach((records, i) => records.forEach((r) => kind.set(r, i)));
    const records = trace.probes.filter((r) => kind.has(r)).filter((r) => !r.preroll);
    for (const r of records) r.probe = kind.get(r);

    let frame = null;
    const flush = () => {
      if (!frame) return;
      const { want, got } = frame;
      const same = want.length === got.length;
      compared += check(same, { why: 'count', file, frame: frame.number, want: want.map((w) => [hex(w.a0), w.a1, hex(w.ra)]), got: got.map((g) => [hex(g.a0), g.a1, hex(g.ra)]) });
      if (same) {
        want.forEach((w, i) => {
          const g = got[i];
          const wantA2 = w.a2 === 'ring' ? ringTemporaryA2(got[i - 1].head) : w.a2 === 'entry' ? w.entryA2 : w.a2;
          const wantA3 = w.a3 === 'ring' ? ringTemporary(got[i - 1].head) : w.a3 === 'entry' ? w.entryA3 : w.a3 === 'carried' ? w.handlerA3 : w.a3;
          compared += check(g.a0 === w.a0, { why: 'a0', file, frame: frame.number, i, want: w.a0, got: g.a0 });
          compared += check(g.a1 === w.a1, { why: 'a1', file, frame: frame.number, i, want: w.a1, got: g.a1 });
          compared += check(g.a2 === wantA2, { why: 'a2', file, frame: frame.number, i, site: w.site, want: wantA2, got: g.a2 });
          compared += check(g.a3 === wantA3, { why: 'a3', file, frame: frame.number, i, site: w.site, want: wantA3, got: g.a3 });
          compared += check(g.ra === w.ra, { why: 'ra', file, frame: frame.number, i, site: w.site, want: w.ra, got: g.ra });
          stats.sent(`${w.site} ${hex(w.a0)},${w.a1}`, hex(g.a2), ['ring', 'entry', 'carried'].includes(w.a3) ? w.a3 : 'literal', g);
          queued.push({ file, emulatorFrame: frame.id, captureFrame: frame.number, site: w.site, a0: g.a0, a1: g.a1, a2: g.a2, a3: g.a3, ra: g.ra, counter: w.counter });
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
        if (COMMANDS.has(a0)) frame.got.push(entry); else stats.otherCommand(a0);
      } else if (k === START) {
        const module = word(r, 0, 0x001f0648);
        const sounds = openingStart(module);
        frame.want.push(...sounds.map((c, i) => ({ ...c, site: `start module ${module} #${i}`, entryA2: u16(r.gpr[6]), entryA3: u16(r.gpr[7]), counter: null })));
        modelled.starts += 1;
        modelled.startCommands += sounds.length;
      } else if (k === STAGE2) {
        const out = openingStage2({
          counter: word(r, 0, 0x00370000), pending: word(r, 1, 0x00370090) | 0, go: word(r, 1, 0x00370094), fps: FPS,
          forcedWord: word(r, 2, 0x002ad22c), ready: word(r, 2, 0x002ad230), exec: word(r, 2, 0x002ad234) | 0,
          disc: word(r, 3, 0x001f000c), discTable: Array.from({ length: 10 }, (_, i) => word(r, 4, 0x00365470 + 4 * i)),
        });
        frame.want.push(...out.sounds.map((c) => ({ ...c, site: `stage 2 ${out.branch}`, handlerA3: u16(r.gpr[7]), counter: word(r, 0, 0x00370000) })));
        modelled.stage2 += 1;
        modelled.stage2Commands += out.sounds.length;
      } else if (k === ENTRY) {
        entries.push({ file, emulatorFrame: r.frame, captureFrame: r.captureFrame, counter: word(r, 0, 0x00370000) });
      }
    }
    flush();
  }
  if (expectSounds !== undefined) compared += check(stats.observed === expectSounds, { why: 'commands observed in the capture', want: expectSounds, got: stats.observed });
  return { compared, failures, stats, modelled, queued, entries };
}

if (process.argv[1] && process.argv[1].endsWith('verify_sound_opening_senders.mjs')) {
  if (BUILD !== 'hdd') throw new Error('verify_sound_opening_senders.mjs reads the HDD OSD 1.10U: run with CLOCK_BUILD=hdd');
  const argv = process.argv.slice(2);
  const expected = argv.find((a) => a.startsWith('sounds='));
  const r = verify(argv.filter((a) => a !== expected), expected === undefined ? undefined : Number(expected.slice(7)));
  console.log(`build: ${BUILD_NAME}`);
  const s = r.stats;
  console.log(`frames ${s.frames.size}; 0x6150/0x6140 commands predicted ${s.predicted}, observed ${s.observed}; other commands ignored: ${[...s.other].map(([k, v]) => `${k} x${v}`).join(', ') || 'none'}`);
  console.log(`thread starts ${r.modelled.starts} (${r.modelled.startCommands} commands), stage-2 handler calls ${r.modelled.stage2} (${r.modelled.stage2Commands} commands)`);
  for (const [site, count] of [...s.sites].sort()) console.log(`  ${site}: ${count}`);
  for (const [key, set] of [...s.a3].sort()) console.log(`  a3 ${key}: ${[...set].map(hex).join(' ')}`);
  for (const [key, set] of [...s.ra].sort()) console.log(`  ra ${key}: ${[...set].map(hex).join(' ')}`);
  const first = r.entries[0];
  if (first) console.log(`  first OpeningProcessInner call: counter ${first.counter} at emulator frame ${first.emulatorFrame}`);
  for (const q of r.queued) console.log(`  queued ${q.site} ${hex(q.a0)},${q.a1},${hex(q.a2)},${hex(q.a3)} ra ${hex(q.ra)} at emulator frame ${q.emulatorFrame}, counter ${q.counter ?? 'before OpeningInit'}`);
  if (r.compared === 0) throw new Error('compared nothing: not a verifier');
  console.log(`compared ${r.compared} items, ${r.failures.length} differ`);
  for (const f of r.failures.slice(0, 10)) console.log(JSON.stringify(f));
  console.log(r.failures.length === 0 ? `verdict: FOUND ${r.compared} items equal` : `verdict: PARTIAL ${r.failures.length} of ${r.compared} differ`);
  process.exit(r.failures.length === 0 ? 0 : 1);
}
