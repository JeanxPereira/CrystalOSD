// The sound commands the Browser module queues, recomputed from the words each sender reads and compared entry for entry with the enqueue,
// plus the 0x8070 send of the module's start and the clock-side commands around the module (menu Cross, disc-state sound, clock restart).
//
// HDD OSD 1.10U. Browser: every 0x6300 goes through sound_handle_queue_cmd_auto 0x0024E090 (the gate: D_00370740 != 0xA, or view mode 3, or
// view mode 2 with D_00370460 == 2), then the enqueue sound_handler_queue_cmd 0x00200C00 (a0..a3, ra). Senders: func_00254840 (device row, entry
// 0x00254840; page 0x002548F4; item 0x00254A04; stack flags 0x00254C90; func_002547C0's return 0x00254FC4) and func_00255C18 (Format dialog,
// entry 0x00255C18). Per call the model (model/browser_shell.mjs browserRoot / formatDialog) predicts the commands; the gate probe must show the
// same list (a0..a3, ra), and the enqueue must follow a gate record exactly when browserGate says so. 0x8070: module_browser_24EB38 stores
// D_001F0114 at 0x0024EB7C (value from the word read at 0x0024EB60), and the first drain pass after it calls sceSdRemote at 0x0020CE2C. Clock side
// (model/sound_senders.mjs): the main menu's Cross (0x002322E0), the clock thread's disc-state loop (0x00225A28..0x00225B04), the clock start
// (0x00225D50) and set-up (0x002324C8). Every enqueue of the capture must be explained by one of them.
// a3 is never loaded at the Browser sites: 'free' = recorded (sent as 0 by the native port), 'ring' = the second call of a pair.
// CLOCK_BUILD=hdd node verify_browser_sounds.mjs <trace.jsonl>...
//
// Captures (HDD, --mode exact, --state menu, all pad frames are capture frames; every Browser press is held 6 frames unless said):
//   hddosd-110U-browser-sounds-enter  --verifiers verify_browser_enter.mjs,verify_browser_logic.mjs,verify_browser_sounds.mjs, 470 frames:
//     Cross 0 (menu item 0), Circle 140 (dialog fading in: ignored), 262 (closes the dialog), 340 (root Circle: the leave request).
//   hddosd-110U-browser-sounds-row  --verifiers verify_browser_sounds.mjs, 1520 frames: Cross 0, Circle 175 (closes the dialog), then on the
//     device row Right 240, Left 252, Left 270, Right 300, Up 330, Down 360, Up 390, Down 420, Cross 450 (opens the Format dialog), in it Left 500,
//     Right 530, Left 560, Right 590, Cross 620 (answer 0: closes), Circle 670 (pops the page), Right 690 (page fading in), Cross 760 (dialog again),
//     Circle 820 (cancels it), Right 860 (the pushed page has no items), Circle 890 (pops), Left held 50 frames from 980 (the repeat word), Right 1070,
//     1110, 1150, 1190 each with one memory write the frame after (D_00370858 = 8, D_0037085C = 8, byte D_00370678 = 1 then 0 at 1160, D_00370600 = 0),
//     Right 1270, Up held 50 frames from 1330 with Cross 1340 (the held direction stops it), Left 1390, Triangle 1450 (the module leaves). One more
//     write at frame 50: var_mechacon_config_param_1 (0x371818) = 0x07000011 (bit 0 set: the 0x15 / a3 = 2 case of the 0x8070 send).
import { readTraceFor, probesOf } from '../lib/trace.mjs';
import { BUILD, BUILD_NAME, range, pc } from './builds.mjs';
import { Stats } from '../lib/sound_menu_stats.mjs';
import { mainMenu, clockStart, clockSetup, discLoop, ringTemporary } from '../model/sound_senders.mjs';
import { image, browserGate, browserRoot, formatDialog, spdifStore, REMOTE_A3, SOUND_COMMAND } from '../model/browser_shell.mjs';

const PAD_WORDS = range(0x00370330, 0x10);
const HDD = BUILD === 'hdd';
const LIST = [
  ['enqueue', pc(0x00200c00), [range(0x001f0a5c, 8)]],
  ['gate', pc(0x0024e090), [range(0x00370740, 4), range(0x003706f8, 4), range(0x00370460, 4)]],
  ['root', pc(0x00254840), [range(0x003707a0, 0x10), range(0x00370820, 4), range(0x0037072c, 4), range(0x00370678, 4), range(0x00370858, 8), range(0x003706b0, 4), range(0x003706d0, 4), range(0x00370770, 8)]],
  ['page', pc(0x002548f4), ['s1+0x124:0x4', 's1+0xf8:0x8']],
  ['item', pc(0x00254a04), [range(0x00370600, 8), 's2+0x90:0x8', 's2+0xb0:0x4', 's2+0x690:0x4']],
  ['pop', pc(0x00254938), []],
  ['flags', pc(0x00254c90), ['sp+0x0:0x10']],
  ['pred', pc(0x00254fc4), []],
  ['format', pc(0x00255c18), [range(0x00370bbc, 8), range(0x003707a4, 4)]],
  ['storeConfig', pc(0x0024eb60), [range(0x00371818, 4)]],
  ['store', pc(0x0024eb7c), []],
  ['drain', pc(0x00200a80), []],
  ['remote', pc(0x0020ce2c), [range(0x001f0114, 4), range(0x001f0d40, 4)]],
  ['menu', pc(0x002322e0), [range(0x002b2e60, 0x30), range(0x002b2174, 4), PAD_WORDS, range(0x00370ab4, 4)]],
  ['menuGate', pc(0x00232310), []],
  ['submit', pc(0x0022a2c8), []],
  ['clockStart', pc(0x00225d50), []],
  ['setup', pc(0x002324c8), [range(0x002ad22c, 4)]],
  ['top', pc(0x00225a28), [range(0x001f000c, 4), range(0x00370a7c, 4), range(0x002b2174, 4), range(0x001f0d58, 4), range(0x00365500, 0x2c)]],
  ['fef8', pc(0x00225a44), []],
  ['ff28', pc(0x00225a90), []],
  ['fef8b', pc(0x00225aa0), []],
  ['ff98', pc(0x00225ad4), []],
  ['sound', pc(0x00225b04), [range(0x00365530, 0x28)]],
];
export const PROBES = HDD ? LIST.map(([, address, ranges]) => ({ pc: address, ranges })) : [];
const K = Object.fromEntries(LIST.map(([name], i) => [name, i]));

const u16 = (n) => n & 0xffff;
const hex = (v) => `0x${v.toString(16)}`;
const unsigned = (n) => n >>> 0;
const u32 = (img, address) => unsigned(img.s32(address));
const A1 = 1;
const DIALOG_RUNNING = 2;
const same = (a, b) => a.every((x, i) => x === b[i]);
const COUNTERS = ['gated', 'dropped', 'store', 'remote', 'root', 'format', 'menu', 'disc', 'ring', 'afterClose', 'dialogSteps', 'sends'];

export function verify(files) {
  const failures = [];
  const results = [];
  const check = (ok, what) => { results.push(ok); if (!ok) failures.push(what); };
  const stats = new Stats();
  const seen = Object.fromEntries(COUNTERS.map((name) => [name, []]));

  for (const file of files) {
    const trace = readTraceFor(file, PROBES);
    if (!trace.complete) throw new Error(`${file}: ${trace.reason}`);
    const groups = probesOf(trace, PROBES);
    const kind = new Map();
    groups.forEach((records, i) => records.forEach((r) => kind.set(r, i)));
    const records = trace.probes.filter((r) => kind.has(r)).filter((r) => !r.preroll);
    for (const r of records) r.probe = kind.get(r);

    let frame = null;
    let call = { type: 'before the first call', number: null, seq: [] };
    let previousKind = null;
    let iteration = null;
    let dialog = null;
    let expectW820 = null;
    let pending = null;

    const closeIteration = () => {
      if (!iteration) return;
      const it = iteration;
      iteration = null;
      const t = image([it.top]);
      const input = {
        disc: u32(t, 0x001f000c), last: u32(t, 0x00370a7c), flag: u32(t, 0x002b2174), d58: u32(t, 0x001f0d58),
        compareTable: Array.from({ length: 11 }, (_, i) => u32(t, 0x00365500 + 4 * i)), mode: it.mode, soundTable: it.soundTable,
        fef8: it.returns.fef8, ff28: it.returns.ff28, fef8b: it.returns.fef8b, ff98: it.returns.ff98,
      };
      const out = discLoop(input);
      seen.disc.push(true);
      for (const name of out.calls) check(it.returns[name] !== undefined, { why: 'callee not reached', file, frame: it.number, name });
      for (const name of ['fef8', 'ff28', 'fef8b', 'ff98']) check(out.calls.includes(name) || it.returns[name] === undefined, { why: 'callee reached but not modelled', file, frame: it.number, name });
      check(out.soundBranch === it.sawSound, { why: 'sound branch', file, frame: it.number, want: out.soundBranch, got: it.sawSound });
      it.context.push(...out.sounds.map((c) => ({ ...c, site: 'disc state' })));
    };

    // The words of one func_00254840 call, from its records.
    const rootWords = (c) => {
      const e = image([c.root]);
      const w = {
        held: u32(e, 0x003707a0), edge: u32(e, 0x003707a4), repeat: u32(e, 0x003707ac), w820: u32(e, 0x00370820), fadeIn: u32(e, 0x0037072c),
        pal: u32(e, 0x003706b0), b678: e.u8(0x00370678), w858: u32(e, 0x00370858), w85c: u32(e, 0x0037085c), w6d0: u32(e, 0x003706d0),
        b771: e.u8(0x00370771), b772: e.u8(0x00370772), b773: e.u8(0x00370773),
      };
      if (c.page) { const p = image([c.page]); w.kind = u32(p, c.page.gpr[17] + 0x124); w.pageFlags = u32(p, c.page.gpr[17] + 0xf8); }
      if (c.pop) w.poppedKind = unsigned(c.pop.gpr[3]);
      if (c.item) {
        const i = image([c.item]);
        const item = c.item.gpr[18];
        w.count = unsigned(c.item.gpr[3]); w.w600 = u32(i, 0x00370600); w.w604 = u32(i, 0x00370604);
        w.item90 = u32(i, item + 0x90); w.itemB0 = u32(i, item + 0xb0); w.item690 = u32(i, item + 0x690);
      }
      if (c.flags) { const f = image([c.flags]); const sp = unsigned(c.flags.gpr[29]); w.flags = { up: u32(f, sp), down: u32(f, sp + 4), left: u32(f, sp + 8), right: u32(f, sp + 0xc) }; }
      if (c.pred) w.pred = unsigned(c.pred.gpr[2]);
      return w;
    };

    // One func_00254840 or func_00255C18 call: the model's commands against the gate records that followed its entry (a call's commands may
    // land in the frame after its entry: the pass is cut by the vsync).
    const finishCall = (c) => {
      const number = c.number;
      let want = [];
      if (c.type === 'root') {
        const w = rootWords(c);
        if (expectW820 !== null) { check(w.w820 === expectW820, { why: 'dialog flag D_00370820 after the dialog call', file, frame: number, want: expectW820, got: w.w820 }); seen.afterClose.push(true); expectW820 = null; }
        seen.root.push(true);
        want = browserRoot(w).map((x) => ({ ...x, site: 'device row' }));
      }
      if (c.type === 'format') {
        const e = image([c.format]);
        const state = u32(e, 0x00370bc0);
        const sel = e.u8(0x00370bbc);
        if (dialog) {
          check(state === DIALOG_RUNNING, { why: 'dialog state D_00370BC0', file, frame: number, want: DIALOG_RUNNING, got: state });
          check(sel === dialog.sel, { why: 'dialog answer D_00370BBC', file, frame: number, want: dialog.sel, got: sel });
          seen.dialogSteps.push(true);
        }
        const d = formatDialog({ state, sel, edge: u32(e, 0x003707a4) });
        dialog = d.closed ? null : d;
        expectW820 = Number(!d.closed);
        seen.format.push(true);
        want = d.out.map((x) => ({ ...x, site: 'format dialog' }));
      }
      const gates = c.seq.filter((s) => s.type === 'gate');
      check(want.length === gates.length, { why: 'count of gate calls', file, frame: number, call: c.type, want: want.map((w) => [w.a2, hex(w.ra)]), got: gates.map((g) => [g.a2, hex(g.ra)]) });
      let lastEnqueue = null;
      want.forEach((w, i) => {
        const g = gates[i] ?? { words: {} };
        check(g.a0 === SOUND_COMMAND, { why: 'a0', file, frame: number, i, want: SOUND_COMMAND, got: g.a0 });
        check(g.a1 === A1, { why: 'a1', file, frame: number, i, want: A1, got: g.a1 });
        check(g.a2 === w.a2, { why: 'a2', file, frame: number, i, want: w.a2, got: g.a2 });
        check(g.ra === w.ra, { why: 'ra', file, frame: number, i, site: w.site, want: w.ra, got: g.ra });
        if (w.a3 === 'ring') {
          check(lastEnqueue !== null, { why: 'a3 ring temporary without a previous enqueue', file, frame: number, i });
          check(g.a3 === ringTemporary(lastEnqueue.head), { why: 'a3 ring temporary', file, frame: number, i, got: g.a3, previous: lastEnqueue });
          seen.ring.push(true);
        }
        const pass = browserGate(g.words);
        const next = c.seq[c.seq.indexOf(g) + 1] ?? {};
        const enqueued = next.type === 'enqueue';
        check(enqueued === pass, { why: 'gate', file, frame: number, i, words: g.words, want: pass, got: enqueued });
        if (enqueued) {
          check(same([next.a0, next.a1, next.a2, next.a3, next.ra], [g.a0, g.a1, g.a2, g.a3, g.ra]), { why: 'enqueue arguments', file, frame: number, i });
          lastEnqueue = next;
          seen.gated.push(true);
        } else seen.dropped.push(true);
        stats.sent(w.site, w.a2, w.a3 === 'ring' ? 'ring' : 'free', g);
      });
      stats.predicted += want.length;
      stats.observed += gates.length;
    };

    // The commands the enqueue saw that did not come through the gate: the clock side, frame by frame.
    const flush = () => {
      if (!frame) return;
      closeIteration();
      const number = frame.number;
      for (const r of frame.menus) {
        const m = image([r]);
        const sounds = mainMenu({
          edge: u32(m, 0x00370334), selected: u32(m, 0x002b2e70), count: u32(m, 0x002b2e68), rampState: u32(m, 0x002b2e84),
          flag: u32(m, 0x002b2174), mode: u32(m, 0x00370ab4), gate: frame.gate, submit: frame.submit,
        });
        frame.context.push(...sounds.map((c) => ({ ...c, a0: SOUND_COMMAND, a1: 1, site: 'main menu' })));
        seen.menu.push(...sounds);
      }
      const direct = frame.direct;
      const context = frame.context;
      check(context.length === direct.length, { why: 'count of clock-side commands', file, frame: number, want: context.map((c) => [hex(c.a0), c.a1, c.a2, hex(c.ra)]), got: direct.map((d) => [hex(d.a0), d.a1, d.a2, hex(d.ra)]) });
      context.forEach((c, i) => {
        const d = direct[i] ?? {};
        const a2 = c.a2 === 'ring' ? u16(0x065c + 8 * direct[i - 1].head) : c.a2;
        const a3 = c.a3 === 'ring' ? ringTemporary(direct[i - 1].head) : c.a3;
        check(d.a0 === c.a0, { why: 'clock-side a0', file, frame: number, i, want: c.a0, got: d.a0 });
        check(d.a1 === c.a1, { why: 'clock-side a1', file, frame: number, i, want: c.a1, got: d.a1 });
        check(d.a2 === a2, { why: 'clock-side a2', file, frame: number, i, want: a2, got: d.a2 });
        if (c.a3 !== 'free') check(d.a3 === a3, { why: 'clock-side a3', file, frame: number, i, want: a3, got: d.a3 });
        check(d.ra === c.ra, { why: 'clock-side ra', file, frame: number, i, site: c.site, want: c.ra, got: d.ra });
        stats.sent(`${c.site} ${hex(c.a0)},${c.a1}`, c.a2, c.a3 === 'free' ? 'free' : 'literal', d);
      });
      stats.predicted += context.length;
      stats.observed += direct.length;
      frame = null;
    };

    for (const r of records) {
      const k = r.probe;
      if (!frame || frame.id !== r.frame) {
        flush();
        frame = { id: r.frame, number: r.captureFrame, direct: [], context: [], menus: [], gate: undefined, submit: undefined };
        stats.frame(file, r.captureFrame);
      }
      if (k === K.enqueue) {
        const entry = { type: 'enqueue', a0: u16(r.gpr[4]), a1: u16(r.gpr[5]), a2: u16(r.gpr[6]), a3: u16(r.gpr[7]), ra: unsigned(r.gpr[31]), head: r.mem[0].bytes.readUInt32LE(4) & 127 };
        if (previousKind === K.gate) call.seq.push(entry);
        else frame.direct.push(entry);
      } else if (k === K.gate) {
        const g = image([r]);
        call.seq.push({ type: 'gate', a0: u16(r.gpr[4]), a1: u16(r.gpr[5]), a2: u16(r.gpr[6]), a3: u16(r.gpr[7]), ra: unsigned(r.gpr[31]), words: { w740: u32(g, 0x00370740), view: u32(g, 0x003706f8), w460: u32(g, 0x00370460) } });
      } else if (k === K.root) { finishCall(call); call = { type: 'root', root: r, number: r.captureFrame, seq: [] }; }
      else if (k === K.format) { finishCall(call); call = { type: 'format', format: r, number: r.captureFrame, seq: [] }; }
      else if (k === K.page) call.page = r;
      else if (k === K.item) call.item = r;
      else if (k === K.pop) call.pop = r;
      else if (k === K.flags) call.flags = r;
      else if (k === K.pred) call.pred = r;
      else if (k === K.storeConfig) pending = { config: unsigned(image([r]).s32(0x00371818)), frame: r.captureFrame, stored: null, drained: false };
      else if (k === K.store) {
        check(pending !== null, { why: 'store without the config read', file, frame: r.captureFrame });
        pending.stored = unsigned(r.gpr[2]);
        check(pending.stored === spdifStore(pending.config), { why: 'D_001F0114 stored', file, frame: r.captureFrame, want: spdifStore(pending.config), got: pending.stored });
        seen.store.push(true);
      } else if (k === K.drain) {
        stats.drain(r.captureFrame);
        if (pending && pending.stored !== null) {
          check(!pending.drained, { why: 'no sceSdRemote in the drain pass after the store', file, frame: r.captureFrame });
          pending.drained = true;
          pending.drainFrame = r.captureFrame;
        }
      } else if (k === K.remote) {
        const m = image([r]);
        check(pending !== null, { why: 'sceSdRemote without a store', file, frame: r.captureFrame });
        check(pending.drained, { why: 'sceSdRemote outside the first drain pass after a store', file, frame: r.captureFrame });
        const word = u32(m, 0x001f0114);
        check(word === pending.stored, { why: 'D_001F0114 at the send', file, frame: r.captureFrame, want: pending.stored, got: word });
        check(u32(m, 0x001f0d40) === 0, { why: 'sceSdRemote with the drain suspended', file, frame: r.captureFrame });
        const args = [r.gpr[4], r.gpr[5], r.gpr[7]].map(unsigned);
        check(same(args, [1, 0x8070, REMOTE_A3[word]]), { why: 'sceSdRemote arguments', file, frame: r.captureFrame, got: args.map(hex) });
        seen.remote.push(true);
        seen.sends.push(`config ${hex(pending.config)} read at frame ${pending.frame}, drain pass ${pending.drainFrame}, send ${r.captureFrame}: word ${hex(word)} a3 ${hex(args[2])}`);
        pending = null;
      } else if (k === K.menu) frame.menus.push(r);
      else if (k === K.menuGate) frame.gate = unsigned(r.gpr[2]) !== 0;
      else if (k === K.submit) frame.submit = unsigned(r.gpr[2]) !== 0;
      else if (k === K.clockStart) frame.context.push(...clockStart().map((c) => ({ ...c, site: 'clock start' })));
      else if (k === K.setup) frame.context.push(...clockSetup({ word: u32(image([r]), 0x002ad22c) }).map((c) => ({ ...c, site: 'set-up' })));
      else if (k === K.top) {
        closeIteration();
        iteration = { top: r, number: r.captureFrame, returns: {}, mode: undefined, soundTable: undefined, sawSound: false, context: frame.context };
      } else if (iteration) {
        if (k === K.fef8) iteration.returns.fef8 = unsigned(r.gpr[2]);
        else if (k === K.ff28) iteration.returns.ff28 = unsigned(r.gpr[2]);
        else if (k === K.fef8b) iteration.returns.fef8b = unsigned(r.gpr[2]);
        else if (k === K.ff98) iteration.returns.ff98 = unsigned(r.gpr[2]);
        else if (k === K.sound) {
          const s = image([r]);
          iteration.sawSound = true;
          iteration.mode = unsigned(r.gpr[2]);
          iteration.soundTable = Array.from({ length: 10 }, (_, i) => u32(s, 0x00365530 + 4 * i));
        }
      }
      previousKind = k;
    }
    flush();
    finishCall(call);
    check(pending === null, { why: 'a store without its sceSdRemote', file });
  }
  return { compared: results.length, failures, stats, seen };
}

if (process.argv[1] && process.argv[1].endsWith('verify_browser_sounds.mjs')) {
  if (!HDD) throw new Error('verify_browser_sounds.mjs reads the HDD OSD 1.10U: run with CLOCK_BUILD=hdd');
  const r = verify(process.argv.slice(2));
  console.log(`build: ${BUILD_NAME}`);
  r.stats.report(console.log);
  const n = (name) => r.seen[name].length;
  console.log(`device-row calls ${n('root')}, Format dialog calls ${n('format')} (state/answer carried between calls ${n('dialogSteps')}, flag after a dialog call ${n('afterClose')}), gated commands enqueued ${n('gated')}, dropped by the gate ${n('dropped')}, ring a3 ${n('ring')}; `
    + `main-menu commands ${n('menu')}, disc-loop iterations ${n('disc')}; D_001F0114 stores ${n('store')}, sceSdRemote sends ${n('remote')}`);
  for (const line of r.seen.sends) console.log(`  0x8070: ${line}`);
  if (r.compared === 0) throw new Error('compared nothing: not a verifier');
  console.log(`compared ${r.compared} items, ${r.failures.length} differ`);
  for (const f of r.failures.slice(0, 10)) console.log(JSON.stringify(f));
  const need = [];
  if (!r.stats.observed) need.push('no command enqueued at all');
  if (!n('store') || n('store') !== n('remote')) need.push('the 0x8070 store and send are not both seen');
  const ok = !r.failures.length && !need.length;
  console.log(ok ? `verdict: FOUND ${r.compared} items equal` : `verdict: PARTIAL ${r.failures.length ? `${r.failures.length} of ${r.compared} differ` : need.join(', ')}`);
  process.exitCode = Number(!ok);
}
