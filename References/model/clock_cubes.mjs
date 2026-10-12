// The cubes of System Configuration (HDD module_clock_230C00, ROM 0x0022CD80): the ramp's tick,
// one frame of the list position (or, on ROM 2.30 with fewer than six entries, of the five
// standing cubes), then the pass: every cube, the highlight layer, and the buffers put together
// and onto the display. Rules: facts/config-cubes.md; the packets between the faces were read in
// HDD module_clock_2308F0, module_clock_237350, module_clock_237860 and ROM 0x0022C8D0,
// 0x00233928, 0x00233DD8.
import { f, add, sub, toInt, s16, ints, vector, matrix, REG, apply, mul, unit, sin, cos, tickRamp } from './clock_math.mjs';
import { cosf } from './ee_libm.mjs';
import { rectangle } from './clock_rest.mjs';

const STEP = 3000;                 // one list place
const TURN = 60 * STEP;            // the position wraps after sixty places
/** `x mod m` with the result in 0..m-1, written the way the code does it. */
const wrap = (x, m) => { const lifted = x >= 0 ? x : x + 1 - m; return x - (lifted - (lifted % m)); };
const div = (a, b) => Math.trunc(a / b);
const set = (record, fields) => { for (const [offset, value] of Object.entries(fields)) record.writeInt32LE(value | 0, Number(offset)); };

const rotZ = (m, a) => { const c = cos(a), s = sin(a); return mul(m, [[c, s, 0, 0], [-s, c, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]); };
const rotY = (m, a) => { const c = cos(a), s = sin(a); return mul(m, [[c, 0, -s, 0], [0, 1, 0, 0], [s, 0, c, 0], [0, 0, 0, 1]]); };
const rotX = (m, a) => { const c = cos(a), s = sin(a); return mul(m, [[1, 0, 0, 0], [0, c, s, 0], [0, -s, c, 0], [0, 0, 0, 1]]); };
/** A cube standing at a position, turned by one angle about X, then Y, then Z. */
function turned(position, angle) {
  const moved = unit();
  moved[3] = apply(moved, position);
  return rotZ(rotY(rotX(moved, angle), angle), angle);
}

// ---- one frame of the list ---------------------------------------------------------------------

/** HDD module_clock_230550: the list position moving to its target, and the pulse dying down. */
function ringStep(m) {
  const list = m.at('cubeList');
  const left = list.readInt32LE(0xc);
  let speed = list.readInt32LE(0x10), move;
  if (!(speed < Math.abs(left))) { move = left; speed = 0; }
  else {
    const slower = speed - list.readInt32LE(0x14);
    move = left > -1 ? speed : -speed;
    speed = slower > 0 ? slower : 1;
  }
  list.writeInt32LE(speed, 0x10);
  list.writeInt32LE(left - move, 0xc);
  list.writeInt32LE(wrap(list.readInt32LE(8) + move, TURN), 8);
  list.writeFloatLE(f(list.readFloatLE(0) * m.float('cubeConstants', 4)), 0);
}

/** The colour chase (ROM 0x002352A0): each channel one step toward its target, never past it. */
function chase(buffer, at, target, step) {
  for (let c = 0; c < 4; c++) {
    const x = buffer.readInt32LE(at + c * 4), to = target[c];
    if (x === to) continue;
    let next;
    if (step === 1) next = x < to ? x + 1 : x - 1;
    else if (x < to) next = Math.min(x + step, to);
    else next = Math.max(x - step, to);
    buffer.writeInt32LE(next, at + c * 4);
  }
}

/** ROM 0x0022C3D8: one frame of the five standing cubes' colour, glow and pulse. */
function standingStep(m) {
  const table = m.at('standing'), colours = m.at('cubeColours');
  const selected = m.int('configPage', 0x10);
  const fade = m.float('cubeConstants', 0);
  for (let i = 0; i < 5; i++) {
    const entry = table.subarray(i * 0x30, (i + 1) * 0x30);
    let target, glow;
    if (i === selected) {
      chase(colours, 0x20, ints(colours, 0), 1);
      target = ints(colours, 0x20);
      glow = entry.readInt32LE(0x24) + 8;
      glow = glow >= 0 ? Math.min(glow, 0x80) : 0;
    } else {
      target = ints(colours, 0x10);
      glow = entry.readInt32LE(0x24) - 8;
      glow = glow < 0 ? 0 : Math.min(glow, 0x80);
    }
    entry.writeInt32LE(glow, 0x24);
    chase(entry, 0x10, target, 7);
    entry.writeFloatLE(f(entry.readFloatLE(0x20) * fade), 0x20);
  }
}

// ---- one cube ----------------------------------------------------------------------------------

/** HDD module_clock_230600: A and B mixed with weight w of 128, four ints, cut toward zero. */
const mix = (a, b, w) => a.map((x, i) => { const sum = x * w + b[i] * (128 - w); return (sum > -1 ? sum : sum + 127) >> 7; });

/** HDD module_clock_2306B0(place, position, scale): the record's scale and matrix for a list place. */
function place(m, record, index, position, scale) {
  const list = m.at('cubeList'), k = m.at('cubeConstants');
  const size = index === list.readInt32LE(4) ? add(scale, list.readFloatLE(0)) : scale;
  for (const o of [0x70, 0x68, 0x6c]) record.writeFloatLE(size, o);
  const twoPi = k.readFloatLE(8), minusPi = k.readFloatLE(0x14);
  const raw = add(f(f(f(wrap(index * STEP - position, TURN)) * twoPi) / k.readFloatLE(0xc)), k.readFloatLE(0x10));
  const angle = sub(raw, f(Math.floor(f(sub(raw, minusPi) / twoPi)) * twoPi));
  // The fourth word of the position is not written by the code: it is a stack word that is not a
  // normal float, which VU0 takes as zero.
  const position4 = [add((index & 1 ? 60 : 70), -80), add(f(cosf(angle) * 60), 0), 47.5, 0];
  turned(position4, s16((m.at('spin').readUInt16LE(0)) + index * 7000)).flat().forEach((x, i) => record.writeFloatLE(x, 0x20 + i * 4));
}

const face4 = (face, lift = 0n) => face.vertices.map((vertex) => [REG.XYZF2, lift ? BigInt.asUintN(64, vertex.xyz + (lift << 32n)) : vertex.xyz]);

/** What the frame's context gives the cubes: the model's own transform and emitters. */
function drawing(ctx, view, screen) {
  const { m, hdd, w, h, gs, send, env, parts } = ctx;
  const field = env.field;
  const mesh = ctx.mesh.cube;
  const centre = m.at('centreFactors');
  const packet = (label, writes) => ({ kind: 'vertex', label, writes });
  // The quads: HDD OSD sends the faces of a send in one packet, ROM 2.30 one packet per face.
  const quads = (label, list) => (hdd ? [packet(label, list.flat())] : list.map((writes) => packet(label, writes)));

  const edge = (face, rod) => {
    const F = parts.edgeTerm(face);
    const square = f(F * F);
    const channel = (base) => { const value = toInt(f(square * f(base))); return value < 0x100 ? value : 0xff; };
    return [[REG.PRIM, 0xc4n], [REG.RGBAQ, BigInt.asUintN(64, BigInt(channel(rod.base[0])) | 0x80000000n | (BigInt(channel(rod.base[1])) << 8n) | (BigInt(channel(rod.base[2])) << 16n))], ...face4(face)];
  };
  // Black, one depth step nearer. HDD OSD: blended, alpha 0x20. ROM 2.30: not blended, alpha 0x80.
  const depth = (face) => [[REG.PRIM, hdd ? 0xc4n : 0x84n], [REG.RGBAQ, hdd ? 0x03f8000020000000n : 0x03f8000080000000n], ...face4(face, 1n)];
  const alpha = (face, value) => [[REG.PRIM, value > 0x40 ? 0x44n : 0xc4n], [REG.RGBAQ, BigInt.asUintN(64, (BigInt(value) << 24n) | 0x03f8000000000000n)], ...face4(face)];

  /** HDD module_clock_237350: eight sends and the half-buffer sprite. */
  const cube = (record) => {
    if (record.readFloatLE(0x6c) < 0) return;
    const rod = parts.readRod(record);
    const whole = parts.transform(rod, view, screen, mesh);
    const cx = f(whole.cx * centre.readFloatLE(0)), cy = f(whole.cy * centre.readFloatLE(0));
    const far = whole.faces.filter((face) => face.flag === 0), near = whole.faces.filter((face) => face.flag !== 0);
    const bent = (faces) => packet('cube: refracted', faces.flatMap((face) => parts.refracted(face, rod, cx, cy, 0, env)));
    const grain = (faces, ds, dt) => packet('cube: grain', faces.flatMap((face) => parts.textured(face, rod.textured, ds, dt)));
    send(gs.frameTexture(), gs.work(1, null, field), gs.blend(1, 1), bent(far));
    send(gs.bind(2, 1, 2), gs.blend(0, 2), grain(far, rod.pair[0], rod.pair[1]));
    send(gs.blend(2, 2), grain(far, 0, 0));
    send(gs.buffer(1), gs.work(0, null, field), gs.blend(1, 1), quads('cube: edge colour', far.map((face) => edge(face, rod))));
    send(gs.blend(0, hdd ? 2 : 3), quads('cube: depth', near.map(depth)));
    const half = m.at('halfRecord');
    set(half, { 0x20: (w + (w >>> 31)) >> 1 << 4, 0x24: h << 4, 0x28: ((w + (w >>> 31)) << 3) | 8, 0x2c: (h << 4) + 8 });
    send(gs.buffer(0), gs.work(1, null, 0), gs.blend(0, 1), rectangle(half, w, h, 'cube: half of buffer 0 added to buffer 1'));
    send(gs.buffer(1), gs.work(0, null, field), gs.blend(1, 1), bent(near));
    send(gs.bind(2, 1, 2), gs.blend(0, 2), grain(near, rod.pair[0], rod.pair[1]));
    send(gs.blend(2, 2), grain(near, 0, 0));
  };

  /** HDD module_clock_237860: one cube in the highlight layer, two sends over the near faces. */
  const layer = (record) => {
    if (record.readFloatLE(0x6c) < 0) return;
    const rod = parts.readRod(record);
    const near = parts.transform(rod, view, screen, mesh).faces.filter((face) => face.flag !== 0);
    send(gs.buffer(0), gs.work(1, null, field), gs.blend(1, 1), gs.bind(5, 0, 1),
      packet('cube layer: reflection', near.flatMap((face) => parts.reflected(face, rod.reflection, 0x194n))));
    send(gs.blend(0, 2), quads('cube layer: alpha', near.map((face) => alpha(face, rod.reflection[3]))));
  };
  return { cube, layer };
}

/** HDD func_00236350(n): buffer 0 shrunk into buffer 1 and stretched back, n times. */
function chain({ m, hdd, w, h, gs, send }, trips) {
  const record = m.at('chainRecord');
  for (let k = 0; k < trips; k++) {
    const x = 0x13f4 - 0x20 * k;
    send(gs.buffer(0), gs.work(1, null, 0), gs.blend(1, 1));
    set(record, { 0x20: x, 0x24: 0x954 - 0x10 * k, 0x28: (w << 4) + 8, 0x2c: ((h - 1) << 4) + 8 });
    send(rectangle(record, w, h, 'cubes: blur chain, shrink'));
    send(gs.buffer(1), gs.work(0, null, 0), gs.blend(1, 1));
    set(record, { 0x20: w << 4, 0x24: (h - 1) << 4, 0x28: x + 8, 0x2c: 0x95c - 0x10 * k });
    send(rectangle(record, w, h, 'cubes: blur chain, stretch'));
  }
  if (!hdd) send(gs.blend(1, 3));
}

/** The whole of it, once a frame, right after the trips that follow the rods. */
export function cubes(ctx) {
  const { m, hdd, w, h, gs, send, env } = ctx;
  // A snapshot taken without the cubes' pieces: their packets fall into the gap that follows.
  if (!ctx.mesh.cube || !['cubeRamp', 'cubeRecord', 'cubeList', 'chainRecord', 'centreFactors', 'cubeView'].every((name) => m.has(name)) || (!hdd && !m.has('standing'))) return;
  const ramp = m.at('cubeRamp');
  tickRamp(ramp);
  const standing = !hdd && m.int('cubeMode') < 6;
  if (standing) standingStep(m); else ringStep(m);

  // The pass (HDD module_clock_2308F0).
  const scale = f(f(ramp.readInt32LE(4)) / f(m.int('body')));
  if (ramp.readInt32LE(12) === 0) return;
  const record = m.at('cubeRecord'), colours = m.at('cubeColours');
  // The record points at its own two matrices, not at the frame's.
  const { cube, layer } = drawing(ctx, matrix(m.at('cubeView')), matrix(m.at('cubeScreen')));
  const position = m.int('cubeList', 8);
  const whole = div(position, STEP), part = position % STEP;
  const spin = m.at('spin').readUInt16LE(0);
  const stand = (i) => {
    const entry = m.at('standing').subarray(i * 0x30, (i + 1) * 0x30);
    const size = add(scale, entry.readFloatLE(0x20));
    for (const o of [0x70, 0x68, 0x6c]) record.writeFloatLE(size, o);
    return entry;
  };
  const standMatrix = (entry, i) => turned(vector(entry, 0), s16(spin + i * 7000)).flat().forEach((x, n) => record.writeFloatLE(x, 0x20 + n * 4));

  if (standing) {
    for (let i = 0; i < 5; i++) {
      const entry = stand(i);
      entry.copy(record, 0x80, 0x10, 0x20);
      standMatrix(entry, i);
      cube(record);
    }
  } else {
    const selected = ints(colours, 0), plain = ints(colours, 0x10);
    for (let slot = 0; slot < 6; slot++) {
      const weight = div(part << 7, STEP);
      const colour = slot === 2 ? mix(selected, plain, 128 - weight) : slot === 3 ? mix(selected, plain, weight) : plain;
      colour.forEach((x, c) => record.writeInt32LE(x, 0x80 + c * 4));
      place(m, record, wrap(whole + slot - 2, 60), m.int('cubeList', 8), scale);
      cube(record);
    }
  }
  send(gs.work(1, ints(m.at('layerClear')), env.field));
  if (standing) {
    for (let i = 0; i < 5; i++) { standMatrix(stand(i), i); layer(record); }
  } else {
    for (let slot = 0; slot < 6; slot++) {
      const fade = div((Math.abs(-2 * STEP + slot * STEP - part) - 2 * STEP) << 7, STEP);
      if (!(fade < 128)) continue;
      record.writeInt32LE(128 - (fade > -1 ? fade : 0), 0xcc);
      place(m, record, wrap(whole + slot - 2, 60), position, scale);
      layer(record);
    }
  }
  // Buffer 1 added to buffer 0, the blur chain, buffer 0 onto the display.
  const added = m.at('addRecord');
  set(added, { 0x20: w << 4, 0x24: h << 4, 0x28: (w << 4) + 8, 0x2c: (h << 4) + 8 });
  send(gs.buffer(1), gs.work(0, null, 0), gs.blend(0, 1), rectangle(added, w, h, 'cubes: buffer 1 added to buffer 0'));
  const level = m.int('level') >>> 0;
  chain(ctx, level < 5 ? 5 - level : 0);
  const copy = m.at('copyRecord');
  set(copy, { 0x20: w << 4, 0x24: h << 4, 0x28: (w << 4) + 8, 0x2c: (h << 4) + 8, 0x34: 1 });
  send(gs.buffer(0), gs.display(null, 0), gs.blend(1, 1), rectangle(copy, w, h, 'cubes: buffer 0 onto the display'));
  if (!hdd) send(gs.blend(1, 3));
}
