// What Clock Adjustment's confirm writes to the console (HDD OSD config_item_change_cb_clock_write_mechacon
// 0x00235170, ROM 2.30 0x00231738), recomputed from the items and the settings word it read:
//   items 6..0xB (HDD 0x409148, ROM 0x375118: year, month, day, hour, minute, second) are local time;
//   func_002148B8 = func_002149D8 (seconds since 1600) -> func_00214788 (minus an hour when summer time,
//   minus zone x 60, plus the base zone's 540 x 60) -> some_sort_of_lut_calc (seconds back to a date)
//   gives six RTC words; zone and summer time come from the settings word (HDD 0x371818, ROM 0x002C9680).
//   Stores (HDD; ROM is 0x64 lower): 0x1F0D17 = BCD(year mod 100), 0x1F0D16 = BCD(month) | 0x80, 0x1F0D15 = BCD(day),
//   0x1F0D13 = BCD(hour), 0x1F0D12 = BCD(minute), 0x1F0D11 = BCD(second) (func_00235138), word 0x1F0D18 = 1,
//   and the mirror 0x1F0D1C..0x1F0D30 = the six RTC words. Nothing else in 0x1F0D10..0x1F0D30 changes.
//   Positive control: the verified cancel rule (the RTC moved to local time, timeFromClock) on the written words
//   gives the items back.
// node verify_clock_write.mjs <trace>      (CLOCK_BUILD=hdd|rom)
import { readTraceFor } from '../lib/trace.mjs';
import { pick, range, pc, BUILD_NAME } from './builds.mjs';
import { rtcFromLocal, secondsOf, dateOf, zoned, zoneOf, summerOf, bcd } from '../model/clock_date.mjs';

const A = pick({
  rom: { entry: 0x00231738, done: 0x0023187c, items: 0x00375118, param: 0x002c9680, block: 0x001f0cac },
  hdd: { entry: 0x00235170, done: 0x002352b4, items: 0x00409148, param: 0x00371818, block: 0x001f0d10 },
});
export const PROBES = [
  { pc: pc(A.entry), ranges: [range(A.items, 0x18), range(A.param, 4), range(A.block, 0x24)] },
  { pc: pc(A.done), ranges: [range(A.block, 0x24)] },
];
const readTrace = (file) => readTraceFor(file, PROBES);

const ints = (bytes, at, count) => Array.from({ length: count }, (_, i) => bytes.readInt32LE(at + i * 4));

export function verify(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const checks = {};
  const problems = [];
  const check = (name, got, want, where) => {
    checks[name] ??= [0, 0];
    checks[name][1] += 1;
    if (JSON.stringify(got) === JSON.stringify(want)) checks[name][0] += 1;
    else if (problems.length < 16) problems.push(`${where} ${name}: written ${JSON.stringify(got)}, computed ${JSON.stringify(want)}`);
  };
  const seen = { calls: 0, summer: 0, zoned: 0, dateMoved: 0 };
  const facts = [];
  const probes = trace.probes;
  for (let n = 0; n + 1 < probes.length; n++) {
    const [enter, done] = [probes[n], probes[n + 1]];
    if (enter.pc !== A.entry || done.pc !== A.done) continue;
    seen.calls += 1;
    const where = `frame ${enter.frame}`;
    const items = ints(enter.mem[0].bytes, 0, 6);
    const param = enter.mem[1].bytes.readUInt32LE(0);
    const before = enter.mem[2].bytes, after = done.mem[0].bytes;
    const want = rtcFromLocal(items, param);
    const zone = zoneOf(param), summer = summerOf(param);
    if (summer) seen.summer += 1;
    if (zone !== 0) seen.zoned += 1;
    if (want.slice(0, 3).join() !== items.slice(0, 3).join()) seen.dateMoved += 1;

    check('RTC words', ints(after, 0x0c, 6), want, where);
    check('BCD bytes', [after[7], after[6], after[5], after[3], after[2], after[1]],
      [bcd(want[0] % 100), bcd(want[1]) | 0x80, bcd(want[2]), bcd(want[3]), bcd(want[4]), bcd(want[5])], where);
    check('flag', after.readInt32LE(8), 1, where);
    check('untouched bytes', [after[0], after[4], ...after.subarray(9, 12)], [before[0], before[4], ...before.subarray(9, 12)], where);
    const written = ints(after, 0x0c, 6);
    check('cancel rule gives the items', dateOf(zoned(secondsOf(...written), param)), items, where);
    if (facts.length < 3) facts.push(`${where}: items ${items} zone ${zone} summer ${summer} -> RTC ${written}  BCD ${[...after.subarray(1, 8)].map((b) => b.toString(16).padStart(2, '0'))}`);
  }
  return { checks, problems, seen, facts };
}

if (process.argv[1] && process.argv[1].endsWith('verify_clock_write.mjs')) {
  const result = verify(process.argv[2]);
  console.log(`build: ${BUILD_NAME}`);
  console.log(`calls: ${result.seen.calls}   ${JSON.stringify(result.seen)}`);
  for (const line of result.facts) console.log(`  ${line}`);
  let whole = result.seen.calls > 0;
  for (const [name, [equal, total]] of Object.entries(result.checks)) {
    console.log(`  ${name.padEnd(30)} ${equal} of ${total} equal`);
    if (equal !== total) whole = false;
  }
  for (const text of result.problems) console.log(`  ! ${text}`);
  console.log(`verdict: ${whole ? `FOUND ${result.seen.calls} calls, every value equal` : 'PARTIAL the reading does not reproduce every value'}`);
  process.exit(whole ? 0 : 3);
}
