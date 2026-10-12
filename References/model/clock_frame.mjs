// One frame of the crystal clock from the state the program holds at the start of the frame:
// every packet the frame function (HDD 0x00225E80, ROM 0x00221558) has sent to the GS, in order,
// and the state it leaves for the next frame.
// Builds modelled: HDD OSD 1.10U and ROM 2.30 (BIOS 0230AC20080220), chosen by the memory's build.
// Arithmetic and call order are the ones of the facts pages (clock-state, clock-camera,
// clock-scene, clock-rod-draw, clock-extra-passes, clock-orbs, clock-gs-state, clock-frame-rest,
// config-cubes); every place where the two builds differ is a branch on `hdd`.
//
// Every single-precision operation is cut toward zero; float to int conversions truncate.
import { f, add, sub, floatBits, asFloat, toInt, toUnsigned, s16, big, vector, matrix, ints, REG, apply, mul, unit, sin, cos, tickRamp } from './clock_math.mjs';
import { camera } from './clock_camera.mjs';
import { head, overlay, tripsAfter, bars, column, overlayStep, blurLevel, menuStep } from './clock_rest.mjs';
import { logic, scale } from './clock_logic.mjs';
import { cubes } from './clock_cubes.mjs';
import { menus, between, endOfFrame } from './clock_menus.mjs';
export { between };

// clock_text.mjs reaches verify_text2.mjs and elf_words.mjs, which read process.argv[1] when they load;
// a process started with -e (the suite's probe discovery) has none.
process.argv[1] ??= '';
const { putString } = await import('./clock_text.mjs');

export { f, REG };

// Constants as the binary stores them (nearest singles).
const C01 = Math.fround(0.1), C09 = Math.fround(0.9), C099 = Math.fround(0.99), C095 = Math.fround(0.95);
const DEPTH_TO_SIZE = asFloat(0x36da1a93);
const RODS_SHOWN_ABOVE = Math.fround(0.05);

// ---- the clock's matrix routines ------------------------------------------------------------

const normalize = (v) => {
  const length = f(Math.sqrt(add(add(f(v[0] * v[0]), f(v[1] * v[1])), f(v[2] * v[2]))));
  const inverse = f(1 / length);
  return [f(v[0] * inverse), f(v[1] * inverse), f(v[2] * inverse)];
};
const dot = (a, b) => add(add(f(a[0] * b[0]), f(a[1] * b[1])), f(a[2] * b[2]));
const rotZ = (m, a) => { const c = cos(a), s = sin(a); return mul(m, [[c, s, 0, 0], [-s, c, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]); };
const rotY = (m, a) => { const c = cos(a), s = sin(a); return mul(m, [[c, 0, -s, 0], [0, 1, 0, 0], [s, 0, c, 0], [0, 0, 0, 1]]); };
const rotX = (m, a) => { const c = cos(a), s = sin(a); return mul(m, [[1, 0, 0, 0], [0, c, s, 0], [0, -s, c, 0], [0, 0, 0, 1]]); };
const move = (m, x, y, z) => [m[0], m[1], m[2], apply(m, [x, y, z, 1])];

const rodMatrix = (i, ring, spin) => {
  let m = rotY(rotZ(unit(), ring), spin);
  m = rotZ(m, s16(Math.trunc((i << 16) / 12) - 0x8000));
  m = move(m, 0, 20, 0);
  return rotY(m, s16(s16(spin) << 2));
};
const orbMatrix = (k, hourHand, secondHand, minuteTurn, secondsTurn, factor, radius) => {
  let m = rotZ(rotY(rotZ(unit(), hourHand), secondHand), -0x8000);
  m = rotY(m, s16(toInt(f(minuteTurn * factor))));
  m = rotX(m, s16(toInt(f((k + 0x15) * secondsTurn))));
  m = move(m, 0, radius, 0);
  return rotY(m, 0x2000);
};

// ---- the rod record and the transform --------------------------------------------------------

/** A rod record as plain values. */
export const readRod = (bytes) => ({
  number: bytes.readInt32LE(0), faces: bytes.readInt32LE(4), local: matrix(bytes, 0x20),
  sx: bytes.readFloatLE(0x68), sy: bytes.readFloatLE(0x6c), sz: bytes.readFloatLE(0x70),
  base: ints(bytes, 0x80), strength: bytes.readFloatLE(0x90), textured: ints(bytes, 0xa0),
  pair: [bytes.readFloatLE(0xb0), bytes.readFloatLE(0xb4)], refraction: bytes.readFloatLE(0xb8),
  reflection: ints(bytes, 0xc0), extra: ints(bytes, 0xd0),
});

/** HDD func_00237010: every face of the record's mesh through the two matrices. */
export function transform(rod, view, screen, mesh) {
  const M = rod.local.map((row) => apply(view, row));
  let centre = apply(screen, apply(M, [0, 0, 0, 1]));
  centre = centre.map((x) => f(x * f(1 / centre[3])));
  const out = { cx: sub(centre[0], 2048), cy: sub(centre[1], 2048), cz: centre[2], faces: [] };
  for (let i = 0; i < rod.faces; i++) {
    const face = { index: i, normal: apply(M, vector(mesh.normals, 16 * i)), vertices: [] };
    for (let k = 0; k < 4; k++) {
      const p = vector(mesh.positions, 64 * i + 16 * k);
      const eye = apply(M, [f(p[0] * rod.sx), f(p[1] * rod.sy), f(p[2] * rod.sz), 1]);
      let on = apply(screen, eye);
      const q = f(1 / on[3]);
      on = on.map((x) => f(x * q));
      const st = vector(mesh.coordinates, 64 * i + 16 * k);
      const whole = on.map((x) => toInt(x * 16));
      face.vertices.push({ eye, on, q, s: st[0], t: f(st[1] * rod.sy),
        xyz: BigInt.asUintN(64, BigInt(whole[0]) | (BigInt(whole[1]) << 16n) | (BigInt(whole[2]) << 32n)) });
    }
    const e2 = face.vertices[2].on.map((x, n) => sub(x, face.vertices[0].on[n]));
    const e1 = face.vertices[1].on.map((x, n) => sub(x, face.vertices[0].on[n]));
    face.flag = sub(f(e2[0] * e1[1]), f(e2[1] * e1[0])) > 0 ? 0 : 1;
    out.faces.push(face);
  }
  return out;
}

// ---- the emitters ---------------------------------------------------------------------------

const rgba = (c) => ((c[0] | (c[1] << 8) | (c[2] << 16) | (c[3] << 24)) >>> 0);

/** The edge term of a face: 1 - |eye direction . normal|. */
export const edgeTerm = (face) => { const d = dot(normalize(face.vertices[0].eye), face.normal); return sub(1, (d < 0 ? -d : d)); };

export function refracted(face, rod, cx, cy, extra, env) {
  const F = edgeTerm(face);
  let bright = toInt(f(f(f(f(f(rod.strength * 10) * F) * F) * F) * F));
  if (C09 < F) {
    const angle = s16(toInt(f(f(sub(1, F) * 32768) / C01)));
    bright = toInt(f(f(bright) * f(sub(1, cos(angle)) * 0.5)));
  }
  const channel = (base) => { const value = bright + base + extra; return value < 0x100 ? value : 0xff; };
  const colour = (channel(rod.base[0]) | (channel(rod.base[1]) << 8) | (channel(rod.base[2]) << 16) | 0x80000000) >>> 0;
  // The face's header: ROM 2.30 fills its two spare slots with CLAMP_1 0x1000000; HDD OSD has one
  // slot and writes the region clamp of the screen in it.
  const region = 0xan | (big(env.width - 1) << 14n) | (big(env.height - 1) << 34n);
  const writes = env.hdd ? [[REG.PRIM, C099 < F ? 0x114n : 0x194n], [REG.CLAMP, region], [REG.RGBAQ, big(colour)]]
    : [[REG.PRIM, C099 < F ? 0x114n : 0x194n], [REG.CLAMP, 0x1000000n], [REG.CLAMP, 0x1000000n], [REG.RGBAQ, big(colour)]];
  const halfW = f(Math.trunc(env.width / 2)), halfH = f(Math.trunc(env.height / 2));
  const half = f(f(env.field) * f(0.5));
  for (const vertex of face.vertices) {
    const push = f(f(f(face.normal[0] * 1000) * vertex.q) * rod.refraction);
    const u = sub(add(f(sub(sub(vertex.on[0], 2048), cx) * C095), cx), push);
    const lift = f(f(f(face.normal[1] * 500) * vertex.q) * rod.refraction);
    const v = sub(add(f(sub(sub(vertex.on[1], 2048), cy) * C095), cy), lift);
    let ui, vi;
    if (env.hdd) {
      // HDD OSD clamps the 12.4 integers to the screen; ROM 2.30 adds 1024 and 256 instead.
      const clampTo = (value, top) => Math.min(Math.max(value, 0), top);
      ui = clampTo(toInt(f(add(halfW, u) * 16)), env.width * 16);
      vi = clampTo(toInt(f(sub(add(halfH, v), half) * 16)), env.height * 16);
    } else {
      const wrapped = add(add(halfW, u), 1024);
      ui = toInt(f((wrapped < 1024 ? 1024 : wrapped) * 16));
      vi = toInt(f(sub(add(add(halfH, v), 256), half) * 16));
    }
    writes.push([REG.UV, BigInt.asUintN(64, BigInt(ui) | (BigInt(vi) << 16n))], [REG.XYZF2, vertex.xyz]);
  }
  return writes;
}

export function textured(face, colour, ds, dt) {
  const writes = [[REG.PRIM, 0x54n], [REG.CLAMP, 0x1000000n]];
  for (const vertex of face.vertices) {
    const s = f(add(vertex.s, ds) * vertex.q);
    const t = f(add(vertex.t, dt) * vertex.q);
    writes.push([REG.ST, BigInt(floatBits(s)) | (BigInt(floatBits(t)) << 32n)], [REG.RGBAQ, BigInt(rgba(colour)) | (BigInt(floatBits(vertex.q)) << 32n)], [REG.XYZF2, vertex.xyz]);
  }
  return writes;
}

export function reflected(face, colour, prim = 0x114n) {
  const writes = [[REG.PRIM, prim], [REG.RGBAQ, BigInt(rgba(colour))]];
  for (const vertex of face.vertices) {
    const eye = normalize(vertex.eye);
    const d = dot(eye, face.normal);
    const twice = add(d, d);
    const amount = twice < 0 ? -twice : twice;
    const r = [0, 1].map((i) => add(eye[i], f(face.normal[i] * amount)));
    const u = toUnsigned(f(add(r[0], 1) * 512)), v = toUnsigned(f(add(r[1], 1) * 256));
    writes.push([REG.UV, BigInt(u) | (BigInt(v) << 16n)], [REG.XYZF2, vertex.xyz]);
  }
  return writes;
}

// ---- GS state, as each build sends it -------------------------------------------------------

const TEXA = 0x810000807fn;
const tex0 = (tbp, tbw, psm, tw, th) => big(tbp) | (big(tbw) << 14n) | (big(psm) << 20n) | (big(tw) << 26n) | (big(th) << 30n) | (1n << 34n);
const offsetOf = (env, field) => big((0x800 - (env.width >> 1)) << 4) | (big(((0x800 - (env.height >> 1)) << 4) + (field ? 8 : 0)) << 32n);

/** `env`: { hdd, width, height, field, display (the 0x230 bytes, written through), displayIndex }. */
export function stateWriters(env) {
  // Region clamp to the screen, 0..W-1 and 0..H-1.
  const region = 0xan | (big(env.width - 1) << 14n) | (big(env.height - 1) << 34n);
  const blend = (mode, ztst) => ({ kind: 'state', label: 'blend and depth test',
    writes: [[REG.TEST, 0x10000n | (big(ztst) << 17n)], [REG.ALPHA, [0x48n, 0x44n, 0x42n, (0x28n << 32n) | 0x64n, 0x68n][mode] ?? 0x44n]] });
  // Texture n of the clock: the first sits at width x height x 5 words, the others follow.
  const bind = (n, blended, ztst) => {
    let words = env.width * env.height * 5;
    for (let i = 0; i < n; i++) words += i === 1 ? 128 * 128 : 64 * 64;
    const log = n === 1 ? 7 : 6;
    return { kind: 'state', label: 'bind a loaded texture', writes: [[REG.TEST, (env.hdd ? 0x10000n : 0x30000n) | (big(ztst) << 17n)], [REG.ALPHA, blended ? 0x48n : 0x44n], [REG.PABE, 0n],
      [REG.TEXA, TEXA], [REG.FBA, 0n], [REG.TEXFLUSH, 0n], [REG.TEX1, 0x61n], [REG.TEX0, tex0(words >> 6, (1 << log) >> 6, 0, log, log)], [REG.CLAMP, env.hdd ? 5n : 0n]] };
  };
  const buffer = (which) => {
    const tbp = which & 1 ? (env.width * env.height) >> 4 : (3 * env.width * env.height) >> 6;
    return { kind: 'state', label: 'bind a work buffer', writes: [[REG.TEST, env.hdd ? 0x50000n : 0x70000n], [REG.ALPHA, 0x44n], [REG.PABE, 0n], [REG.TEXA, TEXA], [REG.FBA, 0n],
      [env.hdd ? REG.TEXFLUSH : REG.UNKNOWN_7F, 0n], [REG.TEX1, 0x61n], [REG.TEX0, tex0(tbp, env.width >> 6, 0, 10, 8)], [REG.CLAMP, env.hdd ? region : 5n]] };
  };
  // The frame being drawn, as a 24-bit texture (HDD func_00233F48, ROM 0x002305F0).
  const frameTexture = () => {
    const tbp = env.displayIndex === 0 ? (env.width * env.height) >> 6 : 0;
    return { kind: 'state', label: 'bind the frame', writes: [[REG.TEST, env.hdd ? 0x50000n : 0x70000n], [REG.ALPHA, 0x44n], [REG.PABE, 0n], [REG.TEXA, TEXA], [REG.FBA, 0n],
      [env.hdd ? REG.TEXFLUSH : REG.UNKNOWN_7F, 0n], [REG.TEX1, 0x61n], [REG.TEX0, tex0(tbp, env.width >> 6, 1, 10, 8)], [REG.CLAMP, env.hdd ? region : 0n]] };
  };
  // The depth buffer follows the frame buffers (sceGszbufaddr): 0x8C at 640 x 224, 0xA0 at 640 x 256.
  const zbuf = big(((env.width + 63) >> 6) * ((env.height + 31) >> 5) * 2);
  const work = (target, clear, field) => {
    const fbp = target & 1 ? (env.width * env.height) >> 9 : (3 * env.width * env.height) >> 11;
    const writes = [[REG.FRAME, big(fbp) | (big((env.width + 63) >> 6) << 16n)], [REG.ZBUF, zbuf], [REG.XYOFFSET, offsetOf(env, field)],
      [REG.SCISSOR, (big(env.width - 1) << 16n) | (big(env.height - 1) << 48n)], [REG.PRMODECONT, 1n], [REG.COLCLAMP, 1n], [REG.DTHE, 0n], [REG.TEST, 0x50000n]];
    if (clear) {
      const x = (0x800 - (env.width >> 1)) << 4, y = (0x800 - (env.height >> 1)) << 4;
      writes.push([REG.TEST, 0x30000n], [REG.PRIM, 6n], [REG.RGBAQ, BigInt(rgba(clear)) | (0x3f800000n << 32n)], [REG.XYZ2, big(x) | (big(y) << 16n)],
        [REG.XYZ2, big(x + (env.width << 4)) | (big(y + (env.height << 4)) << 16n)], [REG.TEST, 0x50000n]);
    }
    return { kind: 'state', label: 'draw to a work buffer', writes };
  };
  // The display's environments were built when the buffers were set up. Each call writes the
  // offset into the chosen one; a clear colour is written into the second one's clear, whichever
  // is chosen, and the clear's six registers are sent after the environment's eight.
  const display = (clear, field) => {
    const at = env.displayIndex ? 0x140 : 0x50;
    if (clear) env.display.writeBigUInt64LE(big(clear.readInt32LE(0)) | (big(clear.readInt32LE(4)) << 8n) | (big(clear.readInt32LE(8)) << 16n) | (big(clear.readInt32LE(12)) << 24n) | (0x3f800000n << 32n), 0x1f0);
    env.display.writeBigUInt64LE(offsetOf(env, field), at + 0x10 + 2 * 16);
    const writes = [];
    for (let i = 0; i < (clear ? 14 : 8); i++) writes.push([Number(env.display.readBigUInt64LE(at + 0x18 + i * 16) & 0xffn), env.display.readBigUInt64LE(at + 0x10 + i * 16)]);
    return { kind: 'state', label: clear ? 'draw to the display, with the clear' : 'draw to the display', writes };
  };
  const sprite = (label, rect) => {
    const ox = (0x800 - (env.width >> 1)) << 4, oy = (0x800 - (env.height >> 1)) << 4;
    const corner = (x, y) => big((x + ox) & 0xffff) | (big((y + oy) & 0xffff) << 16n) | (big(rect.z) << 32n);
    return [
      { kind: 'vertex', label, writes: [[REG.PRIM, big(6 | (rect.textured << 4) | (rect.blended << 6) | (1 << 8))], [REG.RGBAQ, BigInt(rgba(rect.colour)) | (0x3f800000n << 32n)]] },
      { kind: 'vertex', label, writes: [[REG.UV, big(rect.u0 & 0xffff) | (big(rect.v0 & 0xffff) << 16n)], [REG.XYZF2, corner(rect.x0, rect.y0)],
        [REG.UV, big(rect.u1 & 0xffff) | (big(rect.v1 & 0xffff) << 16n)], [REG.XYZF2, corner(rect.x1, rect.y1)]] },
    ];
  };
  return { blend, bind, buffer, frameTexture, work, display, sprite };
}

// ---- rods, orbs and the two extra passes (HDD module_clock_22FE98) ---------------------------

/**
 * Reads and writes the memory in place: the rod template, the orb rings, the sprites' fade ramp
 * and the eased fraction are left as the program leaves them. Returns the draw order.
 */
export function scene(ctx, view, screen, mesh) {
  const { m, hdd, gs, send, env, notes } = ctx;
  const state = m.at('state');
  const time = m.at('time'), eased = m.at('eased');

  // The draw list: nodes in descending order of the depth of their origin; a new node goes in
  // front of the first one that is not deeper than it.
  const list = [];
  const insert = (node) => {
    node.key = apply(view, node.rod.local[3])[2];
    let at = 0;
    while (at < list.length && node.key < list[at].key) at += 1;
    list.splice(at, 0, node);
  };

  const template = m.at('template');
  const current = state.readInt32LE(0);
  const put = (rows) => rows.flat().forEach((x, i) => template.writeFloatLE(x, 0x20 + i * 4));
  if (RODS_SHOWN_ABOVE < state.readFloatLE(0x10)) {
    for (let i = 0; i < 12; i++) {
      const number = ((i + current) >>> 0) % 12;
      put(rodMatrix(i, state.readInt16LE(6), state.readInt16LE(4)));
      template.writeInt32LE(number, 0);
      template.writeFloatLE(state.readFloatLE(0x10 + number * 0x30), 0x6c);
      state.copy(template, 0x80, 0x20 + number * 0x30, 0x30 + number * 0x30);
      state.copy(template, 0xc0, 0x30 + number * 0x30, 0x40 + number * 0x30);
      template.writeFloatLE(i === 0 ? 200 : 160, 0x90);
      insert({ kind: 'rod', rod: readRod(template), t: i === 0 ? state.readFloatLE(0x14 + number * 0x30) : -1, n: i === 0 ? 100 : 0,
        colour: ints(state, 0x250), extra: ints(state, 0x260) });
    }
  }

  // The orbs.
  const seconds = add(time.readInt32LE(4), f(time.readFloatLE(0) / 1000));
  const minutes = add(time.readInt32LE(8), f(seconds / 60));
  const secondsTurn = f(f(seconds * 65536) / 60), minuteTurn = f(f(minutes * 65536) / 60);
  const fraction = eased.readFloatLE(8);
  const radius = f(add(f(fraction * 7.25), 10) * m.float('scene', 0));
  // The fraction eases toward one less the progress copy (HDD module_clock_22F760).
  eased.writeFloatLE(add(f(sub(sub(1, eased.readFloatLE(4)), fraction) * m.float('orbConstants', 4)), fraction), 8);
  for (let k = 0; k < 7; k++) {
    put(orbMatrix(k, eased.readInt16LE(2), eased.readInt16LE(0), minuteTurn, secondsTurn, m.float('orbConstants', 0), radius));
    insert({ kind: 'orb', rod: readRod(template), k });
  }
  // While the overlay mode is 2 or 3 the orbs come in from, or leave toward, a random direction and
  // take a colour of their own (HDD module_clock_22F908): mode 2 every orb when the clock was
  // entered from the opening, else orb 0; mode 3 orb 0.
  const mode = m.int('mode');
  const modes = mode === 2 || mode === 3;
  if (modes && !(m.has('orbRandom') && m.has('orbColours') && m.has('wide') && m.has('overlayLevel'))) notes.push(`orb mode ${mode}: the snapshot lacks what the orbs' motion and colours need`);
  const halfOf = (n) => (n + (n >>> 31)) >> 1;
  const orbEntry = (k, x, y, base) => {
    if (!modes || !m.has('orbRandom') || !m.has('orbColours') || !m.has('wide')) return { x, y, colour: base };
    const weight = m.int('overlayLevel');
    const moved = (mode === 2 && (m.int('wide') === 1 || k === 0)) || (mode === 3 && k === 0);
    if (moved) {
      const a = s16(toInt(f(Math.fround(weight << 14) * 0.0078125)));
      const s = s16(m.at('orbRandom').readInt32LE(k * 4));
      const rest = sub(1, sin(a));
      const dx = f(f(halfOf(env.width) * cos(s)) * rest), dy = f(f(halfOf(env.height) * sin(s)) * rest);
      if (mode === 2) { x = add(x, dx); y = add(y, dy); }
      else {
        const w = f(weight * 0.0078125);
        const fy = f(dy * 1.5), fx = f(dx * 1.5);
        y = add(f(y * w), fy);
        x = add(f(x * w), fx);
      }
    }
    const own = mode === 2 || k === 0 ? 128 - weight : 0;
    const other = mode === 2 || k === 0 ? weight : 128;
    const mine = m.at('orbColours');
    return { x, y, colour: base.map((c, i) => (Math.imul(mine.readInt32LE((mode === 3 ? 0 : k) * 16 + i * 4), own) + Math.imul(c, other)) >> 7) };
  };

  const rings = m.at('rings');
  const fade = m.at('spriteFade');

  // ---- a rod ----
  const pieces = (node, change) => {
    const whole = transform(node.rod, view, screen, mesh);
    const centre = { cx: f(whole.cx * C09), cy: f(whole.cy * C09) };
    if (!(node.t > 0)) return { centre, sets: [{ rod: node.rod, faces: whole.faces, lift: 0 }] };
    const s = node.rod.sy;
    const a = change({ ...node.rod, sy: f(node.t * s) }, 'A');
    const moved = [...node.rod.local.slice(0, 3), apply(node.rod.local, [0, f(f(s * 26) * node.t), 0, 1])];
    const b = change({ ...node.rod, sy: f(sub(1, node.t) * s), local: moved }, 'B');
    const twice = add(f(node.t * s), f(node.t * s));
    return { centre, sets: [
      { rod: a, faces: transform(a, view, screen, mesh).faces.filter((face) => face.index >= 8), lift: 0 },
      { rod: b, faces: transform(b, view, screen, mesh).faces.filter((face) => face.index !== 8 && face.index !== 9), lift: twice },
    ] };
  };
  const offsets = (rod, face, lift, paired) => {
    const stepped = add(f(rod.number * C01), f(face.index * C01));
    if (!paired) return [stepped, lift ? add(stepped, lift) : stepped];
    return [add(stepped, rod.pair[0]), lift ? add(add(stepped, rod.pair[1]), lift) : add(stepped, rod.pair[1])];
  };
  const vertices = (label, sets, side, emit) => ({ kind: 'vertex', label,
    writes: sets.flatMap((set) => set.faces.filter((face) => (face.flag !== 0) === side).flatMap((face) => emit(set, face))) });

  const drawRod = (node) => {
    if (node.rod.sy < 0) return;
    const { centre, sets } = pieces(node, (rod, piece) => (piece === 'A' ? { ...rod, strength: node.n, base: node.colour } : rod));
    const bent = (label, side, extra) => vertices(label, sets, side, (set, face) => refracted(face, set.rod, centre.cx, centre.cy, extra, env));
    // ROM 2.30 sends the grain of a split rod one face to a packet, piece A's faces and then
    // piece B's; HDD OSD sends them all in one. A whole rod's grain is one packet on both.
    const grain = (label, paired) => {
      const emit = (set, face) => textured(face, set.rod.textured, ...offsets(set.rod, face, set.lift, paired));
      if (sets.length === 1 || hdd) return vertices(label, sets, false, emit);
      return sets.flatMap((set) => set.faces.filter((face) => face.flag === 0).map((face) => ({ kind: 'vertex', label, writes: emit(set, face) })));
    };
    send(gs.buffer(0), gs.work(1, null, env.field), gs.blend(1, 1), bent('rod: refracted, far side', false, 0));
    send(gs.bind(2, 1, 2), gs.blend(2, 2), grain('rod: grain, subtracted', false));
    send(gs.blend(0, 2), grain('rod: grain, added', true));
    send(gs.buffer(1), gs.display(null, env.field), gs.blend(1, 2), bent('rod: refracted, near side, to the frame', true, 0));
    send(gs.buffer(1), gs.work(0, null, env.field), gs.blend(1, 2), bent('rod: refracted, near side, to the refraction buffer', true, 0xff));
  };

  // ---- an orb ----
  const drawOrb = (node) => {
    // The fade ramp of the sprites steps once per orb.
    tickRamp(fade);
    const faded = (alpha) => Math.trunc((fade.readInt32LE(4) * alpha) / fade.readInt32LE(0));

    const whole = transform({ ...node.rod, faces: 0 }, view, screen, mesh);
    const { x: px, y: py, colour } = orbEntry(node.k, whole.cx, whole.cy, ints(m.at('orbColour')));
    // The ring: the head is rewritten every frame; every third frame it moves on.
    const ring = rings.subarray(node.k * 0x650, (node.k + 1) * 0x650);
    let head = ring.readInt32LE(0);
    const write = () => {
      // The program copies four words; the fourth is a word of its stack that nothing sets.
      [px, py, whole.cz].forEach((x, i) => ring.writeFloatLE(x, 0x10 + head * 0x20 + i * 4));
      colour.forEach((c, i) => ring.writeInt32LE(c, 0x20 + head * 0x20 + i * 4));
    };
    write();
    const count = ring.readInt32LE(4) + 1;
    ring.writeInt32LE(count, 4);
    if (count === 3) {
      ring.writeInt32LE(0, 4);
      head += 1;
      if (head === 50) { head = 0; ring.writeInt32LE(1, 8); }
      ring.writeInt32LE(head, 0);
      write();
    }

    // The trail.
    const full = ring.readInt32LE(8) !== 0;
    const points = full ? 49 : Math.max(0, head - 1);
    const trail = [];
    const shift = (value, by) => (value < 0 ? value + (1 << by) - 1 : value) >> by;
    for (let i = 0; i < points; i++) {
      const entry = 0x10 + (full ? (head + 100 - i) % 50 : head - i) * 0x20;
      const step = full ? i : Math.trunc((i * 50) / (head - 1));
      let t = toInt(sub(128, f(step * 3)));
      if (t < 0) t = 0;
      const [r, g, b] = [0x10, 0x14, 0x18].map((o) => ring.readInt32LE(entry + o));
      const red = shift(Math.imul(shift(Math.imul(shift(Math.imul(Math.imul(r, t), t), 7), t), 7), t), 14);
      const green = shift(Math.imul(Math.imul(g, t), t), 14);
      const blue = shift(Math.imul(b, t), 7);
      const x = toInt(f(add(ring.readFloatLE(entry), 2048) * 16)), y = toInt(f(add(ring.readFloatLE(entry + 4), 2048) * 16)), z = toInt(f(ring.readFloatLE(entry + 8) * 16));
      trail.push([REG.RGBAQ, BigInt.asUintN(64, BigInt(red) | (BigInt(green) << 8n) | (BigInt(blue) << 16n) | (BigInt(t >> 1) << 24n) | (0xfe00n << 42n))],
        [REG.XYZF2, BigInt.asUintN(64, BigInt(x) | (BigInt(y) << 16n) | (BigInt(z) << 32n))]);
    }
    // The header's alpha goes through the sprites' fade ramp too.
    const strip = [{ kind: 'vertex', label: 'orb: trail header', writes: [[REG.PRIM, 0x82n], [REG.RGBAQ, (big(faded(0x80)) << 24n) | (0xfe00n << 42n)]] },
      { kind: 'vertex', label: 'orb: trail', writes: trail }];

    // The two sprites at the head.
    const entry = 0x10 + head * 0x20;
    const [x, y, z] = [0, 4, 8].map((o) => ring.readFloatLE(entry + o));
    const [r, g, b, a] = [0x10, 0x14, 0x18, 0x1c].map((o) => ring.readInt32LE(entry + o));
    const size = f(z * DEPTH_TO_SIZE);
    const halfW = Math.trunc(env.width / 2), halfH = Math.trunc(env.height / 2);
    const rect = (factor, c) => {
      const hw = f(size * factor), hh = f(hw * 0.5);
      const at = (centre, delta, middle) => toInt(f(add(add(centre, delta), middle) * 16));
      return { colour: c, x0: at(x, -hw, halfW), y0: at(y, -hh, halfH), x1: at(x, hw, halfW), y1: at(y, hh, halfH), u0: 0, v0: 0, u1: 0x3f0, v1: 0x3f0, z: 0, blended: 1, textured: 1 };
    };
    const head2 = (first, second) => [gs.bind(7, 1, 1), gs.sprite('orb: glow', rect(30, first)), gs.bind(6, 1, 1), gs.sprite('orb: disc', rect(4.5, second))];
    send(gs.display(null, env.field), gs.blend(0, 3), strip, head2([r, g, b, faded(a)], [0x80, 0x80, 0x80, faded(0x80)]));
    send(gs.work(0, null, env.field), gs.blend(0, 3), strip, head2([r, g, b, faded(0x80)], [0xff, 0xff, 0xff, faded(0x80)]));
  };

  for (const node of list) (node.kind === 'orb' ? drawOrb : drawRod)(node);

  // ---- the two extra passes ----
  const extra = (node, pass) => {
    if (node.rod.sy < 0) return;
    const split = node.t > 0;
    const { sets } = pieces(node, (rod) => ({ ...rod, reflection: node.extra }));
    const mirror = vertices('extra pass: reflection', sets, true, (set, face) => reflected(face, set.rod.reflection));
    const grain = vertices('extra pass: grain', sets, true, (set, face) => textured(face, set.rod.extra, ...offsets(set.rod, face, set.lift, pass !== 0)));
    if (split) send(gs.blend(0, 1), gs.bind(0, 0, 2), mirror);
    else send(gs.bind(0, 0, 2), gs.blend(1, 1), mirror);
    send(gs.bind((pass !== 0) === split ? 3 : 2, 1, 2), gs.blend(2, 1), grain);
  };
  for (const pass of [0, 1]) {
    send(gs.work(1, [0, 0, 0, 0x80], env.field));
    for (const node of list) if (node.kind === 'rod') extra(node, pass);
    send(gs.buffer(1), gs.display(null, 0), gs.blend(0, 1),
      gs.sprite('extra pass: added to the frame', { colour: [0x80, 0x80, 0x80, 30], x0: 0, y0: 0, x1: env.width << 4, y1: env.height << 4, u0: 8, v0: 8,
        u1: (env.width << 4) + 8, v1: (env.height << 4) + 8, z: 0, blended: 1, textured: 1 }));
  }
  return list.map((node) => (node.kind === 'orb' ? `orb ${node.k}` : `rod ${node.rod.number}`));
}

// ---- the frame ------------------------------------------------------------------------------

/** What every part of the frame works with. */
function context(m, mesh) {
  const hdd = m.build === 'hdd';
  const screen = m.at('screen');
  const env = { hdd, width: screen.readInt32LE(0), height: screen.readInt32LE(4), field: m.int('scene', 8), display: m.at('display'), displayIndex: m.int('index') };
  const packets = [], notes = [];
  return { m, hdd, w: env.width, h: env.height, env, gs: stateWriters(env), packets, notes, mesh, send: (...list) => packets.push(...list.flat(Infinity)),
    parts: { readRod, transform, refracted, textured, reflected, edgeTerm } };
}

/**
 * The text a part of the frame function draws (HDD OSD 1.10U, font library of clock_text.mjs): the
 * strings the caller handed the font code, in order, run through the model with the library's
 * context carried from one string, and one frame, to the next. `snapshot.text` is { state, strings:
 * { pages, text, hint } } and its `state` is replaced by the one the strings leave. Without it, or
 * on ROM 2.30 (whose font code the model does not have), the packets of the part are a gap.
 */
function text(ctx, snapshot, key, label) {
  const held = snapshot.text;
  if (!ctx.hdd || !held?.strings[key]) { ctx.packets.push({ gap: label }); return; }
  let state = held.state;
  for (const string of held.strings[key]) {
    const out = putString(state, string.text, string.own, string.measuring);
    state = out.state;
    // The program sends packets that are not text between the strings (button panels, a colour state);
    // the string says where in the capture it starts, so that the comparison skips them.
    if (out.packets.length && string.at !== undefined) ctx.packets.push({ gap: `${label}, not text`, to: string.at });
    for (const p of out.packets) ctx.packets.push({ kind: 'text', label: p.kind, bytes: p.bytes, picture: p.kind === 'picture' ? { at: p.pictureAt, written: p.written, size: p.pictureBytes } : null, string: string.text.toString('latin1') });
  }
  held.state = state;
  ctx.packets.push({ gap: `${label}, not text` });
}

/**
 * One frame. `snapshot`:
 *   memory   a Memory (clock_memory.mjs) holding the clock's state at the frame function's entry;
 *            it is written in place and holds the next frame's state when this returns
 *   view, screen   optional: use these matrices and produce only the rods, orbs and extra passes
 *                  (for a capture that probed nothing else)
 *   events   optional: called with the memory when the pages function is done, to write into it
 *   text     optional, HDD OSD: the strings of the frame and the font state (see `text`)
 *            what the menus' code, which the model does not have, changed in this frame
 * `mesh`: the rod's positions, normals, coordinates as Buffers; `mesh.cube` the cube's, when the
 * cubes of System Configuration are wanted.
 *
 * Returns { packets, order, notes, view, screen }. A packet is { kind, label, writes }. Between
 * them: { mark } where a part of the frame function starts (head, rods, overlay, pages, bars, text,
 * hint, column), and { gap } where the program sends packets this model does not produce (text);
 * a gap runs to the next mark.
 */
export function frame(snapshot, mesh) {
  const ctx = context(snapshot.memory, mesh);
  const { m, hdd, packets, notes } = ctx;
  if (snapshot.view) return { packets, order: scene(ctx, snapshot.view, snapshot.screen, mesh), notes };

  const { view, screen } = camera(m);
  const part = (name) => packets.push({ mark: name });
  part('head');
  head(ctx, view, screen);
  part('rods');
  const order = scene(ctx, view, screen, mesh);
  part('overlay');
  overlay(ctx);
  // The pages function: the trips after the rods, the cubes of System Configuration, then the menus.
  part('pages');
  tripsAfter(ctx);
  cubes(ctx);
  menuStep(m, hdd);
  // The menus' own code: the main menu, System Configuration and its list.
  menus(m, notes);
  // Whatever the model does not have of the menus, taken from the capture when asked for.
  snapshot.events?.(m);
  text(ctx, snapshot, 'pages', 'menu pages and their text');
  part('bars');
  bars(ctx);
  part('text');
  text(ctx, snapshot, 'text', 'date and time');
  part('hint');
  text(ctx, snapshot, 'hint', 'button hint');
  part('column');
  column(ctx);
  // State only, from here on.
  logic(m);
  scale(m, hdd);
  blurLevel(m, hdd);
  m.setInt('counter', m.int('counter') + 1);
  overlayStep(m);
  endOfFrame(m);
  return { packets, order, notes, view, screen };
}
