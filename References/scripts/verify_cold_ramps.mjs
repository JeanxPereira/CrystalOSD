// The init's ramp helpers and length setters, run from the console's own code and compared with the rule.
// HDD OSD 1.10U (canon): func_00234B88, func_00238F20, func_00239E60, func_002324C8 (without the list
// builder func_00228220), func_00232858, func_0022A9C0 and the ramp helpers func_00234AB0/AC0/B10/A98.
// ROM 2.30 (second witness): the same functions found by head match (match_functions.mjs), run over its
// RAM image; its stores must be the same values in the same order as the HDD OSD's.
// The code runs in cold_mips.mjs over the memory of the program's initial image; callees outside the
// question (is_pal_vmode, sceVu0 matrix calls, the list builder, the sound queue) are hooked.
// Rule, with fps = PAL ? 50 : 60 and C integer division:
//   menuShort = fps*40/60, menuLong = fps*80/60, one = 1 (D_003702E0..E8)
//   vignette ramp (D_002B5F20) length = menuLong, reset; vignetteLength = menuLong; mode = 0; overlay flag = 0
//   spriteFade (D_002B61B0) length = fps*256/60, reset, started and ticked to its end: counter = length, changed = 1, state = 2
//   body = fps*40/60 (D_003702CC), tail = fps/6 (D_003702D0)
//   cubeRamp (D_002B5740) length = body; menuRamp (D_002B5780) length = body + tail
//   configRamp (D_002B2E04) length = menuShort + body + tail; mainMenu ramp (D_002B2E78) length = tail, reset
//   versionRamp (D_002B3000) length = tail; page template D_002B2F90 +0x1C = tail; entry 0 of it (0x54 bytes) copied to each of the 30 entries of D_00404370
//   greyRamp (D_002B5CD0) length = menuShort; greys D_00370AA8/AAC/AB0 = 0; counter D_003702D4 = 0
//   the ten ring records (D_002B6200 + k*0x650, the loop ends at +0x3F20; the orbs use seven): head, count, full = 0
// node verify_cold_ramps.mjs [--out <dir>]    (CLOCK_BUILD=hdd|rom, CLOCK_VIDEO=pal)
import fs from 'node:fs';
import { openBuild, FPS, PAL, ROM_GP, gpAddress } from './cold_mips.mjs';
import { BUILD, BUILD_NAME } from './builds.mjs';

const ADDR = { menuShort: 0x3702e0, menuLong: 0x3702e4, one: 0x3702e8, vignette: 0x2b5f20, vignetteLength: 0x3702e4, mode: 0x370ab4, overlay: 0x370ab8, spriteFade: 0x2b61b0, body: 0x3702cc, tail: 0x3702d0, cube: 0x2b5740, menu: 0x2b5780, config: 0x2b2e04, mainMenu: 0x2b2e78, version: 0x2b3000, template: 0x2b2f90, page: 0x404370, pagePointer: 0x3701c0, grey: 0x2b5cd0, greys: [0x370aa8, 0x370aac, 0x370ab0], counter: 0x3702d4, rings: 0x2b6200, level: 0x370aa4, spin: 0x370290, configPage18: 0x2b2e00, cubeScreen: 0, };
const ROOTS = [0x234b88, 0x238f20, 0x239e60, 0x2324c8, 0x232858, 0x22a9c0];
const noop = () => undefined;

const build = openBuild(ROOTS);
const m = build.machine({
  0x208350: () => (PAL ? 1 : 0),
  0x27b628: noop, 0x27b140: noop, 0x228220: noop, 0x208378: () => 0, 0x200c00: noop,
});
const first = new Map();
const stores = [];
const gpStores = [];
for (const entry of ROOTS) { if (entry === 0x22a9c0) continue; m.trace.length = 0; m.call(build.entry(entry)); stores.push(...m.trace.map((t) => t.value)); for (const t of m.trace) if (((m.read32(t.pc) >>> 21) & 31) === 28) gpStores.push(t); }

if (process.argv.includes('--stores')) { console.log(JSON.stringify(stores)); process.exit(0); }
const initial = build.machine({});
const wantWords = new Map();
const set = (a, v) => wantWords.set(a, v >>> 0);
const ramp = (a, length, counter, changed, state) => { set(a, length); set(a + 4, counter); set(a + 8, changed); set(a + 12, state); };
const menuShort = Math.trunc(FPS * 40 / 60), menuLong = Math.trunc(FPS * 80 / 60), body = Math.trunc(FPS * 40 / 60), tail = Math.trunc(FPS / 6);
const spriteLength = Math.trunc(FPS * 256 / 60);
set(ADDR.menuShort, menuShort); set(ADDR.menuLong, menuLong); set(ADDR.one, 1);
set(ADDR.mode, 0); set(ADDR.overlay, 0);
ramp(ADDR.vignette, menuLong, 0, 0, 0);
ramp(ADDR.spriteFade, spriteLength, 0, 1, 1);
set(ADDR.body, body); set(ADDR.tail, tail);
set(ADDR.cube, body); set(ADDR.menu, body + tail);
set(ADDR.config, menuShort + body + tail);
ramp(ADDR.mainMenu, tail, 0, 0, 0);
set(ADDR.version, tail);
set(ADDR.grey, menuShort);
for (const a of ADDR.greys) set(a, 0);
set(ADDR.counter, 0);
set(ADDR.level, 0); set(ADDR.spin, 0 | 0);
set(ADDR.configPage18, 0);
for (let k = 0; k < 10; k++) for (const o of [0, 4, 8]) set(ADDR.rings + k * 0x650 + o, 0);
const template = [];
for (let i = 0; i < 30 * 0x54 / 4; i++) template.push(initial.read32(ADDR.template + i * 4));
template[0x1c / 4] = tail;
set(ADDR.template + 0x1c, tail);
for (let e = 0; e < 30; e++) for (let i = 0; i < 0x54 / 4; i++) set(ADDR.page + e * 0x54 + i * 4, template[i]);
set(ADDR.pagePointer, ADDR.page);

const writtenWords = new Set();
for (const a of m.written) if (a < 0x01e00000) writtenWords.add(a & ~3);
const problems = [];
const hexs = (a) => `0x${a.toString(16)}`;
const have = (a) => m.read32(a);
const mapped = (a) => a;
if (BUILD === 'hdd') {
  for (const [a, v] of wantWords) if (have(mapped(a)) !== v || !writtenWords.has(a)) problems.push(`${hexs(a)} ${hexs(have(a))} want ${hexs(v)}${writtenWords.has(a) ? '' : ' (not written)'}`);
  for (const a of writtenWords) if (!wantWords.has(a)) problems.push(`${hexs(a)} written (${hexs(have(a))}) with no rule`);
} else {
  const ref = (await import('node:child_process')).spawnSync(process.execPath, [new URL(import.meta.url).pathname.replace(/^\//, ''), '--stores'], { env: { ...process.env, CLOCK_BUILD: 'hdd' }, encoding: 'utf8' });
  const hddStores = JSON.parse(ref.stdout);
  if (hddStores.length !== stores.length) problems.push(`ROM stored ${stores.length} words, HDD ${hddStores.length}`);
  for (const t of gpStores) if (t.address !== gpAddress(m, t.pc, ROM_GP)) problems.push(`gp store at ${hexs(t.pc)}: ${hexs(t.address)} is not gp ${hexs(ROM_GP)} + displacement`);
  console.log(`  ${gpStores.length} gp-relative stores, gp ${hexs(ROM_GP)}`);
  const exempt = { 46: 'the level word: ROM 2.30 stores 5 (addiu v0, zero, 5 at 0x22E81C), HDD OSD 1.10U stores 0 (0x232540)', 86: 'the pointer to the page copy: a build address' };
  const used = new Set();
  stores.forEach((v, i) => { if (v === hddStores[i]) return; if (exempt[i]) { used.add(i); console.log(`  store ${i} differs by build: ${exempt[i]}`); } else problems.push(`store ${i}: ROM ${hexs(v)} HDD ${hexs(hddStores[i])}`); });
  for (const i of Object.keys(exempt)) if (!used.has(Number(i))) problems.push(`stale exemption ${i}`);
}
const HELPERS = { reset: 0x234ab0, start: 0x234ac0, reverse: 0x234ae0, tick: 0x234b10, isState: 0x234a98, scaled: 0x234a70 };
for (const entry of Object.values(HELPERS)) build.learn(entry);
const model = {
  reset: (r) => ({ ...r, counter: 0, changed: 0, state: 0 }),
  start: (r) => (r.state === 0 ? { ...r, counter: 0, changed: 1, state: 1 } : { ...r }),
  reverse: (r) => (r.state === 2 ? { ...r, counter: r.length, changed: 1, state: 3 } : { ...r }),
  tick: (r) => {
    const o = { ...r, changed: 0 };
    if (r.state === 1) { o.counter += 1; if (o.counter === r.length) { o.changed = 1; o.state = 2; } } else if (r.state === 3) { o.counter -= 1; if (o.counter === 0) { o.changed = 1; o.state = 0; } }
    return o;
  },
};
const helperRecords = [];
const scratch = 0x00500000;
const hm = build.machine({});
const readRamp = () => ({ length: hm.read32(scratch) | 0, counter: hm.read32(scratch + 4) | 0, changed: hm.read32(scratch + 8) | 0, state: hm.read32(scratch + 12) | 0 });
for (const length of [1, 3, 40]) for (const counter of [0, 1, 2, length]) for (const changed of [0, 1]) for (const state of [0, 1, 2, 3]) {
  const input = { length, counter, changed, state };
  const put = () => { [length, counter, changed, state].forEach((v, k) => hm.write32(scratch + 4 * k, v)); };
  for (const [name, fn] of Object.entries(model)) {
    put(); hm.call(build.entry(HELPERS[name]), [scratch]);
    const got = readRamp(), want = fn(input);
    helperRecords.push({ fn: name, in: input, out: got });
    if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${name}(${JSON.stringify(input)}) ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  }
  for (const arg of [0, 1, 2, 3]) {
    put(); const is = hm.call(build.entry(HELPERS.isState), [scratch, arg]);
    helperRecords.push({ fn: 'isState', in: input, arg, ret: is });
    if (is !== (state === arg ? 1 : 0)) problems.push(`isState(${JSON.stringify(input)}, ${arg}) ${is}`);
  }
  for (const arg of [0, 1, 7, 100]) {
    put(); const scaled = hm.call(build.entry(HELPERS.scaled), [scratch, arg]);
    helperRecords.push({ fn: 'scaled', in: input, arg, ret: scaled });
    if (scaled !== Math.trunc(counter * arg / length)) problems.push(`scaled(${JSON.stringify(input)}, ${arg}) ${scaled}`);
  }
}

const out = {
  helpers: helperRecords,
  pal: PAL, fps: FPS,
  menuShort: have(ADDR.menuShort), menuLong: have(ADDR.menuLong), one: have(ADDR.one),
  vignette: [0, 4, 8, 12].map((o) => have(ADDR.vignette + o)), spriteFade: [0, 4, 8, 12].map((o) => have(ADDR.spriteFade + o)),
  body: have(ADDR.body), tail: have(ADDR.tail), cube: have(ADDR.cube), menu: have(ADDR.menu), config: have(ADDR.config),
  mainMenu: [0, 4, 8, 12].map((o) => have(ADDR.mainMenu + o)), version: have(ADDR.version), grey: have(ADDR.grey), vignetteLength: have(ADDR.vignetteLength),
};
const dir = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
if (dir && BUILD === 'hdd') { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(`${dir}/ramps-${PAL ? 'pal' : 'ntsc'}.json`, JSON.stringify(out, null, 1)); }

console.log(`${BUILD_NAME} ${PAL ? 'PAL' : 'NTSC'}: ${stores.length} stores, ${writtenWords.size} words written, ${BUILD === 'hdd' ? wantWords.size : '-'} words ruled`);
for (const p of problems.slice(0, 12)) console.log(`  ${p}`);
console.log(`verdict: ${problems.length ? `PARTIAL ${problems.length} differences` : 'FOUND every init ramp and length equals the rule'}`);
process.exit(problems.length ? 1 : 0);
