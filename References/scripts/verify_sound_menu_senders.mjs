// Which 0x6300 sound commands the menu senders queue (main menu, System Configuration, Version page, Square), recomputed
// from the words each sender reads and compared entry for entry with the enqueue probe.
//
// HDD OSD 1.10U: sound_handler_queue_cmd 0x00200C00 (a0..a3, ra), the senders' entries: menupos 0x002322E0, the show
// trigger 0x00230D58, the System Configuration dispatcher 0x00231C50, the Version page 0x0022A7A8 and the entry frame
// callbacks 0x00227940 / 0x00228660. Per frame the model (model/sound_senders.mjs) predicts the commands from the state
// at those entries; the enqueue probe must show the same list, in order, with the same ra. a3 is never loaded at these
// sites: for the second call of a pair it must be the first call's address temporary, elsewhere it is recorded only.
// The drain 0x00200A80 is probed to record on which frames it runs.
// CLOCK_BUILD=hdd node verify_sound_menu_senders.mjs <trace.jsonl>... [sounds=<n>]  (n: the 0x6300 commands the capture's scenario queues, a positive control)
import { readTraceFor, probesOf } from '../lib/trace.mjs';
import { BUILD, BUILD_NAME, range, pc } from './builds.mjs';
import { Stats } from '../lib/sound_menu_stats.mjs';
import { CMD, mainMenu, squareShow, sysConfig, versionPage, clockAdjustment, valueList, versionSubPage, ringTemporary, rowTemporary } from '../model/sound_senders.mjs';

const PAD_WORDS = range(0x00370330, 0x10);
export const PROBES = [
  { pc: pc(0x00200c00), ranges: [range(0x001f0a5c, 8)] },
  { pc: pc(0x00200a80), ranges: [] },
  { pc: pc(0x002322e0), ranges: [range(0x002b2e60, 0x30), range(0x002b2174, 4), range(0x002b2e04, 0x10), range(0x002b3000, 0x10), PAD_WORDS, range(0x00370ab4, 4)] },
  { pc: pc(0x00232310), ranges: [] },
  { pc: pc(0x0022a2c8), ranges: [] },
  { pc: pc(0x00230d58), ranges: [range(0x002b5780, 0x10), PAD_WORDS] },
  { pc: pc(0x00231c50), ranges: [range(0x002b2de8, 0x38), range(0x002b5780, 0x10), PAD_WORDS] },
  { pc: pc(0x0022a7a8), ranges: [range(0x002b2fe8, 0x20), range(0x002b3000, 0x10), PAD_WORDS] },
  { pc: pc(0x0022a7e8), ranges: [] },
  { pc: pc(0x0022a868), ranges: [] },
  { pc: pc(0x00227940), ranges: [PAD_WORDS] },
  { pc: pc(0x00228660), ranges: [range(0x002b5780, 0x10), PAD_WORDS] },
  { pc: pc(0x0022a944), ranges: [] },
  { pc: pc(0x0022a81c), ranges: [] },
  { pc: pc(0x00229520), ranges: [PAD_WORDS, '*0x003701c0:0x30'] },
  { pc: pc(0x002295a0), ranges: [] },
  { pc: pc(0x00228ff0), ranges: [] },
];
const [ENQUEUE, DRAIN, MENUPOS, MENU_GATE, SUBMIT, SHOW, SYSCONFIG, VERSION, VERSION_EARLY, VERSION_ROW, CLOCK_ADJUST, VALUE_LIST, VERSION_SUB, VERSION_ROW_SUBS, SUBPAGE, SUBPAGE_LIST, SUBPAGE_BACK] = PROBES.map((_, i) => i);

const u16 = (n) => n & 0xffff;
const word = (record, slot, address) => {
  const bytes = record.mem[slot].bytes;
  const base = Number(PROBES[record.probe].ranges[slot].split(':')[0]);
  return bytes.readUInt32LE(address - base);
};
const pad = (record, slot) => ({ edge: word(record, slot, 0x00370334), repeat: word(record, slot, 0x0037033c) });

const SITES = {
  [MENUPOS]: (r, frame) => mainMenu({
    ...pad(r, 4), selected: word(r, 0, 0x002b2e70), count: word(r, 0, 0x002b2e68), rampState: word(r, 0, 0x002b2e84),
    flag: word(r, 1, 0x002b2174), mode: word(r, 5, 0x00370ab4),
    gate: frame.gate, submit: frame.submit,
  }),
  [SHOW]: (r) => squareShow({ ...pad(r, 1), menuState: word(r, 0, 0x002b578c) }),
  [SYSCONFIG]: (r) => sysConfig({ ...pad(r, 2), listState: word(r, 0, 0x002b2e10), menuState: word(r, 1, 0x002b578c), level: word(r, 0, 0x002b2e00) }),
  [VERSION]: (r, frame) => versionPage({
    ...pad(r, 2), state: word(r, 1, 0x002b300c), selected: word(r, 0, 0x002b2ff8), count: word(r, 0, 0x002b2ff0),
    early: frame.early, rowFree: frame.rowFree, subRows: frame.subRows,
  }),
  [SUBPAGE]: (r, frame) => versionSubPage({ ...pad(r, 0), listTwo: frame.listTwo, backTwo: frame.backTwo, selected: r.mem[1].bytes.readUInt32LE(0x10), count: r.mem[1].bytes.readUInt32LE(8) }),
  [CLOCK_ADJUST]: (r) => clockAdjustment(pad(r, 0)),
  [VALUE_LIST]: (r) => valueList({ ...pad(r, 1), menuState: word(r, 0, 0x002b578c) }),
};
const SITE_NAMES = { [MENUPOS]: 'main menu', [SHOW]: 'square show', [SYSCONFIG]: 'system configuration', [VERSION]: 'version page', [SUBPAGE]: 'version sub-page', [CLOCK_ADJUST]: 'clock adjustment', [VALUE_LIST]: 'value list' };

export function verify(files, expectSounds) {
  const failures = [];
  const check = (ok, what) => { if (!ok) failures.push(what); return 1; };
  let compared = 0;
  const stats = new Stats();

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
      const number = frame.number;
      for (const { k, r } of frame.order.filter(({ k }) => k === MENUPOS)) {
        const sysState = word(r, 2, 0x002b2e10);
        const versionState = word(r, 3, 0x002b300c);
        compared += check(!frame.gate || sysState === 0, { why: 'func_00232020 true with System Configuration open', file, frame: number });
        compared += check(!frame.gate || versionState === 0, { why: 'func_00232020 true with the Version page open', file, frame: number });
      }
      const want = frame.order.flatMap(({ k, r }) => SITES[k](r, frame).map((w) => ({ ...w, site: SITE_NAMES[k] })));
      const got = frame.got;
      const same = want.length === got.length;
      compared += check(same, { why: 'count', file, frame: number, want: want.map((w) => [w.a2, w.ra]), got: got.map((g) => [g.a2, g.ra]) });
      if (same) {
        want.forEach((w, i) => {
          const g = got[i];
          compared += check(g.a0 === CMD, { why: 'a0', file, frame: number, i, want: CMD, got: g.a0 });
          compared += check(g.a1 === 1, { why: 'a1', file, frame: number, i, want: 1, got: g.a1 });
          compared += check(g.a2 === w.a2, { why: 'a2', file, frame: number, i, want: w.a2, got: g.a2 });
          compared += check(g.ra === w.ra, { why: 'ra', file, frame: number, i, site: w.site, want: w.ra, got: g.ra });
          if (w.a3 === 'row') compared += check(g.a3 === rowTemporary(frame.rowSubs), { why: 'a3 row marker', file, frame: number, i, want: rowTemporary(frame.rowSubs), got: g.a3 });
          if (w.a3 === 'ring') compared += check(g.a3 === ringTemporary(got[i - 1].head), { why: 'a3 ring temporary', file, frame: number, i, want: ringTemporary(got[i - 1].head), got: g.a3 });
          stats.sent(w.site, w.a2, w.a3, g);
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
        frame = { id: r.frame, number: r.captureFrame, order: [], got: [], gate: undefined, submit: undefined, early: undefined, rowFree: undefined, subRows: undefined, rowSubs: undefined, listTwo: undefined, backTwo: undefined };
        stats.frame(file, r.captureFrame);
      }
      if (k === DRAIN) stats.drain(r.captureFrame);
      else if (k === ENQUEUE) {
        const a0 = u16(r.gpr[4]);
        const entry = { a0, a1: u16(r.gpr[5]), a2: u16(r.gpr[6]), a3: u16(r.gpr[7]), ra: r.gpr[31] >>> 0, head: r.mem[0].bytes.readUInt32LE(4) };
        if (a0 === CMD) frame.got.push(entry);
        else stats.otherCommand(a0);
      } else if (k === MENU_GATE) frame.gate = (r.gpr[2] >>> 0) !== 0;
      else if (k === SUBMIT) frame.submit = (r.gpr[2] >>> 0) !== 0;
      else if (k === VERSION_EARLY) frame.early = (r.gpr[2] >>> 0) !== 0;
      else if (k === VERSION_ROW) frame.rowFree = (r.gpr[2] >>> 0) !== 0;
      else if (k === VERSION_SUB) frame.subRows = r.gpr[4] >>> 0;
      else if (k === VERSION_ROW_SUBS) frame.rowSubs = r.gpr[2] >>> 0;
      else if (k === SUBPAGE_LIST) frame.listTwo = (r.gpr[2] >>> 0) !== 0;
      else if (k === SUBPAGE_BACK) frame.backTwo = (r.gpr[2] >>> 0) !== 0;
      else if (SITES[k]) frame.order.push({ k, r });
    }
    flush();
  }
  if (expectSounds !== undefined) compared += check(stats.observed === expectSounds, { why: 'commands observed in the capture', want: expectSounds, got: stats.observed });
  return { compared, failures, stats };
}

if (process.argv[1] && process.argv[1].endsWith('verify_sound_menu_senders.mjs')) {
  if (BUILD !== 'hdd') throw new Error('verify_sound_menu_senders.mjs reads the HDD OSD 1.10U: run with CLOCK_BUILD=hdd');
  const argv = process.argv.slice(2);
  const expected = argv.find((a) => a.startsWith('sounds='));
  const r = verify(argv.filter((a) => a !== expected), expected === undefined ? undefined : Number(expected.slice(7)));
  console.log(`build: ${BUILD_NAME}`);
  r.stats.report(console.log);
  if (r.compared === 0) throw new Error('compared nothing: not a verifier');
  console.log(`compared ${r.compared} items, ${r.failures.length} differ`);
  for (const f of r.failures.slice(0, 10)) console.log(JSON.stringify(f));
  console.log(r.failures.length === 0 ? `verdict: FOUND ${r.compared} items equal` : `verdict: PARTIAL ${r.failures.length} of ${r.compared} differ`);
  process.exit(r.failures.length === 0 ? 0 : 1);
}
