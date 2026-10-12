// The head of the clock frame: clear, background, blur trips, the copies into the two work
// buffers and the tinted copy back; and the blur trips after the rods.
// Recomputes, from what each function was handed, the calls it makes and the rectangles it
// draws, and compares with the calls really made and the packets really sent.
//
//   head            HDD 0x00226000   (view, screen)
//   blur trips      HDD 0x00236490   a0 trips
//   trips after     HDD 0x00232438   reads the level
//   level           HDD 0x00232640   second half writes the level from the menu ramp
//   sprite          HDD 0x00233770   a0 rectangle record (uncached address)
//
// The state helpers' own packets are checked by verify_gs_state.mjs, whose probes are a subset
// of these: a trace taken with these PROBES serves both.
//
// node verify_blur.mjs <trace.jsonl>
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { GifPath } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/gif.js';
import { pick, range, pc, BUILD, BUILD_NAME } from './builds.mjs';
import { PROBES as STATE } from './verify_gs_state.mjs';

const A = pick({
  rom: { head: 0x002216d8, background: 0x0022f698, blur: 0x002328d8, toWork: 0x00232470, toFrame: 0x00232538, copy: 0x002326a8, frameTexture: 0x002305f0, post: 0x0022e718, level: 0x0022e910,
    screen: 0x001f0c50, index: 0x001f0c40, field: 0x0028a348, levelAt: 0x002c8f5c, ramp: 0x00296740, tail: 0x002c88f4, body: 0x002c88f0, buffers: 0x001f0a10,
    records: { blur: 0x00297320, copy: 0x00297260, tint: 0x0028a3b0 }, clear: 0x0028a3a0 },
  hdd: { head: 0x00226000, background: 0x00233338, blur: 0x00236490, toWork: 0x00235fe0, toFrame: 0x002360a8, copy: 0x00236230, frameTexture: 0x00233f48, post: 0x00232438, level: 0x00232640,
    screen: 0x001f0cb4, index: 0x001f0ca0, field: 0x002b2178, levelAt: 0x00370aa4, ramp: 0x002b5780, tail: 0x003702d0, body: 0x003702cc, buffers: 0x001f0a70,
    records: { blur: 0x002b6120, copy: 0x002b6060, tint: 0x002b21e0 }, clear: 0x002b21d0 },
});
export const ADDRESSES = A;
const SCREEN = range(A.screen, 8);
export const [BLEND, TEXTURE, BUFFER, WORK, DISPLAY, SPRITE] = STATE.map((probe) => parseInt(probe.pc, 16));
export const PROBES = [
  ...STATE.slice(0, 5),
  // The record's address is the uncached mirror; the third range reads it through the cached one.
  { pc: STATE[5].pc, ranges: ['a0:0x3c', SCREEN, 'a0+0xe0000000:0x3c', range(A.index, 4)] },
  { pc: pc(A.head), ranges: [SCREEN, range(A.index, 4), range(A.field, 4), range(A.levelAt, 4), range(A.ramp, 0x10), range(A.tail, 4), range(A.body, 4)] },
  { pc: pc(A.blur), ranges: [] },
  { pc: pc(A.toWork), ranges: [] },
  { pc: pc(A.toFrame), ranges: [] },
  { pc: pc(A.copy), ranges: [] },
  { pc: pc(A.frameTexture), ranges: [SCREEN] },
  { pc: pc(A.post), ranges: [range(A.levelAt, 4)] },
  { pc: pc(A.level), ranges: [range(A.ramp, 0x10), range(A.tail, 4), range(A.levelAt, 4)] },
];

const R = { PRIM: 0x00, RGBAQ: 0x01, UV: 0x03, XYZF2: 0x04, XYZ2: 0x05, TEX0: 0x06, CLAMP: 0x08, TEX1: 0x14, TEXA: 0x3b, TEXFLUSH: 0x3f, ALPHA: 0x42, TEST: 0x47, PABE: 0x49, FBA: 0x4a };
const NAME = Object.fromEntries(Object.entries(R).map(([name, value]) => [value, name]));
const big = (x) => BigInt.asUintN(64, BigInt(x));
const UNCACHED = 0x20000000;

export const writesOf = (packet) => (packet ? [...new GifPath().feed(packet.bytes)].filter((event) => event.kind === 'write') : []);
export const tally = (table, name, same) => { const entry = (table[name] ??= [0, 0]); entry[1] += 1; if (same) entry[0] += 1; return same; };
export const tallyText = (table) => Object.entries(table).map(([name, [equal, total]]) => `${name} ${equal}/${total}`).join('  ');
export const allEqual = (table) => Object.values(table).every(([equal, total]) => equal === total);

/**
 * The sprite helper: the two register lists it sends for a rectangle record, one packet each.
 * Record: +0x00 R, G, B, A; +0x10 x0, y0; +0x18 u0, v0; +0x20 x1, y1; +0x28 u1, v1; +0x30 z; +0x34 blend; +0x38 textured.
 * Nothing is masked: every field is OR-ed in at its place.
 */
export function spriteWrites(record, w, h) {
  const i = (o) => BigInt(record.readInt32LE(o));
  const ox = BigInt((0x800 - (w >> 1)) << 4), oy = BigInt((0x800 - (h >> 1)) << 4);
  const z = big(i(0x30)) << 32n;
  return [
    [R.PRIM, big((BigInt(record.readUInt32LE(0x38)) << 4n) | 0x100n | (i(0x34) << 6n) | 6n)],
    [R.RGBAQ, big(i(0) | (0x3f800000n << 32n) | (i(8) << 16n) | (i(4) << 8n) | (i(0xc) << 24n))],
    [R.UV, big(i(0x18) | (i(0x1c) << 16n))],
    [R.XYZF2, big((i(0x10) + ox) | ((i(0x14) + oy) << 16n) | z)],
    [R.UV, big(i(0x28) | (i(0x2c) << 16n))],
    [R.XYZF2, big((i(0x20) + ox) | ((i(0x24) + oy) << 16n) | z)],
  ];
}

/** Every sprite call of a trace: the packet sent against the record handed in. */
export function checkSprites(trace, table, problems) {
  let calls = 0;
  for (const probe of trace.probes) {
    if (probe.pc !== SPRITE || probe.preroll) continue;
    const record = probe.mem[2]?.bytes;
    if (!record || !probe.mem[1].bytes) { problems.push('a sprite record could not be read'); continue; }
    calls += 1;
    const [w, h] = [probe.mem[1].bytes.readInt32LE(0), probe.mem[1].bytes.readInt32LE(4)];
    const sent = [...writesOf(trace.packets[probe.at]), ...writesOf(trace.packets[probe.at + 1])];
    const wanted = spriteWrites(record, w, h);
    tally(table, 'writes in the two packets', sent.length === wanted.length && writesOf(trace.packets[probe.at]).length === 2);
    wanted.forEach(([reg, value], n) => {
      const got = sent[n];
      const same = !!got && got.reg === reg && got.value === value;
      if (!tally(table, `${NAME[reg]}${n >= 4 ? ' (second corner)' : n >= 2 ? ' (first corner)' : ''}`, same) && problems.length < 12) {
        problems.push(`sprite at packet ${probe.at}: ${NAME[reg]} wanted 0x${value.toString(16)}, sent ${got ? `${NAME[got.reg] ?? got.reg} 0x${got.value.toString(16)}` : 'nothing'}`);
      }
    });
  }
  return calls;
}

/** The probes of the functions whose order is under test, in the order they ran. */
export function sequenceOf(trace, pcs) {
  const set = new Set(pcs);
  return trace.probes.filter((probe) => set.has(probe.pc));
}

/**
 * Walk `wanted` (a list of { pc, name, args: {register: value}, record: {address, fields: {offset: value}} })
 * against the probes that follow `from` in `sequence`. Returns how many matched.
 */
export function matchCalls(sequence, from, wanted, table, problems, label) {
  let matched = 0;
  for (let n = 0; n < wanted.length; n++) {
    const want = wanted[n];
    const probe = sequence[from + 1 + n];
    if (!probe) return -1; // the trace ended inside this group
    let same = probe.pc === want.pc;
    if (same) for (const [register, value] of Object.entries(want.args ?? {})) same = same && (probe.gpr[register] >>> 0) === (value >>> 0);
    tally(table, `${label}: calls in the order and with the arguments read`, same);
    if (!same) {
      if (problems.length < 12) problems.push(`${label}: call ${n} wanted ${want.name}(${Object.entries(want.args ?? {}).map(([r, v]) => `r${r}=0x${(v >>> 0).toString(16)}`).join(', ')}), got pc 0x${probe.pc.toString(16)} a0..a3 ${[4, 5, 6, 7].map((r) => `0x${probe.gpr[r].toString(16)}`).join(' ')}`);
      return matched;
    }
    matched += 1;
    if (want.record) {
      const record = probe.mem[2]?.bytes;
      let fields = !!record && (probe.gpr[4] >>> 0) === ((want.record.address | UNCACHED) >>> 0);
      if (fields) for (const [offset, value] of Object.entries(want.record.fields)) fields = fields && record.readInt32LE(Number(offset)) === value;
      if (!tally(table, `${label}: ${want.record.name} rectangle as computed`, fields) && problems.length < 12) {
        problems.push(`${label}: ${want.record.name} wanted ${JSON.stringify(want.record.fields)}, record has ${record ? Object.keys(want.record.fields).map((o) => `${o}:${record.readInt32LE(Number(o))}`).join(' ') : 'nothing readable'}`);
      }
    }
  }
  return matched;
}

const call = (pcValue, name, args = {}, record = undefined) => ({ pc: pcValue, name, args, record });
export const display = (index, clear = 0, field = 0) => call(DISPLAY, 'draw to the display', { 4: A.buffers, 5: index, 6: clear, 7: field });
export const blend = (mode, ztst) => call(BLEND, 'blend', { 4: mode, 5: ztst });
export const sprite = (name, address, fields) => call(SPRITE, 'sprite', {}, { name, address, fields });

/** What `trips` blur trips call, in order. */
function tripCalls(trips, index, w, h) {
  const out = [call(A.blur, 'blur trips', { 4: trips })];
  for (let k = 0; k < trips; k++) {
    const x = 0x13f4 - 0x20 * k;
    out.push(
      call(A.toWork, 'frame to work buffer', { 4: 1, 5: 0, 6: 0 }), call(A.frameTexture, 'bind the frame', { 4: index }), call(WORK, 'draw to a work buffer', { 4: 1, 5: 0, 6: 0 }),
      blend(1, 1),
      sprite('shrink', A.records.blur, { 0x20: x, 0x24: 0x954 - 0x10 * k, 0x28: (w << 4) + 8, 0x2c: ((h - 1) << 4) + 8 }),
      call(A.toFrame, 'work buffer to frame', { 4: 1, 5: 0, 6: 0 }), call(BUFFER, 'bind a work buffer', { 4: 1 }), display(index),
      blend(1, 1),
      sprite('stretch', A.records.blur, { 0x20: w << 4, 0x24: (h - 1) << 4, 0x28: x + 8, 0x2c: 0x95c - 0x10 * k }),
    );
  }
  // ROM 2.30 leaves the depth test at GREATER when the trips are done (also when there is none).
  if (BUILD === 'rom') out.push(blend(1, 3));
  return out;
}

/**
 * The level, from the menu ramp's counter and the length of its tail.
 * HDD OSD: 10 at the start of the ramp, falling to 0 over the tail, 0 from there on.
 * ROM 2.30: 10 at the start, falling to 5 over the tail, 5 from there on.
 */
const levelOf = pick({
  hdd: (counter, tail) => (counter < tail ? 10 - Math.trunc((counter * 10) / tail) : 0),
  rom: (counter, tail) => { const left = tail - counter; return Math.trunc((5 * (left < 0 ? 0 : Math.min(left, tail))) / tail) + 5; },
});

/** What the head of the frame calls, given the level, the buffer index and the screen size. */
function headCalls(level, index, field, w, h) {
  const trips = (level >>> 0) < 6 ? level : 10 - level;
  const full = { 0x20: w << 4, 0x24: h << 4, 0x28: (w << 4) + 8, 0x2c: (h << 4) + 8 };
  // ROM 2.30's copy also ends by setting the depth test to GREATER.
  const copy = [call(A.copy, 'copy', { 4: 0 }), blend(1, 1), sprite('copy', A.records.copy, { ...full, 0x34: 0 }), ...(BUILD === 'rom' ? [blend(1, 3)] : [])];
  return [
    display(index, A.clear, field),
    call(A.background, 'background'),
    ...tripCalls(trips, index, w, h),
    call(WORK, 'draw to a work buffer', { 4: 0, 5: 0, 6: 0 }), call(A.frameTexture, 'bind the frame', { 4: index }),
    ...copy,
    call(WORK, 'draw to a work buffer', { 4: 1, 5: 0, 6: 0 }),
    ...copy,
    display(index), call(BUFFER, 'bind a work buffer', { 4: 0 }), blend(0, 1),
    sprite('tint', A.records.tint, full),
  ];
}

export function verify(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const table = {}, sprites = {}, problems = [], facts = { levels: new Map(), trips: new Map(), after: new Map(), records: new Map(), bind: new Map(), fields: new Map() };

  const spriteCalls = checkSprites(trace, sprites, problems);

  const sequence = sequenceOf(trace, [A.head, A.background, A.blur, A.toWork, A.toFrame, A.copy, A.frameTexture, A.post, BLEND, BUFFER, WORK, DISPLAY, SPRITE]);
  let heads = 0, posts = 0;
  sequence.forEach((probe, at) => {
    if (probe.preroll) return;
    if (probe.pc === A.head) {
      const [w, h] = [probe.mem[0].bytes.readInt32LE(0), probe.mem[0].bytes.readInt32LE(4)];
      const index = probe.mem[1].bytes.readInt32LE(0), field = probe.mem[2].bytes.readInt32LE(0), level = probe.mem[3].bytes.readInt32LE(0);
      const wanted = headCalls(level, index, field, w, h);
      if (matchCalls(sequence, at, wanted, table, problems, 'head') < 0) return;
      heads += 1;
      const trips = (level >>> 0) < 6 ? level : 10 - level;
      facts.levels.set(level, (facts.levels.get(level) ?? 0) + 1);
      facts.trips.set(trips, (facts.trips.get(trips) ?? 0) + 1);
    } else if (probe.pc === A.post) {
      const level = probe.mem[0].bytes.readInt32LE(0);
      const next = sequence[at + 1];
      if (!next) return;
      posts += 1;
      if ((level >>> 0) < 5) { tally(table, 'after the rods: no trip below level 5', next.pc !== A.blur); facts.after.set(0, (facts.after.get(0) ?? 0) + 1); return; }
      // The screen size and index of this frame are the ones the last head saw.
      let head = at; while (head >= 0 && sequence[head].pc !== A.head) head -= 1;
      if (head < 0) return;
      const [w, h] = [sequence[head].mem[0].bytes.readInt32LE(0), sequence[head].mem[0].bytes.readInt32LE(4)];
      const index = sequence[head].mem[1].bytes.readInt32LE(0);
      if (matchCalls(sequence, at, tripCalls(level - 5, index, w, h), table, problems, 'after the rods') < 0) return;
      facts.after.set(level - 5, (facts.after.get(level - 5) ?? 0) + 1);
    }
  });

  // The level: written from the menu ramp's counter, read by the next frame's head.
  const levelProbes = trace.probes.filter((probe) => probe.pc === A.level || probe.pc === A.head);
  levelProbes.forEach((probe, at) => {
    if (probe.pc !== A.level) return;
    const next = levelProbes.slice(at + 1).find((other) => other.pc === A.head);
    if (!next) return;
    const counter = probe.mem[0].bytes.readInt32LE(4), tail = probe.mem[1].bytes.readInt32LE(0);
    const wanted = levelOf(counter, tail);
    const got = next.mem[3].bytes.readInt32LE(0);
    const key = `ramp of ${probe.mem[0].bytes.readInt32LE(0)}, tail ${tail}: level ${got}`;
    const seen = facts.records.get(key) ?? { low: counter, high: counter, n: 0 };
    facts.records.set(key, { low: Math.min(seen.low, counter), high: Math.max(seen.high, counter), n: seen.n + 1 });
    if (!tally(table, 'level from the menu ramp', wanted === got) && problems.length < 12) problems.push(`level: counter ${counter}, tail ${tail}: wanted ${wanted}, next frame has ${got}`);
  });

  // The fields of the three records that the code does not write: colour, first corner, depth, blend, texture.
  const named = Object.fromEntries(Object.entries(A.records).map(([name, address]) => [(address | UNCACHED) >>> 0, name]));
  for (const probe of trace.probes) {
    const name = named[probe.gpr[4] >>> 0];
    const record = probe.mem[2]?.bytes;
    if (probe.pc !== SPRITE || probe.preroll || !name || !record) continue;
    const i = (o) => record.readInt32LE(o);
    const text = `${name} record: colour ${i(0)},${i(4)},${i(8)},${i(12)}; first corner ${i(0x10) / 16},${i(0x14) / 16} texel ${i(0x18) / 16},${i(0x1c) / 16}; z ${i(0x30)}; blend ${i(0x34)}; textured ${i(0x38)}`;
    facts.fields.set(text, (facts.fields.get(text) ?? 0) + 1);
  }

  // What binding the frame as a texture sends.
  for (const probe of trace.probes) {
    if (probe.pc !== A.frameTexture || probe.preroll) continue;
    const text = `index ${probe.gpr[4]}: ${writesOf(trace.packets[probe.at]).map((write) => `${NAME[write.reg] ?? `0x${write.reg.toString(16)}`}=0x${write.value.toString(16)}`).join(' ')}`;
    facts.bind.set(text, (facts.bind.get(text) ?? 0) + 1);
    // HDD OSD's rule: the frame being drawn as a 24-bit texture, alpha not taken from it, clamped to the screen.
    if (BUILD !== 'hdd' || !probe.mem[0]?.bytes) continue;
    const [w, h] = [probe.mem[0].bytes.readInt32LE(0), probe.mem[0].bytes.readInt32LE(4)];
    const base = probe.gpr[4] === 0 ? (w * h) >> 6 : 0;
    const wanted = [[R.TEST, 0x50000n], [R.ALPHA, 0x44n], [R.PABE, 0n], [R.TEXA, 0x810000807fn], [R.FBA, 0n], [R.TEXFLUSH, 0n], [R.TEX1, 0x61n],
      [R.TEX0, big(base) | (big(w >> 6) << 14n) | (1n << 20n) | (10n << 26n) | (8n << 30n) | (1n << 34n)], [R.CLAMP, 0xan | (big(w - 1) << 14n) | (big(h - 1) << 34n)]];
    const sent = writesOf(trace.packets[probe.at]);
    wanted.forEach(([reg, value], n) => tally(table, `bind the frame: ${NAME[reg]}`, !!sent[n] && sent[n].reg === reg && sent[n].value === value));
  }
  return { table, sprites, problems, facts, heads, posts, spriteCalls };
}

if (process.argv[1] && process.argv[1].endsWith('verify_blur.mjs')) {
  const result = verify(process.argv[2]);
  const list = (map) => [...map].map(([key, n]) => `${key} x${n}`).join(', ');
  console.log(`build: ${BUILD_NAME}`);
  console.log(`frame heads: ${result.heads}   level -> ${list(result.facts.levels)}   trips before the rods -> ${list(result.facts.trips)}`);
  console.log(`after the rods: ${result.posts} calls   trips -> ${list(result.facts.after)}`);
  console.log(`  ${tallyText(result.table)}`);
  console.log(`sprite helper: ${result.spriteCalls} calls`);
  console.log(`  ${tallyText(result.sprites)}`);
  for (const [text, seen] of result.facts.records) console.log(`  ${text} at counter ${seen.low}${seen.high !== seen.low ? `..${seen.high}` : ''}  x${seen.n}`);
  for (const [text, n] of result.facts.bind) console.log(`  bind the frame, ${text}  x${n}`);
  for (const [text, n] of result.facts.fields) console.log(`  ${text}  x${n}`);
  for (const problem of result.problems) console.log(`  ! ${problem}`);
  const good = result.heads > 0 && allEqual(result.table) && allEqual(result.sprites) && result.problems.length === 0;
  console.log(`verdict: ${result.heads === 0 ? 'NOT FOUND no frame head in the trace' : good ? `FOUND ${result.heads} frame heads and ${result.spriteCalls} sprites, every call and every write as computed` : 'PARTIAL see the lines marked'}`);
  process.exit(good ? 0 : 3);
}
