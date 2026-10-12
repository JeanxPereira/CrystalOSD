// The transitions of the clock scene: the mode and its weight, the ramps they start, and what the
// orb draw-entry function does with them (displaced positions, blended colours). Recompute each
// from what the code really read and compare with what it really wrote; print the timeline.
//
//   HDD OSD 1.10U                         ROM 2.30
//   clock_orb_rendering_func 0x00225E80   0x00221558   one frame
//   module_clock_234E70      0x00234E70   0x00231478   ticks the band ramp, draws the overlay
//   func_00234EA8            0x00234EA8   0x002314b0   steps the weight, ends modes 1 and 2
//   func_00234C28            0x00234C28   0x00231230   sets the mode
//   func_00234B88            0x00234B88   0x00231190   resets mode and weight (clock thread start)
//   module_clock_22F908      0x0022F908   0x0022b928   one orb: position, colour, ring, draw
//   module_clock_239E98      0x00239E98   0x00236500   push on the orb's ring
//   StartSysConfig           0x00230EC0   0x0022d040   System Configuration opens
//
// node verify_transitions.mjs <trace.jsonl> [--timeline]
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { pick, range, pc, BUILD_NAME } from './builds.mjs';

const A = pick({
  hdd: {
    frame: 0x00225e80, rampIn: 0x00234e70, rampOut: 0x00234e84, tick: 0x00234ea8, after: 0x00235b10, setMode: 0x00234c28, init: 0x00234b88,
    bandRise: 0x00234cd0, bandFall: 0x00234d18, openConfig: 0x00230ec0, rodsOn: 0x0022f078, rodsOff: 0x0022f110, backgroundOn: 0x002331c8,
    orbPosition: 0x0022f93c, push: 0x00239e98,
    mode: 0x00370ab4, weight: 0x00370ab8, bandLength: 0x003702e4, band: 0x002b5f20, overlay: 0x002b5f30, random: 0x00405210, screen: 0x001f0cb4,
    wide: 0x001f064c, colours: 0x002b5670, screenCode: 0x00370a7c, offset: 0x00370a80, scale: 0x002b2170, target: 0x00370294, appear: 0x002b5640,
    config: 0x002b2e04, background: 0x002b5cd0, sprite: 0x002b61b0, pending: 0x001f000c, intro: 0x00370264, filled: 0x00370324,
    menu: 0x002b2e78, item: 0x002b2e70, alone: 0x002b5780, blur: 0x00370aa4,
    groups: [[0x00370a70, 0x50], [0x00370260, 0xd0], [0x002b2170, 0x30], [0x002b5f20, 0x60], [0x002b5640, 0x10], [0x002b2de8, 0xa0], [0x002b5740, 0x50], [0x001f0000, 0x14]],
    more: [[0x002b5f20, 0x10], [0x002b5cd0, 0x10], [0x002b61b0, 0x10], [0x001f0640, 0x10], [0x002b46d0, 0x30]],
  },
  rom: {
    frame: 0x00221558, rampIn: 0x00231478, rampOut: 0x0023148c, tick: 0x002314b0, after: 0x00232028, setMode: 0x00231230, init: 0x00231190,
    bandRise: 0x002312d8, bandFall: 0x00231320, openConfig: 0x0022d040, rodsOn: 0x0022b098, rodsOff: 0x0022b130, backgroundOn: 0x0022f528,
    orbPosition: 0x0022b95c, push: 0x00236500,
    mode: 0x002c8f6c, weight: 0x002c8f70, bandLength: 0x002c8908, band: 0x00297120, overlay: 0x00297130, random: 0x003711e0, screen: 0x001f0c50,
    wide: 0x001f05ec, colours: 0x00296630, screenCode: 0x002c8f1c, offset: 0x002c8f20, scale: 0x0028a340, target: 0x002c88ac, appear: 0x00296600,
    config: 0x0028b00c, background: 0x00296c90, sprite: 0x00297410, pending: 0x001f13c4, intro: null, filled: null,
    menu: 0x0028b070, item: 0x0028b068, alone: 0x00296740, blur: 0x002c8f5c,
    groups: [[0x002c8f10, 0x70], [0x002c8870, 0xa0], [0x0028a340, 0x30], [0x00297120, 0x60], [0x00296600, 0x10], [0x0028aff0, 0x90], [0x00296700, 0x50], [0x001f13c0, 0x8]],
    more: [[0x00297120, 0x10], [0x00296c90, 0x10], [0x00297410, 0x10], [0x001f05e0, 0x10]],
  },
});
const BAND = range(A.band, 0x10);
const MODE = range(A.mode, 8);
export const PROBES = [
  { pc: pc(A.frame), ranges: A.groups.map(([address, length]) => range(address, length)) },
  { pc: pc(A.rampIn), ranges: A.more.map(([address, length]) => range(address, length)) },
  { pc: pc(A.rampOut), ranges: [BAND] },
  { pc: pc(A.tick), ranges: [MODE, range(A.bandLength, 4), BAND] },
  { pc: pc(A.after), ranges: [MODE, BAND] },
  { pc: pc(A.setMode), ranges: [] },
  { pc: pc(A.init), ranges: [] },
  { pc: pc(A.bandRise), ranges: [] },
  { pc: pc(A.bandFall), ranges: [] },
  { pc: pc(A.openConfig), ranges: [] },
  { pc: pc(A.rodsOn), ranges: [] },
  { pc: pc(A.rodsOff), ranges: [] },
  { pc: pc(A.backgroundOn), ranges: [] },
  { pc: pc(A.orbPosition), ranges: ['sp:0x10', MODE, range(A.random, 0x1c), range(A.screen, 8), range(A.wide, 4), range(A.colours, 0x90)] },
  { pc: pc(A.push), ranges: ['a1:0x20'] },
];

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
const half = (n) => (n + (n >>> 31)) >> 1;

// The quarter-wave sine table as the code fills it (verify_placement.mjs: all 16385 entries equal).
const TABLE = Float32Array.from({ length: 0x4001 }, (_, i) => Math.sin((i * 1.5707963267948966) / 16385));
const sin = (angle) => {
  const a = s16(angle);
  let v = a < 0 ? -a : a;
  if (v >= 0x4000) v = 0x8000 - v;
  return a < 0 ? -TABLE[v] : TABLE[v];
};
const cos = (angle) => sin(s16(angle) + 0x4000);

/** Bytes of a probe at an absolute address, from whichever recorded range holds them. */
function at(probe, address, length) {
  for (const entry of probe.mem) {
    if (entry.bytes && address >= entry.address && address + length <= entry.address + entry.bytes.length) return entry.bytes.subarray(address - entry.address, address - entry.address + length);
  }
  return null;
}
const int = (probe, address) => at(probe, address, 4)?.readInt32LE(0) ?? null;
const float = (probe, address) => at(probe, address, 4)?.readFloatLE(0) ?? null;
const ramp = (probe, address) => { const b = at(probe, address, 16); return b ? [0, 4, 8, 12].map((o) => b.readInt32LE(o)) : null; };

/** One tick of a ramp { length, value, changed, state }. */
function tickRamp([length, value, , state]) {
  let changed = 0;
  if (state === 1) { value += 1; if (value === length) { state = 2; changed = 1; } }
  else if (state === 3) { value -= 1; if (value === 0) { state = 0; changed = 1; } }
  return [length, value, changed, state];
}

/** What func_00234EA8 leaves: mode, weight, and whether it starts the band ramp. */
export function expectTick(mode, weight, bandLength) {
  let a0 = mode;
  if (mode > 0 && mode < 3) {
    weight += 1;
    if (weight > 128) { weight = 128; a0 = 0; mode = 0; }
  } else if (mode === 3) {
    weight -= 1;
    if (weight < 0) weight = 0;
  }
  return { mode, weight, startsBand: a0 === 2 && weight === 128 - bandLength };
}

/** What func_00234C28 leaves for a mode: the weight (null = untouched) and the overlay colour. */
const SET_MODE = { 1: { weight: 0, colour: 0xff }, 2: { weight: 0, colour: 0 }, 3: { weight: 0x80, colour: 0 }, 4: { weight: 0, colour: 0 } };

/** Position and colour the orb draw-entry function hands to the ring, for orb k. */
export function expectOrb(k, x, y, mode, weight, random, screenW, screenH, wide, base, perOrb) {
  let branch = 'none';
  if (mode === 2 && wide === 1) branch = 'mode 2, every orb';
  else if (mode === 2 && k === 0) branch = 'mode 2, orb 0';
  else if (mode === 3 && k === 0) branch = 'mode 3, orb 0';
  if (branch !== 'none') {
    const a = s16(toInt(f(Math.fround(weight << 14) * 0.0078125)));
    const s = s16(random);
    const rest = f(1 - sin(a));
    const dx = f(f(half(screenW) * cos(s)) * rest);
    const dy = f(f(half(screenH) * sin(s)) * rest);
    if (mode === 2) { x = f(x + dx); y = f(y + dy); }
    else {
      const w = f(weight * 0.0078125);
      const fy = f(dy * 1.5), fx = f(dx * 1.5);
      y = f(f(y * w) + fy);
      x = f(f(x * w) + fx);
    }
  }
  let own = 0;
  if (mode === 3 && k === 0) own = 128 - weight;
  else if (mode === 2) own = 128 - weight;
  const other = mode === 2 || (mode === 3 && k === 0) ? weight : 128;
  const colour = [0, 1, 2, 3].map((i) => (Math.imul(perOrb.readInt32LE((mode === 3 ? 0 : k) * 16 + i * 4), own) + Math.imul(base.readInt32LE(i * 4), other)) >> 7);
  return { x, y, colour, branch };
}

const NAMES = new Map([[A.setMode, 'set mode'], [A.init, 'reset mode'], [A.bandRise, 'band rise asked'], [A.bandFall, 'band fall asked'], [A.openConfig, 'open System Configuration'],
  [A.rodsOn, 'rods on'], [A.rodsOff, 'rods off'], [A.backgroundOn, 'background ramp asked']]);

export function verify(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const checks = {};
  const problems = [];
  const check = (name, same, text) => {
    checks[name] ??= [0, 0];
    checks[name][1] += 1;
    if (same) checks[name][0] += 1;
    else if (problems.length < 16) problems.push(`${name}: ${text()}`);
  };
  const seen = { ticks: {}, setMode: {}, orbBranches: {}, bandStarts: 0, bandTicks: {} };
  const frames = [];
  const events = [];
  let pendingSet = null, orbIn = null, rampIn = null, tickIn = null, row = null;
  for (const probe of trace.probes) {
    const pcAt = probe.pc;
    const mode = int(probe, A.mode), weight = int(probe, A.weight);
    // A set mode is checked at the first later probe that shows mode and weight.
    if (pendingSet && mode !== null && pcAt !== A.after) {
      const want = SET_MODE[pendingSet.mode];
      check('set mode: mode', mode === pendingSet.mode, () => `frame ${probe.frame}: asked ${pendingSet.mode}, found ${mode}`);
      if (want) check('set mode: weight', weight === want.weight, () => `frame ${probe.frame}: mode ${pendingSet.mode}, weight ${weight}`);
      const overlay = at(probe, A.overlay, 0x28);
      if (overlay && want) {
        const screen = [int(probe, A.screen), int(probe, A.screen + 4)];
        check('set mode: overlay colour', [0, 4, 8].every((o) => overlay.readInt32LE(o) === want.colour), () => `frame ${probe.frame}: ${[0, 4, 8].map((o) => overlay.readInt32LE(o))}`);
        if (screen[0] !== null) check('set mode: overlay size', overlay.readInt32LE(0x20) === screen[0] << 4 && overlay.readInt32LE(0x24) === screen[1] << 4, () => `frame ${probe.frame}`);
      }
      pendingSet = null;
    }
    if (NAMES.has(pcAt)) {
      const text = pcAt === A.setMode ? `set mode ${probe.gpr[4]} (caller returns to 0x${(probe.gpr[31] >>> 0).toString(16)})` : NAMES.get(pcAt);
      events.push({ frame: probe.frame, text });
      if (row) row.events.push(text);
      if (pcAt === A.setMode) { pendingSet = { mode: probe.gpr[4] | 0 }; seen.setMode[pendingSet.mode] = (seen.setMode[pendingSet.mode] ?? 0) + 1; }
    }
    if (pcAt === A.frame) {
      row = { frame: probe.frame, mode, weight, screenCode: int(probe, A.screenCode), pending: int(probe, A.pending), offset: float(probe, A.offset), scale: float(probe, A.scale),
        target: float(probe, A.target), band: ramp(probe, A.band), appear: ramp(probe, A.appear), config: ramp(probe, A.config), overlayAlpha: int(probe, A.overlay + 0xc),
        menu: ramp(probe, A.menu), item: int(probe, A.item), alone: ramp(probe, A.alone), blur: int(probe, A.blur),
        intro: A.intro ? int(probe, A.intro) : null, filled: A.filled ? int(probe, A.filled) : null, events: [], orbs: 0 };
      frames.push(row);
    } else if (pcAt === A.rampIn) {
      rampIn = probe;
      if (row) { row.background = ramp(probe, A.background); row.sprite = ramp(probe, A.sprite); row.wide = int(probe, A.wide); }
    } else if (pcAt === A.rampOut && rampIn) {
      const before = ramp(rampIn, A.band), after = ramp(probe, A.band);
      seen.bandTicks[before[3]] = (seen.bandTicks[before[3]] ?? 0) + 1;
      check('band ramp tick', after.join() === tickRamp(before).join(), () => `frame ${probe.frame}: ${before} -> ${after}`);
      rampIn = null;
    } else if (pcAt === A.tick) tickIn = probe;
    else if (pcAt === A.after && tickIn) {
      const before = { mode: int(tickIn, A.mode), weight: int(tickIn, A.weight) };
      const want = expectTick(before.mode, before.weight, int(tickIn, A.bandLength));
      seen.ticks[before.mode] = (seen.ticks[before.mode] ?? 0) + 1;
      check('tick: mode', mode === want.mode, () => `frame ${probe.frame}: mode ${before.mode} weight ${before.weight} -> mode ${mode}`);
      check('tick: weight', weight === want.weight, () => `frame ${probe.frame}: mode ${before.mode} weight ${before.weight} -> ${weight}, computed ${want.weight}`);
      const band = ramp(tickIn, A.band);
      const wantBand = want.startsBand && band[3] === 0 ? [band[0], 0, 1, 1] : band;
      if (want.startsBand) seen.bandStarts += 1;
      check('tick: band ramp', ramp(probe, A.band).join() === wantBand.join(), () => `frame ${probe.frame}: ${band} -> ${ramp(probe, A.band)}`);
      tickIn = null;
    } else if (pcAt === A.orbPosition) orbIn = probe;
    else if (pcAt === A.push && orbIn) {
      const k = probe.gpr[4];
      const start = orbIn.mem[0].bytes, sent = probe.mem[0].bytes;
      const want = expectOrb(k, start.readFloatLE(0), start.readFloatLE(4), int(orbIn, A.mode), int(orbIn, A.weight), at(orbIn, A.random, 0x1c).readInt32LE(k * 4),
        int(orbIn, A.screen), int(orbIn, A.screen + 4), int(orbIn, A.wide), at(orbIn, A.colours, 16), at(orbIn, A.colours + 16, 0x70));
      seen.orbBranches[want.branch] = (seen.orbBranches[want.branch] ?? 0) + 1;
      if (row) row.orbs += 1;
      const where = () => `frame ${probe.frame} orb ${k} (${want.branch}, mode ${int(orbIn, A.mode)} weight ${int(orbIn, A.weight)})`;
      check(`orb position (${want.branch})`, Object.is(sent.readFloatLE(0), want.x) && Object.is(sent.readFloatLE(4), want.y) && sent.readUInt32LE(8) === start.readUInt32LE(8),
        () => `${where()}: handed ${sent.readFloatLE(0)}, ${sent.readFloatLE(4)}; computed ${want.x}, ${want.y}`);
      check(`orb colour (mode ${int(orbIn, A.mode)})`, [0, 1, 2, 3].every((i) => sent.readInt32LE(0x10 + i * 4) === want.colour[i]),
        () => `${where()}: handed ${[0, 1, 2, 3].map((i) => sent.readInt32LE(0x10 + i * 4))}; computed ${want.colour}`);
      orbIn = null;
    }
  }
  return { checks, problems, seen, frames, events };
}

const show = (r) => (r ? `${r[1]}/${r[0]}s${r[3]}` : '-');
function timeline(frames) {
  const lines = [];
  let last = '';
  for (const row of frames) {
    const key = [row.mode, row.screenCode, row.pending, row.band?.[3], row.appear?.[3], row.config?.[3], row.background?.[3], row.sprite?.[3], row.target, row.intro, row.filled, row.orbs, row.wide, row.menu?.[3], row.item, row.alone?.[3],
      row.weight === 0 || row.weight === 128 ? row.weight : 'x', row.events.join()].join('|');
    if (key === last) continue;
    last = key;
    lines.push(`frame ${String(row.frame).padStart(5)}  mode ${row.mode} weight ${String(row.weight).padStart(3)}  code ${row.screenCode} pending ${row.pending} wide ${row.wide}  offset ${row.offset?.toFixed(3)}  scale ${row.scale?.toFixed(4)} -> ${row.target}`
      + `  band ${show(row.band)} rods ${show(row.appear)} config ${show(row.config)} background ${show(row.background)} sprites ${show(row.sprite)} menu ${show(row.menu)} item ${row.item} alone ${show(row.alone)} blur ${row.blur}  orbs ${row.orbs}`
      + (row.intro !== null ? `  intro ${row.intro} filled ${row.filled}` : '') + (row.events.length ? `  << ${row.events.join('; ')}` : ''));
  }
  return lines;
}

if (process.argv[1] && process.argv[1].endsWith('verify_transitions.mjs')) {
  const result = verify(process.argv[2]);
  console.log(`build: ${BUILD_NAME}   frames: ${result.frames.length}`);
  if (process.argv.includes('--timeline')) {
    console.log('ramps are value/length and state (0 idle, 1 rising, 2 held, 3 falling); a row is printed when anything but the counters changes');
    for (const line of timeline(result.frames)) console.log(line);
  }
  console.log(`mode at the ticks: ${JSON.stringify(result.seen.ticks)}   set mode calls: ${JSON.stringify(result.seen.setMode)}   band ramp started by the tick: ${result.seen.bandStarts}`);
  console.log(`band ramp state at its ticks: ${JSON.stringify(result.seen.bandTicks)}   orb branches: ${JSON.stringify(result.seen.orbBranches)}`);
  let whole = Object.keys(result.checks).length > 0;
  for (const [name, [equal, total]] of Object.entries(result.checks)) {
    console.log(`  ${name.padEnd(42)} ${equal} of ${total} equal`);
    if (equal !== total) whole = false;
  }
  for (const text of result.problems) console.log(`  ! ${text}`);
  console.log(`verdict: ${whole ? 'FOUND every value equal' : 'PARTIAL the reading does not reproduce every value'}`);
  process.exit(whole ? 0 : 3);
}
