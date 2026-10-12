// Recompute the cubes of System Configuration - the refracting blocks beside the list - from the
// inputs the code really got, and compare with what it really wrote and sent. The addresses in
// this list are HDD OSD 1.10U's; ROM 2.30's are in the table below.
//
//   pass      0x002308F0  which six list places are drawn, each one's colour, scale and layer alpha
//   scroll    0x00230550  the list position moving toward its target; 0x00230860 asks for a move
//   place     0x002306B0  one cube's matrix from its list place
//   standing  ROM 2.30 only (0x0022C3D8): with fewer than six entries the cubes stand still, one per entry
//   draw      0x00237350  one cube: eight sends      layer  0x00237860  one cube in the highlight layer: two sends
//   emitters  refracted 0x002365D0, textured 0x00236A20, reflection 0x00236E20,
//             edge colour 0x00236D90, depth quad 0x00236B30, alpha quad 0x00236BC8
//
// node verify_cubes.mjs <trace.jsonl>          (CLOCK_BUILD=hdd for HDD OSD 1.10U)
// Capture with PROBES on the System Configuration screen; hold up or down for the list moving.
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { GifPath } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/gif.js';
import { REG } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/registers.js';
import { pick, range, pc, BUILD_NAME } from './builds.mjs';
import { expectFace } from './verify_refraction.mjs';
import { expectReflected, edgeTerm } from './verify_reflection.mjs';

const A = pick({
  hdd: {
    pass: 0x002308f0, scroll: 0x00230550, ask: 0x00230860, place: 0x002306b0, beforeCos: 0x002307b0, afterCos: 0x002307b8, move: 0x0023a3c0,
    draw: [0x00237350, 0x00237860], layer: [0x00237860, 0x00237a28], transform: 0x00237010,
    refracted: 0x002365d0, afterG: 0x00236678, textured: 0x00236a20, reflected: 0x00236e20, edge: 0x00236d90, depth: 0x00236b30, alpha: 0x00236bc8,
    ramp: 0x002b5740, list: 0x003702a8, spin: 0x00370290, colours: 0x002b5750, record: 0x002b5af0, sine: 0x0040eaa0, field: 0x002b2178, screen: 0x001f0cb4,
    rampLength: 0x24, fixed: null, depthQuad: { prim: 0xc4, rgbaq: 0x03f8000020000000n },
  },
  rom: {
    pass: 0x0022c8d0, scroll: 0x0022c528, ask: 0x0022c840, place: 0x0022c690, beforeCos: 0x0022c790, afterCos: 0x0022c798, move: 0x00236a28,
    draw: [0x00233928, 0x00233dd8], layer: [0x00233dd8, 0x00233f60], transform: 0x002335e8,
    refracted: 0x002329f8, afterG: 0x00232aa4, textured: 0x00232e38, reflected: 0x002333b8, edge: 0x00233328, depth: 0x00232f80, alpha: 0x00233070,
    ramp: 0x00296700, list: 0x002c88c0, spin: 0x002c88a8, colours: 0x00296710, record: 0x00296ab0, sine: 0x0037aa70, field: 0x0028a348, screen: 0x001f0c50,
    rampLength: 0x30, fixed: { update: 0x0022c3d8, table: 0x00296b90, menu: 0x0028aff0, count: 0x18 }, depthQuad: { prim: 0x84, rgbaq: 0x03f8000080000000n },
  },
});
const LIST = { pulse: 0x00, pulsed: 0x04, position: 0x08, left: 0x0c, speed: 0x10, slowing: 0x14, rampLength: A.rampLength };
const CENTRE = 0.35;

export const PROBES = [
  { pc: pc(A.pass), ranges: [range(A.ramp, 0x10), range(A.list, 0x34), range(A.spin, 0x4), range(A.colours, 0x30), range(A.fixed ? A.fixed.table : A.record, 0xf0)] },
  // The sine table, once a pass; a probe takes eight ranges at most, so it has one of its own on the next instruction.
  { pc: pc(A.pass + 4), ranges: [...[0, 1, 2, 3].map((n) => range(A.sine + n * 0x4000, 0x4000)), range(A.sine + 0x10000, 0x4)] },
  { pc: pc(A.scroll), ranges: [range(A.list, 0x34)] },
  { pc: pc(A.ask), ranges: [range(A.list, 0x34), range(A.screen, 0x8)] },
  { pc: pc(A.place), ranges: [] },
  ...(A.fixed ? [{ pc: pc(A.fixed.update), ranges: [range(A.fixed.table, 0xf0), range(A.fixed.menu + 0x10, 0x4), range(A.colours, 0x30)] }] : []),
  { pc: pc(A.beforeCos), ranges: [] },
  { pc: pc(A.afterCos), ranges: [] },
  { pc: pc(A.move), ranges: ['a0:0x10'] },
  { pc: pc(A.draw[0]), ranges: ['a0:0xe0'] },
  { pc: pc(A.layer[0]), ranges: ['a0:0xe0'] },
  { pc: pc(A.transform), ranges: ['t0:0xe0', '*t0+0x64:0x40', '*t0+0x60:0x40', '*t0+0x8:0x400', '*t0+0xc:0x100', '*t0+0x10:0x400'] },
  { pc: pc(A.refracted), ranges: ['v0:0x20', '*v0+0x4:0xc0', '*v0+0x10:0x160', range(A.field, 4), range(A.screen, 8)] },
  { pc: pc(A.afterG), ranges: [] },
  { pc: pc(A.textured), ranges: ['a0:0x160', 'a1:0x10'] },
  { pc: pc(A.reflected), ranges: ['a0:0x160', 'a1:0xd0'] },
  { pc: pc(A.edge), ranges: ['a0:0x160', 'a1:0xd0'] },
  { pc: pc(A.depth), ranges: ['a0:0x160'] },
  { pc: pc(A.alpha), ranges: ['a0:0x160'] },
];

const bits = new DataView(new ArrayBuffer(4));
const near = Math.fround;
/** One single-precision operation cut toward zero. */
const f = (x) => {
  const rounded = Math.fround(x);
  if (Math.abs(rounded) <= Math.abs(x) || !Number.isFinite(rounded)) return rounded;
  bits.setFloat32(0, rounded);
  bits.setUint32(0, bits.getUint32(0) - 1);
  return bits.getFloat32(0);
};
const floatBits = (x) => { bits.setFloat32(0, x); return bits.getUint32(0); };
const asFloat = (u32) => { bits.setUint32(0, u32 >>> 0); return bits.getFloat32(0); };
const toInt = (x) => (x >= 2147483647 ? 2147483647 : x <= -2147483648 ? -2147483648 : Math.trunc(x));
const s16 = (x) => (x << 16) >> 16;
const vector = (buffer, at) => [0, 4, 8, 12].map((k) => buffer.readFloatLE(at + k));
const matrix = (buffer, at) => [0, 16, 32, 48].map((k) => vector(buffer, at + k));
const sameFloats = (values, buffer, at) => values.every((x, i) => floatBits(x) === buffer.readUInt32LE(at + 4 * i));
const apply = (m, v) => [0, 1, 2, 3].map((i) => f(f(f(f(m[0][i] * v[0]) + f(m[1][i] * v[1])) + f(m[2][i] * v[2])) + f(m[3][i] * v[3])));
const mul = (a, b) => b.map((row) => apply(a, row));
/** VU0 has no denormals: a product that small is zero. Needed where a stack word that is not a float goes through a matrix. */
const flushed = (x) => (Math.abs(x) < 1.1754943508222875e-38 ? 0 : x);
const unit = () => [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
const xyzOf = (face, k, lift = 0) => BigInt.asUintN(64, BigInt(face.readInt32LE(k * 0x50 + 0x30)) | (BigInt(face.readInt32LE(k * 0x50 + 0x34)) << 16n) | (BigInt((face.readInt32LE(k * 0x50 + 0x38) + lift) | 0) << 32n));

// ---- the list position ----------------------------------------------------------------------

const STEP = 3000;                 // one list place
const TURN = 60 * STEP;            // the position wraps after sixty places
/** `x mod m` with the result in 0..m-1, written the way the code does it. */
const wrap = (x, m) => { const lifted = x >= 0 ? x : x + 1 - m; return x - (lifted - (lifted % m)); };
const div = (a, b) => Math.trunc(a / b);

/** `module_clock_230550`: one frame of the list position moving to its target, and the pulse dying down. */
export function scrollStep(list) {
  let left = list.left, speed = list.speed;
  let step;
  if (!(speed < Math.abs(left))) { step = left; speed = 0; }
  else {
    const slower = speed - list.slowing;
    step = left > -1 ? speed : -speed;
    speed = slower > 0 ? slower : 1;
  }
  return { ...list, left: left - step, speed, position: wrap(list.position + step, TURN), pulse: f(list.pulse * near(0.95)) };
}

/** `func_00230860(n)`: ask for a move of n places; `rate` is the frame rate the build takes (59.94, or 50 in PAL). */
export function askMove(list, n, rate) {
  const half = (toInt(rate) + (toInt(rate) < 0 ? 1 : 0)) >> 1;
  const left = list.left + n * STEP;
  const speed = div(Math.abs(left) * 2, half);
  return { ...list, left, speed, slowing: div(speed, half) };
}

const readList = (bytes) => ({
  count: A.fixed ? bytes.readInt32LE(A.fixed.count) : null,
  pulse: bytes.readFloatLE(LIST.pulse), pulsed: bytes.readInt32LE(LIST.pulsed), position: bytes.readInt32LE(LIST.position),
  left: bytes.readInt32LE(LIST.left), speed: bytes.readInt32LE(LIST.speed), slowing: bytes.readInt32LE(LIST.slowing), rampLength: bytes.readInt32LE(LIST.rampLength),
});
const sameList = (a, b) => floatBits(a.pulse) === floatBits(b.pulse) && ['pulsed', 'position', 'left', 'speed', 'slowing'].every((k) => a[k] === b[k]);

// ---- the pass: which cubes, their colour, scale and layer alpha ------------------------------

/** `module_clock_230600`: A and B mixed with weight w of 128, four ints, cut toward zero. */
const mix = (a, b, w) => a.map((x, i) => { const sum = x * w + b[i] * (128 - w); return (sum > -1 ? sum : sum + 127) >> 7; });

/** What `module_clock_2308F0` asks for: the cubes drawn, then the cubes of the highlight layer. */
export function pass({ ramp, list, selected, plain, fixed }) {
  if (ramp.state === 0) return { cubes: [], layer: [] };
  const scale = f(f(ramp.counter) / f(list.rampLength));
  if (fixed) {
    const cubes = fixed.map((entry, i) => ({ fixed: i, position: entry.position.map(asFloat), scale: f(scale + entry.pulse), colour: entry.colour }));
    return { cubes, layer: cubes.map((cube) => ({ ...cube, colour: undefined })) };
  }
  const whole = div(list.position, STEP), part = list.position % STEP;
  const cubes = [], layer = [];
  for (let slot = 0; slot < 6; slot++) {
    const place = wrap(whole + slot - 2, 60);
    const weight = div(part << 7, STEP);
    const colour = slot === 2 ? mix(selected, plain, 128 - weight) : slot === 3 ? mix(selected, plain, weight) : plain;
    cubes.push({ slot, place, scale, colour });
  }
  for (let slot = 0; slot < 6; slot++) {
    const away = Math.abs(-2 * STEP + slot * STEP - part) - 2 * STEP;
    const fade = div(away << 7, STEP);
    if (!(fade < 128)) continue;
    layer.push({ slot, place: wrap(whole + slot - 2, 60), scale, alpha: 128 - (fade > -1 ? fade : 0) });
  }
  return { cubes, layer };
}

// ---- ROM 2.30 with fewer than six entries: five cubes that stand still -----------------------

const readFixed = (bytes) => Array.from({ length: 5 }, (_, i) => ({
  position: [0, 4, 8, 12].map((k) => bytes.readUInt32LE(i * 0x30 + k)), colour: [0, 4, 8, 12].map((k) => bytes.readInt32LE(i * 0x30 + 0x10 + k)),
  pulse: bytes.readFloatLE(i * 0x30 + 0x20), glow: bytes.readInt32LE(i * 0x30 + 0x24),
}));
const sameFixed = (a, b) => a.every((entry, i) => entry.position.every((x, k) => x === b[i].position[k]) && entry.colour.every((x, k) => x === b[i].colour[k])
  && floatBits(entry.pulse) === floatBits(b[i].pulse) && entry.glow === b[i].glow);
/** The colour chase (`func_00238D00`): each channel one step toward its target, never past it. */
const chase = (from, to, step) => from.map((x, i) => {
  const target = to[i];
  if (x === target) return x;
  if (step === 1) return x < target ? x + 1 : x - 1;
  if (x < target) { const next = x + step; return target < next ? target : next; }
  const next = x - step;
  return next < target ? target : next;
});
/** One frame of the five standing cubes: the selected entry's colour goes to the live selected colour, the others to plain. */
export function fixedStep({ entries, selectedIndex, selected, plain, live }) {
  let liveNow = live;
  const out = entries.map((entry, i) => {
    let target, glow;
    if (i === selectedIndex) { liveNow = chase(liveNow, selected, 1); target = liveNow; const v = entry.glow + 8; glow = v >= 0 ? Math.min(v, 128) : 0; }
    else { target = plain; const v = entry.glow - 8; glow = v < 0 ? 0 : Math.min(v, 128); }
    return { ...entry, colour: chase(entry.colour, target, 7), glow, pulse: f(entry.pulse * near(0.95)) };
  });
  return { entries: out, live: liveNow };
}

// ---- one cube's matrix ----------------------------------------------------------------------

const TWO_PI = near(6.2831854820251465), HALF_PI = near(1.5707963705062866), MINUS_PI = near(-3.1415927410125732);

/** The angle `module_clock_2306B0` hands to `cosf`: the place's distance from the list position, as a turn of sixty places. */
export function angleOf(place, position) {
  const distance = wrap(place * STEP - position, TURN);
  const raw = f(f(f(f(distance) * TWO_PI) / f(TURN)) + HALF_PI);
  const turns = Math.floor(f(f(raw - MINUS_PI) / TWO_PI));
  return f(raw - f(turns * TWO_PI));
}

function routines(table) {
  const sin = (angle) => {
    const a = s16(angle);
    let v = a < 0 ? -a : a;
    if (v >= 0x4000) v = 0x8000 - v;
    const s = table.readFloatLE(v * 4);
    return a < 0 ? -s : s;
  };
  const cos = (angle) => sin(s16(angle) + 0x4000);
  const rotZ = (m, a) => { const c = cos(a), s = sin(a); return mul(m, [[c, s, 0, 0], [-s, c, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]); };
  const rotY = (m, a) => { const c = cos(a), s = sin(a); return mul(m, [[c, 0, -s, 0], [0, 1, 0, 0], [s, 0, c, 0], [0, 0, 0, 1]]); };
  const rotX = (m, a) => { const c = cos(a), s = sin(a); return mul(m, [[1, 0, 0, 0], [0, c, s, 0], [0, -s, c, 0], [0, 0, 0, 1]]); };
  return { rotX, rotY, rotZ };
}

/** The matrix of the cube at a list place: where it stands, then one angle about X, Y and Z. */
export function placeMatrix({ place, cosine, w, spin, table }) {
  const position = [f((place & 1 ? 60 : 70) + -80), f(f(cosine * 60) + 0), 47.5, w];
  return { position, ...turned(position, s16((spin & 0xffff) + place * 7000), table) };
}
/** A cube standing at a position, turned by one angle about X, then Y, then Z. */
export function turned(position, angle, table) {
  const { rotX, rotY, rotZ } = routines(table);
  const moved = unit();
  moved[3] = apply(moved, position.map(flushed));
  return { angle, matrix: rotZ(rotY(rotX(moved, angle), angle), angle) };
}

// ---- transform and emitters -----------------------------------------------------------------

function transform({ rod, first, second, positions, normals, coordinates }) {
  const scale = (v, s) => v.map((x) => f(x * s));
  const sub = (a, b) => a.map((x, i) => f(x - b[i]));
  const local = matrix(rod, 0x20);
  const M = local.map((column) => apply(first, column));
  const sx = rod.readFloatLE(0x68), sy = rod.readFloatLE(0x6c), sz = rod.readFloatLE(0x70);
  let centre = apply(second, apply(M, [0, 0, 0, 1]));
  centre = scale(centre, f(1 / centre[3]));
  const out = { cx: f(centre[0] - 2048), cy: f(centre[1] - 2048), faces: [] };
  const count = rod.readInt32LE(4);
  for (let i = 0; i < count; i++) {
    const face = { normal: apply(M, vector(normals, 16 * i)), vertices: [] };
    for (let k = 0; k < 4; k++) {
      const p = vector(positions, 64 * i + 16 * k);
      const view = apply(M, [f(p[0] * sx), f(p[1] * sy), f(p[2] * sz), 1]);
      let screen = apply(second, view);
      const q = f(1 / screen[3]);
      screen = scale(screen, q);
      const st = vector(coordinates, 64 * i + 16 * k);
      face.vertices.push({ view, screen, q, ints: screen.map((x) => toInt(x * 16)), s: st[0], t: f(st[1] * sy) });
    }
    const e2 = sub(face.vertices[2].screen, face.vertices[0].screen);
    const e1 = sub(face.vertices[1].screen, face.vertices[0].screen);
    face.flag = f(f(e2[0] * e1[1]) - f(e2[1] * e1[0])) > 0 ? 0 : 1;
    out.faces.push(face);
  }
  return out;
}

const sameRecord = (computed, record) => computed.vertices.every((vertex, k) => {
  const at = k * 0x50;
  return sameFloats(vertex.view, record, at) && sameFloats([vertex.s, vertex.t], record, at + 0x10) && sameFloats(vertex.screen, record, at + 0x20)
    && vertex.ints.slice(0, 3).every((x, i) => x === record.readInt32LE(at + 0x30 + 4 * i)) && floatBits(vertex.q) === record.readUInt32LE(at + 0x40);
}) && sameFloats(computed.normal, record, 0x140) && computed.flag === record.readInt32LE(0x150);

/** Textured face: `PRIM 0x54`, then ST, RGBAQ, XYZ per vertex. */
function expectTextured(face, colour, ds, dt) {
  const rgba = BigInt.asUintN(32, BigInt(colour.readInt32LE(0) | (colour.readInt32LE(4) << 8) | (colour.readInt32LE(8) << 16) | (colour.readInt32LE(12) << 24)));
  return { prim: 0x54, vertices: [0, 1, 2, 3].map((k) => {
    const at = k * 0x50, q = face.readFloatLE(at + 0x40);
    const s = f(f(face.readFloatLE(at + 0x10) + ds) * q), t = f(f(face.readFloatLE(at + 0x14) + dt) * q);
    return { st: BigInt(floatBits(s)) | (BigInt(floatBits(t)) << 32n), rgbaq: rgba | (BigInt(face.readUInt32LE(at + 0x40)) << 32n), xyz: xyzOf(face, k) };
  }) };
}

/** Edge colour (`func_00236D90`): the cube's colour times F squared, untextured, alpha 0x80, Q 0. */
export function expectEdge(face, rod) {
  const F = edgeTerm(face);
  const square = f(F * F);
  const channel = (offset) => { const value = toInt(f(square * f(rod.readInt32LE(offset)))); return value < 0x100 ? value : 0xff; };
  const rgbaq = BigInt.asUintN(64, BigInt(channel(0x80)) | 0x80000000n | (BigInt(channel(0x84)) << 8n) | (BigInt(channel(0x88)) << 16n));
  return { prim: 0xc4, rgbaq, xyz: [0, 1, 2, 3].map((k) => xyzOf(face, k)) };
}
/** Depth quad (`func_00236B30`): black, one depth step nearer. HDD OSD: blended, alpha 0x20. ROM 2.30: not blended, alpha 0x80. */
export const expectDepth = (face) => ({ ...A.depthQuad, xyz: [0, 1, 2, 3].map((k) => xyzOf(face, k, 1)) });
/** Alpha quad (`func_00236BC8`): black with the layer's alpha; antialiased only at alpha 64 and below. */
export const expectAlpha = (face, alpha) => ({ prim: alpha > 0x40 ? 0x44 : 0xc4, rgbaq: BigInt.asUintN(64, (BigInt(alpha) << 24n) | 0x03f8000000000000n), xyz: [0, 1, 2, 3].map((k) => xyzOf(face, k)) });

/** The faces a packet carries: each PRIM write and what follows it. */
function facesOf(packet) {
  const faces = [];
  let current = null;
  for (const event of new GifPath().feed(packet.bytes)) {
    if (event.kind !== 'write') continue;
    if (event.reg === REG.PRIM) { current = { prim: Number(event.value), rgbaq: [], st: [], uv: [], xyz: [] }; faces.push(current); }
    else if (!current) continue;
    else if (event.reg === REG.RGBAQ) current.rgbaq.push(event.value);
    else if (event.reg === REG.ST) current.st.push(event.value);
    else if (event.reg === REG.UV) current.uv.push(event.value);
    else if ([REG.XYZ2, REG.XYZF2, REG.XYZ3, REG.XYZF3].includes(event.reg)) current.xyz.push(event.value);
  }
  return faces;
}

// ---- the trace ------------------------------------------------------------------------------

const within = (address, [from, to]) => address >= from && address < to;
const EMITTERS = new Map([[A.refracted, 'refracted'], [A.textured, 'textured'], [A.reflected, 'reflection'], [A.edge, 'edge'], [A.depth, 'depth'], [A.alpha, 'alpha']]);

export function verify(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const tally = {};
  const problems = [];
  const check = (name, same, describe) => {
    tally[name] ??= [0, 0];
    tally[name][1] += 1;
    if (same) tally[name][0] += 1;
    else if (problems.filter((text) => text.startsWith(name)).length < 3 && problems.length < 24) problems.push(`${name}: ${describe ? describe() : 'differs'}`);
    return same;
  };
  const seen = { packets: {}, passes: 0, cubes: 0, layerCubes: 0, moves: 0, pulses: 0, standing: 0, selected: new Set(), positions: new Set(), colours: new Set(), w: new Set(), cosError: 0, scales: new Set(), alphas: new Set() };
  const lists = { true: trace.preroll, false: trace.packets };

  let table = null;              // the sine table, from the latest pass probe
  let frame = null;              // what the latest pass asks for
  let nextList = null;           // the list state the next reader should find
  let lastList = null;           // the list state at the latest pass
  let nextFixed = null, lastFixed = null;   // the same two for the standing cubes of ROM 2.30
  let placing = null;            // the place call being followed
  let cube = null;               // the cube being drawn
  let pendingG = null;
  let lastSpin = null, lastSpinFrame = null;

  const closeCube = () => {
    if (!cube) return;
    // Every emitter call of the cube, in order, against the plan: which emitter, which face.
    const faces = cube.computed ? cube.computed.faces.map((face, index) => ({ index, flag: face.flag })) : [];
    const side = (flag) => faces.filter((face) => (flag === 0 ? face.flag === 0 : face.flag !== 0)).map((face) => face.index);
    const plan = cube.kind === 'cube'
      ? [['refracted', 0], ['textured', 0, 'pair'], ['textured', 0, 'none'], ['edge', 0], ['depth', 1], ['refracted', 1], ['textured', 1, 'pair'], ['textured', 1, 'none']]
      : [['reflection', 1], ['alpha', 1]];
    const wanted = plan.flatMap(([kind, flag, offsets], send) => side(flag).map((index) => ({ kind, offsets, index, send })));
    check(`${cube.kind}: emitter calls in the planned order (which emitter, which face)`, cube.calls.length === wanted.length && cube.calls.every((call, i) => call.kind === wanted[i].kind && call.index === wanted[i].index),
      () => `${cube.calls.map((call) => `${call.kind} ${call.index}`).join(', ')} against ${wanted.map((want) => `${want.kind} ${want.index}`).join(', ')}`);
    if (cube.calls.length !== wanted.length) { cube = null; return; }
    // The packet each call's face went into, and its place there.
    const perPacket = new Map();
    for (const call of cube.calls) {
      const key = `${call.probe.preroll}:${call.probe.at}`;
      if (!perPacket.has(key)) perPacket.set(key, { sent: null, calls: [] });
      call.place = perPacket.get(key).calls.push(call) - 1;
      call.packet = perPacket.get(key);
    }
    for (const [key, entry] of perPacket) {
      const [preroll, at] = key.split(':');
      const packet = lists[preroll][Number(at)];
      entry.sent = packet ? facesOf(packet) : [];
      check('packet: as many faces as emitter calls before it', entry.sent.length === entry.calls.length, () => `${key}: ${entry.calls.length} calls, ${entry.sent.length} faces`);
    }
    // How a send of several faces is cut into packets.
    plan.forEach(([kind], send) => {
      const calls = cube.calls.filter((call, n) => wanted[n].send === send);
      if (calls.length < 2) return;
      const packets = new Set(calls.map((call) => call.packet)).size;
      seen.packets[kind] ??= new Set();
      seen.packets[kind].add(packets === 1 ? 'one packet per send' : packets === calls.length ? 'one packet per face' : 'neither');
    });
    {
      cube.calls.forEach((call, n) => {
        const want = wanted[n];
        const sent = call.packet.sent;
        if (sent.length !== call.packet.calls.length) return;
        const i = call.place;
        const probe = call.probe, actual = sent[i], rod = cube.record;
        if (call.kind === 'refracted') {
          const [stack, rodBytes, face, fieldBytes, screen] = probe.mem.map((entry) => entry.bytes);
          const centreX = f(cube.computed.cx * near(CENTRE)), centreY = f(cube.computed.cy * near(CENTRE));
          check('refracted: centre handed on is 0.35 of the projected centre', floatBits(stack.readFloatLE(0)) === floatBits(centreX) && floatBits(stack.readFloatLE(8)) === floatBits(centreY),
            () => `got ${stack.readFloatLE(0)}, ${stack.readFloatLE(8)}; computed ${centreX}, ${centreY}`);
          check('refracted: nothing added to the colour', stack.readInt32LE(0xc) === 0);
          const expected = expectFace({ F: asFloat(probe.fpr[12]), cx: stack.readFloatLE(0), cy: stack.readFloatLE(8), add: stack.readInt32LE(0xc), rod: rodBytes, face,
            field: fieldBytes.readInt32LE(0), screenW: screen.readInt32LE(0), screenH: screen.readInt32LE(4), g: call.g });
          check('refracted: F', floatBits(edgeTerm(face)) === probe.fpr[12]);
          check('refracted: PRIM', actual.prim === expected.prim);
          check('refracted: RGBA', Number(actual.rgbaq[0] & 0xffffffffn) === expected.rgba, () => `sent ${actual.rgbaq[0].toString(16)}, computed ${expected.rgba.toString(16)}`);
          for (let k = 0; k < 4; k++) {
            check('refracted: UV', actual.uv[k] === expected.vertices[k].uv);
            check('refracted: XYZ', actual.xyz[k] === expected.vertices[k].xyz);
          }
          seen.colours.add(`${cube.slot === undefined ? '?' : cube.slot}:${rod.readInt32LE(0x80)},${rod.readInt32LE(0x84)},${rod.readInt32LE(0x88)}`);
        } else if (call.kind === 'textured') {
          const [face, colour] = probe.mem.map((entry) => entry.bytes);
          const pair = want.offsets === 'pair' ? [rod.readUInt32LE(0xb0), rod.readUInt32LE(0xb4)] : [0, 0];
          check('textured: offsets are the record pair, then none', probe.fpr[12] === pair[0] && probe.fpr[13] === pair[1], () => `got ${asFloat(probe.fpr[12])}, ${asFloat(probe.fpr[13])}`);
          check('textured: colour is the record at +0xA0', probe.gpr[5] === cube.address + 0xa0);
          const expected = expectTextured(face, colour, asFloat(probe.fpr[12]), asFloat(probe.fpr[13]));
          check('textured: PRIM', actual.prim === expected.prim);
          for (let k = 0; k < 4; k++) {
            check('textured: ST', actual.st[k] === expected.vertices[k].st);
            check('textured: RGBAQ', actual.rgbaq[k] === expected.vertices[k].rgbaq);
            check('textured: XYZ', actual.xyz[k] === expected.vertices[k].xyz);
          }
        } else if (call.kind === 'reflection') {
          const [face, rodBytes] = probe.mem.map((entry) => entry.bytes);
          check('reflection: antialiased', probe.gpr[6] === 1);
          const expected = expectReflected(face, rodBytes, probe.gpr[6]);
          check('reflection: PRIM', actual.prim === expected.prim);
          check('reflection: RGBA', Number(actual.rgbaq[0] & 0xffffffffn) === expected.rgba);
          for (let k = 0; k < 4; k++) {
            check('reflection: UV', actual.uv[k] === expected.vertices[k].uv);
            check('reflection: XYZ', actual.xyz[k] === expected.vertices[k].xyz);
          }
        } else {
          const face = probe.mem[0].bytes;
          const expected = call.kind === 'edge' ? expectEdge(face, probe.mem[1].bytes) : call.kind === 'depth' ? expectDepth(face) : expectAlpha(face, probe.gpr[5] | 0);
          if (call.kind === 'alpha') check('alpha quad: alpha is the record at +0xCC', (probe.gpr[5] | 0) === rod.readInt32LE(0xcc));
          check(`${call.kind} quad: PRIM`, actual.prim === expected.prim, () => `sent ${actual.prim.toString(16)}, computed ${expected.prim.toString(16)}`);
          check(`${call.kind} quad: RGBAQ`, actual.rgbaq[0] === expected.rgbaq, () => `sent ${actual.rgbaq[0].toString(16)}, computed ${expected.rgbaq.toString(16)}`);
          for (let k = 0; k < 4; k++) check(`${call.kind} quad: XYZ`, actual.xyz[k] === expected.xyz[k]);
        }
      });
    }
    cube = null;
  };

  for (const probe of trace.probes) {
    const mem = probe.mem.map((entry) => entry.bytes);
    if (probe.pc === A.scroll) {
      closeCube();
      const list = readList(mem[0]);
      if (nextList?.from === 'ask') check('ask for a move: what is left, speed, slowing', sameList(nextList.list, list), () => JSON.stringify([nextList.list, list]));
      else if (lastList && !sameList(lastList, list)) {
        // Nothing probed changed the list since the last pass: the enter key's pulse is the one writer left.
        const entered = { ...lastList, pulse: near(-0.1), pulsed: div(lastList.position + lastList.left, STEP) };
        if (check('enter: pulse of -0.1 at the place the list is heading for', sameList(entered, list), () => JSON.stringify([lastList, list]))) seen.pulses += 1;
      }
      nextList = { from: 'scroll', list: scrollStep(list) };
    } else if (probe.pc === A.ask) {
      closeCube();
      const list = readList(mem[0]);
      const pal = mem[1].readInt32LE(4) === 256;
      seen.moves += 1;
      nextList = { from: 'ask', list: askMove(list, probe.gpr[4] | 0, pal ? 50 : near(59.939998626708984)) };
    } else if (probe.pc === A.pass + 4) {
      table = Buffer.concat(mem);
    } else if (probe.pc === A.pass) {
      closeCube();
      seen.passes += 1;
      const [rampBytes, listBytes, spinBytes, colours, fixedBytes] = mem;
      const list = readList(listBytes);
      const standing = Boolean(A.fixed) && list.count < 6;
      if (standing) {
        const entries = readFixed(fixedBytes);
        if (nextFixed) {
          check('standing cubes: one frame of colour, glow and pulse', sameFixed(nextFixed.entries, entries), () => JSON.stringify([nextFixed.entries, entries]));
          check('standing cubes: the live selected colour', nextFixed.live.every((x, i) => x === colours.readInt32LE(0x20 + 4 * i)));
        }
        nextFixed = null;
        lastFixed = entries;
        seen.standing += 1;
      }
      if (nextList?.from === 'scroll') check('list position: one frame of the move, and the pulse dying down', sameList(nextList.list, list), () => JSON.stringify([nextList.list, list]));
      nextList = null;
      lastList = list;
      seen.positions.add(list.position);
      const ramp = { length: rampBytes.readInt32LE(0), counter: rampBytes.readInt32LE(4), state: rampBytes.readInt32LE(12) };
      const selected = [0, 4, 8, 12].map((k) => colours.readInt32LE(k)), plain = [0, 4, 8, 12].map((k) => colours.readInt32LE(0x10 + k));
      const spin = spinBytes.readUInt16LE(0);
      if (lastSpin !== null && probe.frame === lastSpinFrame + 1) check('spin: thirty units more each frame', ((spin - lastSpin) & 0xffff) === 30, () => `${lastSpin} then ${spin}`);
      lastSpin = spin;
      lastSpinFrame = probe.frame;
      const plan = pass({ ramp, list, selected, plain, fixed: standing ? lastFixed : null });
      frame = { list, spin: spinBytes.readUInt16LE(0), queue: [...plan.cubes.map((c) => ({ ...c, kind: 'cube' })), ...plan.layer.map((c) => ({ ...c, kind: 'layer' }))], selected, plain };
      seen.scales.add(plan.cubes[0]?.scale);
    } else if (A.fixed && probe.pc === A.fixed.update) {
      closeCube();
      const entries = readFixed(mem[0]);
      const colours = mem[2];
      const read = (at) => [0, 4, 8, 12].map((k) => colours.readInt32LE(at + k));
      const selectedIndex = mem[1].readInt32LE(0);
      if (lastFixed && !sameFixed(lastFixed, entries)) {
        // Nothing probed writes the table between two frames: the enter key's pulse is the one writer left.
        const entered = lastFixed.map((entry, i) => (i === selectedIndex ? { ...entry, pulse: near(-0.1) } : entry));
        if (check('enter: pulse of -0.1 on the selected standing cube', sameFixed(entered, entries), () => JSON.stringify([lastFixed, entries]))) seen.pulses += 1;
      }
      seen.selected.add(selectedIndex);
      nextFixed = fixedStep({ entries, selectedIndex, selected: read(0), plain: read(0x10), live: read(0x20) });
    } else if (probe.pc === A.place) {
      closeCube();
      if (!frame) continue;
      const want = frame.queue.shift();
      const scaleBits = probe.fpr[12];
      if (!check('pass: a cube is placed only where the pass asks', Boolean(want))) continue;
      check('pass: list place, list position and scale of each cube', (probe.gpr[4] | 0) === want.place && (probe.gpr[5] | 0) === frame.list.position && scaleBits === floatBits(want.scale),
        () => `got place ${probe.gpr[4] | 0}, position ${probe.gpr[5] | 0}, scale ${asFloat(scaleBits)}; computed ${want.place}, ${frame.list.position}, ${want.scale}`);
      placing = { want, place: probe.gpr[4] | 0, position: probe.gpr[5] | 0, scale: asFloat(scaleBits) };
      if (placing.place === frame.list.pulsed) placing.scale = f(placing.scale + frame.list.pulse);
    } else if (probe.pc === A.beforeCos && placing) {
      placing.angle = asFloat(probe.fpr[12]);
      check('place: angle handed to cosf', floatBits(angleOf(placing.place, placing.position)) === probe.fpr[12], () => `got ${placing.angle}, computed ${angleOf(placing.place, placing.position)}`);
    } else if (probe.pc === A.afterCos && placing) {
      placing.cosine = asFloat(probe.fpr[0]);
      seen.cosError = Math.max(seen.cosError, Math.abs(placing.cosine - Math.cos(placing.angle)));
    } else if (probe.pc === A.move && placing && !placing.moved) {
      placing.moved = mem[0];
      seen.w.add(mem[0].readUInt32LE(12).toString(16));
    } else if (probe.pc === A.draw[0] || probe.pc === A.layer[0]) {
      closeCube();
      const record = mem[0];
      const kind = probe.pc === A.draw[0] ? 'cube' : 'layer';
      cube = { kind, record, address: probe.gpr[4], calls: [], computed: null, slot: placing?.want.slot };
      if (kind === 'cube') seen.cubes += 1; else seen.layerCubes += 1;
      check('draw: the record is the one template', probe.gpr[4] === A.record);
      if (placing && placing.moved && placing.cosine !== undefined) {
        const expected = placeMatrix({ place: placing.place, cosine: placing.cosine, w: placing.moved.readFloatLE(12), spin: frame.spin, table });
        check('place: position handed to the move', sameFloats(expected.position.slice(0, 3), placing.moved, 0), () => `got ${vector(placing.moved, 0)}, computed ${expected.position}`);
        check('place: matrix written to the record', sameFloats(expected.matrix.flat(), record, 0x20), () => `got ${matrix(record, 0x20).flat()}, computed ${expected.matrix.flat()}`);
        check('place: scale written to the record, with the pulse for the entered place', [0x68, 0x6c, 0x70].every((at) => record.readUInt32LE(at) === floatBits(placing.scale)),
          () => `got ${record.readFloatLE(0x68)}, computed ${placing.scale}`);
        check('pass: the kind of draw that follows the place', placing.want.kind === kind);
        if (kind === 'cube') check('pass: colour of the cube', placing.want.colour.every((x, i) => x === record.readInt32LE(0x80 + 4 * i)), () => `got ${[0, 4, 8, 12].map((k) => record.readInt32LE(0x80 + k))}, computed ${placing.want.colour}`);
        else { check('pass: alpha of the cube in the layer', placing.want.alpha === record.readInt32LE(0xcc), () => `got ${record.readInt32LE(0xcc)}, computed ${placing.want.alpha}`); seen.alphas.add(placing.want.alpha); }
      }
      else if (frame && frame.queue[0]?.fixed !== undefined) {
        const want = frame.queue.shift();
        cube.slot = want.fixed;
        const expected = turned(want.position, s16((frame.spin & 0xffff) + want.fixed * 7000), table);
        seen.w.add(floatBits(want.position[3]).toString(16));
        check('standing cube: matrix written to the record', sameFloats(expected.matrix.flat(), record, 0x20), () => `got ${matrix(record, 0x20).flat()}, computed ${expected.matrix.flat()}`);
        check('standing cube: scale is the ramp plus the pulse of its entry', [0x68, 0x6c, 0x70].every((at) => record.readUInt32LE(at) === floatBits(want.scale)), () => `got ${record.readFloatLE(0x68)}, computed ${want.scale}`);
        check('standing cube: the kind of draw', (want.colour === undefined) === (kind === 'layer'));
        if (kind === 'cube') check('standing cube: colour is that of its entry', want.colour.every((x, i) => x === record.readInt32LE(0x80 + 4 * i)));
        else seen.alphas.add(record.readInt32LE(0xcc));
      }
      placing = null;
    } else if (probe.pc === A.transform && cube && (within(probe.gpr[31], A.draw) || within(probe.gpr[31], A.layer))) {
      const [rod, first, second, positions, normals, coordinates] = mem;
      // The cubes' view is the unit matrix func_002324C8 writes (HDD 0x004090F0, ROM 0x003750C0),
      // not the camera: they follow neither its position nor its rotation.
      const unit = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
      check('the view matrix of a cube is the unit matrix', matrix(first, 0).every((row, r) => row.every((x, c) => x === unit[r][c])));
      cube.computed = transform({ rod, first: matrix(first, 0), second: matrix(second, 0), positions, normals, coordinates });
      cube.array = probe.gpr[7];
      cube.checked = new Set();
    } else if (probe.pc === A.transform) {
      closeCube();               // a transform asked for by anything else: the cube's function has returned
    } else if (probe.pc === A.afterG) {
      if (pendingG) pendingG.g = asFloat(probe.fpr[0]);
    } else if (EMITTERS.has(probe.pc) && cube && cube.computed) {
      const kind = EMITTERS.get(probe.pc);
      const face = kind === 'refracted' ? mem[2] : mem[0];
      const address = kind === 'refracted' ? mem[0].readUInt32LE(0x10) : probe.gpr[4];
      const index = (address - cube.array) / 0x160;
      const call = { kind, probe, index, g: undefined };
      pendingG = kind === 'refracted' ? call : null;
      cube.calls.push(call);
      if (Number.isInteger(index) && cube.computed.faces[index] && !cube.checked.has(index)) {
        cube.checked.add(index);
        check('transform: face record (positions, s and t, screen, integers, q, normal, side)', sameRecord(cube.computed.faces[index], face));
      }
    }
  }
  closeCube();
  return { tally, problems, seen };
}

if (process.argv[1] && process.argv[1].endsWith('verify_cubes.mjs')) {
  const { tally, problems, seen } = verify(process.argv[2]);
  console.log(`build: ${BUILD_NAME}`);
  console.log(`passes: ${seen.passes}   cubes drawn: ${seen.cubes}   cubes in the highlight layer: ${seen.layerCubes}   moves asked: ${seen.moves}   enter pulses: ${seen.pulses}`);
  console.log(`list positions met: ${seen.positions.size} (${[...seen.positions].slice(0, 6).join(', ')}${seen.positions.size > 6 ? ', ...' : ''})   scales: ${[...seen.scales].slice(0, 6).join(', ')}   layer alphas: ${[...seen.alphas].sort((a, b) => a - b).join(', ')}`);
  console.log(`colours by slot (slot:R,G,B): ${[...seen.colours].sort().join('  ')}`);
  console.log(`packets: ${Object.entries(seen.packets).map(([kind, shapes]) => `${kind}: ${[...shapes].join(' / ')}`).join('; ')}`);
  if (seen.standing) console.log(`standing cubes (fewer than six entries): ${seen.standing} passes; selected entry: ${[...seen.selected].join(', ')}`);
  console.log(`w of the position handed to the move (bits): ${[...seen.w].join(', ')}   cosf against the true cosine: within ${seen.cosError.toExponential(2)}`);
  for (const [name, [same, total]] of Object.entries(tally)) console.log(`  ${String(same).padStart(6)} of ${String(total).padEnd(6)} ${name}`);
  for (const text of problems) console.log(`  ! ${text}`);
  const whole = seen.cubes > 0 && Object.values(tally).every(([same, total]) => same === total);
  console.log(`verdict: ${whole ? `FOUND ${seen.cubes} cubes and ${seen.layerCubes} layer cubes (${BUILD_NAME}), every value equal` : 'PARTIAL the formulas do not reproduce everything'}`);
  process.exit(whole ? 0 : 3);
}
