// Export the (items, settings word, RTC words) of every Clock Adjustment confirm in the adjust-write captures
// (References/scripts/verify_clock_write.mjs probes) as JSON for tests/scene/ConsoleClockTest.cpp.
//
//   node tools/scene/export_clock_write.mjs [--out <file>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.CLOCK_BUILD = 'hdd';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const url = (file) => pathToFileURL(file).href;
const verifier = await import(url(path.join(HERE, '../../References/scripts/verify_clock_write.mjs')));
const trace = await import(url(path.join(HERE, '../../References/lib/trace.mjs')));
const CAPTURES = process.env.CRYSTALOSD_CAPTURES ?? 'D:/CodingProjects/Watson/Runtime/captures';
const argv = process.argv.slice(2);
const outAt = argv.indexOf('--out');
const out = outAt >= 0 ? argv[outAt + 1] : 'D:/CodingProjects/CrystalOSD-Data/fixtures/clock-write/pairs.json';
const ints = (bytes, at, count) => Array.from({ length: count }, (_, i) => bytes.readInt32LE(at + i * 4));

const pairs = [];
for (const name of ['hddosd-110U-adjust-write', 'hddosd-110U-adjust-write-summer', 'hddosd-110U-adjust-write-zone']) {
  const loaded = trace.readTraceFor(path.join(CAPTURES, `${name}.trace.jsonl`), verifier.PROBES);
  if (!loaded.complete) throw new Error(`${name}: ${loaded.reason}`);
  const probes = loaded.probes;
  for (let n = 0; n + 1 < probes.length; n++) {
    const [enter, done] = [probes[n], probes[n + 1]];
    if (enter.pc !== probes[0].pc || done.pc === enter.pc || enter.mem.length < 3) continue;
    const items = ints(enter.mem[0].bytes, 0, 6);
    const word = enter.mem[1].bytes.readUInt32LE(0);
    const rtc = ints(done.mem[0].bytes, 0x0c, 6);
    pairs.push({ capture: name, frame: enter.frame, items, word, rtc });
  }
}
if (pairs.length === 0) throw new Error('no confirm in the captures');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(pairs, null, 1));
console.log(`${pairs.length} pairs -> ${out}`);
