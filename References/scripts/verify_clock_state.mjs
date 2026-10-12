// Recompute what the clock logic writes each frame (current rod, angles, progress, colours,
// appearance) from the time and state it really read, and compare with what it really wrote.
// Build: ROM 2.30. The same code, word for word apart from data addresses, is in HDD OSD 1.10U
// (diff_rom.mjs).
//
//   0x0022b1c0  per-frame update (HDD func_0022F1A0)      0x0022b2ac  its return
//   0x0022abf0  time to angles   (HDD func_0022EBD0)
//   0x0022ae40  colours          (HDD func_0022EE20)
//   0x0022a8e0  colour chase     (HDD func_0022E8C0)
//
// node verify_clock_state.mjs <trace.jsonl>
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { pick, range, pc, BUILD_NAME } from './builds.mjs';

// Addresses per build: the functions, in the order of the list above, and the data they use.
const A = pick({
  rom: { pcs: [0x0022b1c0, 0x0022abf0, 0x0022ae40, 0x0022a8e0, 0x0022b2ac], state: 0x00370f40, time: 0x00375200, eased: 0x002c8f50, ramp: 0x00296600,
    colours: 0x002965c0, counters: 0x002c8880, tables: 0x00296530, constants: 0x002c8168 },
  hdd: { pcs: [0x0022f1a0, 0x0022ebd0, 0x0022ee20, 0x0022e8c0, 0x0022f28c], state: 0x00404f70, time: 0x00409230, eased: 0x00370a98, ramp: 0x002b5640,
    colours: 0x002b5600, counters: 0x00370268, tables: 0x002b5570, constants: 0x0036fbcc },
});
const STATE = range(A.state, 0x2c0);
const TIME = range(A.time, 0x10);
const EASED = range(A.eased, 0x8);
const RAMP = range(A.ramp, 0x10);
const COLOURS = range(A.colours, 0x40);
const COUNTERS = range(A.counters, 0x14);
const TABLES = range(A.tables, 0x90);
const CONSTANTS = range(A.constants, 0xc);
export const PROBES = [
  { pc: pc(A.pcs[0]), ranges: [STATE, RAMP, TABLES, CONSTANTS] },
  { pc: pc(A.pcs[1]), ranges: [STATE, TIME, EASED, RAMP] },
  { pc: pc(A.pcs[2]), ranges: [STATE, EASED, TIME, COLOURS, COUNTERS] },
  { pc: pc(A.pcs[3]), ranges: [STATE, COLOURS, COUNTERS] },
  { pc: pc(A.pcs[4]), ranges: [STATE, TIME] },
];
const [UPDATE, ANGLES, MIX, CHASE, DONE] = A.pcs;
const STATE_AT = A.state;

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
const u16 = (x) => x & 0xffff;

const seconds = (time) => f(time.readInt32LE(4) + f(time.readFloatLE(0) / 1000));
const minutes = (time) => f(time.readInt32LE(8) + f(seconds(time) / 60));
const hours = (time) => f(time.readInt32LE(12) + f(minutes(time) / 60));

/** One step of an eased 16-bit angle: the difference, wrapped to 16 bits, times a factor. */
const ease = (target, old, factor) => u16(toInt(f(f(s16(target - old) * factor) + s16(old))));

/** What the time-to-angles function leaves behind. */
export function expectAngles(time, state, eased, k1, k2) {
  const current = toInt(hours(time)) % 12;
  const turn = ((current << 16) >>> 0) / 12 >>> 0;
  const oldSeconds = state.readUInt16LE(4), oldRod = state.readUInt16LE(6);
  const snap = Math.abs(s16(oldSeconds)) < 201 || s16(oldSeconds) === -32768;
  const rod = snap ? u16(turn) : ease(turn, oldRod, k1);
  const secondsTurn = toInt(f(f(seconds(time) * 65536) / 60));
  const hourOld = eased.readInt16LE(2);
  const hourStep = s16(toInt(f(f(f(hours(time) * 65536) / 12) - hourOld)));
  return {
    snap,
    current,
    rod,
    seconds: ease(secondsTurn, oldSeconds, k2),
    hourHand: u16(toInt(f(f(hourStep * k2) + hourOld))),
    secondHand: ease(secondsTurn, eased.readUInt16LE(0), k2),
    progress: f(1 - f(minutes(time) / 60)),
  };
}

/** Move four ints one unit each toward a target; true when nothing had to move. */
function chase(colour, target) {
  let moved = false;
  for (let c = 0; c < 4; c++) {
    if (colour[c] === target[c]) continue;
    colour[c] += colour[c] < target[c] ? 1 : -1;
    moved = true;
  }
  return !moved;
}
const ints = (bytes, at, count = 4) => Array.from({ length: count }, (_, i) => bytes.readInt32LE(at + i * 4));

/** A colour that walks through a table, one unit every ninth call. */
function cycle(colour, counter, index, table) {
  const old = counter;
  if (old >>> 0 < 8) return { counter: old + 1, index, stepped: false };
  if (chase(colour, ints(table, index * 16))) {
    index += 1;
    if (table.readInt32LE(index * 16 + 12) === -1) index = 0;
  }
  return { counter: 0, index, stepped: true };
}

export function verify(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const checks = {};
  const problems = [];
  const check = (name, got, want, where) => {
    checks[name] ??= [0, 0];
    checks[name][1] += 1;
    if (Object.is(got, want) || (Array.isArray(got) && got.join() === want.join())) checks[name][0] += 1;
    else if (problems.length < 16) problems.push(`${where} ${name}: written ${got}, computed ${want}`);
  };
  const seen = { frames: 0, snap: 0, eased: 0, rising: 0, settled: 0, cycleA: 0, cycleB: 0, timeMoved: 0, rodsMoving: 0, coloursMoving: 0 };
  const facts = [];
  const probes = trace.probes;
  for (let n = 0; n + 4 < probes.length; n++) {
    const group = probes.slice(n, n + 5);
    if (group.some((probe, i) => probe.pc !== [UPDATE, ANGLES, MIX, CHASE, DONE][i])) continue;
    const [update, angles, mix, chaseIn, done] = group;
    const where = `frame ${update.frame}`;
    seen.frames += 1;
    const k1 = update.mem[3].bytes.readFloatLE(0), k2 = update.mem[3].bytes.readFloatLE(4), step = update.mem[3].bytes.readFloatLE(8);
    const tables = update.mem[2].bytes;

    // The appearance ramp: { length, value, changed, state }.
    const before = ints(update.mem[1].bytes, 0), after = ints(angles.mem[3].bytes, 0);
    const ramp = [...before];
    ramp[2] = 0;
    if (ramp[3] === 1) { ramp[1] += 1; if (ramp[1] === ramp[0]) { ramp[2] = 1; ramp[3] = 2; } }
    else if (ramp[3] === 3) { ramp[1] -= 1; if (ramp[1] === 0) { ramp[2] = 1; ramp[3] = 0; } }
    check('ramp', after, ramp, where);

    // Time to angles.
    const time = angles.mem[1].bytes;
    if (!time.equals(mix.mem[2].bytes) || !time.equals(done.mem[1].bytes)) seen.timeMoved += 1;
    const want = expectAngles(time, angles.mem[0].bytes, angles.mem[2].bytes, k1, k2);
    seen[want.snap ? 'snap' : 'eased'] += 1;
    const state = mix.mem[0].bytes;
    check('current rod', state.readInt32LE(0), want.current, where);
    check('rod angle', state.readUInt16LE(6), want.rod, where);
    check('seconds angle', state.readUInt16LE(4), want.seconds, where);
    check('hour hand', mix.mem[1].bytes.readUInt16LE(2), want.hourHand, where);
    check('second hand', mix.mem[1].bytes.readUInt16LE(0), want.secondHand, where);
    check('progress target', state.readFloatLE(0x270), want.progress, where);
    check('progress copy', mix.mem[1].bytes.readFloatLE(4), want.progress, where);

    // The two cycling colours and their mix.
    const base = ints(mix.mem[3].bytes, 0);
    const counters = ints(mix.mem[4].bytes, 0, 5);
    const a = cycle(base, counters[1], counters[0], tables.subarray(0));
    const accent = [0xa7, 0xd9, 0xff, 0];
    const b = cycle(accent, counters[3], counters[2], tables.subarray(0x60));
    const mixed = [0, 1, 2].map((c) => (accent[c] + base[c]) >> 1).concat(base[3]);
    if (a.stepped) seen.cycleA += 1;
    if (b.stepped) seen.cycleB += 1;
    const mid = chaseIn.mem[0].bytes;
    check('base colour', ints(chaseIn.mem[1].bytes, 0), base, where);
    check('accent colour', ints(mid, 0x280), accent, where);
    check('mixed colour', ints(mid, 0x290), mixed, where);
    check('cycle counters', ints(chaseIn.mem[2].bytes, 0, 5), [a.index, a.counter, b.index, b.counter, 3], where);

    // Every rod's two colours, and two more, chase their targets.
    const at = (pointer) => (pointer >= STATE_AT ? ints(mid, pointer - STATE_AT) : ints(chaseIn.mem[1].bytes, pointer - A.colours));
    const [others, accentTarget, currentBase, othersReflect, extraTarget, currentReflect] = [4, 5, 6, 7, 8, 9].map((r) => at(chaseIn.gpr[r]));
    const end = done.mem[0].bytes;
    const current = mid.readInt32LE(0);
    let moving = 0;
    for (let i = 0; i < 12; i++) {
      const colour = ints(mid, 0x20 + i * 0x30), reflect = ints(mid, 0x30 + i * 0x30);
      if (!chase(colour, i === current ? currentBase : others)) moving += 1;
      if (!chase(reflect, i === current ? currentReflect : othersReflect)) moving += 1;
      check('rod colour', ints(end, 0x20 + i * 0x30), colour, `${where} rod ${i}`);
      check('rod reflection colour', ints(end, 0x30 + i * 0x30), reflect, `${where} rod ${i}`);
    }
    if (moving) seen.coloursMoving += 1;
    const first = ints(mid, 0x250), second = ints(mid, 0x260);
    chase(first, accentTarget);
    chase(second, extraTarget);
    check('accent chaser', ints(end, 0x250), first, where);
    check('extra chaser', ints(end, 0x260), second, where);

    // Progress and appearance of every rod.
    const target = mid.readFloatLE(0x270);
    const appearance = f(Math.trunc((after[1] * 128) / after[0]) * 0.0078125);
    for (let i = 0; i < 12; i++) {
      let progress = 0;
      if (i === current) {
        const old = mid.readFloatLE(0x14 + i * 0x30);
        if (old < target) { progress = f(old + step); if (target < progress) progress = target; else seen.rising += 1; }
        else { progress = target; seen.settled += 1; }
      }
      check('rod progress', end.readFloatLE(0x14 + i * 0x30), progress, `${where} rod ${i}`);
      check('rod appearance', end.readFloatLE(0x10 + i * 0x30), appearance, `${where} rod ${i}`);
    }
    if (facts.length < 3 || n + 9 >= probes.length) {
      facts.push(`${where}: time ${time.readInt32LE(12)}:${time.readInt32LE(8)}:${time.readInt32LE(4)} + ${time.readFloatLE(0).toFixed(1)} ms  rod ${want.current}  rod angle ${want.rod}  seconds angle ${want.seconds}  progress ${want.progress.toFixed(4)}  ramp ${after}  base ${base}  accent ${accent}  factors ${k1} ${k2} step ${step}`);
    }
  }
  return { checks, problems, seen, facts };
}

if (process.argv[1] && process.argv[1].endsWith('verify_clock_state.mjs')) {
  const result = verify(process.argv[2]);
  console.log(`build: ${BUILD_NAME}`);
  console.log(`frames: ${result.seen.frames}   ${JSON.stringify(result.seen)}`);
  for (const line of result.facts) console.log(`  ${line}`);
  let whole = result.seen.frames > 0;
  for (const [name, [equal, total]] of Object.entries(result.checks)) {
    console.log(`  ${name.padEnd(22)} ${equal} of ${total} equal`);
    if (equal !== total) whole = false;
  }
  for (const text of result.problems) console.log(`  ! ${text}`);
  console.log(`verdict: ${whole ? `FOUND ${result.seen.frames} frames, every value equal` : 'PARTIAL the reading does not reproduce every value'}`);
  process.exit(whole ? 0 : 3);
}
