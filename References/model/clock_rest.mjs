// The parts of a clock frame around the rods and orbs: the head (clear, background tube, blur
// trips, the two copies, the tint) and the tail (vignette, fade, the trips after the rods, the
// letterbox bars, the right column). Rules: facts/clock-frame-rest.md. Every function takes the
// frame's context { m, hdd, w, h, gs, send } and reads and writes the memory as the program does.
import { f, add, sub, toInt, sin, cos, s16, big, floatBits, REG, apply, tickRamp } from './clock_math.mjs';

/**
 * The sprite helper (HDD func_00233770, ROM 0x0022fd00): two packets for a rectangle record.
 * Record: +0x00 R, G, B, A; +0x10 x0, y0; +0x18 u0, v0; +0x20 x1, y1; +0x28 u1, v1; +0x30 z; +0x34 blend; +0x38 textured.
 * Nothing is masked: every field is OR-ed in at its place.
 */
export function rectangle(record, w, h, label) {
  const i = (o) => BigInt(record.readInt32LE(o));
  const ox = BigInt((0x800 - (w >> 1)) << 4), oy = BigInt((0x800 - (h >> 1)) << 4);
  const z = big(i(0x30)) << 32n;
  return [
    { kind: 'vertex', label, writes: [[REG.PRIM, big((BigInt(record.readUInt32LE(0x38)) << 4n) | 0x100n | (i(0x34) << 6n) | 6n)],
      [REG.RGBAQ, big(i(0) | (0x3f800000n << 32n) | (i(8) << 16n) | (i(4) << 8n) | (i(0xc) << 24n))]] },
    { kind: 'vertex', label, writes: [[REG.UV, big(i(0x18) | (i(0x1c) << 16n))], [REG.XYZF2, big((i(0x10) + ox) | ((i(0x14) + oy) << 16n) | z)],
      [REG.UV, big(i(0x28) | (i(0x2c) << 16n))], [REG.XYZF2, big((i(0x20) + ox) | ((i(0x24) + oy) << 16n) | z)]] },
  ];
}
const set = (record, fields) => { for (const [offset, value] of Object.entries(fields)) record.writeInt32LE(value | 0, Number(offset)); };

// ---- the background: sixteen strips of a tube seen from inside -----------------------------

const project = (screen, v) => { const p = apply(screen, v); const q = f(1 / p[3]); return [p.map((x) => f(x * q)), q]; };
const rgbaq = (r, g, b, q) => big(BigInt(r) | (BigInt(floatBits(q)) << 32n) | (BigInt(b) << 16n) | (BigInt(g) << 8n) | 0x40000000n);
const st = (s, t) => big(BigInt(floatBits(s)) | (BigInt(floatBits(t)) << 32n));
const xyz = (v) => { const [x, y, z] = v.map((c) => BigInt(toInt(c * 16))); return big(x | (y << 16n) | (z << 32n)); };
const coordinate = (u, v, q) => st(f(f(u * 3) * q), f(f(v * 3) * q));

/** One strip (HDD func_00233110): 33 ring pairs, those in view kept, and the closing pair. */
function strip(view, screen, angle0, angle1, counter, greys, K) {
  const a = s16(angle0), b = s16(angle1);
  const P0 = [f(K.radius * sin(a)), f(K.radius * cos(a)), 0, 1];
  const P1 = [f(K.radius * sin(b)), f(K.radius * cos(b)), 0, 1];
  const u0 = f(angle0 / K.turn), u1 = f(angle1 / K.turn);
  const lightA = toInt(f(add(cos(a), 1) * 10)), lightB = toInt(f(add(cos(b), 1) * 10));
  const out = [];
  for (let i = 0; i <= 32; i++) {
    const v = add(f(i * 0.03125), f((counter % 5000) * K.scroll));
    const wobble = add(f(sin(Math.imul(counter, 100) + i * 0x1400) * K.ripple), 1);
    const n = 32 - i;
    const fall = Math.imul(Math.imul(n, n), n) >> 10;
    const c1 = greys[0] + ((0xe6 * fall) >> 5), c2 = greys[1] + ((0x104 * fall) >> 5), c3 = greys[2] + ((0x104 * fall) >> 5);
    const z = i * 0x4e2 - 0x9c4;
    let V0 = apply(view, [f(P0[0] * wobble), f(P0[1] * wobble), z, P0[3]]);
    let V1 = apply(view, [f(P1[0] * wobble), f(P1[1] * wobble), z, P1[3]]);
    if (V0[2] < K.near || V1[2] < K.near) continue;
    let q0, q1;
    [V0, q0] = project(screen, V0);
    [V1, q1] = project(screen, V1);
    const outside = (x) => Math.abs(sub(x, 2000)) > 1000;
    if (outside(V0[0]) || outside(V1[0]) || outside(V0[1]) || outside(V1[1])) continue;
    out.push([REG.RGBAQ, rgbaq(c1 + lightA, c2 + lightA, c3 + lightA, q0)], [REG.ST, coordinate(u0, v, q0)], [REG.XYZF2, xyz(V0)],
      [REG.RGBAQ, rgbaq(c1 + lightB, c2 + lightB, c3 + lightB, q1)], [REG.ST, coordinate(u1, v, q1)], [REG.XYZF2, xyz(V1)]);
  }
  // The closing pair: both vertices at the far end of the axis, no light and no fall added.
  const v = add(f((counter % 5000) * K.scrollEnd), 1);
  const [E0, e0] = project(screen, apply(view, [0, 0, K.far, 1]));
  const [E1, e1] = project(screen, apply(view, [0, 0, K.far, 1]));
  out.push([REG.RGBAQ, rgbaq(greys[0], greys[1], greys[2], e0)], [REG.ST, coordinate(f(angle0 / K.turnEnd), v, e0)], [REG.XYZF2, xyz(E0)],
    [REG.RGBAQ, rgbaq(greys[0], greys[1], greys[2], e0)], [REG.ST, coordinate(f(angle1 / K.turnEnd), v, e1)], [REG.XYZF2, xyz(E1)]);
  return out;
}

/** HDD module_clock_233338: ticks the grey ramp, sets the grey, draws when the overlay mode is 0. */
export function background({ m, gs, send }, view, screen) {
  const ramp = m.at('greyRamp');
  tickRamp(ramp);
  const greys = m.at('greys');
  if (ramp.readInt32LE(12) !== 0) {
    const grey = Math.trunc((ramp.readInt32LE(4) * 0x28) / ramp.readInt32LE(0));
    for (const o of [0, 4, 8]) greys.writeInt32LE(grey, o);
  }
  if (m.int('mode') !== 0) return;
  const c = m.at('tubeConstants');
  const K = { near: c.readFloatLE(0), turn: c.readFloatLE(4), scroll: c.readFloatLE(8), ripple: c.readFloatLE(0xc),
    scrollEnd: c.readFloatLE(0x10), turnEnd: c.readFloatLE(0x14), far: c.readFloatLE(0x18), radius: c.readFloatLE(0x1c) };
  const grey = [0, 4, 8].map((o) => greys.readInt32LE(o));
  send(gs.bind(1, 1, 2));
  for (let angle = 0; angle <= 0xffff; angle += 0x1000) {
    send({ kind: 'state', label: 'background: strip primitive', writes: [[REG.PRIM, 0x1cn], [REG.CLAMP, 0n]] },
      { kind: 'vertex', label: 'background: strip', writes: strip(view, screen, angle, angle + 0x1000, m.int('counter'), grey, K) });
  }
}

// ---- blur trips, copies, tint -------------------------------------------------------------------

/** HDD func_00236490(trips): shrink the frame into work buffer 1 and stretch it back, `trips` times. */
export function blur(ctx, trips) {
  const { m, hdd, w, h, gs, send } = ctx;
  const record = m.at('blurRecord');
  for (let k = 0; k < trips; k++) {
    const x = 0x13f4 - 0x20 * k;
    send(gs.frameTexture(), gs.work(1, null, 0), gs.blend(1, 1));
    set(record, { 0x20: x, 0x24: 0x954 - 0x10 * k, 0x28: (w << 4) + 8, 0x2c: ((h - 1) << 4) + 8 });
    send(rectangle(record, w, h, 'blur: shrink'));
    send(gs.buffer(1), gs.display(null, 0), gs.blend(1, 1));
    set(record, { 0x20: w << 4, 0x24: (h - 1) << 4, 0x28: x + 8, 0x2c: 0x95c - 0x10 * k });
    send(rectangle(record, w, h, 'blur: stretch'));
  }
  // ROM 2.30 leaves the depth test at GREATER when the trips are done, also when there is none.
  if (!hdd) send(gs.blend(1, 3));
}

/** HDD func_00236230(blend): what is bound, over the whole target. */
function copy({ m, hdd, w, h, gs, send }, blended) {
  const record = m.at('copyRecord');
  set(record, { 0x20: w << 4, 0x24: h << 4, 0x28: (w << 4) + 8, 0x2c: (h << 4) + 8, 0x34: blended });
  send(gs.blend(1, 1), rectangle(record, w, h, 'copy'));
  if (!hdd) send(gs.blend(1, 3));
}

/** HDD module_clock_226000(view, screen): everything drawn before the rods. */
export function head(ctx, view, screen) {
  const { m, w, h, gs, send } = ctx;
  const tint = m.at('tint');
  set(tint, { 0x20: w << 4, 0x24: h << 4, 0x28: (w << 4) + 8, 0x2c: (h << 4) + 8 });
  send(gs.display(m.at('clearColour'), m.int('scene', 8)));
  background(ctx, view, screen);
  const level = m.int('level') >>> 0;
  blur(ctx, level < 6 ? level : 10 - level);
  send(gs.work(0, null, 0), gs.frameTexture());
  copy(ctx, 0);
  send(gs.work(1, null, 0));
  copy(ctx, 0);
  send(gs.display(null, 0), gs.buffer(0), gs.blend(0, 1), rectangle(tint, w, h, 'tint'));
}

// ---- after the rods: vignette, fade, trips, bars, column ---------------------------------------

/** HDD func_00233D00: the vignette's seventeen packets for the record { alpha, cx, cy, rx, ry, z }. */
function vignette(record, w, h, hdd, tall) {
  const [alpha, cx, cy, rx, ry, z] = [0, 4, 8, 12, 16, 20].map((o) => record.readInt32LE(o));
  const left = (0x800 - (w >> 1)) << 4, top = (0x800 - (h >> 1)) << 4;
  const X = (angle, r) => toInt(add(add(cx, f(f(sin(angle) * rx) * r)), left));
  // ROM 2.30 in PAL multiplies the vertical term by 1.15 (0x0022FEE4); HDD OSD has no such step.
  const Y = (angle, r) => { const term = f(f(cos(angle) * ry) * r); return toInt(add(add(cy, (tall ? f(term * tall) : term)), top)); };
  const clamp = (value, low, high) => (value < low ? low : high < value ? high : value);
  const colour = (a) => big((BigInt(a) << 24n) | (0x3f800000n << 32n));
  const point = (x, y) => big(BigInt(x) | (BigInt(y) << 16n) | (BigInt(z) << 32n));
  const packets = [{ kind: 'vertex', label: 'vignette', writes: [[REG.PRIM, 0x4cn]] }];
  for (let angle = 0; angle <= 0xffff; angle += 0x1000) {
    const next = angle + 0x1000;
    const writes = [
      [REG.RGBAQ, colour(0)], [REG.XYZF2, point(X(angle, 1), Y(angle, 1))],
      [REG.RGBAQ, colour(0)], [REG.XYZF2, point(X(next, 1), Y(next, 1))],
      [REG.RGBAQ, colour(alpha)], [REG.XYZF2, point(X(angle, 1.5), Y(angle, 1.5))],
      [REG.RGBAQ, colour(alpha)], [REG.XYZF2, point(X(next, 1.5), Y(next, 1.5))],
      [REG.RGBAQ, colour(alpha)], [REG.XYZF2, point(clamp(X(angle, 10), left, left + (w << 4)), clamp(Y(angle, 10), top, top + (h << 4)))],
      [REG.RGBAQ, colour(alpha)], [REG.XYZF2, point(clamp(X(next, 10), left, left + (w << 4)), clamp(Y(next, 10), top, top + (h << 4)))],
    ];
    // ROM 2.30 only: the last sector goes on with the inner edge at angles 0 and 0x1000.
    if (!hdd && next === 0x10000) writes.push([REG.RGBAQ, colour(0)], [REG.XYZF2, point(X(0, 1), Y(0, 1))], [REG.RGBAQ, colour(0)], [REG.XYZF2, point(X(0x1000, 1), Y(0x1000, 1))]);
    packets.push({ kind: 'vertex', label: 'vignette', writes });
  }
  return packets;
}

/** HDD module_clock_234E70: ticks the vignette ramp; the vignette when the mode is 0; then the fade. */
export function overlay({ m, hdd, w, h, gs, send }) {
  const ramp = m.at('vignetteRamp');
  tickRamp(ramp);
  if (m.int('mode') === 0) {
    // func_00234D60 (ROM 0x00231368) writes the record on every frame of mode 0, whatever the ramp
    // does (a hidden ramp has the counter 0); only the drawing waits for the ramp to be shown.
    const ring = m.at('ringRecord');
    set(ring, { 0: Math.trunc((ramp.readInt32LE(4) * 0x80) / ramp.readInt32LE(0)), 4: 0x10a0, 8: Math.trunc(h / 2) << 4 });
    if (ramp.readInt32LE(12) !== 0) {
      const tall = !hdd && m.has('videoMode') && m.int('videoMode') === 2 ? m.float('vignettePal') : 0;
      send(gs.blend(1, 2), vignette(ring, w, h, hdd, tall));
    }
  }
  const fade = m.at('fadeRecord');
  fade.writeInt32LE(0x80 - m.int('overlayLevel'), 0xc);
  send(gs.display(null, 0), gs.blend(1, 1), rectangle(fade, w, h, 'fade'));
}

/** HDD module_clock_232438: the trips after the rods, `level - 5` of them from level 5 up. */
export function tripsAfter(ctx) {
  const level = ctx.m.int('level') >>> 0;
  if (level >= 5) blur(ctx, level - 5);
}

/** HDD func_002262C8 / func_00226158: the two letterbox bars, when configuration item 0 is 0 or 2. */
export function bars({ m, w, h, gs, send }) {
  const item = m.int('item0');
  if (item !== 0 && item !== 2) return;
  const record = m.at('bars');
  record.writeInt32LE(w << 4, 0x20);
  send(gs.display(null, 0), gs.blend(1, 1));
  const picture = f(f(f(f(w / m.float('proportions', 0)) * 0.0625) * 9) * m.float('proportions', 4));
  const margin = f(sub(h, picture) * 0.5);
  set(record, { 0x14: 0, 0x24: toInt(f(margin * 16)) });
  send(rectangle(record, w, h, 'bars'));
  set(record, { 0x14: toInt(f(sub(h, margin) * 16)), 0x24: h << 4 });
  send(rectangle(record, w, h, 'bars'));
}

/**
 * HDD func_00226300 / ROM 0x002219D8: the row of the date and the time, in pixels (the y given to
 * Font_SetLocate, from 22 on the left): 0xE, or 0x20 when item 0 is 2. PAL scales it by
 * 0.5405 / 0.47 in double precision (D_00365570 / D_00365578), cut to an integer.
 */
export function dateRow(m) {
  const row = m.int('item0') === 2 ? 0x20 : 0xe;
  return m.int('videoMode') === 2 ? Math.trunc((row * 0.5404999986290931) / 0.4699999988079071) : row;
}

/** HDD func_00226958: the row of the button hints, 0xB6, or 0xC8 unless item 0 is 2 (the same PAL scale). */
export function hintRow(m) {
  const row = m.int('item0') === 2 ? 0xb6 : 0xc8;
  return m.int('videoMode') === 2 ? Math.trunc((row * 0.5404999986290931) / 0.4699999988079071) : row;
}

/** HDD func_00226A88: two pixels at the right edge. */
export function column({ m, w, h, gs, send }) {
  const record = m.at('column');
  set(record, { 0x10: (w << 4) - 0x28, 0x14: 0, 0x20: (w << 4) - 8, 0x24: h << 4 });
  send(gs.display(null, 0), gs.blend(1, 1), rectangle(record, w, h, 'column'));
}

const rampUp = (ramp) => { if (ramp.readInt32LE(12) === 0) { ramp.writeInt32LE(0, 4); ramp.writeInt32LE(1, 12); ramp.writeInt32LE(1, 8); } };
const rampDown = (ramp) => { if (ramp.readInt32LE(12) === 2) { ramp.writeInt32LE(1, 8); ramp.writeInt32LE(3, 12); ramp.writeInt32LE(ramp.readInt32LE(0), 4); } };

/**
 * HDD module_clock_230DF0 (ROM 0x0022CF70): the ramp between System Configuration (0) and the
 * clock alone (full). While it rises, the cubes' ramp is sent down when the counter reaches the
 * tail length; when it is full, square sends it down and the cubes' ramp up.
 */
export function menuStep(m, hdd) {
  if (!m.has('cubeRamp') || !m.has('pad')) return;
  const ramp = m.at('menuRamp'), cubes = m.at('cubeRamp');
  tickRamp(ramp);
  const state = ramp.readInt32LE(12);
  if (state === 1) {
    if (ramp.readInt32LE(4) === m.int('tail')) rampDown(cubes);
  } else if (state === 2 && (m.int('pad', 4) & 0x80)) {
    rampDown(ramp);
    // ROM 2.30 chooses here between the standing cubes and the ring, by the number of entries.
    if (!hdd && cubes.readInt32LE(12) === 0) m.setInt('cubeMode', m.int('configPage', 8) < 6 ? 5 : 6);
    rampUp(cubes);
  }
}

/** HDD func_00234EA8: the overlay level's state machine, once per frame. */
export function overlayStep(m) {
  const mode = m.int('mode');
  if (mode <= 0) return;
  let level = m.int('overlayLevel');
  if (mode < 3) {
    level += 1;
    let now = mode;
    if (level > 0x80) { level = 0x80; now = 0; m.setInt('mode', 0); }
    m.setInt('overlayLevel', level);
    // Mode 2 only: start the vignette ramp (if idle) when the level reaches 128 less its length.
    if (now === 2 && level === 0x80 - m.int('vignetteLength')) {
      const ramp = m.at('vignetteRamp');
      if (ramp.readInt32LE(12) === 0) { ramp.writeInt32LE(0, 4); ramp.writeInt32LE(1, 8); ramp.writeInt32LE(1, 12); }
    }
  } else if (mode === 3) {
    level -= 1;
    m.setInt('overlayLevel', level < 0 ? 0 : level);
  }
}

/** The blur level, written once per frame from the menu ramp (second half of HDD func_00232640). */
export function blurLevel(m, hdd) {
  const counter = m.int('menuRamp', 4), tail = m.int('tail');
  if (hdd) m.setInt('level', counter < tail ? 10 - Math.trunc((counter * 10) / tail) : 0);
  else { const left = tail - counter; m.setInt('level', Math.trunc((5 * (left < 0 ? 0 : Math.min(left, tail))) / tail) + 5); }
}
