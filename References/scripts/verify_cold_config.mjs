// The configuration list at the clock thread's start (HDD OSD 1.10U func_00234F78 -> config_load_clock_osd 0x00234F88, then
// func_00227F08 through func_00228220), run from the console's own code over settings words, the RTC and the video mode,
// and compared with the rule. HDD OSD 1.10U only: ROM 2.30 builds its list with other code (two templates in the list).
// Rule:
//   func_00234F78: D_00370300 = 1 then config_load_clock_osd. With p = var_mechacon_config_param_1 (0x371818), w = D_0037181C,
//   v = D_002AD228 as get_vidmode_with_fallback returns it (negative -> 0), configItems (0x409130, one word each):
//     [0] aspect: (p >> 1) & 3, 0 when 3                 [1] p & 1 (spdif)             [2] (p >> 3) & 1 (video output)
//     [3] language (config_get_osd_language): f = (p >> 4) & 0x1F; v = 0: f == 1; else f = 0: p becomes (p & ~0x1F0) | 0x10 and
//         it is 1, f < 8: f, else 1                       [4] D_001F1294 & 1
//     [13] (p >> 30) & 1 (time format)                    [14] w & 3, 0 when 3 (date format)
//     [15] city (p >> 20) & 0x1FF, 0x80 past 0x7F (the city is kept at D_002AB240)    [16] (p >> 29) & 1 (summer)
//     [17] (w >> 2) & 1   [18] (w >> 3) & 1   [19] (w >> 4) & 1
//     [5] and [12] are never written
//   func_00235848 runs first (the init's order): the time record from the RTC (verify_cold_time.mjs); module_clock_set_anim_offset(zone, summer)
//   (zone = p << 12 >> 21) moves the record by the difference between the new zone and the record's: none here; then
//     [6] year, [7] month, [8] day, [9] hours, [10] minutes, [11] seconds of the record
//   func_00227F08 (list builder, page D_002B2DE8, entries D_002B2BF0, 0x38 bytes each):
//     k = 4; when item 19 is set, entry 4 = D_002B2E88 and k = 5; entry k = D_002B2EC0 with func_002282F0 (count and table by v:
//     0: 2, D_002B25D0; 1: 7, D_002B2610; 2: 7, D_002B26F0); entry k + 1 = D_002B2EF8; entry k + 2 = D_002B2F30 with func_00228228
//     (0: 2, D_002B2930; 1: 9, D_002B2970; 2: 9, D_002B2A90); page count (+8) = k + 3
//     page selected (+0x10) stays when the entry it names still has the id it had; else the first entry of that id; else 0
//     func_0022D6C0(v) sets the count (+4) and table (+0x10) of D_002B4940 (v 0: 2, D_002B4700; 1: 7, D_002B4740; 2: 7, D_002B4820)
//   words written beyond item 19 (the keyboard and mouse items to 0x409230) and the time keeper's (D_00370324, D_00370328, D_00370AC8) belong to
//   other ports
//   the other entries, the main menu (D_002B2E60) and the page's other words are the ELF's
// node verify_cold_config.mjs [--out <dir>]    (CLOCK_BUILD=hdd)
import fs from 'node:fs';
import { openBuild, Machine, loadImage } from './cold_mips.mjs';
import { BUILD, BUILD_NAME } from './builds.mjs';
import { sampler } from './cold_samples.mjs';

if (BUILD !== 'hdd') { console.log('verdict: NOT VERIFIED HDD OSD 1.10U only'); process.exit(2); }

const ITEMS = 0x409130, PARAM = 0x371818, DATE_WORD = 0x37181c, KEYBOARD = 0x1f1294, VIDMODE = 0x2ad228, GATE = 0x370300, CITY = 0x2ab240;
const RTC = 0x1f0d1c, TIME = 0x409230, TABLE = 0x2ad988, COUNT = 0x2ae5a0;
const ENTRIES = 0x2b2bf0, PAGE = 0x2b2de8, MENU = 0x2b2e60, VIDEO_LIST = 0x2b4940;
const TEMPLATE = { four: 0x2b2e88, video: 0x2b2ec0, middle: 0x2b2ef8, last: 0x2b2f30 };
const FIRST = { 0: [2, 0x2b25d0], 1: [7, 0x2b2610], 2: [7, 0x2b26f0] }, LAST = { 0: [2, 0x2b2930], 1: [9, 0x2b2970], 2: [9, 0x2b2a90] }, VIDEO = { 0: [2, 0x2b4700], 1: [7, 0x2b4740], 2: [7, 0x2b4820] };

const build = openBuild([0x234f78, 0x228220, 0x235848]);
const reference = new Machine(loadImage('hdd'));
const problems = [];
const hex = (v) => `0x${(v >>> 0).toString(16)}`;
const rand = sampler(777);
const base = (() => {
  const n = reference.read32(COUNT) | 0;
  for (let i = 0; i < n; i++) if (reference.read8(TABLE + i * 0x18 + 2) === 0x33) return (reference.read16(TABLE + i * 0x18) << 16) >> 16;
  throw new Error('no zone');
})();
const shift = (rtc, minutes) => {
  const d = new Date(Date.UTC(rtc[0], rtc[1] - 1, rtc[2], rtc[3], rtc[4] + minutes, rtc[5]));
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()];
};

const cases = [];
const word = () => parseInt(rand(0x10000).toString(16).padStart(4, '0') + rand(0x10000).toString(16).padStart(4, '0'), 16);
for (let i = 0; i < 120; i++) {
  const f = i === 9 ? 0 : i < 8 ? i : rand(32);
  const city = i < 3 ? [0x7f, 0x80, 0x81][i] : rand(0x200);
  const vid = i < 10 ? (i + 1) % 3 : i % 3;
  cases.push({ param: ((i < 10 ? i % 2 : rand(2)) | (rand(4) << 1) | (rand(2) << 3) | (f << 4) | ((rand(0x800)) << 9) | (city << 20) | (rand(2) << 29) | (rand(2) << 30) | (rand(2) << 31)) >>> 0, date: word(), keyboard: word(), vid, selected: rand(9), rtc: [2000 + rand(100), 1 + rand(12), 1 + rand(28), rand(24), rand(60), rand(60)] });
}

const exported = [];
for (const c of cases) {
  const m = build.machine({});
  m.write32(PARAM, c.param); m.write32(DATE_WORD, c.date); m.write32(KEYBOARD, c.keyboard); m.write32(VIDMODE, c.vid);
  c.rtc.forEach((v, k) => m.write32(RTC + 4 * k, v));
  m.write32(PAGE + 0x10, c.selected);
  const entries0 = Array.from({ length: 0x1f8 / 4 }, (_, k) => m.read32(ENTRIES + 4 * k));
  const page0 = Array.from({ length: 14 }, (_, k) => m.read32(PAGE + 4 * k));
  const menu0 = Array.from({ length: 10 }, (_, k) => m.read32(MENU + 4 * k));
  const items0 = Array.from({ length: 20 }, (_, k) => m.read32(ITEMS + 4 * k));
  const keptId = entries0[c.selected * 14];
  m.written.clear();
  m.call(0x235848);
  m.call(0x234f78);
  m.call(build.entry(0x228220));

  const want = new Map();
  const set = (a, v) => want.set(a, v >>> 0);
  let p = c.param;
  const f = (p >> 4) & 0x1f;
  let language;
  if (c.vid === 0) language = f === 1 ? 1 : 0;
  else if (f === 0) { p = ((p & ~0x1f0) | 0x10) >>> 0; language = 1; }
  else language = f < 8 ? f : 1;
  set(PARAM, p);
  const aspect = (c.param >>> 1) & 3, dateFormat = c.date & 3;
  const city = (c.param >>> 20) & 0x1ff;
  const zone = ((c.param << 12) >> 21), summer = (c.param >>> 29) & 1;
  const items = [...items0];
  items[0] = aspect < 3 ? aspect : 0;
  items[1] = c.param & 1; items[2] = (c.param >>> 3) & 1; items[3] = language; items[4] = c.keyboard & 1;
  items[13] = (c.param >>> 30) & 1; items[14] = dateFormat < 3 ? dateFormat : 0; items[15] = city < 0x80 ? city : 0x80; items[16] = summer;
  items[17] = (c.date >>> 2) & 1; items[18] = (c.date >>> 3) & 1; items[19] = (c.date >>> 4) & 1;
  if (city >= 0x80) set(CITY, city);
  const date = shift(c.rtc, summer * 60 + (zone - base));
  items[6] = date[0]; items[7] = date[1]; items[8] = date[2]; items[9] = date[3]; items[10] = date[4]; items[11] = date[5];
  items.forEach((v, k) => set(ITEMS + 4 * k, v));
  set(GATE, 1);
  [0, date[5], date[4], date[3], date[2], date[1], date[0], zone, summer].forEach((v, k) => set(TIME + 4 * k, v));
  const flag = items[19] !== 0;
  const entries = [...entries0];
  const put = (index, at, count, table) => {
    for (let k = 0; k < 14; k++) entries[index * 14 + k] = reference.read32(at + 4 * k);
    if (count !== undefined) { entries[index * 14 + 1] = count; entries[index * 14 + 4] = table; }
  };
  let k = 4;
  if (flag) { put(4, TEMPLATE.four); k = 5; }
  put(k, TEMPLATE.video, ...FIRST[c.vid]);
  put(k + 1, TEMPLATE.middle);
  put(k + 2, TEMPLATE.last, ...LAST[c.vid]);
  entries.forEach((v, i) => set(ENTRIES + 4 * i, v));
  const count = k + 3;
  const ids = entries.filter((_, i) => i % 14 === 0);
  let selected = c.selected;
  if (ids[selected] !== keptId) { const at = ids.slice(0, count).indexOf(keptId); selected = at < 0 ? 0 : at; }
  set(PAGE + 8, count); set(PAGE + 0x10, selected);
  set(VIDEO_LIST + 4, VIDEO[c.vid][0]); set(VIDEO_LIST + 0x10, VIDEO[c.vid][1]);

  const writtenWords = new Set();
  for (const a of m.written) if (a < 0x1e00000) writtenWords.add(a & ~3);
  for (const [a, v] of want) {
    const got = m.read32(a);
    if (got !== v) problems.push(`${hex(a)} ${hex(got)} want ${hex(v)} (case ${exported.length})`);
  }
  const itemsRange = (a) => (a >= ITEMS + 0x50 && a < ITEMS + 0x100) || [0x370324, 0x370328, 0x370ac8, 0x370acc].includes(a);
  for (const a of writtenWords) if (!want.has(a) && !itemsRange(a)) problems.push(`${hex(a)} written (${hex(m.read32(a))}) with no rule (case ${exported.length})`);
  for (let a = ITEMS; a < ITEMS + 0x50; a += 4) if (!want.has(a)) problems.push(`item word ${hex(a)} has no rule`);
  for (const index of [5, 12]) if (writtenWords.has(ITEMS + 4 * index)) problems.push(`item ${index} written`);
  const menuNow = Array.from({ length: 10 }, (_, q) => m.read32(MENU + 4 * q));
  if (JSON.stringify(menuNow) !== JSON.stringify(menu0)) problems.push('main menu changed');
  const pageNow = Array.from({ length: 14 }, (_, q) => m.read32(PAGE + 4 * q));
  pageNow.forEach((v, q) => { if (q !== 2 && q !== 4 && v !== page0[q]) problems.push(`page word ${q} changed`); });
  exported.push({ param: c.param, date: c.date, keyboard: c.keyboard, vid: c.vid, selected: c.selected, rtc: c.rtc, items: Array.from({ length: 20 }, (_, q) => m.read32(ITEMS + 4 * q)), entries: Array.from({ length: 0x1f8 / 4 }, (_, q) => m.read32(ENTRIES + 4 * q)), page: pageNow, newParam: m.read32(PARAM) });
}
const dir = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
if (dir) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(`${dir}/config.json`, JSON.stringify({ base, cases: exported })); }
console.log(`${BUILD_NAME}: ${cases.length} cases`);
for (const q of problems.slice(0, 12)) console.log(`  ${q}`);
console.log(`verdict: ${problems.length ? `PARTIAL ${problems.length} differences` : 'FOUND the configuration list equals the rule on every case'}`);
process.exit(problems.length ? 1 : 0);
