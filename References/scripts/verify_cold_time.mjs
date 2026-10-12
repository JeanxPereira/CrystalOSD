// The clock's time record at the start (HDD OSD 1.10U func_00235848, ROM 2.30 0x00231CF0), run from the console's own
// code over the RTC mirror and the console's time zone settings, and compared with the rule.
// Rule:
//   the record (HDD 0x409230, ROM 0x375200): ms = 0, then seconds, minutes, hours, day, month, year of the RTC mirror
//   (HDD 0x1F0D1C = year, month, day, hour, minute, second; ROM 0x1F0CB8) moved by shift = summer*60 + (zone - base)
//   minutes, the calendar carried (func_002149D8 days since 1600 -> some_sort_of_lut_calc), where
//   zone = config_get_timezone_offset = param << 12 >> 21 (signed 11 bits, minutes), summer = param >> 29 & 1, the param
//   being var_mechacon_config_param_1 (HDD 0x371818), and base = the halfword at the start of the entry of the table
//   D_002AD988 (stride 0x18, count D_002AE5A0) whose byte +2 is 0x33 (config_check_timezone_city 0x33,
//   get_timezone_info_struct)
//   +0x1C = zone, +0x20 = summer (module_clock_set_anim_offset), timeFilled (D_00370324) = 0, D_00370AC8 = 0 (8 bytes)
//   ROM 2.30 also reads a seventh RTC word (0x1F0CD0, set to 0 here); its function is one piece: it carries the frame period too (a float call at 0x263940, hooked out); only the record is
//   compared there
//   frame period (D_00370328) = 1000.0 / fps as div.s: fps = PAL ? 50.0 : the float D_0036FC34 (59.94)
// node verify_cold_time.mjs [--out <dir>]    (CLOCK_BUILD=hdd|rom, CLOCK_VIDEO=pal)
import fs from 'node:fs';
import { openBuild, FPS, PAL, ROM_GP, Machine, loadImage } from './cold_mips.mjs';
import { BUILD, BUILD_NAME, pick } from './builds.mjs';
import { div, floatBits, asFloat } from '../lib/ee-float.mjs';
import { sampler } from './cold_samples.mjs';

const A = pick({
  rom: { rtc: 0x1f0cb8, time: 0x375200, param: null, timeFilled: null, period: ROM_GP - 30132 },
  hdd: { rtc: 0x1f0d1c, time: 0x409230, param: 0x371818, timeFilled: 0x370324, period: 0x370328 },
});
const TABLE = 0x2ad988, COUNT = 0x2ae5a0, FLOAT_NTSC = 0x36fc34;

const build = openBuild([0x235848], { 0x235848: 0x231cf0 });
const m = build.machine({ 0x208350: () => (PAL ? 1 : 0) }, { 0x263940: () => undefined });
const reference = new Machine(loadImage('hdd'));
const stores = [];

if (BUILD === 'rom') {
  const tzFn = 0x2044d8;
  const lui = m.read32(tzFn), lw = m.read32(tzFn + 4);
  A.param = (((lui & 0xffff) << 16) + ((lw << 16) >> 16)) >>> 0;
}

const problems = [];
const hex = (v) => `0x${(v >>> 0).toString(16)}`;
const rand = sampler();
const cases = [];
const rtcs = [[2000, 1, 1, 0, 0, 0], [2099, 12, 31, 23, 59, 59], [2024, 2, 29, 23, 30, 0], [2000, 2, 29, 12, 0, 0], [2023, 12, 31, 23, 59, 59], [2001, 3, 1, 0, 0, 0], [2038, 1, 19, 3, 14, 7]];
for (let i = 0; i < 90; i++) rtcs.push([2000 + rand(100), 1 + rand(12), 1 + rand(28), rand(24), rand(60), rand(60)]);
const zones = [-720, -480, -60, 0, 60, 540, 600, 780, 840];
for (const rtc of rtcs) cases.push({ rtc, zone: zones[rand(zones.length)], summer: rand(2) });
for (const zone of zones) for (const summer of [0, 1]) cases.push({ rtc: [2024, 12, 31, 23, 45, 30], zone, summer });

const baseOf = () => {
  const count = reference.read32(COUNT) | 0;
  for (let i = 0; i < count; i++) if (reference.read8(TABLE + i * 0x18 + 2) === 0x33) { const h = reference.read16(TABLE + i * 0x18); return (h << 16) >> 16; }
  throw new Error('no table entry for city 0x33');
};
const base = baseOf();
const shift = (rtc, shiftMinutes) => {
  const t = Date.UTC(rtc[0], rtc[1] - 1, rtc[2], rtc[3], rtc[4] + shiftMinutes, rtc[5]);
  const d = new Date(t);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()];
};

const exportCases = [];
for (const c of cases) {
  c.rtc.forEach((v, k) => m.write32(A.rtc + 4 * k, v));
  if (BUILD === 'rom') m.write32(A.rtc + 0x18, 0);
  const param = ((c.summer << 29) | ((c.zone & 0x7ff) << 9)) >>> 0;
  m.write32(A.param, param);
  m.trace.length = 0;
  m.call(build.entry(0x235848));
  stores.push(m.trace.map((t) => t.value));
  const rec = (o) => m.read32(A.time + o) | 0;
  const date = [rec(0x18), rec(0x14), rec(0x10), rec(0xc), rec(8), rec(4)];
  const want = shift(c.rtc, c.summer * 60 + (c.zone - base));
  if (rec(0) !== 0) problems.push(`ms ${rec(0)}`);
  if (JSON.stringify(date) !== JSON.stringify(want)) problems.push(`rtc ${c.rtc} zone ${c.zone} summer ${c.summer}: ${date} want ${want}`);
  if (rec(0x1c) !== c.zone) problems.push(`+0x1C ${rec(0x1c)} want ${c.zone}`);
  if (rec(0x20) !== c.summer) problems.push(`+0x20 ${rec(0x20)} want ${c.summer}`);
  if (A.timeFilled !== null && (m.read32(A.timeFilled) | 0) !== 0) problems.push(`timeFilled ${m.read32(A.timeFilled)}`);
  exportCases.push({ rtc: c.rtc, param, time: date, zone: rec(0x1c), summer: rec(0x20) });
}

const period = m.read32(A.period);
{
  const want = floatBits(div(1000, PAL ? 50 : asFloat(reference.read32(FLOAT_NTSC))));
  if (period !== want) problems.push(`frame period ${hex(period)} want ${hex(want)}`);
}
if (BUILD === 'hdd') {
  if (m.read32(0x370ac8) !== 0 || m.read32(0x370acc) !== 0) problems.push('D_00370AC8 not zero');
}
if (process.argv.includes('--stores')) { console.log(JSON.stringify(stores)); process.exit(0); }

const dir = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
if (dir && BUILD === 'hdd') {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/time-${PAL ? 'pal' : 'ntsc'}.json`, JSON.stringify({ pal: PAL, fps: FPS, base, framePeriod: period, cases: exportCases }, null, 1));
}
console.log(`${BUILD_NAME} ${PAL ? 'PAL' : 'NTSC'}: ${cases.length} cases, base zone ${base}${period === undefined ? '' : `, frame period ${hex(period)}`}`);
for (const p of problems.slice(0, 10)) console.log(`  ${p}`);
console.log(`verdict: ${problems.length ? `PARTIAL ${problems.length} differences` : 'FOUND the time record equals the rule on every case'}`);
process.exit(problems.length ? 1 : 0);
