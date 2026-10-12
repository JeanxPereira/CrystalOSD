// The EE interpreter of cold_mips.mjs against the emulator: for each init function of the clock thread, the interpreter runs
// the console's own code from the memory and registers the capture probed at the function's entry (the probed ranges laid over
// the build's image, gp and the argument registers from the capture), and its memory afterwards is compared word by word with
// the capture's memory at the function's exit, over every probed range.
//   capture: hddosd-110U-cold-init-{ntsc,pal}, rom-0230A-cold-init-ntsc, rom-0230E-cold-init-pal (Watson captures)
//   rule: every probed word equals the capture's exit word, except the words a RULE exempts, each with its reason (a callee that
//   is out of the interpreter's scope, an input the capture holds and the interpreter does not)
// node verify_cold_interpreter.mjs <capture>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const capture = process.argv[2]?.split(/[/\\]/).pop().replace(/\.trace\.jsonl(\.gz)?$/, '');
if (!capture) { console.error('usage: node verify_cold_interpreter.mjs <capture>'); process.exit(2); }
const build = capture.startsWith('hddosd') ? 'hdd' : 'rom';
const pal = capture.includes('pal');
process.env.CLOCK_BUILD = build;
if (pal) process.env.CLOCK_VIDEO = 'pal'; else delete process.env.CLOCK_VIDEO;
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));
const load = (file) => import(pathToFileURL(path.join(HERE, file)).href);
const probes = await load('cold_init_probes.mjs');
const mips = await load('cold_mips.mjs');
const trace = await import(pathToFileURL(path.join(HERE, '../lib/trace.mjs')).href);
const { expand } = await load('extract_font.mjs');
const CAPTURES = process.env.CRYSTALOSD_CAPTURES ?? 'D:/CodingProjects/Watson/Runtime/captures';
const loaded = trace.readTraceFor(path.join(CAPTURES, `${capture}.trace.jsonl`), probes.PROBES);
if (!loaded.complete) throw new Error(`${capture}: ${loaded.reason}`);
const records = trace.probesOf(loaded, probes.PROBES);
const at = (pc) => records[probes.PROBES.findIndex((p) => parseInt(p.pc, 16) === pc)][0];

const hdd = build === 'hdd';
const address = (name) => probes.FUNCTIONS.find((f) => f[0] === name)[hdd ? 1 : 2];
const FUNCTIONS = ['func_00238F10', 'func_00235E98', 'func_00235848', 'func_00234F78', 'func_00234B88', 'do_load_font', 'func_0022EF40', 'func_002324C8',
  'func_00232858', 'func_0022CB50', 'func_00234C28', 'clock_stuff1', 'module_clock_225D98'];
const INIT = probes.FUNCTIONS[0][hdd ? 1 : 2];

const noop = () => undefined;
const FONT = 0x00900000;
const fontFile = hdd ? expand(fs.readFileSync(`${mips.REFERENCES}/dumps/hddosd-host/FNTOSD`)) : null;
const memset = (m) => { const d = Number(m.reg('a0')), v = Number(m.reg('a1')) & 255, n = Number(m.reg('a2')); for (let i = 0; i < n; i++) m.write8(d + i, v); return d; };
const { viewScreen } = await load('../model/clock_camera.mjs');
const identity = (m) => { const a = Number(m.reg('a0')); for (let i = 0; i < 16; i++) m.write32(a + 4 * i, i % 5 === 0 ? 0x3f800000 : 0); };
const bitsToFloat = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b.readFloatLE(0); };
const floatToBits = (x) => { const b = Buffer.alloc(4); b.writeFloatLE(x); return b.readUInt32LE(0); };
const screenMatrix = (m) => {
  const f = (n) => bitsToFloat(m.f[n]);
  const rows = viewScreen(f(12), f(13), f(14), f(15), f(16), f(17), f(18), f(19), bitsToFloat(m.read32(Number(m.reg('sp')))));
  const a = Number(m.reg('a0'));
  rows.forEach((row, r) => row.forEach((v, c) => m.write32(a + 16 * r + 4 * c, floatToBits(v))));
};
const HOOKS = {
  0x208350: () => ((pal ? 1 : 0) ^ (process.env.CONTROL === 'video' ? 1 : 0)),
  0x27b628: screenMatrix, 0x27b140: identity, 0x208378: () => 0, 0x288bd8: noop, 0x27bbc0: noop, 0x239f48: noop, 0x20bf00: noop,
  0x2893a8: noop,
  0x20bd28: () => FONT, 0x29c578: memset,
};
const EXTRA_ROOTS = { func_00238F10: [0x238ea0], func_002324C8: [0x22a9c0, 0x228220] };
const PRELUDE = { func_00234F78: ['func_00235848'], func_0022CB50: ['do_load_font'] };
const ROM_RAW = { 0x263940: noop, 0x221488: noop, 0x207480: noop, 0x272b48: noop, 0x272fa0: noop, 0x26e700: noop };

/**
 * Why a word may differ: a thread other than the clock's wrote it between the probes, or an input is outside the probed ranges.
 * Each rule must exempt at least one word of the capture it is listed for (a stale rule fails).
 */
const queueBuild = mips.openBuild([0x200c00]);
const queueOps = mips.memoryOps(queueBuild.machine({}), queueBuild.entry(0x200c00));
const queueFrom = queueBuild.entry(0x200c00);
const composed = new Set();
{
  const m = queueBuild.machine({});
  const high = {};
  for (let a = queueFrom; a < queueFrom + 0x140; a += 4) {
    const w = m.read32(a), op = w >>> 26, rs = (w >>> 21) & 31, rt = (w >>> 16) & 31;
    if (op === 15) high[rt] = (w & 0xffff) << 16;
    else if (op === 13 && high[rs] !== undefined) { high[rt] = (high[rs] | (w & 0xffff)) >>> 0; composed.add(high[rt]); }
  }
}
const ringBase = Math.min(...[...composed].filter((a) => a >= 0x1f0000 && a < 0x1f1000));
const queueWords = [...new Set(queueOps.filter((o) => o.op === 35 || o.op === 43).map((o) => o.address))];
const inRing = (a) => a >= ringBase && a < ringBase + 0x400;
const RULES = [
  { name: 'the sound command queue', applies: (a) => inRing(a) || queueWords.includes(a), reason: 'the sound thread takes commands off the queue (ring from 0x' + ringBase.toString(16) + ', its indices) while the clock thread runs' },
  ...(hdd ? [
    { name: 'the vsync counter', applies: (a) => a === 0x36ff84, reason: 'D_0036FF84 counts the vsync interrupts (handler D_00214E70)' },
    { name: 'the keyboard and mouse settings', fn: 'func_00234F78', applies: (a) => a >= 0x409188 && a < 0x4091a0, reason: 'the loop reads the console bytes at 0x1F1284.., outside the probed ranges: the interpreter reads zeros' },
  ] : [
    { name: "ROM 2.30's list builder", fn: 'func_002324C8', applies: (a) => [0x2953f8, 0x2953fc, 0x2c8840, 0x2c88ac].includes(a), reason: "the twin of func_00228220 reads and writes ROM words (the list's template count, the aspect ratio) from inputs outside the probed ranges; verify_cold_config does not claim ROM" },
  ]),
];
const usedRules = new Set();
const exitOf = (name) => {
  const chain = probes.SITES.findIndex((s) => s.name === name);
  if (chain >= 0) return at(chain + 1 < probes.SITES.length ? probes.SITES[chain + 1].site : INIT + 0xb8);
  const slots = probes.THREAD_EXITS[name];
  return at(slots[slots.length - 1]);
};

const problems = [];
const hex = (v) => `0x${(v >>> 0).toString(16).padStart(8, '0')}`;
const skipped = [];
let seeded = null;
let words = 0, written = 0, exempted = 0, slotStores = 0;
const hddOf = (name) => probes.FUNCTIONS.find((f) => f[0] === name)[1];
const bld = mips.openBuild([], Object.fromEntries(probes.FUNCTIONS.map((f) => [f[1], f[2]])));
for (const name of FUNCTIONS) {
  if (!hdd && (name === 'do_load_font' || name === 'func_0022CB50')) { skipped.push(name); continue; }
  const entry = at(address(name)), exit = exitOf(name);
  const hddAddress = probes.FUNCTIONS.find((f) => f[0] === name)[1];
  for (const root of [hddAddress, ...(EXTRA_ROOTS[name] ?? [])]) bld.learn(root);
  const stopAt = probes.THREAD_EXITS[name] ? probes.THREAD_EXITS[name][probes.THREAD_EXITS[name].length - 1] : null;
  const stop = () => { throw new Error('STOP'); };
  const usable = {};
  for (const [k, v] of Object.entries(HOOKS)) { try { bld.machine({ [k]: v }); usable[k] = v; } catch { /* a callee this function does not reach */ } }
  const m = bld.machine(usable, { ...(hdd ? {} : ROM_RAW), ...(stopAt ? { [stopAt]: stop } : {}) });
  for (const range of entry.mem) {
    if (!range.bytes) continue;
    for (let o = 0; o + 4 <= range.bytes.length; o += 4) m.write32(range.address + o, range.bytes.readUInt32LE(o));
  }
  if (name === 'do_load_font' || PRELUDE[name]?.includes('do_load_font')) for (let i = 0; i < fontFile.length; i++) m.write8(FONT + i, fontFile[i]);
  if (!hdd && name === 'func_0022EF40') {
    const impure = mips.memoryOps(m, bld.entry(0x29c6e8)).find((o) => o.op === 35).address;
    const angles = [0, 1, 2, 3, 4, 5, 6].map((k) => exit.mem.map((r) => (r.bytes && 0x3711e0 + 4 * k >= r.address && 0x3711e0 + 4 * k < r.address + r.bytes.length ? r.bytes.readUInt32LE(0x3711e0 + 4 * k - r.address) : null)).find((v) => v !== null));
    let seed = -1;
    for (let candidate = 0; candidate < 65536 && seed < 0; candidate++) {
      let state = candidate;
      if (angles.every((angle) => { state = (state * 0x4e6d + 12345) & 0xffff; return state === angle; })) seed = candidate;
    }
    if (seed < 0) problems.push('func_0022EF40: no generator state gives the capture seven angles');
    m.write32(m.read32(impure) + 0x58, Math.max(seed, 0));
    seeded = seed;
  }
  if (!hdd) m.write32(0x1f0cd0, 0);
  m.written.clear();
  m.setReg('gp', entry.gpr[28]);
  try {
    for (const before of PRELUDE[name] ?? []) { bld.learn(probes.FUNCTIONS.find((f) => f[0] === before)[1]); m.call(bld.entry(probes.FUNCTIONS.find((f) => f[0] === before)[1])); }
    for (const range of entry.mem) {
      if (!range.bytes) continue;
      for (let o = 0; o + 4 <= range.bytes.length; o += 4) {
        const a = range.address + o;
        if (m.written.has(a) || m.written.has(a + 1) || m.written.has(a + 2) || m.written.has(a + 3)) m.write32(a, range.bytes.readUInt32LE(o));
      }
    }
    m.written.clear();
    for (let r = 4; r < 8; r++) m.setReg(['a0', 'a1', 'a2', 'a3'][r - 4], entry.gpr[r] >>> 0);
    entry.fpr.forEach((v, i) => { m.f[i] = v >>> 0; });
    m.call(bld.entry(hddAddress), [], 5e7);
  } catch (error) {
    if (error.message !== 'STOP') {
      problems.push(`${name}: ${error.message} (ra ${hex(Number(BigInt.asUintN(32, m.reg('ra'))))})`);
      continue;
    }
  }
  if (process.env.DEBUG_WORDS) for (const a of process.env.DEBUG_WORDS.split(',').map((x) => parseInt(x, 16))) console.log(`  ${name} ${hex(a)} interpreter ${hex(m.read32(a))} emulator exit ${hex(exit.mem.map((r) => (r.bytes && a >= r.address && a < r.address + r.bytes.length ? r.bytes.readUInt32LE(a - r.address) : null)).find((v) => v !== null))}`);
  let count = 0, differ = 0;
  entry.mem.forEach((range, k) => {
    const after = exit.mem[k].bytes;
    if (!range.bytes || !after) return;
    for (let o = 0; o + 4 <= range.bytes.length; o += 4) {
      const a = range.address + o;
      const want = after.readUInt32LE(o), got = m.read32(a);
      count++;
      if (want !== range.bytes.readUInt32LE(o)) written++;
      if (got === want) continue;
      const key = `${name}:${hex(a)}`;
      if (probes.THREAD_EXITS[name]) {
        const next = at(INIT).mem[k].bytes;
        if (next && next.readUInt32LE(o) === got) { slotStores++; continue; }
      }
      const rule = RULES.find((r) => (!r.fn || r.fn === name) && r.applies(a));
      if (rule) { usedRules.add(rule.name); exempted++; continue; }
      differ++;
      if (differ <= 40) problems.push(`${name} ${hex(a)}: interpreter ${hex(got)} emulator ${hex(want)} (entry ${hex(range.bytes.readUInt32LE(o))})`);
    }
  });
  if (differ > 40) problems.push(`${name}: ${differ - 40} more differences`);
  words += count;
}
if (seeded !== null) console.log(`  ROM 2.30 func_0022EF40: the generator word is in the heap, outside the probed ranges; the low 16 bits that give the capture's seven angles (found by search over the generator's low half, 0x${seeded.toString(16)}) are written before the run; the interpreter's rand code, its angle stores and everything else are compared as for the HDD`);
if (skipped.length) console.log(`  not run on ${build}: ${skipped.join(', ')} (verify_cold_font.mjs has no ROM witness: another function)`);
for (const r of RULES) if (!usedRules.has(r.name)) problems.push(`stale rule: ${r.name}`);
for (const r of RULES) if (usedRules.has(r.name)) console.log(`  exempt: ${r.name}: ${r.reason}`);
console.log(`${capture}: ${FUNCTIONS.length} functions, ${words} probed words compared, ${written} changed by the console's code, ${exempted} exempt, ${slotStores} stored by a jr delay slot (the probe precedes it; the next record at the init's entry holds the value)`);
for (const p of problems) console.log(`  ${p}`);
console.log(`verdict: ${problems.length ? `PARTIAL ${problems.length} differences` : 'FOUND the interpreter equals the emulator on every init function'}`);
process.exit(problems.length ? 1 : 0);
