// The Browser module's shell: the overlay fade, the HDD error dialog, the leave request, the leave
// counter and the exit stores, one module pass at a time. HDD OSD 1.10U addresses first, ROM 2.30
// (which has no HDD pages, no dialog, a byte-sized fade state) in References/readings/browser-shell-scout.md.
//
// A pass is one trip of the thread loop (HDD 0x24F070):
//   pad words (0x253B58) -> master 0x253860 [leave request by Circle at the root (0x254840), dialog
//   0x25BD18] -> fade overlay 0x24D0A0/0x24CEB0 -> soft-reset overlay 0x24EE80 -> D_00370698++ ->
//   wait for the next frame -> leave counter / exit (0x24F0A0..0x24F0E0).
// stepShell takes the words as the master function sees them (after the pad words are updated) and
// returns the words the next pass starts with; `trail` holds what the pass computed on the way.
//
import { readTraceFor, pick, range, pc, BUILD } from '../lib/index.mjs';

// state: { leave, pal, dest, exec, e8, ec, f0, be4, be8,
//          fade: { state, count, colour, length },
//          exit: { w648, w64C, w010, w644, w014 },
//          gate: { view, fadeIn, b678, w820, w858, w85c, b771, kind }   (words the code only reads here)
//          misc: { w68C, b625, mode } }
// input: padEdge (D_003707A4), discState { dvdError (D_00370778), discError (D_00370780), io (D_003705FC at the
//        thread's check) }, pal.

const i32 = (x) => x | 0;
// MIPS div: signed 32-bit quotient, truncated toward zero.
const div32 = (a, b) => Math.trunc(i32(a) / i32(b));

export const CIRCLE = 0x40;
export const LEAVE_LIMIT = { ntsc: 0x5b, pal: 0x4c };
export const FADE_LENGTH = { ntsc: 0x5a, pal: 0x4b };
export const DIALOG_LENGTH = { ntsc: 0x1e, pal: 0x19 };
export const PAGE_FADE_IN = { ntsc: 0x1a, pal: 0x15 };

// func_0024DFA8: clamp value into [low, high].
export const clamp = (value, low, high) => (value < low ? low : (high < value ? high : value));

/**
 * The fade overlay, func_0024CEB0 (ROM 0x246860). Returns the colour alpha it draws with (null when it
 * returns without drawing) and the new fade words.
 */
export function fadeStep(fade) {
  let { state, count } = fade;
  const { length } = fade;
  let alpha;
  if (state === 1) alpha = 0x80;
  else {
    if (length === 0) throw new Error('fade length 0 (the console breaks)');
    const part = div32(i32(count << 7), length);
    alpha = state === 2 ? part : 0x80 - part;
    if (count === 0) {
      if (state === 2) return { alpha: null, fade: { ...fade, state: 0 } };
      if (state === 3) state = 1;
    }
    count = i32(count - 1);
  }
  return { alpha, fade: { ...fade, state, count } };
}

// module_browser_24CE60 / func_0024CE88: start the fade-in (2) or fade-out (3) unless that state is running.
export const fadeStart = (fade, want, length) => (fade.state === want ? fade : { ...fade, state: want, count: length, length });

// The entry scan (HDD 0x24B96C): which dialog kind the status words ask for, or null.
export function scanKind(e8, ec) {
  if (e8 !== 2) return 0;
  if (ec === 0) return 0;
  return ec === e8 ? null : 1;
}

/**
 * browser_transition_to_other_module (HDD 0x24EBF0, ROM 0x248038): fade out, destination, execute-app type
 * -1, leave counter 1. The side effects on D_0037068C, D_00370625 and the mode word are HDD OSD's.
 */
export function leaveRequest(state, module, pal) {
  const next = {
    ...state,
    fade: fadeStart(state.fade, 3, pal ? FADE_LENGTH.pal : FADE_LENGTH.ntsc),
    dest: module, exec: -1, leave: 1,
  };
  if (state.misc) next.misc = { w68C: 0, b625: 0, mode: 3 };
  return next;
}

/**
 * The first pass of the module (HDD 0x24F038..0x24F070): init zeroes the leave counter and stores the PAL
 * flag, the thread starts the fade-in, the scan opens the dialog its status words ask for.
 * `stale` are the words the module does not touch (the exit words, the fade colour, the gate words).
 */
export function startShell({ pal, e8, ec, fadeBefore, stale }) {
  const length = pal ? FADE_LENGTH.pal : FADE_LENGTH.ntsc;
  const kind = scanKind(e8, ec);
  return {
    leave: 0, pal: pal ? 1 : 0, dest: stale.dest, exec: stale.exec,
    e8, ec, f0: kind === null ? 0 : 1, be4: kind === null ? 0 : 1, be8: kind === null ? stale.be8 : kind,
    fade: fadeStart(fadeBefore, 2, length),
    exit: { ...stale.exit },
    gate: { ...stale.gate },
    misc: stale.misc ? { ...stale.misc } : undefined,
    kind,
  };
}

/**
 * One pass. `state` as the master function finds it, `input` { padEdge, discState, pal }.
 * Returns { state, sounds, trail } with the next pass's words; trail: { alpha, fadeIn, fadeOut, requested,
 * checked (the counter the thread reads), exited }.
 */
export function stepShell(state, { padEdge, discState, pal, request }) {
  const trail = { requested: false, alpha: null, fadeIn: state.fade, fadeOut: null, checked: null, exited: false };
  const sounds = [];
  const g = state.gate;
  const kinds = pal ? 'pal' : 'ntsc';
  let s = { ...state };

  // 0x253860: input and logic only when nothing is open and nothing is leaving
  const idle = s.leave === 0 && discState.dvdError === 0 && discState.discError === 0 && s.f0 === 0 && (g.extra ?? 0) === 0;
  // 0x254840: the page's fade-in is complete, no scroll, Circle at a root page. `request` replaces this
  // predicate where it is not fully read (ROM 2.30).
  const open = g.w820 === 0 && g.fadeIn === PAGE_FADE_IN[kinds] && g.b678 !== 1 && g.w858 === 0 && g.w85c === 0 && g.b771 !== 0;
  const asked = request ?? (idle && g.view === 1 && open && (padEdge & CIRCLE) !== 0 && g.kind === 0);
  if (asked) { s = leaveRequest(s, 2, pal); trail.requested = true; }
  trail.fadeIn = s.fade;

  // 0x25BD18 (called when D_003708F0 != 0)
  if (s.f0 !== 0) {
    if (s.leave !== 0 || discState.dvdError !== 0 || discState.discError !== 0) { s.f0 = 0; s.be4 = -1; }
    else {
      const length = DIALOG_LENGTH[kinds];
      s.f0 = clamp(s.f0 + s.be4, 0, length);
      if (s.be8 === 0) s.e8 = 1;
      else if (s.be8 === 1) s.ec = 1;
      if (s.f0 === length && (padEdge & CIRCLE) !== 0) s.be4 = -1;
    }
  }

  // 0x24D0A0 -> 0x24CEB0
  if (s.fade.state !== 0) {
    const out = fadeStep(s.fade);
    trail.alpha = out.alpha;
    s.fade = out.fade;
  }
  trail.fadeOut = s.fade;

  // 0x24F0A0..0x24F0E0
  trail.checked = s.leave;
  if (s.leave !== 0) {
    const old = s.leave;
    s.leave = old + 1;
    const limit = pal ? LEAVE_LIMIT.pal : LEAVE_LIMIT.ntsc;
    if (old >= limit && discState.io === 0) {
      s.exit = { w648: s.dest, w64C: 3, w010: s.exec, w644: 1, w014: 0 };
      trail.exited = true;
    }
  }
  return { state: s, sounds, trail };
}

// ---- Reading a capture: probes, memory images, the words of a pass ----
// (here, not in the verifiers, so that a verifier and the model it runs on form one tree for mutation)
export const A = pick({
  rom: {
    master: 0x0024d500, start: 0x00246810, request: 0x00248038, fadeIn: 0x00246860, alpha: 0x0024690c, fadeEnd: 0x00246a4c,
    check: 0x002484c8, exitIn: 0x00248160, exitOut: 0x0024819c, open: null, clock: 0x00221558,
    fadeBase: 0x002c8bb4,
    pass: [[0x002c8bb0, 0x20], [0x002c8c00, 0x14], [0x002c8cc8, 0x20], [0x002c8d00, 0x20], [0x002c8d30, 0x40], [0x002c8dc0, 8], [0x002c8b5c, 4], [0x002c8b34, 4],
      [0x002adb18, 0x50], [0x001f05e4, 0xc], [0x001f0014, 8]],
    leaveWords: [[0x002c8c00, 0x14]], exitWords: [[0x001f05e4, 0xc], [0x001f0014, 8], [0x002c8c0c, 8]],
  },
  hdd: {
    master: 0x00253860, start: 0x0024ce60, request: 0x0024ebf0, fadeIn: 0x0024ceb0, alpha: 0x0024cf54, fadeEnd: 0x0024d094,
    check: 0x0024f0a0, exitIn: 0x0024ed20, exitOut: 0x0024ed6c, open: 0x0025bc08, clock: 0x00225e80,
    fadeBase: 0x00370660,
    pass: [[0x00370660, 0x20], [0x003706a0, 0x20], [0x003706d0, 4], [0x0037068c, 4], [0x00370620, 8], [0x003706f8, 4], [0x00370720, 0x10], [0x00370770, 0x20],
      [0x003707a0, 8], [0x00370820, 0x44], [0x003708e0, 0x18], [0x00370be0, 0x10], [0x003705f8, 8], [0x002bd518, 0x38], [0x001f0640, 0x10], [0x001f0010, 8]],
    leaveWords: [[0x003706a0, 0x20], [0x003708e0, 0x18], [0x00370be0, 0x10]], exitWords: [[0x001f0640, 0x10], [0x001f0010, 8], [0x003706b4, 8]],
  },
});

const chunk = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, (i + 1) * n));
const ranges = (list) => chunk(list.map(([a, n]) => range(a, n)), 8);
const fadeRanges = [[A.fadeBase, 0x20]];
const groups = (pcValue, list) => ranges(list).map((rs) => ({ pc: pc(pcValue), ranges: rs }));
export const SHELL_PROBES = [
  ...groups(A.master, A.pass),
  ...groups(A.start, fadeRanges), ...groups(A.fadeIn, fadeRanges), ...groups(A.alpha, fadeRanges), ...groups(A.fadeEnd, fadeRanges),
  ...groups(A.request, A.leaveWords), ...groups(A.check, [[BUILD === 'hdd' ? 0x003706a8 : 0x002c8c00, 4], [BUILD === 'hdd' ? 0x003705fc : 0x002c8b34, 4]]),
  ...groups(A.exitIn, A.exitWords), ...groups(A.exitOut, A.exitWords),
  ...(A.open ? groups(A.open, [[0x003708e0, 0x18], [0x00370be0, 0x10]]) : []),
  { pc: pc(A.clock), ranges: [] },
];

// The memory a pass's records hold, by address.
export function image(records) {
  const parts = records.flatMap((r) => r.mem.filter((m) => m.bytes).map((m) => ({ address: m.address, bytes: m.bytes })));
  const find = (address, size) => {
    for (const p of parts) if (address >= p.address && address + size <= p.address + p.bytes.length) return p.bytes.subarray(address - p.address, address - p.address + size);
    throw new Error(`0x${address.toString(16)} is not in the probe`);
  };
  return { s32: (a) => find(a, 4).readInt32LE(0), u8: (a) => find(a, 1)[0] };
}

// The shell words of a master-function record group.
export function decode(img) {
  if (BUILD === 'hdd') {
    const depth = img.s32(0x00370728);
    return {
      leave: img.s32(0x003706a8), pal: img.s32(0x003706b0), dest: img.s32(0x003706b4), exec: img.s32(0x003706b8),
      e8: img.s32(0x003708e8), ec: img.s32(0x003708ec), f0: img.s32(0x003708f0), be4: img.s32(0x00370be4), be8: img.s32(0x00370be8),
      fade: { state: img.s32(0x00370660), count: img.s32(0x0037066c), colour: img.s32(0x00370670), length: img.s32(0x00370674) },
      exit: { w648: img.s32(0x001f0648), w64C: img.s32(0x001f064c), w010: img.s32(0x001f0010), w644: img.s32(0x001f0644), w014: img.s32(0x001f0014) },
      gate: { view: img.s32(0x003706f8), fadeIn: img.s32(0x0037072c), b678: img.u8(0x00370678), w820: img.s32(0x00370820), w858: img.s32(0x00370858), w85c: img.s32(0x0037085c),
        b771: img.u8(0x00370771), kind: depth === 0 ? img.s32(0x002bd544) : null },
      misc: { w68C: img.s32(0x0037068c), b625: img.u8(0x00370625), mode: img.s32(0x003706d0) },
      edge: img.s32(0x003707a4), io: img.s32(0x003705fc), dvdError: img.s32(0x00370778), discError: img.s32(0x00370780),
    };
  }
  const depth = img.s32(0x002c8cc8);
  return {
    leave: img.s32(0x002c8c00), pal: img.s32(0x002c8c08), dest: img.s32(0x002c8c0c), exec: img.s32(0x002c8c10),
    e8: 0, ec: 0, f0: 0, be4: 0, be8: 0,
    fade: { state: img.u8(0x002c8bb4), count: img.s32(0x002c8bbc), colour: img.s32(0x002c8bc0), length: img.s32(0x002c8bc4) },
    exit: { w648: img.s32(0x001f05e8), w64C: img.s32(0x001f05ec), w010: img.s32(0x001f0014), w644: img.s32(0x001f05e4), w014: img.s32(0x001f0018) },
    gate: { view: img.s32(0x002c8ce0) === 0 ? 1 : 0, fadeIn: img.s32(0x002c8ccc), b678: img.u8(0x002c8bc8), w820: 0, w858: 0, w85c: 0, b771: img.u8(0x002c8d09),
      kind: depth === 0 ? img.s32(0x002adb44) : null, extra: img.s32(0x002c8b5c) },
    misc: undefined,
    edge: img.s32(0x002c8d34), io: img.s32(0x002c8b34), dvdError: img.s32(0x002c8d10), discError: img.s32(0x002c8d18),
  };
}

const KINDS = { [A.master]: 'master', [A.start]: 'start', [A.fadeIn]: 'fadeIn', [A.alpha]: 'alpha', [A.fadeEnd]: 'fadeEnd', [A.request]: 'request', [A.check]: 'check',
  [A.exitIn]: 'exitIn', [A.exitOut]: 'exitOut', [A.clock]: 'clock', ...(A.open ? { [A.open]: 'open' } : {}) };

// The probe records as events in file order: a run of records at one pc with rising index is one event.
export function events(records) {
  const out = [];
  for (const r of records) {
    const last = out[out.length - 1];
    if (last && last.pc === r.pc && r.index > last.lastIndex && last.records.length < 8) { last.records.push(r); last.lastIndex = r.index; continue; }
    out.push({ kind: KINDS[r.pc], pc: r.pc, frame: r.captureFrame, gpr: r.gpr, records: [r], lastIndex: r.index });
  }
  for (const e of out) e.img = image(e.records);
  return out;
}

const fadeOf = (img) => (BUILD === 'hdd'
  ? { state: img.s32(0x00370660), count: img.s32(0x0037066c), colour: img.s32(0x00370670), length: img.s32(0x00370674) }
  : { state: img.u8(0x002c8bb4), count: img.s32(0x002c8bbc), colour: img.s32(0x002c8bc0), length: img.s32(0x002c8bc4) });
export { fadeOf };

/**
 * The passes of a capture: for each master record the events up to the next one, the model's step from the
 * words at the master, and the next master's words. `first` is the pass that follows the thread's start.
 */
export function walk(file) {
  const trace = readTraceFor(file, SHELL_PROBES);
  if (!trace.complete) throw new Error(`${file}: ${trace.reason}`);
  const evs = events(trace.probes);
  const masters = [];
  const before = [];
  evs.forEach((e) => { if (e.kind === 'master') masters.push({ e, words: decode(e.img), events: [] }); else if (masters.length) masters[masters.length - 1].events.push(e); else before.push(e); });
  const writes = (trace.inputs ?? []).filter((i) => i.type === 'write');
  // words the capture wrote itself at a frame (stimuli): not predictions of the model
  masters.forEach((m) => { m.written = new Set(writes.filter((i) => i.captureFrame === m.e.frame).flatMap((i) => Array.from({ length: Math.ceil(i.bytes.length / 4) }, (_, k) => i.address + 4 * k))); });
  masters.forEach((m, n) => { m.next = masters[n + 1] && masters[n + 1].e.frame === m.e.frame + 1 ? masters[n + 1] : null; });
  return { trace, masters, before };
}


// ---- The Browser's sound commands (HDD OSD 1.10U; the senders are read from the disassembly) ----
// Every 0x6300 command the Browser queues goes through sound_handle_queue_cmd_auto 0x0024E090, which passes it to the
// enqueue 0x00200C00 or drops it (browserGate). A sender takes the words it reads and returns the commands it queues in
// order: { a2, ra, a3 }. a0 is 0x6300 and a1 is 1 at every site. ra is the return address the enqueue sees (jal pc + 8: the
// gate's tail j keeps it). a3 is never loaded at these sites: 'free' = whatever the register held (recorded, sent as 0 by the
// native port); 'ring' = the second call of a pair keeps the address temporary the enqueue left (sound_senders.ringTemporary).
// Read and not reached by any capture (the model throws when a capture reaches them): Triangle with D_003706D0 == 2 (0x254958..0x2549FC),
// the Cross on an item whose +0x90 has no bit 1 (0x255004..0x255040), the Format dialog's states 3..5 (0x255D80, 0x255E1C: 9 and 0xB).
export const SOUND_COMMAND = 0x6300;
export const BROWSER_PAD = { Up: 0x1000, Down: 0x4000, Left: 0x8000, Right: 0x2000, Cross: 0x20, Circle: 0x40, Triangle: 0x10 };
const MOVES = BROWSER_PAD.Up | BROWSER_PAD.Down | BROWSER_PAD.Left | BROWSER_PAD.Right;
// func_00254840 0x00254F84: a held direction or Circle (D_003707A0 & 0xF040) stops the Cross and Triangle handling.
const HELD_STOPS = MOVES | BROWSER_PAD.Circle;
// 0x002550A0: an item whose +0x90 has bit 5 or bit 16 takes the Triangle path.
const TRIANGLE_ITEM_BITS = 0x10020;
const has = (word, bit) => (word & bit) === bit;
const send = (a2, ra, a3 = 'free') => ({ a2, ra, a3 });
const unverified = (what) => { throw new Error(`${what}: read, not reached by a capture`); };
// A word the sender reads only on some paths: a probe that did not record it is an error, never a value.
const need = (value, name) => { if (value === undefined) throw new Error(`${name} was not probed on this path`); return value; };

// sound_handle_queue_cmd_auto 0x0024E090. s: w740 (D_00370740), view (D_003706F8), w460 (D_00370460).
export const browserGate = (s) => s.w740 !== 0xa || s.view === 3 || (s.view === 2 && s.w460 === 2);

// func_00254840 0x00254840 (view mode 1, the device row), once per pass. s: w820, fadeIn (D_0037072C), pal (D_003706B0), b678, w858, w85c,
// b771, b772, b773 (bytes D_00370771..3), held / edge / repeat (D_003707A0 / A4 / AC), w6d0 (D_003706D0), kind and pageFlags
// (the page record's +0x124 and the low word of its +0xF8), poppedKind (the +0x124 read after func_00252C48 at 0x00254934), count (+0x1A0),
// w600 / w604, flags (the four words the move code leaves on the stack at 0x00254C90: left sp+8, right sp+0xC, up sp+0, down sp+4),
// item90 / itemB0 / item690 (the item record's +0x90 low word, +0xB0 and +0x690), pred (func_002547C0's return at 0x00254FC4).
export function browserRoot(s) {
  if (s.w820 !== 0) return [];
  if (s.fadeIn !== PAGE_FADE_IN[s.pal ? 'pal' : 'ntsc']) return [];
  if (s.b678 === 1 || s.w858 !== 0 || s.w85c !== 0) return [];
  if (s.b771 !== 0 && has(s.edge, BROWSER_PAD.Circle)) {
    if (need(s.kind, 'page kind') === 0) return [];
    if (has(need(s.pageFlags, 'page flags'), 4)) return [];
    return need(s.poppedKind, 'popped kind') === 0xa ? [] : [send(0xa, 0x00254950)];
  }
  const triangle = s.b773 !== 0 && has(s.edge, BROWSER_PAD.Triangle);
  if (triangle && s.w6d0 === 2) unverified('Triangle with D_003706D0 == 2');
  if (need(s.count, 'count') === 0 || need(s.w600, 'D_00370600') === 0 || need(s.w604, 'D_00370604') !== 0) return [];
  const f = need(s.flags, 'move flags');
  if (has(s.repeat, BROWSER_PAD.Left)) return f.left !== 0 ? [send(6, 0x00254f54)] : [];
  if (has(s.repeat, BROWSER_PAD.Right)) return f.right !== 0 ? [send(6, 0x00254f54)] : [];
  if (has(s.repeat, BROWSER_PAD.Up)) return f.up !== 0 ? [send(6, 0x00254f54)] : [];
  if (has(s.repeat, BROWSER_PAD.Down)) {
    if (f.down === 0) return [];
    return f.down !== 2 && s.w6d0 !== 2 ? [send(6, 0x00254f7c)] : [send(6, 0x00254f54)];
  }
  if ((s.held & HELD_STOPS) !== 0) return [];
  if (s.b772 !== 0 && has(s.edge, BROWSER_PAD.Cross)) {
    if (!has(need(s.item90, 'item +0x90'), 2)) unverified('Cross on an item without +0x90 bit 1');
    if (need(s.pred, 'func_002547C0 return') === 0 || need(s.itemB0, 'item +0xB0') === 0) return [];
    return [send(7, 0x00254fec), send(8, 0x00254ffc, 'ring')];
  }
  if (triangle) {
    const b0 = need(s.itemB0, 'item +0xB0');
    const sound = b0 === 0 || need(s.item690, 'item +0x690') === 1 || (need(s.item90, 'item +0x90') & TRIANGLE_ITEM_BITS) !== 0 || b0 === 0xe;
    return sound ? [send(4, 0x002550dc)] : [];
  }
  return [];
}

// func_00255C18 0x00255C18 (the Format dialog, state D_00370BC0 = 1 or 2, called by func_00255BE8 while D_00370820 = 1).
// s: state, sel (byte D_00370BBC: 0 = the first answer, 1 = the second), edge. State 1 stores sel = 0 and state = 2 and goes on in the
// same call. Left with sel 0 and Right with sel 1 swap the answer (sound 6); Cross: sound 4, then sel 1 -> state 3 (the work, not reached),
// else the dialog closes (D_00370820 = 0); Circle: sound A and the dialog closes.
// Returns { out, sel, closed }.
export function formatDialog(s) {
  if (s.state !== 1 && s.state !== 2) unverified(`Format dialog state ${s.state}`);
  let sel = s.state === 1 ? 0 : s.sel;
  const out = [];
  if (has(s.edge, BROWSER_PAD.Left) && sel === 0) { out.push(send(6, 0x00255cc0)); sel = 1; }
  if (has(s.edge, BROWSER_PAD.Right) && sel === 1) { out.push(send(6, 0x00255cf4)); sel = 0; }
  if (has(s.edge, BROWSER_PAD.Cross)) {
    out.push(send(4, 0x00255d14));
    if (sel === 1) unverified('Format dialog answer 1 (state 3)');
    return { out, sel, closed: true };
  }
  if (has(s.edge, BROWSER_PAD.Circle)) {
    out.push(send(0xa, 0x00255d6c));
    return { out, sel, closed: true };
  }
  return { out, sel, closed: false };
}

// module_browser_24EB38 0x0024EB38, once per thread start: D_001F0114 = 0x14 when config_get_spdif_mode (var_mechacon_config_param_1 & 1) is 0,
// else 0x15 (store 0x0024EB7C). pad_sound_handler_thread_proc 0x0020CD20 sends it in the first drain pass that follows, when D_001F0D40 == 0
// (0x0020CE2C: sceSdRemote(1, 0x8070, 0xA, a3)), a3 by the word: 0x14 -> 0, 0x15 -> 2. The thread also maps 0x12 -> 1 and 0x13 -> 0xF
// (0x0020CDC4..0x0020CE18); 0x13 is stored by func_002552E8 0x00255324 (a Browser store, reached by no capture). Any other word sends the stack word.
export const spdifStore = (mechaconParam) => ((mechaconParam & 1) === 0 ? 0x14 : 0x15);
export const REMOTE_A3 = { 0x14: 0, 0x15: 2 };
