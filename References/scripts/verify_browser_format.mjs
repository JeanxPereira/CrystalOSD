// The Browser's Format dialog on a memory card slot that reports no format (HDD OSD 1.10U NTSC): the logic's per-call
// transitions (state, Yes/No cursor, the pad, the sounds it queues, the rescan request and the format job), and what the
// render draws in each state (string ids, heights, the colours of Yes and No, the fade alpha), recomputed by
// model/browser_devices.mjs from the probed words and compared with what the console did.
//   HDD OSD: logic 0x255C18 (dispatcher 0x255BE8), render 0x255868 from 0x2516F0, job start 0x2496F0, sceMcFormat 0x23C370.
// CLOCK_BUILD=hdd node verify_browser_format.mjs <trace.jsonl>...
import { readTraceFor, probesOf } from '../lib/trace.mjs';
import { range, pc } from './builds.mjs';

const BUILD = process.env.CLOCK_BUILD ?? 'hdd';
import { statusLine } from '../model/browser_devices.mjs';
import { formatStep, formatDraw } from '../model/browser_format.mjs';

const SPEC = BUILD === 'hdd' ? [
  ['logic', { pc: pc(0x255c18), ranges: [range(0x370bbc, 8), range(0x370820, 8), range(0x370604, 4), range(0x37061c, 4), range(0x3707a4, 4), range(0x370728, 4), range(0x2bd420, 0x380), range(0x2bc9d8, 0x20)] }],
  ['enqueue', { pc: pc(0x200c00), ranges: [] }],
  ['render', { pc: pc(0x255868), ranges: [range(0x370bbc, 8), range(0x370764, 4), range(0x37072c, 4), range(0x3706b0, 4), range(0x3706d0, 4), range(0x370730, 4)] }],
  ['string', { pc: pc(0x2081b8), ranges: [] }],
  ['lines', { pc: pc(0x24d550), ranges: [] }],
  ['yesno', { pc: pc(0x24d900), ranges: [] }],
  ['sprintf', { pc: pc(0x25593c), ranges: [] }],
  ['wrapper', { pc: pc(0x23c370), ranges: [] }],
  ['input', { pc: pc(0x254840), ranges: [range(0x370820, 8)] }],
] : [];
export const PROBES = SPEC.map(([, probe]) => probe);
const NAMES = SPEC.map(([name]) => name);

const LOGIC = [0x255c18, 0x255e4c];
const RENDER = [0x255868, 0x2559fc];

const w = (record, slot, at = 0) => record.mem[slot].bytes.readInt32LE(at);
const hex = (n) => `0x${(n >>> 0).toString(16)}`;
const seq = new WeakMap();
const order = (record) => seq.get(record);
const inside = (record, [low, high]) => record.gpr[31] >= low && record.gpr[31] < high;

export function verify(files) {
  const failures = [];
  const counts = {};
  const check = (section, ok, what) => { counts[section] = (counts[section] ?? 0) + 1; if (!ok) failures.push(`${section}: ${what}`); };
  for (const file of files) {
    const trace = readTraceFor(file, PROBES);
    if (!trace.complete) throw new Error(`${file}: ${trace.reason}`);
    trace.probes.forEach((r, i) => seq.set(r, i));
    const groups = probesOf(trace, PROBES);
    const g = Object.fromEntries(NAMES.map((n, i) => [n, groups[i].filter((r) => !r.preroll)]));
    const byFrame = (list) => new Map(list.map((r) => [r.captureFrame, r]));
    const logicAt = byFrame(g.logic);
    const inputAt = byFrame(g.input);
    const soundsAt = new Map();
    for (const e of g.enqueue.filter((x) => inside(x, LOGIC))) soundsAt.set(e.captureFrame, [...(soundsAt.get(e.captureFrame) ?? []), e]);
    let opened = false;

    for (const r of g.logic) {
      const frame = r.captureFrame;
      const state = w(r, 0, 4);
      const cursor = r.mem[0].bytes[0];
      if (!opened) { check('open', state === 1 && w(r, 1, 0) === 1, `first call: state ${state}, dialog ${w(r, 1, 0)}`); opened = true; }
      const want = formatStep({ state, cursor, edge: w(r, 4), busy: w(r, 2), result: r.mem[3].bytes[0] });
      const effects = (soundsAt.get(frame) ?? []).filter((e) => e.gpr[4] === 0x6300 && e.gpr[5] === 1).map((e) => e.gpr[6]);
      check('sound', JSON.stringify(effects) === JSON.stringify(want.sounds), `frame ${frame}: effects ${JSON.stringify(effects)}, wanted ${JSON.stringify(want.sounds)}`);
      const next = logicAt.get(frame + 1);
      const after = inputAt.get(frame + 1);
      if (next) {
        check('step', next.mem[0].bytes[0] === want.cursor && w(next, 0, 4) === want.state && w(next, 1, 0) === want.dialog, `frame ${frame}: state ${state} cursor ${cursor} edge ${hex(w(r, 4))} -> state ${w(next, 0, 4)} cursor ${next.mem[0].bytes[0]} dialog ${w(next, 1, 0)}, wanted ${want.state} ${want.cursor} ${want.dialog}`);
        if (want.job) check('job', w(next, 2) === 2, `frame ${frame}: busy ${w(next, 2)} after the format job started`);
        if (want.rescan) check('rescan', w(next, 7, w(r, 1, 4) * 4) === 1, `frame ${frame}: rescan flag ${w(next, 7, w(r, 1, 4) * 4)}`);
        if (want.clearBit) {
          const rec = 0x1c0 * w(r, 5) + 0xf8;
          check('flag', (w(next, 6, rec) & 8) === 0 && (w(r, 6, rec) & 8) !== 0, `frame ${frame}: flags ${hex(w(r, 6, rec))} -> ${hex(w(next, 6, rec))}`);
        }
      } else if (after && want.dialog === 0) {
        check('close', w(after, 0, 0) === 0, `frame ${frame}: dialog word ${w(after, 0, 0)} after a close`);
      }
    }
    const forms = g.wrapper.length;
    counts.formatCalls = forms;

    g.render.forEach((r, k) => {
      const state = w(r, 0, 4);
      const cursor = r.mem[0].bytes[0];
      const want = formatDraw({ state, cursor });
      const last = g.render[k + 1] ? order(g.render[k + 1]) : Infinity;
      const mine = (list) => list.filter((e) => order(e) > order(r) && order(e) < last && inside(e, RENDER));
      const ids = mine(g.string).map((e) => e.gpr[4]);
      const heights = [...mine(g.lines), ...mine(g.yesno)].map((e) => e.gpr[5]);
      const colours = mine(g.sprintf).map((e) => [e.gpr[6], e.gpr[8]])[0] ?? null;
      check('draw', want !== null && JSON.stringify(ids) === JSON.stringify(want.ids) && JSON.stringify(heights) === JSON.stringify(want.heights) && JSON.stringify(colours) === JSON.stringify(want.colours),
        `state ${state} cursor ${cursor}: ids ${JSON.stringify(ids.map(hex))} heights ${JSON.stringify(heights)} colours ${JSON.stringify(colours)}, wanted ${JSON.stringify(want)}`);
      const fade = statusLine({ flags: 0, device: 0, empty: w(r, 1), pageIn: w(r, 2), pal: w(r, 3), mode: w(r, 4), slide: w(r, 5) });
      check('alpha', fade !== null && (r.gpr[4] | 0) === fade.alpha, `render alpha ${r.gpr[4] | 0}, wanted ${fade?.alpha}`);
    });
  }
  return { failures, counts };
}

if (process.argv[2] && process.argv[1].endsWith('verify_browser_format.mjs')) {
  const { failures, counts } = verify(process.argv.slice(2).filter((a) => !a.startsWith('--')));
  console.log(JSON.stringify(counts));
  for (const f of failures.slice(0, 30)) console.log(`DIFFERENT ${f}`);
  const sections = ['open', 'sound', 'step', 'draw', 'alpha', 'close'];
  const missing = sections.filter((s) => !counts[s]);
  console.log(`verdict: ${failures.length === 0 && missing.length === 0 ? 'FOUND the Format dialog' : `PARTIAL ${failures.length} different, nothing compared for: ${missing.join(', ') || '-'}`}`);
}
