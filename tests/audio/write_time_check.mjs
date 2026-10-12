import fs from 'node:fs';
import path from 'node:path';
import { gather } from './write_time_gather.mjs';
import { classify, summary } from './write_time_model.mjs';

const [modelDir, capturesDir, outDir, expectedFile] = process.argv.slice(2);
const RUNS = [
  ['boot-a', 'hddosd-110U-sound-boot-a', 'hddosd-110U-sound-boot-b', false],
  ['boot-b', 'hddosd-110U-sound-boot-b', 'hddosd-110U-sound-boot-b', true],
  ['bad-effect', 'hddosd-110U-sound-bad-effect', 'hddosd-110U-sound-bad-effect', true],
  ['fx-steal', 'hddosd-110U-sound-fx-steal', 'hddosd-110U-sound-fx-steal', true],
  ['voice-steal', 'hddosd-110U-sound-voice-steal', 'hddosd-110U-sound-voice-steal', true],
  ['modes-1', 'hddosd-110U-sound-modes-1', 'hddosd-110U-sound-modes-1', true],
  ['modes-2', 'hddosd-110U-sound-modes-2', 'hddosd-110U-sound-modes-2', true],
  ['modes-3', 'hddosd-110U-sound-modes-3', 'hddosd-110U-sound-modes-3', true],
  ['modes-4', 'hddosd-110U-sound-modes-4', 'hddosd-110U-sound-modes-4', true],
  ['modes-5', 'hddosd-110U-sound-modes-5', 'hddosd-110U-sound-modes-5', true],
  ['modes-6', 'hddosd-110U-sound-modes-6', 'hddosd-110U-sound-modes-6', true],
  ['steady-long', 'hddosd-110U-sound-steady-long', 'hddosd-110U-sound-steady-long', true],
];

const NL = String.fromCharCode(10);
const need = (name, snap) => [`${name}.spu.jsonl.gz`, `${snap}.start.osdsnd.bin`, `${snap}.start.iopsound.bin`, `${snap}.start.spustate.json`, 'hddosd-110U-sound-libsd.bin'].map((f) => path.join(capturesDir, f));
const missing = RUNS.flatMap(([, name, snap]) => need(name, snap)).filter((f) => !fs.existsSync(f) && !fs.existsSync(f.replace(/\.gz$/, '')));
if (missing.length) {
  console.log(`SKIPPED: missing ${[...new Set(missing)].join(', ')}`);
  process.exit(77);
}
fs.mkdirSync(outDir, { recursive: true });

const lines = [];
for (const [label, name, snap, warm] of RUNS) {
  const g = await gather(modelDir, capturesDir, name, snap, { blocks: true, loops: true, warm });
  const rows = classify(g);
  const values = g.observed.every((o, i) => o.address === g.predicted[i]?.address && (o.value & 0xffff) === g.predicted[i]?.value) && g.observed.length === g.predicted.length;
  lines.push(`${label} writes ${rows.length} real-code stream ${values ? 'equal' : 'DIFFERS'} from Watson's`);
  for (const [cls, counts] of [...summary(rows)].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`  ${cls} ${[...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([s, n]) => `${s} ${n}`).join(' ')}`);
  }
  const seeds = [...g.seed].flatMap(([a, v]) => [a, v]);
  const words = [0x57544d31, warm ? 0 : 1, seeds.length / 2, ...seeds, g.ran.length];
  const byEvent = new Map();
  g.predicted.forEach((p, i) => { const l = byEvent.get(p.event.index) ?? []; l.push(i); byEvent.set(p.event.index, l); });
  for (const e of g.ran) {
    const idx = byEvent.get(e.index) ?? [];
    words.push(e.kind === 'tick' ? 0 : 1, e.kind === 'tick' ? 0 : e.id, ...(e.words ?? [0, 0, 0, 0, 0]), e.cycle, e.envx.length);
    for (const r of e.envx) words.push(r.core, r.voice, r.value);
    words.push(idx.length);
    for (const i of idx) words.push(g.predicted[i].address, g.predicted[i].value, rows[rows.findIndex((r) => r.index === i)].offset);
    words.push((e.dmaDone ?? []).length, ...(e.dmaDone ?? []));
  }
  const buffer = Buffer.alloc(4 * words.length);
  words.forEach((w, i) => buffer.writeUInt32LE(w >>> 0, 4 * i));
  fs.writeFileSync(path.join(outDir, `${label}.writetime.bin`), buffer);
}
const report = lines.join(NL) + NL;
process.stdout.write(report);
if (expectedFile) {
  const expected = fs.readFileSync(expectedFile, 'utf8').replaceAll(String.fromCharCode(13), '');
  if (expected !== report) {
    process.stderr.write(`the write-time report differs from ${expectedFile}${NL}`);
    process.exit(1);
  }
}
