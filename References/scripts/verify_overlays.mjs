// What the clock frame draws after the rods and orbs: the fade overlay (and the vignette that
// goes with the start-up fade), the two letterbox bars, the date and time, the button hint and
// the column at the right edge. For the rectangles: recomputes the record each function hands
// to the sprite helper and the calls it makes. For the text: which function sends which packets.
//
//   overlay      HDD 0x00234e70   ticks the vignette ramp; vignette when the mode is 0; then the fade
//   vignette     HDD 0x00234d60   alpha = ramp counter * 128 / length; drawn while the ramp is not idle
//   fade         HDD 0x00234e08   full-screen rectangle, alpha = 128 - level
//   step         HDD 0x00234ea8   the level's state machine, once per frame
//   bars         HDD 0x002262c8   config item 0 is 0 or 2 -> 0x00226158, two rectangles
//   column       HDD 0x00226a88   2 pixels at the right edge
//   date, time   HDD 0x00226300
//   hint         HDD 0x002269e0
//   count        HDD 0x00232878   frame counter + 1
//
// The trace must carry the PROBES of verify_blur.mjs as well (the sprite and state helpers).
//
// node verify_overlays.mjs <trace.jsonl>
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { GifPath } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/gif.js';
import { pick, range, pc, BUILD, BUILD_NAME } from './builds.mjs';
import { f, toInt, sin, cos } from './verify_background.mjs';
import { ADDRESSES as HEAD, BLEND, DISPLAY, SPRITE, display, blend, sprite, matchCalls, sequenceOf, tally, tallyText, allEqual, writesOf } from './verify_blur.mjs';

const A = pick({
  rom: { overlay: 0x00231478, vignette: 0x00231368, ring: 0x00230488, fade: 0x00231410, step: 0x002314b0, bars: 0x002219a0, barsDraw: 0x00221830, column: 0x00222210, text: 0x002219d8, hint: 0x00222160, count: 0x0022eb10, pages: 0x0022e738,
    ramp: 0x00297120, length: 0x002c8908, mode: 0x002c8f6c, level: 0x002c8f70, item: 0x00375100, camera: 0x0028a340, counter: 0x002c88f8, screen: 0x001f0c50,
    records: { fade: 0x00297130, bars: 0x0028a3f0, column: 0x0028a730, ring: 0x00297170 } },
  hdd: { overlay: 0x00234e70, vignette: 0x00234d60, ring: 0x00233d00, fade: 0x00234e08, step: 0x00234ea8, bars: 0x002262c8, barsDraw: 0x00226158, column: 0x00226a88, text: 0x00226300, hint: 0x002269e0, count: 0x00232878, pages: 0x00232458,
    ramp: 0x002b5f20, length: 0x003702e4, mode: 0x00370ab4, level: 0x00370ab8, item: 0x00409130, camera: 0x002b2170, counter: 0x003702d4, screen: 0x001f0cb4,
    records: { fade: 0x002b5f30, bars: 0x002b2220, column: 0x002b2500, ring: 0x002b5f70 } },
});
const SCREEN = range(A.screen, 8);
export const PROBES = [
  { pc: pc(A.overlay), ranges: [range(A.ramp, 0x10), range(A.mode, 4), range(A.level, 4), range(A.length, 4), SCREEN, range(HEAD.index, 4)] },
  { pc: pc(A.vignette), ranges: [range(A.ramp, 0x10), SCREEN] },
  { pc: pc(A.ring), ranges: ['a0+0xe0000000:0x40'] },
  { pc: pc(A.fade), ranges: [range(A.level, 4)] },
  { pc: pc(A.step), ranges: [range(A.mode, 4), range(A.level, 4), range(A.length, 4), range(A.ramp, 0x10)] },
  { pc: pc(A.bars), ranges: [range(A.item, 4)] },
  { pc: pc(A.barsDraw), ranges: [range(A.camera, 0x14), SCREEN, range(HEAD.index, 4)] },
  { pc: pc(A.column), ranges: [SCREEN, range(HEAD.index, 4)] },
  { pc: pc(A.text), ranges: [range(A.item, 4)] },
  { pc: pc(A.hint), ranges: [range(A.item, 4)] },
  { pc: pc(A.pages), ranges: [] },
  { pc: pc(A.count), ranges: [range(A.counter, 4)] },
];

const big = (x) => BigInt.asUintN(64, BigInt(x));

/**
 * The vignette: what 0x00233d00 sends for a record { alpha, cx, cy, rx, ry, z } (integers, 1/16 pixel).
 * One packet with PRIM = 0x4c, then sixteen packets of six vertices each: a sector of an ellipse at
 * radius 1 (alpha 0), at radius 1.5 (alpha), and at radius 10 clamped to the screen (alpha).
 * Every vertex is black; only the alpha differs.
 */
function vignette(record, w, h) {
  const [alpha, cx, cy, rx, ry, z] = [0, 4, 8, 12, 16, 20].map((o) => record.readInt32LE(o));
  const left = (0x800 - (w >> 1)) << 4, top = (0x800 - (h >> 1)) << 4;
  const X = (angle, r) => toInt(f(f(cx + f(f(sin(angle) * rx) * r)) + left));
  const Y = (angle, r) => toInt(f(f(cy + f(f(cos(angle) * ry) * r)) + top));
  const clamp = (value, low, high) => (value < low ? low : high < value ? high : value);
  const colour = (a) => big((BigInt(a) << 24n) | (0x3f800000n << 32n));
  const point = (x, y) => big(BigInt(x) | (BigInt(y) << 16n) | (BigInt(z) << 32n));
  const packets = [[[0x00, 0x4cn]]];
  for (let angle = 0; angle <= 0xffff; angle += 0x1000) {
    const next = angle + 0x1000;
    packets.push([
      [0x01, colour(0)], [0x04, point(X(angle, 1), Y(angle, 1))],
      [0x01, colour(0)], [0x04, point(X(next, 1), Y(next, 1))],
      [0x01, colour(alpha)], [0x04, point(X(angle, 1.5), Y(angle, 1.5))],
      [0x01, colour(alpha)], [0x04, point(X(next, 1.5), Y(next, 1.5))],
      [0x01, colour(alpha)], [0x04, point(clamp(X(angle, 10), left, left + (w << 4)), clamp(Y(angle, 10), top, top + (h << 4)))],
      [0x01, colour(alpha)], [0x04, point(clamp(X(next, 10), left, left + (w << 4)), clamp(Y(next, 10), top, top + (h << 4)))],
    ]);
    // ROM 2.30 only: the last sector goes on with the inner edge at angles 0 and 0x1000.
    if (BUILD === 'rom' && next === 0x10000) packets.at(-1).push([0x01, colour(0)], [0x04, point(X(0, 1), Y(0, 1))], [0x01, colour(0)], [0x04, point(X(0x1000, 1), Y(0x1000, 1))]);
  }
  return packets;
}
const call = (pcValue, name, args = {}) => ({ pc: pcValue, name, args });
const i32 = (probe, n, at = 0) => probe.mem[n].bytes.readInt32LE(at);

/** The ramp object's tick: { length, counter, changed, state } -> the same after one frame. */
function tick([length, counter, , state]) {
  if (state === 1) { counter += 1; return counter === length ? [length, counter, 1, 2] : [length, counter, 0, 1]; }
  if (state === 3) { counter -= 1; return counter === 0 ? [length, counter, 1, 0] : [length, counter, 0, 3]; }
  return [length, counter, 0, state];
}

/** The level's state machine: (mode, level, length of the vignette ramp) -> (mode, level, whether the ramp is started). */
function step(mode, level, length) {
  let selector = mode;
  if (mode > 0) {
    if (mode < 3) { level += 1; if (level > 0x80) { level = 0x80; selector = 0; mode = 0; } }
    else if (mode === 3) { level -= 1; if (level < 0) level = 0; }
  }
  return { mode, level, starts: selector === 2 && level === 0x80 - length };
}

const REG = { 0x00: 'PRIM', 0x01: 'RGBAQ', 0x02: 'ST', 0x03: 'UV', 0x04: 'XYZF2', 0x05: 'XYZ2', 0x06: 'TEX0', 0x08: 'CLAMP', 0x14: 'TEX1', 0x3b: 'TEXA', 0x3f: 'TEXFLUSH', 0x42: 'ALPHA', 0x47: 'TEST', 0x4c: 'FRAME' };
/** A short description of the packets in [from, to): primitives, their kind, texture, colour. */
function describe(trace, from, to) {
  let prims = 0, vertices = 0, images = 0;
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  const kinds = new Set(), textures = new Set(), colours = new Set(), alphas = new Set(), paths = new Set(), origins = new Set();
  for (let n = from; n < to; n++) {
    const packet = trace.packets[n];
    paths.add(packet.path);
    for (const source of packet.sources) { const origin = trace.origins.get(source.origin); if (origin) origins.add((origin.stack ?? []).slice(0, 4).map((frame) => frame.entry).join(' < ')); }
    for (const event of new GifPath().feed(packet.bytes)) {
      if (event.kind === 'image') { images += 1; continue; }
      if (event.kind !== 'write') continue;
      const name = REG[event.reg];
      if (name === 'PRIM') { prims += 1; kinds.add(`0x${event.value.toString(16)}`); }
      else if (name === 'XYZ2' || name === 'XYZF2' || event.reg === 0x0c || event.reg === 0x0d) {
        vertices += 1;
        // Screen position, for a 640 x 224 field: the window starts at (2048 - 320, 2048 - 112).
        const x = Number(event.value & 0xffffn) / 16 - 1728, y = Number((event.value >> 16n) & 0xffffn) / 16 - 1936;
        box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
      }
      else if (name === 'TEX0') textures.add(`tbp 0x${(event.value & 0x3fffn).toString(16)} psm 0x${((event.value >> 20n) & 0x3fn).toString(16)}`);
      else if (name === 'RGBAQ') colours.add(`${event.value & 0xffn},${(event.value >> 8n) & 0xffn},${(event.value >> 16n) & 0xffn},${(event.value >> 24n) & 0xffn}`);
      else if (name === 'ALPHA') alphas.add(`0x${event.value.toString(16)}`);
    }
  }
  return `${to - from} packets (path ${[...paths].join(',')}), ${prims} PRIM writes [${[...kinds].join(' ')}], ${vertices} vertices${vertices ? ` within x ${box[0]}..${box[2]}, y ${box[1]}..${box[3]}` : ''}, ${images} images; TEX0 {${[...textures].join('; ')}}; ALPHA {${[...alphas].join(' ')}}; colours {${[...colours].slice(0, 6).join(' | ')}}; stacks {${[...origins].slice(0, 3).join(' || ')}}`;
}

export function verify(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const table = {}, problems = [];
  const facts = { overlay: new Map(), steps: new Map(), bars: new Map(), text: new Map(), hint: new Map(), pages: new Map(), items: new Map(), order: new Map(), counters: [] };
  const count = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
  /** Count a key and keep the range of a number that goes with it. */
  const span = (map, key, value) => { const seen = map.get(key) ?? { low: value, high: value, n: 0 }; map.set(key, { low: Math.min(seen.low, value), high: Math.max(seen.high, value), n: seen.n + 1 }); };
  const frames = { overlay: 0, bars: 0, column: 0, text: 0, hint: 0 };

  const sequence = sequenceOf(trace, [A.overlay, A.vignette, A.ring, A.fade, A.bars, A.barsDraw, A.column, BLEND, DISPLAY, SPRITE]);
  sequence.forEach((probe, at) => {
    if (probe.preroll) return;
    if (probe.pc === A.overlay) {
      const ramp = tick([0, 4, 8, 12].map((o) => i32(probe, 0, o)));
      const mode = i32(probe, 1), level = i32(probe, 2);
      const [w, h] = [i32(probe, 4, 0), i32(probe, 4, 4)], index = i32(probe, 5);
      const wanted = [];
      if (mode === 0) {
        wanted.push(call(A.vignette, 'vignette'));
        if (ramp[3] !== 0) wanted.push(blend(1, 2), call(A.ring, 'vignette ring', { 4: A.records.ring | 0x20000000 }));
      }
      wanted.push(call(A.fade, 'fade'), display(index), blend(1, 1), sprite('fade', A.records.fade, { 0x0c: 0x80 - level, 0x20: w << 4, 0x24: h << 4 }));
      if (matchCalls(sequence, at, wanted, table, problems, 'overlay') < 0) return;
      frames.overlay += 1;
      const fadeRecord = sequence[at + wanted.length].mem[2]?.bytes;
      span(facts.overlay, `mode ${mode}, vignette ramp state ${ramp[3]}${mode === 0 && ramp[3] !== 0 ? ' (vignette drawn)' : ''}: fade colour ${fadeRecord ? [0, 4, 8].map((o) => fadeRecord.readInt32LE(o)).join(',') : '?'}, blend ${fadeRecord?.readInt32LE(0x34)}, textured ${fadeRecord?.readInt32LE(0x38)}; level`, level);
      if (mode === 0 && ramp[3] !== 0) {
        const ring = sequence[at + 3].mem[0]?.bytes;
        const good = !!ring && ring.readInt32LE(0) === Math.trunc((ramp[1] * 0x80) / ramp[0]) && ring.readInt32LE(4) === 0x10a0 && ring.readInt32LE(8) === (Math.trunc(h / 2) << 4);
        tally(table, 'vignette: alpha = counter * 128 / length, centre (0x10a0, (h / 2) << 4)', good);
        if (ring) {
          const ringProbe = sequence[at + 3];
          span(facts.overlay, `vignette record: centre ${ring.readInt32LE(4)},${ring.readInt32LE(8)}, radii ${ring.readInt32LE(12)},${ring.readInt32LE(16)}, z ${ring.readInt32LE(20)}; alpha`, ring.readInt32LE(0));
          vignette(ring, w, h).forEach((writes, n) => {
            const sent = writesOf(trace.packets[ringProbe.at + n]);
            if (!tally(table, 'vignette: writes per packet', sent.length === writes.length) && problems.length < 12) problems.push(`vignette packet ${n}: ${sent.length} writes sent, ${writes.length} wanted: ${sent.slice(0, 4).map((x) => `${x.reg.toString(16)}=${x.value.toString(16)}`).join(' ')}`);
            writes.forEach(([reg, value], k) => {
              const got = sent[k];
              const same = !!got && got.reg === reg && got.value === value;
              if (!tally(table, `vignette: ${reg === 0 ? 'PRIM' : reg === 1 ? 'RGBAQ' : 'XYZF2'}`, same) && problems.length < 12) problems.push(`vignette packet ${n} write ${k}: wanted reg ${reg} 0x${value.toString(16)}, sent ${got ? `reg ${got.reg} 0x${got.value.toString(16)}` : 'nothing'}`);
            });
          });
        }
      }
    } else if (probe.pc === A.bars) {
      const item = i32(probe, 0);
      const next = sequence[at + 1];
      if (!next) return;
      const drawn = next.pc === A.barsDraw;
      count(facts.items, `config item 0 = ${item}: bars ${drawn ? 'drawn' : 'not drawn'}`);
      tally(table, 'bars exactly when config item 0 is 0 or 2', drawn === (item === 0 || item === 2));
    } else if (probe.pc === A.barsDraw) {
      const [w, h] = [i32(probe, 1, 0), i32(probe, 1, 4)], index = i32(probe, 2);
      const ax = probe.mem[0].bytes.readFloatLE(0xc), ay = probe.mem[0].bytes.readFloatLE(0x10);
      const picture = f(f(f(f(w / ax) * 0.0625) * 9) * ay);
      const margin = f(f(h - picture) * 0.5);
      const top = toInt(f(margin * 16)), bottom = toInt(f(f(h - margin) * 16));
      const wanted = [display(index), blend(1, 1), sprite('top bar', A.records.bars, { 0x14: 0, 0x20: w << 4, 0x24: top }), sprite('bottom bar', A.records.bars, { 0x14: bottom, 0x20: w << 4, 0x24: h << 4 })];
      if (matchCalls(sequence, at, wanted, table, problems, 'bars') < 0) return;
      frames.bars += 1;
      const record = sequence[at + 3].mem[2]?.bytes;
      count(facts.bars, `w ${w} h ${h} ax ${ax} ay ${ay}: picture ${picture} high, top bar to ${top / 16}, bottom bar from ${bottom / 16}; colour ${record ? [0, 4, 8, 12].map((o) => record.readInt32LE(o)).join(',') : '?'}, blend ${record?.readInt32LE(0x34)}, textured ${record?.readInt32LE(0x38)}, x0 ${record?.readInt32LE(0x10)}`);
    } else if (probe.pc === A.column) {
      const [w, h] = [i32(probe, 0, 0), i32(probe, 0, 4)], index = i32(probe, 1);
      const wanted = [display(index), blend(1, 1), sprite('column', A.records.column, { 0x10: (w << 4) - 0x28, 0x20: (w << 4) - 8, 0x24: h << 4 })];
      if (matchCalls(sequence, at, wanted, table, problems, 'column') < 0) return;
      frames.column += 1;
      const record = sequence[at + 3].mem[2]?.bytes;
      count(facts.bars, `column: colour ${record ? [0, 4, 8, 12].map((o) => record.readInt32LE(o)).join(',') : '?'}, blend ${record?.readInt32LE(0x34)}, textured ${record?.readInt32LE(0x38)}, y0 ${record?.readInt32LE(0x14)}`);
    }
  });

  // The level's state machine, against what the next frame's overlay sees.
  const machine = trace.probes.filter((probe) => !probe.preroll && (probe.pc === A.step || probe.pc === A.overlay));
  machine.forEach((probe, at) => {
    if (probe.pc !== A.step) return;
    const next = machine.slice(at + 1).find((other) => other.pc === A.overlay);
    if (!next) return;
    const mode = i32(probe, 0), level = i32(probe, 1), length = i32(probe, 2);
    const ramp = [0, 4, 8, 12].map((o) => i32(probe, 3, o));
    const wanted = step(mode, level, length);
    // Starting the ramp does something only when it is idle.
    const wantedRamp = wanted.starts && ramp[3] === 0 ? [ramp[0], 0, 1, 1] : ramp;
    const got = { mode: i32(next, 1), level: i32(next, 2), ramp: [0, 4, 8, 12].map((o) => i32(next, 0, o)) };
    const same = got.mode === wanted.mode && got.level === wanted.level;
    count(facts.steps, `mode ${mode} -> ${got.mode}${wanted.starts ? ' (starts the vignette ramp)' : ''}`);
    if (!tally(table, 'level and mode after the step', same) && problems.length < 12) problems.push(`step: mode ${mode} level ${level}: wanted mode ${wanted.mode} level ${wanted.level}, next frame has mode ${got.mode} level ${got.level}`);
    if (mode !== 0 || got.mode !== 0) tally(table, 'vignette ramp after the step', wantedRamp.every((x, n) => x === got.ramp[n]));
  });

  // The frame counter.
  for (const probe of trace.probes) if (!probe.preroll && probe.pc === A.count) facts.counters.push(i32(probe, 0));
  for (let n = 1; n < facts.counters.length; n++) tally(table, 'frame counter one more each frame', facts.counters[n] === facts.counters[n - 1] + 1);

  // Which function sends which packets: the tail of the frame, call by call.
  const tail = trace.probes.filter((probe) => !probe.preroll && [A.overlay, A.pages, A.bars, A.text, A.hint, A.column, A.count].includes(probe.pc));
  const NAMES = { [A.overlay]: 'overlay', [A.pages]: 'pages', [A.bars]: 'bars', [A.text]: 'date and time', [A.hint]: 'hint', [A.column]: 'column', [A.count]: 'count' };
  tail.forEach((probe, at) => {
    const next = tail[at + 1];
    if (!next) return;
    if (probe.pc === A.overlay) {
      let end = at; while (tail[end + 1] && tail[end + 1].pc !== A.overlay) end += 1;
      if (tail[end + 1]) count(facts.order, tail.slice(at, end + 1).map((other) => NAMES[other.pc]).join(' > '));
    }
    if (probe.pc === A.text) { frames.text += 1; count(facts.text, `config item 0 = ${i32(probe, 0)}: ${describe(trace, probe.at, next.at)}`); }
    if (probe.pc === A.hint) { frames.hint += 1; count(facts.hint, describe(trace, probe.at, next.at)); }
    if (probe.pc === A.pages) count(facts.pages, describe(trace, probe.at, next.at));
  });
  return { table, problems, facts, frames };
}

if (process.argv[1] && process.argv[1].endsWith('verify_overlays.mjs')) {
  const result = verify(process.argv[2]);
  console.log(`build: ${BUILD_NAME}`);
  console.log(`frames with: overlay ${result.frames.overlay}, bars ${result.frames.bars}, column ${result.frames.column}, date and time ${result.frames.text}, hint ${result.frames.hint}`);
  console.log(`  ${Object.entries(result.table).map(([name, [equal, total]]) => `${name} ${equal}/${total}`).join('\n  ')}`);
  console.log(`  frame counter: ${result.facts.counters[0]} .. ${result.facts.counters.at(-1)}`);
  for (const name of ['order', 'overlay', 'steps', 'items', 'bars', 'pages', 'text', 'hint']) {
    const lines = [...result.facts[name]];
    for (const [text, n] of lines.slice(0, 6)) console.log(typeof n === 'number' ? `  ${name}: ${text}  x${n}` : `  ${name}: ${text} ${n.low}${n.high !== n.low ? `..${n.high}` : ''}  x${n.n}`);
    if (lines.length > 6) console.log(`  ${name}: and ${lines.length - 6} more different lines`);
  }
  for (const problem of result.problems) console.log(`  ! ${problem}`);
  const good = result.frames.overlay > 0 && allEqual(result.table) && result.problems.length === 0;
  console.log(`verdict: ${result.frames.overlay === 0 ? 'NOT FOUND no overlay call in the trace' : good ? `FOUND ${result.frames.overlay} frames, every call and every rectangle as computed` : 'PARTIAL see the lines marked'}`);
  process.exit(good ? 0 : 3);
}
