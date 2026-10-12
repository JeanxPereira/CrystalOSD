// The clock thread's font init, run from the console's own code and compared with the rule.
// HDD OSD 1.10U (canon only): do_load_font (0x226B10: Font_Load 0x214228, scePFontInit, scePFontAttachData, the Font_Set*
// calls, updateTransMatrix) and func_0022CB50 (the width cache D_00404F48, which measures the time zone names of the
// eight languages through calcDrawArea). ROM 2.30 is not a witness here: its do_load_font (0x00222298) is another function
// (two resource loads and calls to 0x20D4A0 and 0x20D5C8 where the HDD OSD has Font_Load), so no code pairs.
// Hooked: GetResourceData (resource 0 is FNTOSD, expanded and placed in memory), is_pal_vmode, memset (library);
// the GS allocator D_003702DC is an input (clock_load_texture sets it to width * height * 5, the textures advance it).
// Rule:
//   func_00214428 = 4 and func_00214430 = 0x120 (GS block counts): table = D_003702DC, texture = table + (4 << 6),
//     memory = 0x120 << 6 words, D_003702DC = texture + (0x120 << 6)  (func_002335E0 hands out the old value)
//   the library's context is D_003969B0 + 0x1000 bytes: the cache list has (0x1000 - 0x3A0) / 0x20 = 99 entries
//     (scePFontCalcCacheSize), each code 0, loaded 0, cell -1, linked in order
//   the program's font state D_003979B0: line height, fixed, percent, pitch, decoration, clip = 0; tv = 0.5 * (PAL ?
//     D_0036FB9C : 1.0); ratio = 1.0; locate = (0, 0); colour = (1.0, 1.0, 1.0, 1.0); blank = the s16 at font + 0x54,
//     ascent = the s16 at font + 0x50; dirty = 1; the matrix diag(1, tv) moved by (0, ascent * 0.7 * tv)
//     applied through updateTransMatrix: Font_Load calls it while ratio and tv are still 0, so rows 0 and 1 are zero,
//     then dirty = 1 stays until calcDrawArea (the width cache) recomputes it: x = ratio, diag(x, x * tv, 1, 1),
//     translation (pitch * x, ascent * 0.7 * tv * ratio), dirty = 0
//   width cache D_00404F48[language] = the largest, over the time zone table (D_002AD988, D_002AE5A0 entries), of the
//     width of the string (word +0xC) and of the string (word +4) in that language's table (langtblptrs), the
//     width being clock_text.mjs putString measuring through calcDrawArea (func_00213EE8)
//   the cache list after the measuring is the model's carried list
// node verify_cold_font.mjs [--out <dir>]    (CLOCK_BUILD=hdd|rom, CLOCK_VIDEO=pal)
import fs from 'node:fs';
import { openBuild, FPS, PAL, REFERENCES } from './cold_mips.mjs';
import { BUILD, BUILD_NAME } from './builds.mjs';
import { expand, readFont } from './extract_font.mjs';
import { readContext } from './verify_text2.mjs';
import { putString, elfImage, languageTable, languageOf, langPointer } from '../model/clock_text.mjs';
import { add, mul, floatBits, asFloat } from '../lib/ee-float.mjs';

const FONT = 0x00900000;
const CONTEXT = 0x3969b0, STATE = 0x3979b0;
const data = expand(fs.readFileSync(`${REFERENCES}/dumps/hddosd-host/FNTOSD`));
const font = readFont(data);
const image = elfImage(fs.readFileSync(`${REFERENCES}/dumps/hddosd-host/hddosd.elf`));

if (BUILD !== 'hdd') {
  console.log('ROM 2.30: its do_load_font is another function; nothing to run');
  console.log('verdict: NOT VERIFIED HDD OSD 1.10U only'); process.exit(2);
}
const ROOTS = [0x226b10, 0x214228, 0x22cb50];
const build = openBuild(ROOTS);
ROOTS.forEach((r) => build.learn(r));
const problems = [];
const hex = (v) => `0x${(v >>> 0).toString(16)}`;
const memset = (m) => { const d = Number(m.reg('a0')), v = Number(m.reg('a1')) & 255, n = Number(m.reg('a2')); for (let i = 0; i < n; i++) m.write8(d + i, v); return d; };
const bits = (x) => floatBits(x);

const ALLOCATOR = 0x3702dc;
function fresh(allocator, language) {
  const m = build.machine({ 0x208350: () => (PAL ? 1 : 0), 0x20bd28: () => FONT, 0x29c578: memset });
  for (let i = 0; i < data.length; i++) m.write8(FONT + i, data[i]);
  m.write32(ALLOCATOR, allocator);
  m.write32(0x2ad228, PAL ? 2 : 1);
  m.write32(0x371818, language << 4);
  m.written.clear();
  m.trace.length = 0;
  return m;
}

const cases = [716800, 819200, 1000000];
const exported = [];
for (const allocator of cases) {
  const m = fresh(allocator, 1);
  m.call(build.entry(0x226b10));
  const f32 = (a) => m.read32(a);
  const s16 = (o) => data.readInt16LE(o);
  const tvRatio = bits(mul(PAL ? asFloat(image.word(0x36fb9c)) : 1, 0.5));
  const ctx = (o) => CONTEXT + o;
  const memory = f32(ctx(0x350)), texture = f32(ctx(0x354)), table = f32(ctx(0x358));
  if (memory !== 0x120 << 6) problems.push(`memory ${hex(memory)}`);
  if (texture !== allocator + (4 << 6)) problems.push(`texture ${hex(texture)} want ${hex(allocator + (4 << 6))}`);
  if (table !== allocator) problems.push(`table ${hex(table)} want ${hex(allocator)}`);
  if (m.read32(0x3702dc) !== allocator + (4 << 6) + (0x120 << 6)) problems.push(`allocator ${hex(m.read32(0x3702dc))}`);
  [0, 4, 8, 0xc, 0x1c, 0x20, 0x30, 0x34].forEach((o) => { if (f32(STATE + o) !== 0) problems.push(`state +${o.toString(16)} ${hex(f32(STATE + o))} want 0`); });
  if (f32(STATE + 0x24) !== tvRatio) problems.push(`tv ${hex(f32(STATE + 0x24))} want ${hex(tvRatio)}`);
  if (f32(STATE + 0x28) !== 0x3f800000) problems.push('ratio');
  [0x40, 0x44, 0x48, 0x4c].forEach((o) => { if (f32(STATE + o) !== 0x3f800000) problems.push(`colour +${o.toString(16)}`); });
  if (f32(STATE + 0xa8) !== (s16(0x54) >>> 0)) problems.push(`blank ${f32(STATE + 0xa8)} want ${s16(0x54)}`);
  if (f32(STATE + 0xb0) !== (s16(0x50) >>> 0)) problems.push(`ascent ${f32(STATE + 0xb0)} want ${s16(0x50)}`);
  if (f32(STATE + 0xb4) !== 1) problems.push(`dirty ${f32(STATE + 0xb4)}`);
  if (f32(STATE + 0xac) !== ((s16(0x50) - s16(0x52)) >>> 0)) problems.push(`line ${f32(STATE + 0xac)}`);
  const list = readContext(m.bytes(CONTEXT, 0x1000), CONTEXT).list;
  if (list.length !== (0x1000 - 0x3a0) / 0x20) problems.push(`list of ${list.length}`);
  list.forEach((e, i) => { if (e.code !== 0 || e.loaded !== 0 || e.cell !== -1 || e.block !== 0) problems.push(`entry ${i} ${JSON.stringify(e)}`); });
  const matrix = [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => asFloat(f32(STATE + 0x110 + 16 * r + 4 * c))));
  const unset = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  if (JSON.stringify(matrix) !== JSON.stringify(unset)) problems.push(`matrix ${JSON.stringify(matrix)}`);
  exported.push({
    allocator, memory, texture, table, tv: f32(STATE + 0x24), ratio: f32(STATE + 0x28), blank: s16(0x54), ascent: s16(0x50),
    dirty: f32(STATE + 0xb4), matrix: matrix.flat().map((v) => floatBits(v)), entries: list.length,
  });
}

// the width cache (HDD OSD 1.10U only: its language tables, the cached video mode and the settings word are not paired on ROM 2.30)
let widths = [], finalList = [], exportedAfter = null;
{
  const m = fresh(cases[0], 1);
  m.call(build.entry(0x226b10));
  const own = m.bytes(STATE, 0x200);
  let state = { font, data, ctx: readContext(m.bytes(CONTEXT, 0x1000), CONTEXT), headRoom: 0x1ff - 4 };
  const dataBase = state.ctx.data;
  m.trace.length = 0;
  m.call(build.entry(0x22cb50), [], 5e7);
  {
    const count = image.word(0x2ae5a0) | 0;
    const modelWidths = [];
    for (let language = 0; language < 8; language++) {
      const table = languageTable(image, language);
      let widest = 0;
      for (let i = 0; i < count; i++) for (const o of [0xc, 4]) {
        const id = image.word(0x2ad988 + i * 0x18 + o);
        const text = image.string(langPointer(image, table, id));
        const out = putString(state, text, own, true);
        state = out.state;
        const wide = Math.trunc(add(Math.trunc(out.reach.reach[0]), mul(out.reach.pitch, out.reach.x)));
        if (wide > widest) widest = wide;
      }
      modelWidths.push(widest);
    }
    widths = [...Array(8).keys()].map((k) => m.read32(0x404f48 + 4 * k));
    const tv = asFloat(m.read32(STATE + 0x24)), ascent = data.readInt16LE(0x50);
    const ratio = 1, pitch = 0, x = ratio;
    const wantMatrix = [[x, 0, 0, 0], [0, mul(x, tv), 0, 0], [0, 0, 1, 0], [mul(pitch, x), mul(mul(mul(ascent, 0.699999988079071), tv), ratio), 0, 1]];
    const gotMatrix = [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => asFloat(m.read32(STATE + 0x110 + 16 * r + 4 * c))));
    if (JSON.stringify(gotMatrix) !== JSON.stringify(wantMatrix)) problems.push(`matrix after the width cache ${JSON.stringify(gotMatrix)} want ${JSON.stringify(wantMatrix)}`);
    if (m.read32(STATE + 0xb4) !== 0) problems.push('dirty after the width cache');
    if (m.read32(0x2ad220) !== languageTable(image, languageOf(1 << 4))) problems.push(`language table ${hex(m.read32(0x2ad220))} not restored`);
    exportedAfter = { dirty: m.read32(STATE + 0xb4), matrix: gotMatrix.flat().map((v) => floatBits(v)) };
    if (JSON.stringify(widths) !== JSON.stringify(modelWidths)) problems.push(`widths ${widths} model ${modelWidths}`);
    const held = readContext(m.bytes(CONTEXT, 0x1000), CONTEXT).list;
    finalList = held.map((e) => ({ code: e.code, loaded: e.loaded, cell: e.cell, block: e.block === 0 ? 0 : e.block - dataBase }));
    const carried = state.ctx.list.map((e) => ({ code: e.code, loaded: e.loaded, cell: e.cell, block: e.block === 0 ? 0 : e.block - dataBase }));
    if (JSON.stringify(carried) !== JSON.stringify(finalList)) {
      const i = carried.findIndex((e, k) => JSON.stringify(e) !== JSON.stringify(finalList[k]));
      problems.push(`cache list differs at ${i}: model ${JSON.stringify(carried[i])} code ${JSON.stringify(finalList[i])}`);
    }
  }
}

const dir = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
if (dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/font-${PAL ? 'pal' : 'ntsc'}.json`, JSON.stringify({ pal: PAL, fps: FPS, cases: exported, widths, list: finalList, after: exportedAfter }, null, 1));
}
console.log(`${BUILD_NAME} ${PAL ? 'PAL' : 'NTSC'}: ${cases.length} allocator cases, widths ${widths.join(' ')}`);
for (const p of problems.slice(0, 12)) console.log(`  ${p}`);
console.log(`verdict: ${problems.length ? `PARTIAL ${problems.length} differences` : 'FOUND the font init and the width cache equal the rule'}`);
process.exit(problems.length ? 1 : 0);
