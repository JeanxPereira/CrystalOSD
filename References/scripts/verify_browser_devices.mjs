// The Browser's device row (HDD OSD 1.10U NTSC; ROM 2.30 where the addresses are mapped): what the scan stores
// for each memory card slot, the title text ids, the page layout and the item positions, the selection phase
// and the cursor and sounds of Left and Right, recomputed by model/browser_devices.mjs from the probed words
// and compared with what the console wrote.
//   HDD OSD: scan loop 0x24B940 (isfirstslot 0x2493A8, store 0x24BAE0 / 0x24BB00), titles 0x253D38, layout
//   0x2551B0 and 0x257860, phase 0x259AB8, input 0x254840, sound gate 0x24E090 and enqueue 0x200C00.
// CLOCK_BUILD=hdd node verify_browser_devices.mjs <trace.jsonl>...
import { readTraceFor, probesOf } from '../lib/trace.mjs';
import { range, pc } from './builds.mjs';

const named = process.argv.slice(2).find((a) => /\.trace\.jsonl/.test(a));
const BUILD = process.env.CLOCK_BUILD ?? (named && /(^|[\/])rom-/.test(named) ? 'rom' : 'hdd');
import { isFirstSlot, scanStore, titleIds, pageLayout, itemPosition, nextPhase, cursorStep, statusLine, freeText } from '../model/browser_devices.mjs';

const HDD_PAD = range(0x3707a0, 0x10);
const ROM_PAD = range(0x2c8d30, 0x10);
const SPEC = {
  hdd: [
    ['input', { pc: pc(0x254840), ranges: [HDD_PAD, range(0x3707c8, 4), range(0x3709a0, 4), range(0x370820, 4), range(0x37072c, 4), range(0x370678, 4), range(0x370858, 8), range(0x3706b0, 4), range(0x3706d0, 4), range(0x370728, 4), range(0x370740, 4), range(0x370600, 8), range(0x370770, 4), range(0x2bd420, 0x380)] }],
    ['gate', { pc: pc(0x24e090), ranges: [range(0x370740, 4), range(0x3706f8, 4), range(0x370460, 4)] }],
    ['enqueue', { pc: pc(0x200c00), ranges: [] }],
    ['layout', { pc: pc(0x2552e0), ranges: ['s0+0x198:0x14', 's0+0xd8:4', 's0+0xf0:8', range(0x3709a0, 4)] }],
    ['item', { pc: pc(0x2579a8), ranges: ['s1+0x98:8', 's3+0xf0:8', 's3+0x1a4:4', 's1+0x90:4'] }],
    ['phase', { pc: pc(0x259ab8), ranges: [range(0x37086c, 4), range(0x370880, 4), range(0x36ff14, 4)] }],
    ['scanStore', { pc: pc(0x24bae0), ranges: [range(0x2bcf20, 0x80)] }],
    ['isFirst', { pc: pc(0x2493a8), ranges: [] }],
    ['scanArrays', { pc: pc(0x24bb00), ranges: [range(0x2bbd64, 0x20), range(0x2bc188, 0x20), range(0x2bc5ac, 0x20)] }],
    ['title', { pc: pc(0x253d38), ranges: [] }],
    ['string', { pc: pc(0x2081b8), ranges: [] }],
    ['titleEnd', { pc: pc(0x253f84), ranges: [] }],
    ['status', { pc: pc(0x251890), ranges: [range(0x370764, 4), range(0x37072c, 4), range(0x3706b0, 4), range(0x3706d0, 4), range(0x370730, 4), range(0x370740, 4)] }],
    ['statusFlags', { pc: pc(0x251880), ranges: [] }],
    ['freeEntry', { pc: pc(0x253fa0), ranges: [] }],
    ['free1c1', { pc: pc(0x25401c), ranges: [] }],
    ['free1c0', { pc: pc(0x254044), ranges: [] }],
    ['free2f', { pc: pc(0x254090), ranges: [] }],
    ['free2e', { pc: pc(0x2540b8), ranges: [] }],
    ['isFirstEnd', { pc: pc(0x2493dc), ranges: [] }],
    ['header', { pc: pc(0x251330), ranges: [range(0x370740, 4), range(0x2bc188, 0x20), range(0x2bc5ac, 0x20), range(0x2bc5a8, 4), range(0x2bc9cc, 4)] }],
  ],
  rom: [
    ['input', { pc: pc(0x24e440), ranges: [ROM_PAD, range(0x2c8d64, 4), range(0x2c8e44, 4), range(0x2c8b5c, 4), range(0x2c8ccc, 4), range(0x2c8bc8, 4), range(0x2c8dc0, 8), range(0x2c8c08, 4), range(0x2c8ce4, 4), range(0x2c8cc8, 4), range(0x2c8ce4, 4), range(0x2c8b38, 8), range(0x2c8d08, 4), range(0x2ada20, 0x2c0)] }],
    ['enqueue', { pc: pc(0x200be8), ranges: [] }],
    ['layout', { pc: pc(0x24f400), ranges: ['s1+0x138:0x14', 's1+0xd8:4', 's1+0xf0:8', range(0x2c8e44, 4)] }],
    ['item', { pc: pc(0x252670), ranges: ['s0+0x98:8', 's3+0xf0:8', 's3+0x144:4', 's0+0x90:4'] }],
    ['phase', { pc: pc(0x252f38), ranges: [range(0x2c8dd0, 4), range(0x2c8de4, 4), range(0x2c8518, 4)] }],
    ['scanStore', { pc: pc(0x2453b0), ranges: [range(0x2ad460, 0x80)] }],
    ['isFirst', { pc: pc(0x243368), ranges: [] }],
    ['scanArrays', { pc: pc(0x2453c8), ranges: [range(0x29c3a0, 0x20), range(0x29c3c0, 0x20), range(0x29c3e0, 0x20)] }],
    ['title', { pc: pc(0x24d8b0), ranges: [] }],
    ['string', { pc: pc(0x204fd0), ranges: [] }],
    ['titleEnd', { pc: pc(0x24da3c), ranges: [] }],
    ['isFirstEnd', { pc: pc(0x24339c), ranges: [] }],
  ],
};
const CONFIG = {
  hdd: { title: [0x253d38, 0x253f88], sound: { cmd: 0x6300, ra: 0x254f54 }, indexReg: 16, recStride: 0x1c0, count: 0x1a0, scroll: 0x198, rom: false },
  rom: { title: [0x24d8b0, 0x24da44], sound: { cmd: 0x5200, ra: 0x24eb68 }, indexReg: 17, recStride: 0x160, count: 0x140, scroll: 0x138, rom: true },
}[BUILD];
export const PROBES = SPEC[BUILD].map(([, probe]) => probe);
const NAMES = SPEC[BUILD].map(([name]) => name);

const w = (record, slot, at = 0) => record.mem[slot].bytes.readInt32LE(at);
const fl = (record, slot, at = 0) => record.mem[slot].bytes.readFloatLE(at);
const hex = (n) => `0x${(n >>> 0).toString(16)}`;
const seq = new WeakMap();
const order = (record) => seq.get(record);

export function verify(files) {
  const failures = [];
  const counts = {};
  const check = (section, ok, what) => { counts[section] = (counts[section] ?? 0) + 1; if (!ok) failures.push(`${section}: ${what}`); };
  const traces = files.map((file) => {
    const trace = readTraceFor(file, PROBES);
    if (!trace.complete) throw new Error(`${file}: ${trace.reason}`);
    trace.probes.forEach((r, i) => seq.set(r, i));
    const groups = probesOf(trace, PROBES);
    return Object.fromEntries(NAMES.map((n, i) => [n, groups[i].filter((r) => !r.preroll)]));
  });

  for (const g of traces) {
    g.isFirst.forEach((entry, k) => {
      const end = g.isFirstEnd[k];
      const want = isFirstSlot(entry.gpr[4] | 0, entry.gpr[5] | 0);
      if (want === null) { check('covered', false, 'the model does not cover a captured case'); return; }
      (counts.scanCalls ??= []).push(`${entry.gpr[4] | 0},${entry.gpr[5] | 0}->${end?.gpr[5] | 0}`);
      check('scan.kb', end !== undefined && (end.gpr[5] | 0) === want, `call ${k}: isfirstslot(${entry.gpr[4]}, ${entry.gpr[5]}) returned ${end?.gpr[5]}`);
    });
    g.scanStore.forEach((store, k) => {
      check('scan.store', (store.gpr[2] | 0) === (g.isFirstEnd[k]?.gpr[5] | 0), `slot ${store.gpr[20]}: stored ${store.gpr[2]}, returned ${g.isFirstEnd[k]?.gpr[5]}`);
    });
    g.scanStore.forEach((store) => {
      const slot = store.gpr[20];
      const at = slot * 16;
      const rec = { type: w(store, 0, at), free: w(store, 0, at + 4), format: w(store, 0, at + 8), multitap: w(store, 0, at + 12) };
      const done = g.scanArrays.find((a) => order(a) > order(store));
      if (!done) return;
      const want = scanStore(rec);
      if (want === null) { check('covered', false, 'the model does not cover a captured case'); return; }
      check('scan.arrays', w(done, 0, slot * 4) === want.type && w(done, 1, slot * 4) === want.kb && w(done, 2, slot * 4) === want.formatted,
        `slot ${slot}: stored type ${w(done, 0, slot * 4)} kb ${w(done, 1, slot * 4)} format ${w(done, 2, slot * 4)}, wanted ${JSON.stringify(want)}`);
    });

    g.title.forEach((call) => {
      const end = g.titleEnd.find((e) => order(e) > order(call));
      const ids = g.string.filter((s) => order(s) > order(call) && order(s) < order(end) && s.gpr[31] >= CONFIG.title[0] && s.gpr[31] < CONFIG.title[1]).map((s) => s.gpr[4]);
      const want = titleIds(call.gpr[4] | 0, call.gpr[5] | 0, CONFIG.rom);
      if (want === null) { check('covered', false, 'the model does not cover a captured case'); return; }
      check('title', JSON.stringify(ids) === JSON.stringify(want), `device ${call.gpr[4]} type ${call.gpr[5]}: read ids ${JSON.stringify(ids.map(hex))}, wanted ${JSON.stringify(want?.map(hex))}`);
    });

    g.layout.forEach((r) => {
      const rec = { count: w(r, 0, 8), first: w(r, 3), scrollTop: w(r, 0, 0) };
      const got = { cols: w(r, 0, 12), rows: w(r, 0, 16), d8: fl(r, 1), f0: fl(r, 2, 0), f4: fl(r, 2, 4) };
      const want = pageLayout(rec);
      if (want === null) { check('covered', false, 'the model does not cover a captured case'); return; }
      check('layout', want.cols === got.cols && want.rows === got.rows && want.f0 === got.f0 && want.f4 === got.f4 && want.d8 === got.d8, `count ${rec.count} first ${rec.first}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
    });
    g.item.forEach((r) => {
      const index = r.gpr[CONFIG.indexReg] | 0;
      const cols = w(r, 2);
      const want = itemPosition({ index, cols, f0: fl(r, 1, 0), f4: fl(r, 1, 4) });
      check('item', want.x === fl(r, 0, 0) && want.y === fl(r, 0, 4), `item ${index} cols ${cols}: got (${fl(r, 0, 0)}, ${fl(r, 0, 4)}), wanted (${want.x}, ${want.y})`);
    });

    for (let k = 1; k < g.phase.length; k++) {
      const a = g.phase[k - 1];
      const b = g.phase[k];
      const phase = nextPhase(fl(a, 0), fl(a, 2));
      if (phase === null) { check('covered', false, 'the model does not cover the selection phase'); continue; }
      check('phase', fl(b, 0) === phase && fl(b, 1) === fl(a, 0), `call ${k}: ${fl(a, 0)} -> ${fl(b, 0)}`);
    }

    (g.status ?? []).forEach((r) => {
      const flagRecord = g.statusFlags.filter((e) => order(e) < order(r)).at(-1);
      const flags = w(r, 5) !== 0 && flagRecord !== undefined ? flagRecord.gpr[2] : 0;
      const want = statusLine({ flags, device: w(r, 5), empty: w(r, 0), pageIn: w(r, 1), pal: w(r, 2), mode: w(r, 3), slide: w(r, 4) });
      if (want === null) { check('covered', false, 'the model does not cover a captured case'); return; }
      check('status', r.gpr[16] === want.id && (r.gpr[6] | 0) === want.alpha, `status id ${hex(r.gpr[16])} alpha ${r.gpr[6] | 0}, wanted ${hex(want.id)} ${want.alpha}`);
    });
    const exits = [g.free1c1, g.free1c0, g.free2f, g.free2e].flatMap((x) => x ?? []).sort((x, y) => order(x) - order(y));
    (g.freeEntry ?? []).forEach((entry) => {
      const kb = entry.gpr[5] | 0;
      const want = freeText(kb);
      if (want === null) { check('covered', false, 'the model does not cover a captured case'); return; }
      const exit = exits.find((e) => order(e) > order(entry));
      const read = g.string.filter((s) => order(s) > order(entry) && order(s) < order(exit) && s.gpr[31] >= 0x253fa0 && s.gpr[31] < 0x254100).map((s) => s.gpr[4]);
      check('free', exit !== undefined && exit.pc === want.exit && JSON.stringify(read) === JSON.stringify([want.id]) && (exit.gpr[6] | 0) === want.args[0] && (want.args[1] === null || (exit.gpr[7] | 0) === want.args[1]),
        `free ${kb} KB: exit ${hex(exit?.pc)} ids ${JSON.stringify(read.map(hex))} args ${exit?.gpr[6]},${exit?.gpr[7]}, wanted ${hex(want.exit)} ${hex(want.id)} ${JSON.stringify(want.args)}`);
    });

    (g.header ?? []).forEach((h) => {
      const dev = w(h, 0);
      const slot = dev < 2 ? -1 : dev > 0xb ? dev - 4 : dev - 2;
      const format = slot < 0 ? w(h, 4) : w(h, 2, slot * 4);
      const kb = slot < 0 ? w(h, 3) : w(h, 1, slot * 4);
      const next = [...g.string, ...g.freeEntry].filter((e) => order(e) > order(h)).sort((x, y) => order(x) - order(y))[0];
      const text = next === undefined ? 'nothing' : next.pc === 0x253fa0 ? `free ${next.gpr[5] | 0}` : `id ${hex(next.gpr[4])}`;
      const want = h.gpr[2] === 0 ? 'id 0x2d' : `free ${kb}`;
      check('header', (h.gpr[2] | 0) === format && h.gpr[4] === (slot < 0 ? 0x108 : slot) * 4 && text === want, `device ${dev}: format ${h.gpr[2]} (array ${format}), slot offset ${h.gpr[4]}, drew ${text}, wanted ${want}`);
    });

    const frames = new Map(g.input.map((r) => [r.captureFrame, r]));
    const sounds = new Map();
    for (const e of g.enqueue) sounds.set(e.captureFrame, [...(sounds.get(e.captureFrame) ?? []), e]);
    let unmodelled = 0;
    for (const r of g.input) {
      const next = frames.get(r.captureFrame + 1);
      if (!next) continue;
      if (w(next, 9) !== w(r, 9) || w(next, 10) !== w(r, 10)) { counts.pageChanges = (counts.pageChanges ?? 0) + 1; continue; }
      const rec = CONFIG.recStride * w(r, 9);
      const state = {
        cursor: w(r, 1), first: w(r, 2), dialog: w(r, 3), pageIn: w(r, 4), hold: r.mem[5].bytes[0], slide: w(r, 6, 0), slideB: w(r, 6, 4), pal: w(r, 7),
        mode: CONFIG.rom ? (w(r, 8) !== 0 ? 2 : 0) : w(r, 8), device: CONFIG.rom ? 0 : w(r, 10),
        listCount: w(r, 11, 0), busy: w(r, 11, 4), edge: w(r, 0, 4), repeat: w(r, 0, 12),
        recCount: w(r, 13, rec + CONFIG.count), scrollTop: w(r, 13, rec + CONFIG.scroll),
      };
      const want = cursorStep(state);
      if (!want.modelled) { unmodelled += 1; check('covered', (state.edge & 0x70) !== 0, `frame ${r.captureFrame}: input not modelled without an edge key (pad ${hex(state.repeat)})`); continue; }
      const moved = (sounds.get(r.captureFrame) ?? []).filter((e) => e.gpr[4] === CONFIG.sound.cmd && e.gpr[6] === 6 && e.gpr[31] === CONFIG.sound.ra).length;
      check('cursor', w(next, 1) === want.cursor, `frame ${r.captureFrame}: cursor ${state.cursor} pad ${hex(state.repeat)} -> ${w(next, 1)}, wanted ${want.cursor}`);
      check('sound', moved === (want.sound ? 1 : 0), `frame ${r.captureFrame}: ${moved} move sounds, wanted ${want.sound ? 1 : 0}`);
    }
    counts.unmodelledFrames = (counts.unmodelledFrames ?? 0) + unmodelled;
  }
  return { failures, counts };
}

if (process.argv[2] && process.argv[1].endsWith('verify_browser_devices.mjs')) {
  const { failures, counts } = verify(process.argv.slice(2).filter((a) => !a.startsWith('--')));
  console.log(JSON.stringify(counts));
  for (const f of failures.slice(0, 30)) console.log(`DIFFERENT ${f}`);
  const sections = ['scan.kb', 'scan.arrays', 'title', 'layout', 'item', 'phase', 'cursor', 'sound'];
  const missing = sections.filter((s) => !counts[s]);
  console.log(`verdict: ${failures.length === 0 && missing.length === 0 ? 'FOUND the device row' : `PARTIAL ${failures.length} different, nothing compared for: ${missing.join(', ') || '-'}`}`);
}
