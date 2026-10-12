// The rod and orb init of the clock thread (HDD OSD 1.10U func_0022EF40, ROM 2.30 0x0022AF60), run from the console's own
// code over the time record and the generator state, and compared with the rule.
// Rule:
//   appearance ramp length (D_002B5640) = D_003702E8 (the ramps' length "one", set by func_00234B88)
//   accent (state +0x250) and fourth (+0x260) = the colour D_002B5660, before the logic below; after it every rod's base colour
//   (+0x20 + 0x30 i) = D_002B5660 for the current rod, D_002B5650 for the others, the current rod being hours mod 12
//   func_0022E9C8: current rod (state +0) = int(hours) mod 12; hour hand (D_00370A9A) = int(hours * 65536 / 12);
//     second hand (D_00370A98) and seconds angle (state +4) = int(seconds * 65536 / 60), rod angle (state +6) = (rod << 16) / 12,
//     all 16 bits; hours = h + minutes / 60, minutes = m + seconds / 60, seconds = s + ms / 1000 (floats cut toward zero)
//   func_0022EF20: one call of func_0022EBD0 (time to angles) then func_0022EE20 (colours) on that state: the model's `logic`
//     of References/model/clock_logic.mjs with the appearance ramp at rest (its rod loop is then overridden: every rod's
//     appearance (+0x10) and progress (+0x14) are stored 0 by func_0022EF40)
//   seven draws of rand (newlib: state = state * 0x41C64E6D + 12345, rand = state & 0x7FFFFFFF) store rand & 0xFFFF at D_00405210 + 4k
//   the generator word (*(_impure_ptr + 0x58)) ends advanced seven times
//   func_00239E60 and func_00238F20 (tail call; ROM 2.30 0x002364C8 and 0x002354D8) are hooked: verify_cold_ramps.mjs verifies them
//   ROM 2.30 (the 0230A image, the addresses of References/model/clock_memory.mjs; gp 0x2CFEF0 from func_0022AF60's `lw v1, -0x75E4(gp)` =
//   D_002C890C): the NTSC image only, the PAL image (0230E) has other data addresses
//   ROM 2.30's image is a dump of a running console: the pieces the init writes start from the HDD OSD ELF's initial values there
// node verify_cold_state.mjs [--out <dir>]    (CLOCK_BUILD=hdd|rom, CLOCK_VIDEO=pal)
import fs from 'node:fs';
import { openBuild, PAL, ROM_GP, memoryOps, Machine, loadImage } from './cold_mips.mjs';
import { BUILD, BUILD_NAME } from './builds.mjs';
import { f, add, toInt, s16, u16 } from '../model/clock_math.mjs';
import { Memory, addressOf, LAYOUT } from '../model/clock_memory.mjs';
import { logic } from '../model/clock_logic.mjs';
import { sampler } from './cold_samples.mjs';

if (BUILD === 'rom' && PAL) {
  console.log("ROM 2.30 PAL (0230E): the rule's data addresses are the 0230A image's; nothing to run");
  console.log('verdict: NOT VERIFIED 0230A only');
  process.exit(2);
}
const ROM_A_GP = ROM_GP;
const DELTA = BUILD === 'hdd' ? 0 : 0x1f040;
const A = {
  one: BUILD === 'hdd' ? 0x3702e8 : 0x2c890c,
  colourOthers: 0x2b5650 - DELTA, colourCurrent: 0x2b5660 - DELTA,
  hourHand: addressOf(BUILD, 'eased') + 2, secondHand: addressOf(BUILD, 'eased'),
};
const NAMES = ['time', 'eased', 'state', 'appearance', 'colours', 'cycleCounters', 'cycleTables', 'logicConstants', 'orbRandom'];

const build = openBuild([0x22ef40]);
const noop = () => undefined;
const hddInitial = new Machine(loadImage('hdd'));
const INIT_PIECES = [...NAMES, 'colours'];
const machineFor = () => {
  const m = BUILD === 'hdd' ? build.machine({ 0x239e60: noop, 0x238f20: noop }) : build.machine({ 0x239e60: noop }, { 0x2354d8: noop });
  if (BUILD === 'rom') m.setReg('gp', ROM_A_GP);
  if (BUILD === 'rom') for (const n of INIT_PIECES) for (let o = 0; o < (n === 'state' ? 0x2a0 : 0x90); o += 4) {
    if (n !== 'state' && o >= LAYOUT[n][2]) break;
    m.write32(addressOf('rom', n) + o, hddInitial.read32(addressOf('hdd', n) + o));
  }
  return m;
};
const problems = [];
const hex = (v) => `0x${(v >>> 0).toString(16)}`;
const bitsOf = (x) => { const b = Buffer.alloc(4); b.writeFloatLE(x); return b.readUInt32LE(0); };

const probe = machineFor();
const impureAt = memoryOps(probe, build.entry(0x29c6e8)).find((o) => o.op === 35).address;
const stateWord = () => probe.read32(impureAt) + 0x58;

const rand = sampler();
const cases = [];
const times = '0,0,0,0;3998,59,59,23;0,0,0,12;2000,30,30,5;0,5,0,11;1,1,59,13'.split(';').map((t) => t.split(',').map(Number));
for (let i = 0; i < 60; i++) times.push([rand(4000), rand(60), rand(60), rand(24)]);
times.forEach((t, i) => cases.push({ ms: t[0] / 4, s: t[1], m: t[2], h: t[3], seed: i < 3 ? [1, 0x60440537, 0xffffffff][i] : (rand(0x7fffffff) * 2 + rand(2)) >>> 0, one: 1 + rand(3) }));

const hoursOf = (c) => {
  const sec = add(c.s, f(c.ms / 1000)), min = add(c.m, f(sec / 60));
  return { sec, hours: add(c.h, f(min / 60)) };
};
const exportCases = [];
for (const c of cases) {
  const m = machineFor();
  const timeAt = addressOf(BUILD, 'time');
  m.write32(timeAt, bitsOf(c.ms)); m.write32(timeAt + 4, c.s); m.write32(timeAt + 8, c.m); m.write32(timeAt + 12, c.h);
  m.write32(A.one, c.one);
  const sw = m.read32(impureAt) + 0x58;
  m.write32(sw, c.seed);
  m.written.clear();
  const lengths = { time: 0x10, eased: 0x0c, state: 0x2a0, appearance: 0x10, colours: 0x40, cycleCounters: 0x14, cycleTables: 0x90, logicConstants: 0x0c, orbRandom: 0x1c };
  const mem = new Memory(BUILD, NAMES.map((n) => ({ address: addressOf(BUILD, n), bytes: m.bytes(addressOf(BUILD, n), lengths[n]) })));
  const state = mem.at('state'), eased = mem.at('eased'), ramp = mem.at('appearance');
  const { sec, hours } = hoursOf(c);
  const current = toInt(hours) % 12;
  const colourAt = (a) => Buffer.from(m.bytes(a, 16));
  colourAt(A.colourCurrent).copy(state, 0x250);
  colourAt(A.colourCurrent).copy(state, 0x260);
  const turn = ((current << 16) >>> 0) / 12 >>> 0;
  const secondsTurn = toInt(f(f(sec * 65536) / 60));
  state.writeInt32LE(current, 0);
  state.writeUInt16LE(u16(secondsTurn), 4);
  state.writeUInt16LE(u16(turn), 6);
  eased.writeUInt16LE(u16(secondsTurn), 0);
  eased.writeUInt16LE(u16(toInt(f(f(hours * 65536) / 12))), 2);
  ramp.writeInt32LE(c.one, 0);
  logic(mem);
  for (let i = 0; i < 12; i++) {
    state.writeFloatLE(0, 0x10 + i * 0x30);
    state.writeFloatLE(0, 0x14 + i * 0x30);
    colourAt(i === current ? A.colourCurrent : A.colourOthers).copy(state, 0x20 + i * 0x30);
  }
  let seed = c.seed;
  const angles = [];
  for (let k = 0; k < 7; k++) { seed = (Math.imul(seed, 0x41c64e6d) + 12345) >>> 0; angles.push((seed & 0x7fffffff) % 65536); }
  const orb = mem.at('orbRandom');
  angles.forEach((v, k) => orb.writeInt32LE(v, k * 4));
  const startState = m.read32(sw);

  m.trace.length = 0;
  m.call(build.entry(0x22ef40));

  const ruled = [];
  for (const n of NAMES) {
    const base = addressOf(BUILD, n), want = mem.at(n);
    ruled.push([base, want.length]);
    for (let o = 0; o < want.length; o += 4) {
      const got = m.read32(base + o), exp = want.readUInt32LE(o);
      if (got !== exp) problems.push(`${n}+${hex(o)}: ${hex(got)} want ${hex(exp)} (time ${c.h}:${c.m}:${c.s}.${c.ms}, seed ${hex(c.seed)})`);
    }
  }
  if (m.read32(sw) !== seed) problems.push(`generator ${hex(m.read32(sw))} want ${hex(seed)}`);
  ruled.push([sw, 4]);
  for (const a of m.written) {
    const w = a & ~3;
    if (w >= 0x1e00000) continue;
    if (!ruled.some(([b, l]) => w >= b && w < b + l)) problems.push(`${hex(w)} written with no rule`);
  }
  const words = (n) => Array.from({ length: lengths[n] / 4 }, (_, k) => m.read32(addressOf(BUILD, n) + k * 4));
  exportCases.push({ ms: bitsOf(c.ms), seconds: c.s, minutes: c.m, hours: c.h, seed: c.seed, one: c.one, startState, endState: m.read32(sw), state: words('state'), eased: words('eased'), appearance: words('appearance'), colours: words('colours'), cycleCounters: words('cycleCounters'), orbRandom: words('orbRandom') });
}
const dir = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
if (dir && BUILD === 'hdd') {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/state.json`, JSON.stringify({ cases: exportCases }, null, 1));
}
console.log(`${BUILD_NAME} ${PAL ? 'PAL' : 'NTSC'}: ${cases.length} cases`);
for (const p of problems.slice(0, 10)) console.log(`  ${p}`);
console.log(`verdict: ${problems.length ? `PARTIAL ${problems.length} differences` : 'FOUND the 0x22EF40 init equals the rule on every case'}`);
process.exit(problems.length ? 1 : 0);
