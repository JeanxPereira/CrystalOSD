// The Browser page chrome: from the page's state, References/model/browser_chrome.mjs produces the
// packets the module's frame body sends (draw environments, clear, gradient, tile layers, titles'
// shape, error dialog, letter-box bands, button guide, fade rectangle); this compares them with the
// packets the build really sent, write by write and in order, frame by frame.
//
//   frame body        HDD 0x0024EB90  ROM 0x00247FD8
//   master draw       HDD 0x00253860  ROM 0x0024D500   (what marks a Browser frame in a trace capture)
//   card row          HDD 0x002527A8, back at 0x002538F0   ROM 0x0024C238, back at 0x0024D58C   excluded
//
// The card row is excluded by an explicit list: in a trace capture the packets whose origin stack holds
// its root, in an exact capture the packets between the probes at the root and at its return.
// Text is checked by shape, not by geometry: the string (from the build's language table) fixes the glyph
// packet count, every vertex carries the colour and alpha of the rule, and a glyph the font cache loads
// in the middle of a string (a BITBLTBUF packet) is skipped. The font library's context is not page state.
//
// The page state comes from the capture's probes when it carries them (HDD OSD: fade record, screen record,
// guide counters, texture table, dialog); a trace capture has none and takes the stimulus that started it,
// declared below: the leave fade (state 3, length 90) starts at the capture's first Browser frame.
//
// CLOCK_BUILD=hdd|rom node verify_browser_chrome.mjs <trace.jsonl>
import fs from 'node:fs';
import { readTraceFor, writesOf, dataPath } from '../lib/index.mjs';
import { pick, range, pc, BUILD, BUILD_NAME } from './builds.mjs';
import { chromeFrame, titleAlpha, R } from '../model/browser_chrome.mjs';

const A = pick({
  rom: { card: 0x0024c238, cardEnd: 0x0024d58c, master: 0x0024d500, blend: 0x002ad500, tile: 0x0029bcd0, xtab: 0x002ad860, dy: 1 },
  hdd: { card: 0x002527a8, cardEnd: 0x002538f0, master: 0x00253860, blend: 0x002bcfc0, tile: 0x00366148, xtab: 0x002bd2e0, dy: 2 },
});
// The probes (HDD OSD), each on the first instruction of its function unless noted:
//   background 0x00248A90  fade record 0x00370660 (state, counter +0xC, colour +0x10, length +0x14), variant 0x003705D4, texture table 0x002BD910
//   fade       0x0024CEB0  the same record where the rectangle is drawn
//   bands      0x0024D0C8  aspect word 0x00370668, PAL flag 0x003706B0, screen record 0x001F0CB4
//   guide      0x002524D0  slot counters 0x004DA340, language word 0x003706AC, texture table
//   vidmode    0x00252574  after get_vidmode_with_fallback: v0
//   width      0x002526E4  after the width of slot 3's label: v0, label pointer 0x00370B9C
//   title      0x00250DA0  page fade counter 0x0037072C
//   dialog     0x0025BD18  counter 0x003708F0, step 0x00370BE4, kind 0x00370BE8, leave counter 0x003706A8, errors 0x00370778, 0x00370780
const P = { bg: 0x00248a90, fade: 0x0024ceb0, bands: 0x0024d0c8, guide: 0x002524d0, vidmode: 0x00252574, width: 0x002526e4, title: 0x00250da0, dialog: 0x0025bd18 };
export const PROBES = [
  { pc: pc(A.card), ranges: [] },
  { pc: pc(A.cardEnd), ranges: [] },
  ...(BUILD === 'hdd' ? [
    { pc: pc(P.bg), ranges: [range(0x370660, 0x18), range(0x3705d4, 4), range(0x2bd910, 0xe0)] },
    { pc: pc(P.fade), ranges: [range(0x370660, 0x18)] },
    { pc: pc(P.bands), ranges: [range(0x370668, 4), range(0x3706b0, 4), range(0x1f0cb4, 8)] },
    { pc: pc(P.guide), ranges: [range(0x4da340, 0x10), range(0x3706ac, 4), range(0x2bd910, 0xe0)] },
    { pc: pc(P.vidmode), ranges: [] },
    { pc: pc(P.width), ranges: [range(0x370b9c, 4)] },
    { pc: pc(P.title), ranges: [range(0x37072c, 4)] },
    { pc: pc(P.dialog), ranges: [range(0x3708f0, 4), range(0x370be4, 4), range(0x370be8, 4), range(0x3706a8, 4), range(0x370778, 4), range(0x370780, 4)] },
  ] : []),
];

// ---- the program's static tables, from the build's own image ----
// HDD OSD: the ELF's loadable segments by virtual address; ROM 2.30: the EE memory dump at 0x100000.
function image() {
  if (BUILD === 'hdd') {
    // One loadable segment (the first program header): file offset +4, virtual address +8.
    const elf = fs.readFileSync(dataPath('dumps/hddosd-host/hddosd.elf'));
    const header = elf.readUInt32LE(28);
    if (elf.readUInt32LE(header) !== 1) throw new Error('the first program header is not a loadable segment');
    const offset = (address) => elf.readUInt32LE(header + 4) + address - elf.readUInt32LE(header + 8);
    return { word: (address) => elf.readUInt32LE(offset(address)), string: (address) => elf.subarray(offset(address), elf.indexOf(0, offset(address))).toString('latin1') };
  }
  const dump = fs.readFileSync(dataPath('dumps/rom-0230A-clock-ee-00100000.bin'));
  return { word: (address) => dump.readUInt32LE(address - 0x100000), string: null };
}
const IMAGE = image();
// The blend mode table (0x30 bytes per mode, a doubleword per field A, B, C, D, FIX; the low word is read).
const BLEND = (mode) => [0, 8, 0x10, 0x18, 0x20].map((field) => IMAGE.word(A.blend + 0x30 * mode + field));
const TILE = Array.from({ length: 8 }, (_, k) => IMAGE.word(A.tile + 4 * k));
const XTAB = (lang) => Array.from({ length: 4 }, (_, k) => IMAGE.word(A.xtab + 16 * lang + 4 * k));
// get_lang_string (0x002081B8): langtblptrs (0x002AD200)[language] is the table, the string pointer is at table + 4 * id.
const osdString = (language, id) => IMAGE.string(IMAGE.word(IMAGE.word(0x002ad200 + 4 * language) + 4 * id));
// get_lang_string swaps the ids 0x55 and 0x56 when the video mode is not 0 (0x002081B8).
const swapIds = (id, vidmode) => (!vidmode ? id : id === 0x55 ? 0x56 : id === 0x56 ? 0x55 : id);
// A string makes a TEST/ALPHA packet, then (when it has characters) the font sheet's TEX1/TEX0 packet and one packet per character.
const textPackets = (text) => 1 + (text.length > 0 ? 1 + text.length : 0);
const QONE = 0x3f800000n << 32n;

// The label of guide slots 0 to 2 (0x002524D0): id 0x54 + the picture index (slot 3's text is the string it stored).
function guideLabel(lang, s4, vidmode) {
  const s2 = vidmode && s4 === 1 ? 2 : vidmode && s4 === 2 ? 1 : s4;
  return osdString(lang, swapIds(0x54 + s2, vidmode));
}

// ---- the page state of a trace capture (no probes): the stimulus declared, not read ----
// The TEXB sheets are allocated from 0x2800 in order (0x00257068 via 0x0024EA80): 64 blocks for a 64 x 64 sheet,
// 128 for TEXBCDPB (index 5); all CT32, 64 wide (TEXIMAGE members 53 to 60); cbp 0x3E80 is the sheet entry's +0x18.
const BLOCKS = [64, 64, 64, 64, 64, 128, 64, 64];
const sheet = (index) => ({ tbp: 0x2800 + BLOCKS.slice(0, index).reduce((a, b) => a + b, 0), tbw: 1, psm: 0, tw: 6, th: 6, cbp: 0x3e80 });
// The font cache (0x00257158 (8, ...)) is allocated after the eight sheets.
const FONT_TBP = sheet(8).tbp;
const TITLE_LEFT = 0x606060, TITLE_RIGHT = 0x006e6e;
const LANGUAGE = 1;
const LEAVE = 90;
const PAGE_IN = 0x1a;

function declaredState(env, j) {
  const base = { w: env.w, h: env.h, env: { fbp: env.fbp, field: env.field }, tile: TILE, blend: BLEND,
    textures: { 3: sheet(3), 7: sheet(7) }, fade: { state: 3, counter: LEAVE - j, length: LEAVE, colour: 0 }, bgCounter: LEAVE - j };
  const xs = XTAB(LANGUAGE);
  if (BUILD === 'hdd') {
    return { ...base,
      titles: [{ kind: 'text', label: 'title left', text: osdString(LANGUAGE, 6), rgba: QONE | BigInt(TITLE_LEFT) | (BigInt(titleAlpha(PAGE_IN)) << 24n) },
        { kind: 'text', label: 'title right', text: osdString(LANGUAGE, 0x1a1), rgba: QONE | BigInt(TITLE_RIGHT) | (0x80n << 24n) },
        { kind: 'text', label: 'title right, empty second string', text: '', rgba: [] }],
      guide: { slots: [{ s4: 1, counter: 0x18, label: guideLabel(LANGUAGE, 1, true) }, { s4: 3, counter: 0x18, label: osdString(LANGUAGE, 0x1b5) }], swap: true, xs: [xs[0], xs[1], xs[2], null], dy: A.dy } };
  }
  return { ...base,
    titles: [{ kind: 'text', label: 'titles', text: null, rgba: [QONE | 0x606060n | (0x7fn << 24n), QONE | 0x6e6en | (0x80n << 24n)] }],
    guide: { slots: [{ s4: 1, counter: 0x18, label: null }, { s4: 2, counter: 0x18, label: null }], swap: true, xs, dy: A.dy } };
}

// ---- the page state of an exact capture: read from the probes of the frame ----
const sheetOf = (table, index) => {
  const at = 0x1c * index, word = (k) => table.readUInt32LE(at + k);
  return { tbp: word(0), psm: word(8), tbw: word(0xc), tw: word(0x10), th: word(0x14), cbp: word(0x18) };
};

function probedState(env, at) {
  const one = (pcv) => at.find((p) => p.pc === pcv);
  const dlg = one(P.dialog), bg = one(P.bg), fadeProbe = one(P.fade), bands = one(P.bands), guide = one(P.guide), title = one(P.title), width = one(P.width), vid = one(P.vidmode);
  if (!bg || !bands || !guide || !title || !fadeProbe) return null;
  const word = (probe, i, offset = 0) => probe.mem[i].bytes.readUInt32LE(offset);
  const lang = word(guide, 1), vidmode = vid ? vid.gpr[2] !== 0 : false;
  const screen = [word(bands, 2), word(bands, 2, 4)];
  const xs = XTAB(lang);
  xs[3] = width ? screen[0] - width.gpr[2] - 0x34 : null;
  const slot3 = width ? IMAGE.string(word(width, 0)) : null;
  const accept = (colour) => (v) => (v >> 32n) === 0x3f800000n && (v & 0xffffffn) === BigInt(colour) && (v >> 24n & 0xffn) <= 0x80n;
  return { w: env.w, h: env.h, env: { fbp: env.fbp, field: env.field }, tile: TILE, blend: BLEND, screen,
    textures: { 3: sheetOf(guide.mem[2].bytes, 3), 7: sheetOf(bg.mem[2].bytes, 7) },
    bgCounter: bg.mem[0].bytes.readInt32LE(0xc),
    fade: { state: word(fadeProbe, 0), counter: fadeProbe.mem[0].bytes.readInt32LE(0xc), colour: word(fadeProbe, 0, 0x10), length: word(fadeProbe, 0, 0x14) },
    titles: [{ kind: 'text', label: 'title left', text: osdString(lang, 6), rgba: QONE | BigInt(TITLE_LEFT) | (BigInt(titleAlpha(word(title, 0))) << 24n) },
      { kind: 'text', label: 'title right', text: osdString(lang, 0x1a1), rgba: [], accept: accept(TITLE_RIGHT) },
      { kind: 'text', label: 'title right, empty second string', text: '', rgba: [] }],
    dialog: dlg ? { n: word(dlg, 0), step: dlg.mem[1].bytes.readInt32LE(0), kind: word(dlg, 2), abort: word(dlg, 3) !== 0 || word(dlg, 4) !== 0 || word(dlg, 5) !== 0 } : undefined,
    osd: (id) => osdString(lang, id),
    guide: { slots: Array.from({ length: 4 }, (_, s4) => ({ s4, counter: word(guide, 0, 4 * s4), label: s4 === 3 ? slot3 : guideLabel(lang, s4, vidmode) })).filter((slot) => slot.counter !== 0), swap: vidmode, xs, dy: A.dy } };
}

// ---- frames ----
const reg = (packet) => writesOf(packet).map((e) => [e.reg, e.value]);
const stackOf = (trace, packet) => (trace.origins.get(packet.sources[0].origin)?.stack ?? []).map((s) => parseInt(s.entry, 16));

// Per packet, whether it belongs to the card row; and which vsync indices are Browser frames.
function classify(trace) {
  const card = new Uint8Array(trace.packets.length), browser = new Set();
  const frameOf = (index) => { let lo = 0, hi = trace.vsyncAt.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (trace.vsyncAt[mid] > index) hi = mid; else lo = mid + 1; } return lo; };
  const starts = trace.probes.filter((p) => !p.preroll && p.pc === A.card), ends = trace.probes.filter((p) => !p.preroll && p.pc === A.cardEnd);
  if (starts.length > 0) {
    starts.forEach((start, k) => {
      const end = ends.find((e) => e.at >= start.at && (k + 1 === starts.length || e.at <= starts[k + 1].at));
      for (let i = start.at; i < end.at; i++) card[i] = 1;
      browser.add(frameOf(start.at));
    });
    return { card, browser, how: 'probes' };
  }
  trace.packets.forEach((packet, i) => {
    const stack = stackOf(trace, packet);
    if (stack.includes(A.card)) card[i] = 1;
    if (stack.includes(A.master)) browser.add(frameOf(i));
  });
  return { card, browser, how: 'origins' };
}

// The display block and screen record as the frame's first environment packet carries them.
function envOf(packet) {
  const writes = new Map(reg(packet));
  const scissor = writes.get(R.SCISSOR), frame = writes.get(R.FRAME), offset = writes.get(R.XYOFFSET);
  return { w: Number((scissor >> 16n) & 0x7ffn) + 1, h: Number((scissor >> 48n) & 0x7ffn) + 1, fbp: Number(frame & 0x1ffn), field: Number((offset >> 32n) & 0xfn) };
}

const sameWrites = (got, want, wild = []) => got.length === want.length
  && got.every(([r, v], i) => r === want[i][0] && ((v ^ want[i][1]) & ~(wild.find(([k]) => k === i)?.[1] ?? 0n)) === 0n);
const show = (writes) => (writes ? writes.map(([r, v]) => `${r.toString(16)}=${v.toString(16)}`).join(' ') : 'none');

// The shape of a string's packets: TEST_1 0x30000 + ALPHA_1 0x44, then TEX1_1 0x60 + TEX0_1 at the font sheet
// (tbp), then glyph packets (CLAMP_1, PRIM 0x5D fans). An empty string has the first packet only.
function textShape(run, text, fontTbp) {
  const [h0, h1] = run;
  if (!h0 || !sameWrites(h0, [[R.TEST, 0x30000n], [R.ALPHA, 0x44n]])) return false;
  if (text.length === 0) return run.length === 1;
  return !!h1 && h1.length === 2 && h1[0][0] === R.TEX1 && h1[0][1] === 0x60n && h1[1][0] === R.TEX0 && (h1[1][1] & 0x3fffn) === BigInt(fontTbp)
    && run.slice(2).every((g) => g[0]?.[0] === R.CLAMP && g[1]?.[0] === R.PRIM && g[1][1] === 0x5dn);
}
// Every vertex colour of a run is one the rule allows (and, for an accept rule, the same in the whole run).
function coloursOk(run, item) {
  const seen = new Set();
  for (const writes of run) for (const [r, v] of writes) {
    if (r !== R.RGBAQ) continue;
    if (!(item.accept ? item.accept(v) : [].concat(item.rgba).includes(v))) return false;
    seen.add(v);
  }
  return !item.accept || seen.size <= 1;
}

// All checks of one text run: its packet count, the vertex colours, and (when the string is known) its shape.
function runOk(run, item, fontTbp) {
  if (item.text === null) return coloursOk(run, item);
  return run.length === textPackets(item.text) && coloursOk(run, item) && textShape(run, item.text, fontTbp);
}

// Compare one frame's non-card packets with the model's items.
function compareFrame(packets, items, tally, problem, where, fontTbp, samples) {
  let at = 0;
  const firstOf = (from) => items.slice(from).find((e) => e.kind !== 'text');
  items.forEach((item, j) => {
    if (item.kind === 'head') {
      let plain = 0, cleared = 0;
      while (plain + cleared < 3 && at < packets.length) {
        if (sameWrites(packets[at], item.plain)) plain++; else if (sameWrites(packets[at], item.cleared)) cleared++; else break;
        at++;
      }
      tally.items += plain + cleared; tally.cleared += cleared;
      if (!(cleared === 0 ? plain === 3 : plain + cleared >= 2)) { tally.bad++; problem(`${where}: the frame head is ${plain} environment packets and ${cleared} with the clear`); }
      return;
    }
    if (item.kind === 'text') {
      const next = firstOf(j + 1);
      let end = at, run = [];
      if (item.text !== null) {
        // The font cache loads a glyph it does not hold (a BITBLTBUF packet) in the middle of a string: cache state, not page state.
        while (run.length < textPackets(item.text) && end < packets.length) {
          if (packets[end][0]?.[0] === R.BITBLTBUF) tally.uploads++; else run.push(packets[end]);
          end++;
        }
      } else {
        while (end < packets.length && !(next && sameWrites(packets[end], next.writes))) end++;
        run = packets.slice(at, end);
      }
      tally.text++; tally.textPackets += run.length;
      if (!runOk(run, item, fontTbp)) { tally.bad++; problem(`${where}: text run "${item.label}" (${run.length} packets) differs`); }
      else samples.push({ run, item });
      at = end;
      return;
    }
    const got = packets[at];
    tally.items++;
    if (!got || !sameWrites(got, item.writes, item.wild)) {
      tally.bad++; problem(`${where}: ${item.label} differs: ${show(got)} | want ${show(item.writes)}`);
    } else tally.writes += got.length;
    // A picture whose x is left out of the comparison is still 24 pixels wide.
    if (got && item.wild && (got[5][1] & 0xffffn) - (got[3][1] & 0xffffn) !== 0x180n) { tally.bad++; problem(`${where}: ${item.label} is not 24 pixels wide`); }
    at++;
  });
  if (at !== packets.length) { tally.bad++; problem(`${where}: ${packets.length - at} packets follow the last item`); }
}

export function verify(file, { perturb = false } = {}) {
  const trace = readTraceFor(file, PROBES);
  if (!trace.complete) throw new Error(`${file}: ${trace.reason}`);
  const { card, browser, how } = classify(trace);
  const exact = BUILD === 'hdd' && trace.probes.some((p) => !p.preroll && p.pc === P.bg);
  const tally = { frames: 0, items: 0, writes: 0, text: 0, textPackets: 0, bad: 0, excluded: 0, uploads: 0, cleared: 0 };
  const problems = [], badFrames = [], samples = [];
  const problem = (text) => { if (problems.length < 12) problems.push(text); };
  [...browser].forEach((k, j) => {
    const lo = k === 0 ? 0 : trace.vsyncAt[k - 1], hi = trace.vsyncAt[k];
    const packets = [];
    for (let i = lo; i < hi; i++) { if (card[i]) tally.excluded++; else packets.push(reg(trace.packets[i])); }
    const env = envOf(trace.packets[lo]);
    const state = exact ? probedState(env, trace.probes.filter((p) => !p.preroll && p.at >= lo && p.at < hi)) : declaredState(env, j);
    if (!state) { tally.bad++; problem(`frame ${trace.frame + k}: the frame's probes are missing`); return; }
    // The environment packets say the screen is what the screen record says.
    if (state.screen && (state.screen[0] !== env.w || state.screen[1] !== env.h)) { tally.bad++; problem(`frame ${trace.frame + k}: the screen record is ${state.screen} but the environment says ${env.w} x ${env.h}`); }
    if (perturb) { state.fade.counter++; state.bgCounter++; }
    tally.frames++;
    const before = tally.bad;
    compareFrame(packets, chromeFrame(state), tally, problem, `frame ${trace.frame + k}`, FONT_TBP, samples);
    if (tally.bad > before) badFrames.push(`${trace.frame + k}:${tally.bad - before}`);
  });
  return { how, tally, problems, badFrames, samples, inputs: exact ? 'probes' : 'declared (no probes in this capture)' };
}

// The text checks must be able to fail: each corruption of a real run (a packet lost, a wrong head, a wrong
// glyph packet, a wrong colour) must be refused, and the run itself accepted.
function textControl(samples, fontTbp) {
  const accepting = samples.find((s) => s.item.accept), known = samples.find((s) => s.item.text && s.item.text.length > 1), empty = samples.find((s) => s.item.text === ''), lenient = samples.find((s) => s.item.text === null);
  const flip = (run) => run.map((p) => p.map(([r, v]) => (r === R.RGBAQ ? [r, v ^ 1n] : [r, v])));
  const checks = [];
  if (known) {
    const { run, item } = known;
    const swap = (at, packet) => run.map((p, i) => (i === at ? packet : p));
    checks.push(runOk(run, item, fontTbp), ...[
      run.slice(0, -1), swap(0, [[R.TEST, 0x30000n], [R.ALPHA, 0x45n]]), swap(1, [[R.TEX1, 0x61n], run[1][1]]), swap(1, [run[1][0], [R.TEX0, run[1][1][1] ^ 1n]]), swap(1, [...run[1], [R.NOP, 0n]]),
      swap(2, [run[2][0], [R.PRIM, 0x5cn], ...run[2].slice(2)]), swap(2, [[R.TEX1, 0n], ...run[2].slice(1)]), flip(run),
    ].map((broken) => !runOk(broken, item, fontTbp)));
  }
  if (empty) checks.push(runOk(empty.run, empty.item, fontTbp), !runOk([...empty.run, empty.run[0]], empty.item, fontTbp));
  if (accepting) {
    const alter = (run) => run.map((p, i) => (i === 2 ? p.map(([r, v]) => (r === R.RGBAQ ? [r, v + 0x1000000n] : [r, v])) : p));
    checks.push(runOk(accepting.run, accepting.item, fontTbp), !runOk(flip(accepting.run), accepting.item, fontTbp), !runOk(alter(accepting.run), accepting.item, fontTbp));
  }
  if (lenient) checks.push(runOk(lenient.run, lenient.item, fontTbp), !runOk(flip(lenient.run), lenient.item, fontTbp));
  return checks.length > 0 && checks.every(Boolean);
}

if (process.argv[1].endsWith('verify_browser_chrome.mjs')) {
  const file = process.argv[2];
  const result = verify(file), control = verify(file, { perturb: true });
  const { tally } = result;
  const texts = textControl(result.samples, FONT_TBP);
  console.log(`build: ${BUILD_NAME}   card row by ${result.how}   page state: ${result.inputs}`);
  console.log(`frames ${tally.frames}; packets compared ${tally.items} (${tally.writes} writes); text runs ${tally.text} (${tally.textPackets} packets, shape only; ${tally.uploads} font cache loads inside them skipped); frame heads with the entry clear ${tally.cleared}; card packets excluded ${tally.excluded}`);
  for (const line of result.problems) console.log(`  ${line}`);
  console.log(`mismatches ${tally.bad}${result.badFrames.length ? ` in frames ${result.badFrames.join(' ')}` : ''}`);
  console.log(`controls: fade counters + 1 gives ${control.tally.bad} mismatches (must differ); text checks fail on corrupted runs: ${texts}`);
  const ok = tally.frames > 0 && tally.items > 0 && tally.bad === 0 && control.tally.bad > 0 && texts;
  console.log(`verdict: ${ok ? `FOUND ${tally.frames} frames, ${tally.items} packets equal write for write` : 'PARTIAL'}`);
  process.exit(ok ? 0 : 3);
}
