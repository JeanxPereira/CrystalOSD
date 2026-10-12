// The camera and mode part of the clock thread's init, run from the console's own code and compared with the rule.
// HDD OSD 1.10U (canon): module_clock_init_resources (0x225DB0) with every callee outside the question hooked except
// func_00234C28, clock_stuff1 (0x225950), module_clock_225D98, module_clock_23A068 and the first lines of
// clock_input_check_handler_p6_p7_tgt (0x2259B8). ROM 2.30 (second witness): the same functions found by head match,
// its stores equal in value and order to the HDD run's.
// Rule:
//   order of the init's calls: 238F10, 235E98, 235848, 234F78, 234B88, clock_load_texture, 2347D8 x 10, do_load_font,
//   22EF40, 2324C8, 232858, 22CB50, 234C28(2), then the camera offset
//   func_00234C28(2): mode (D_00370AB4) = 2, overlay flag (D_00370AB8) = 0, fade record (D_002B5F30) colour rgb = 0,
//   +0x20 = screen width << 4, +0x24 = screen height << 4 (words 0x1F0CB4 / 0x1F0CB8)
//   init_resources' last store: D_00370A80 (camera offset) = 0xC2C80000 (-100.0)
//   clock_stuff1: D_002B217C (ax) = 1.0; D_002B2180 (ay) = the word D_0036FB84 when is_pal_vmode, else D_0036FB88
//   module_clock_225D98: D_002B2170 (scale) = 1.0
//   module_clock_23A068: D_00370344 = 0; the unit matrix at D_0041EAB0 (hooked library call: sceVu0UnitMatrix);
//   func_00239F48 (the sine table, hooked: References/model clock_math sin) is not in this verifier
//   clock_input_check_handler_p6_p7_tgt up to its first test of the field: D_001F0644 = 0, scene.leaving (D_002B2174) = 0,
//   scene.field (D_002B2178) = D_001F0CA4 (the even/odd field), D_00370A7C (screen code) = D_001F000C; = 0x64 when
//   D_001F064C (wide) is 1, or when func_0022FEF8 returns non-zero
// node verify_cold_camera.mjs [--out <dir>]    (CLOCK_BUILD=hdd|rom, CLOCK_VIDEO=pal)
import fs from 'node:fs';
import { openBuild, memoryOps, FPS, PAL, ROM_GP } from './cold_mips.mjs';
import { BUILD, BUILD_NAME } from './builds.mjs';
import { sampler } from './cold_samples.mjs';

const ROOTS = [0x225db0, 0x225950, 0x225d98, 0x23a068];
const INIT_ORDER = [0x238f10, 0x235e98, 0x235848, 0x234f78, 0x234b88, 0x2334a8, ...Array(10).fill(0x2347d8), 0x226b10, 0x22ef40, 0x2324c8, 0x232858, 0x22cb50, 0x234c28];
const build = openBuild(ROOTS);
ROOTS.forEach((r) => build.learn(r));
build.learn(0x234c28);
const noop = () => undefined;
const stop = () => { throw new Error('STOP'); };
const problems = [];
const hex = (v) => `0x${(v >>> 0).toString(16)}`;

const screenOps = (() => {
  const h = memoryOps(openBuild([]).machine({}), 0x234c28, 0x234c28 + 0x30).filter((o) => o.op === 35);
  if (BUILD === 'hdd') return h.map((o) => o.address);
  const r = memoryOps(build.machine({}), build.entry(0x234c28), build.entry(0x234c28) + 0x30).filter((o) => o.op === 35);
  return r.map((o) => o.address);
})();
const [screenW, screenH] = BUILD === 'hdd' ? [0x1f0cb4, 0x1f0cb8] : [screenOps[1], screenOps[0]];

const all = [];
const seen = { fade: [], handler: [] };
const nonStack = (m) => [...m.written].filter((a) => a < 0x01e00000).map((a) => a & ~3).filter((a, i, l) => l.indexOf(a) === i);

const scenarios = [];
const rand = sampler();
const sizes = [[640, 224], [640, 256], [640, 240], [512, 448]];
const wantInit = (w, h) => ({ 0x370a80: 0xc2c80000, 0x370ab4: 2, 0x370ab8: 0, 0x2b5f30: 0, 0x2b5f34: 0, 0x2b5f38: 0, 0x2b5f50: w << 4, 0x2b5f54: h << 4 });
const base = openBuild([]).machine({});
const hddWord = (a) => base.read32(a);

const run = (label, f) => { try { f(); } catch (e) { problems.push(`${label}: ${e.message}`); } };

for (const [w, h] of sizes) run(`init ${w}x${h}`, () => {
  const hooks = { 0x208350: () => (PAL ? 1 : 0) };
  for (const a of new Set(INIT_ORDER.filter((x) => x !== 0x234c28))) hooks[a] = noop;
  const m = build.machine(hooks);
  m.write32(screenW, w); m.write32(screenH, h);
  m.written.clear();
  m.trace.length = 0;
  m.call(build.entry(0x225db0));
  all.push(m.trace.map((t) => t.value));
  if (BUILD === 'hdd') {
    seen.fade.push({ width: w, height: h, colour: [0x2b5f30, 0x2b5f34, 0x2b5f38].map((a) => m.read32(a)), x1: m.read32(0x2b5f50), y1: m.read32(0x2b5f54) });
    seen.cameraOffset = m.read32(0x370a80); seen.mode = m.read32(0x370ab4); seen.overlayLevel = m.read32(0x370ab8);
    const want = wantInit(w, h);
    const got = nonStack(m);
    for (const [a, v] of Object.entries(want)) if (m.read32(Number(a)) !== v >>> 0) problems.push(`init ${w}x${h}: ${hex(Number(a))} ${hex(m.read32(Number(a)))} want ${hex(v)}`);
    for (const a of got) if (!(a in want)) problems.push(`init ${w}x${h}: ${hex(a)} written with no rule`);
    const order = m.calls.filter((c) => c !== 0x208350 && c !== 0x200c00);
    if (JSON.stringify(order) !== JSON.stringify(INIT_ORDER.filter((x) => x !== 0x234c28))) problems.push(`init order ${order.map((c) => c.toString(16))}`);
  }
});

run('stuff1', () => {
  const m = build.machine({ 0x208350: () => (PAL ? 1 : 0), 0x288bd8: noop, 0x27bbc0: noop });
  m.trace.length = 0;
  m.call(build.entry(0x225950));
  all.push(m.trace.map((t) => t.value));
  if (BUILD === 'hdd') {
    seen.ax = m.read32(0x2b217c); seen.ay = m.read32(0x2b2180);
    const want = { 0x2b217c: 0x3f800000, 0x2b2180: hddWord(PAL ? 0x36fb84 : 0x36fb88) };
    for (const [a, v] of Object.entries(want)) if (m.read32(Number(a)) !== v >>> 0) problems.push(`stuff1: ${hex(Number(a))} ${hex(m.read32(Number(a)))} want ${hex(v)}`);
    for (const a of nonStack(m)) if (!(a in want)) problems.push(`stuff1: ${hex(a)} written with no rule`);
  }
});

run('scale', () => {
  const m = build.machine({});
  m.trace.length = 0;
  m.call(build.entry(0x225d98));
  all.push(m.trace.map((t) => t.value));
  if (BUILD === 'hdd') {
    seen.scale = m.read32(0x2b2170);
    if (m.read32(0x2b2170) !== 0x3f800000) problems.push(`scale ${hex(m.read32(0x2b2170))}`);
    if (nonStack(m).length !== 1) problems.push('scale: more than one word written');
  }
});

run('23A068', () => {
  const identity = (mm) => { const a = mm.reg('a0'); for (let i = 0; i < 16; i++) mm.write32(Number(a) + 4 * i, i % 5 === 0 ? 0x3f800000 : 0); };
  const m = build.machine({ 0x27b140: identity, 0x239f48: noop });
  m.trace.length = 0;
  m.call(build.entry(0x23a068));
  all.push(m.trace.map((t) => t.value));
  if (BUILD === 'hdd') {
    const want = { 0x370344: 0 };
    for (let i = 0; i < 16; i++) want[0x41eab0 + 4 * i] = i % 5 === 0 ? 0x3f800000 : 0;
    for (const [a, v] of Object.entries(want)) if (m.read32(Number(a)) !== v) problems.push(`23A068: ${hex(Number(a))} ${hex(m.read32(Number(a)))} want ${hex(v)}`);
    for (const a of nonStack(m)) if (!(a in want)) problems.push(`23A068: ${hex(a)} written with no rule`);
  }
});

const handlerCases = [];
for (const wide of [0, 1]) for (const disc of [0, 0x66, 0x6a, 0x72]) for (const field of [0, 1]) for (const predicate of BUILD === 'hdd' ? [0, 1] : [0]) handlerCases.push({ wide, disc, field, predicate });
const H = BUILD === 'hdd'
  ? { entry: 0x2259b8, stop: 0x225a28, wide: 0x1f064c, disc: 0x1f000c, field: 0x1f0ca4, flag: 0x1f0644, leaving: 0x2b2174, fieldOut: 0x2b2178, code: 0x370a7c }
  : { entry: 0x221060, stop: 0x2210bc, wide: 0x1f05ec, disc: 0x1f13c4, field: 0x1f0c44, flag: 0x1f05e4, leaving: 0x28a344, fieldOut: 0x28a348, code: ROM_GP + (0x902c - 0x10000) };
for (const c of handlerCases) run(`handler ${JSON.stringify(c)}`, () => {
  const hooks = BUILD === 'hdd' ? { 0x225db0: noop, 0x20bf00: noop, 0x22fef8: () => c.predicate, 0x225a28: stop } : {};
  const m = build.machine(hooks, BUILD === 'hdd' ? {} : { [H.stop]: stop, 0x221488: noop, 0x207480: noop });
  m.write32(H.wide, c.wide); m.write32(H.disc, c.disc); m.write32(H.field, c.field);
  m.write32(H.flag, 9); m.write32(H.leaving, 9);
  try { m.call(BUILD === 'hdd' ? build.entry(H.entry) : H.entry); } catch (e) { if (e.message !== 'STOP') throw e; }
  if (BUILD === 'hdd') seen.handler.push({ ...c, leaving: m.read32(H.leaving), field: m.read32(H.fieldOut), code: m.read32(H.code) });
  const wantCode = c.wide === 1 || (c.wide === 0 && c.predicate === 1) ? 0x64 : c.disc;
  const want = { [H.flag]: 0, [H.leaving]: 0, [H.fieldOut]: c.field, [H.code]: wantCode };
  for (const [a, v] of Object.entries(want)) if (m.read32(Number(a)) !== v) problems.push(`handler ${JSON.stringify(c)}: ${hex(Number(a))} ${hex(m.read32(Number(a)))} want ${hex(v)}`);
});

if (process.argv.includes('--stores')) { console.log(JSON.stringify(all)); process.exit(0); }
if (BUILD === 'rom') {
  const hdd = (await import('node:child_process')).spawnSync(process.execPath, [new URL(import.meta.url).pathname.replace(/^\//, ''), '--stores'], { env: { ...process.env, CLOCK_BUILD: 'hdd' }, encoding: 'utf8', maxBuffer: 268435456 });
  const ref = JSON.parse(hdd.stdout);
  all.forEach((s, i) => {
    const r = ref[i];
    if (!r || s.length !== r.length) { problems.push(`run ${i}: ROM ${s.length} stores, HDD ${r ? r.length : '-'}`); return; }
    const different = s.map((v, k) => (v === r[k] ? -1 : k)).filter((k) => k >= 0);
    if (different.length) problems.push(`run ${i}: stores ${different} differ (${different.map((k) => `${hex(s[k])} / ${hex(r[k])}`)})`);
  });
}

const out = { pal: PAL, fps: FPS, ...seen };
const dir = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
if (dir && BUILD === 'hdd') { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(`${dir}/camera-${PAL ? 'pal' : 'ntsc'}.json`, JSON.stringify(out, null, 1)); }
console.log(`${BUILD_NAME} ${PAL ? "PAL" : "NTSC"}: ${sizes.length} screen sizes, ${handlerCases.length} handler cases, ${all.reduce((n, s) => n + s.length, 0)} stores compared`);
for (const p of problems.slice(0, 12)) console.log(`  ${p}`);
console.log(`verdict: ${problems.length ? `PARTIAL ${problems.length} differences` : 'FOUND the camera and mode init equals the rule'}`);
process.exit(problems.length ? 1 : 0);
