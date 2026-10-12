// Recompute where the crystal clock puts every rod and every orb (their local matrices), the
// orb's screen position and its trail ring, from the state really read, and compare with what
// was really written. Build: ROM 2.30.
//
//   0x0022beb8  one frame (view, screen)          0x0022b5f0  submit the rods
//   0x0022b548  build one rod's matrix            0x0022b3a0  add a rod to the draw list
//   0x0022b780  submit the orbs                   0x0022b498  add an orb to the draw list
//   0x00236500  push a point on an orb's ring     0x00235630  draw an orb
//
// node verify_placement.mjs <trace.jsonl>
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { pick, range, pc, BUILD_NAME } from './builds.mjs';

// Addresses per build: the functions, in the order of the list above, and the data they use.
const A = pick({
  rom: { pcs: [0x0022beb8, 0x0022b5f0, 0x0022b548, 0x0022b3a0, 0x0022b780, 0x0022b498, 0x00236500, 0x00235630], sine: 0x0037aa70, state: 0x00370f40, time: 0x00375200,
    eased: 0x002c8f50, constants: 0x002c8178, scale: 0x0028a340, colours: 0x00296630, mode: 0x002c8f6c, rings: 0x00297460 },
  hdd: { pcs: [0x0022fe98, 0x0022f5d0, 0x0022f528, 0x0022f380, 0x0022f760, 0x0022f478, 0x00239e98, 0x00239078], sine: 0x0040eaa0, state: 0x00404f70, time: 0x00409230,
    eased: 0x00370a98, constants: 0x0036fbdc, scale: 0x002b2170, colours: 0x002b5670, mode: 0x00370ab4, rings: 0x002b6200 },
});
export const PROBES = [
  { pc: pc(A.pcs[0]), ranges: [0, 1, 2, 3].map((n) => range(A.sine + n * 0x4000, 0x4000)).concat([range(A.sine + 0x10000, 0x4), 'a0:0x40', 'a1:0x40']) },
  { pc: pc(A.pcs[1]), ranges: [range(A.state, 0x280)] },
  { pc: pc(A.pcs[2]), ranges: [] },
  { pc: pc(A.pcs[3]), ranges: ['a0:0xe0'] },
  { pc: pc(A.pcs[4]), ranges: [range(A.time, 0x10), range(A.eased, 0x10), range(A.constants, 0x8), range(A.scale, 0x4), range(A.colours, 0x80), range(A.mode, 0x4)] },
  { pc: pc(A.pcs[5]), ranges: ['a0:0xe0'] },
  { pc: pc(A.pcs[6]), ranges: ['a1:0x10', 'a2:0x10', range(A.rings, 0x2c30)] },
  { pc: pc(A.pcs[7]), ranges: ['a0:0x650'] },
];
const [FRAME, RODS, BUILD, ADD_ROD, ORBS, ADD_ORB, PUSH, DRAW_ORB] = A.pcs;

const bits = new DataView(new ArrayBuffer(4));
const f = (x) => {
  const near = Math.fround(x);
  if (Math.abs(near) <= Math.abs(x) || !Number.isFinite(near)) return near;
  bits.setFloat32(0, near);
  bits.setUint32(0, bits.getUint32(0) - 1);
  return bits.getFloat32(0);
};
const toInt = (x) => (x >= 2147483647 ? 2147483647 : x <= -2147483648 ? -2147483648 : Math.trunc(x));
const s16 = (x) => (x << 16) >> 16;
const vector = (buffer, at) => [0, 4, 8, 12].map((k) => buffer.readFloatLE(at + k));
const matrix = (buffer, at) => [0, 16, 32, 48].map((k) => vector(buffer, at + k));
const hex = (m) => { const out = Buffer.alloc(64); m.flat().forEach((x, i) => out.writeFloatLE(x, i * 4)); return out.toString('hex'); };

/** sceVu0ApplyMatrix: the rows of m scaled by the components of v and summed, in that order. */
const apply = (m, v) => [0, 1, 2, 3].map((i) => f(f(f(f(m[0][i] * v[0]) + f(m[1][i] * v[1])) + f(m[2][i] * v[2])) + f(m[3][i] * v[3])));
/** sceVu0MulMatrix(out, a, b): each row of b through a. */
const mul = (a, b) => b.map((row) => apply(a, row));
const unit = () => [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];

/** The matrix routines of the clock, over a quarter-wave sine table of 0x4001 floats. */
export function routines(table) {
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
  const move = (m, x, y, z) => [m[0], m[1], m[2], apply(m, [x, y, z, 1])];

  /** Rod i of the ring: `ring` turns the whole ring, `spin` tilts it and spins each rod. */
  const rod = (i, ring, spin) => {
    let m = rotY(rotZ(unit(), ring), spin);
    m = rotZ(m, s16(Math.trunc((i << 16) / 12) - 0x8000));
    m = move(m, 0, 20, 0);
    return rotY(m, s16(s16(spin) << 2));
  };
  /** Orb k. */
  const orb = (k, hourHand, secondHand, minuteTurn, secondsTurn, factor, radius) => {
    let m = rotZ(rotY(rotZ(unit(), hourHand), secondHand), -0x8000);
    m = rotY(m, s16(toInt(f(minuteTurn * factor))));
    m = rotX(m, s16(toInt(f((k + 0x15) * secondsTurn))));
    m = move(m, 0, radius, 0);
    return rotY(m, 0x2000);
  };
  return { sin, cos, rod, orb };
}

const seconds = (time) => f(time.readInt32LE(4) + f(time.readFloatLE(0) / 1000));
const minutes = (time) => f(time.readInt32LE(8) + f(seconds(time) / 60));

export function verify(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const checks = {};
  const problems = [];
  const check = (name, same, text) => {
    checks[name] ??= [0, 0];
    checks[name][1] += 1;
    if (same) checks[name][0] += 1;
    else if (problems.length < 12) problems.push(`${name}: ${text()}`);
  };
  const facts = [];
  let math = null, view = null, screen = null, state = null, built = null, orbs = null, pushed = null, table = null;
  const sineSeen = new Set();
  for (const probe of trace.probes) {
    if (probe.pc === FRAME) {
      table = Buffer.concat(probe.mem.slice(0, 5).map((range) => range.bytes));
      sineSeen.add(table.toString('hex').length);
      math = routines(table);
      view = matrix(probe.mem[5].bytes, 0);
      screen = matrix(probe.mem[6].bytes, 0);
      orbs = null;
    } else if (!math) continue;
    else if (probe.pc === RODS) state = probe.mem[0].bytes;
    else if (probe.pc === BUILD) {
      const [i, ring, spin] = [probe.gpr[4], s16(probe.gpr[5]), s16(probe.gpr[6])];
      check('rod angles are the state\'s', ring === state.readInt16LE(6) && spin === state.readInt16LE(4), () => `frame ${probe.frame} rod ${i}: ${ring}, ${spin}`);
      built = { i, matrix: math.rod(i, ring, spin) };
    } else if (probe.pc === ADD_ROD && built) {
      const record = probe.mem[0].bytes;
      check('rod matrix', hex(matrix(record, 0x20)) === hex(built.matrix), () => `frame ${probe.frame} rod ${built.i}: written ${matrix(record, 0x20)[3]}, computed ${built.matrix[3]}`);
      check('rod number', record.readInt32LE(0) === (built.i + state.readInt32LE(0)) % 12, () => `frame ${probe.frame}`);
      check('rod length scale', record.readFloatLE(0x6c) === state.readFloatLE(0x10 + record.readInt32LE(0) * 0x30), () => `frame ${probe.frame}`);
      built = null;
    } else if (probe.pc === ORBS) {
      const [time, eased, constants] = probe.mem.map((range) => range.bytes);
      const old = eased.readFloatLE(8);
      const radius = f(f(f(old * 7.25) + 10) * probe.mem[3].bytes.readFloatLE(0));
      orbs = {
        frame: probe.frame,
        hourHand: eased.readInt16LE(2), secondHand: eased.readInt16LE(0),
        secondsTurn: f(f(seconds(time) * 65536) / 60), minuteTurn: f(f(minutes(time) * 65536) / 60),
        factor: constants.readFloatLE(0), radius, old,
        next: f(f(f(f(1 - eased.readFloatLE(4)) - old) * constants.readFloatLE(4)) + old),
        colour: probe.mem[4].bytes.subarray(0, 16), mode: probe.mem[5].bytes.readInt32LE(0), time,
      };
      if (facts.length < 2) facts.push(`frame ${probe.frame}: orbit radius ${radius}  eased fraction ${old} -> ${orbs.next} (factor ${constants.readFloatLE(4)})  minute factor ${orbs.factor}  hour hand ${orbs.hourHand}  second hand ${orbs.secondHand}  mode ${orbs.mode}  colour ${[0, 4, 8, 12].map((o) => orbs.colour.readInt32LE(o))}`);
    } else if (probe.pc === ADD_ORB && orbs) {
      const k = probe.gpr[5];
      const record = probe.mem[0].bytes;
      const want = math.orb(k, orbs.hourHand, orbs.secondHand, orbs.minuteTurn, orbs.secondsTurn, orbs.factor, orbs.radius);
      check('orb matrix', hex(matrix(record, 0x20)) === hex(want), () => `frame ${probe.frame} orb ${k}: written ${matrix(record, 0x20)[3]}, computed ${want[3]}`);
      orbs.local ??= {};
      orbs.local[k] = want;
    } else if (probe.pc === PUSH && orbs) {
      const k = probe.gpr[4];
      const position = probe.mem[0].bytes, colour = probe.mem[1].bytes;
      const M = orbs.local[k].map((row) => apply(view, row));
      let centre = apply(screen, apply(M, [0, 0, 0, 1]));
      centre = centre.map((x) => f(x * f(1 / centre[3])));
      const want = [f(centre[0] - 2048), f(centre[1] - 2048), centre[2]];
      check('orb position', [0, 1, 2].every((c) => Object.is(position.readFloatLE(c * 4), want[c])), () => `frame ${probe.frame} orb ${k}: written ${vector(position, 0).slice(0, 3)}, computed ${want}`);
      if (orbs.mode !== 2 && orbs.mode !== 3) check('orb colour', colour.equals(orbs.colour), () => `frame ${probe.frame} orb ${k}: ${[0, 4, 8, 12].map((o) => colour.readInt32LE(o))}`);
      // The ring: the head is rewritten every frame; every third frame it moves on.
      const ring = Buffer.from(probe.mem[2].bytes.subarray(k * 0x650, (k + 1) * 0x650));
      let head = ring.readInt32LE(0);
      const put = () => { position.copy(ring, 0x10 + head * 0x20); colour.copy(ring, 0x20 + head * 0x20); };
      put();
      const count = ring.readInt32LE(4) + 1;
      ring.writeInt32LE(count, 4);
      if (count === 3) {
        ring.writeInt32LE(0, 4);
        head += 1;
        if (head === 50) { head = 0; ring.writeInt32LE(1, 8); }
        ring.writeInt32LE(head, 0);
        put();
      }
      pushed = { k, ring, frame: probe.frame };
    } else if (probe.pc === DRAW_ORB && pushed) {
      check('orb ring', probe.mem[0].bytes.equals(pushed.ring), () => `frame ${pushed.frame} orb ${pushed.k}`);
      pushed = null;
    }
  }
  // The sine table against the formula it is filled with.
  let sines = 0;
  if (table) for (let i = 0; i <= 0x4000; i++) if (Object.is(table.readFloatLE(i * 4), Math.fround(Math.sin((i * 1.5707963267948966) / 16385)))) sines += 1;
  return { checks, problems, facts, sines };
}

if (process.argv[1] && process.argv[1].endsWith('verify_placement.mjs')) {
  const result = verify(process.argv[2]);
  console.log(`build: ${BUILD_NAME}`);
  for (const line of result.facts) console.log(line);
  console.log(`sine table entries equal to the nearest float of sin(i * 1.5707963267948966 / 16385): ${result.sines} of ${0x4001}`);
  let whole = Object.keys(result.checks).length > 0;
  for (const [name, [equal, total]] of Object.entries(result.checks)) {
    console.log(`  ${name.padEnd(28)} ${equal} of ${total} equal`);
    if (equal !== total) whole = false;
  }
  for (const text of result.problems) console.log(`  ! ${text}`);
  console.log(`verdict: ${whole ? 'FOUND every matrix, position and ring equal' : 'PARTIAL the reading does not reproduce every value'}`);
  process.exit(whole ? 0 : 3);
}
