// The console's boot (hddosd-110U-sound-boot-a) with the commands the native app queues for the clock thread start, the ramp and the set-up pair
// put in place of the console's, as events SoundLab renders in its modelled mode.
//   v1: the native commands' arguments at the console's samples (the content of the stream)
//   v2: the native commands at the native samples and frames (the content and the placing of the stream)
// node native_boot_events.mjs <render dir> <name> <native.commands.txt> <out dir>
import fs from 'node:fs';
import path from 'node:path';

const [renderDir, name, nativeLog, outDir] = process.argv.slice(2);
const WIDTH = 10;
const file = (dir, stem, suffix) => path.join(dir, `${stem}.render.${suffix}`);
const events = fs.readFileSync(file(renderDir, name, 'events.bin'));
const rows = [];
for (let at = 0; at + 4 * WIDTH <= events.length; at += 4 * WIDTH) rows.push(Array.from({ length: WIDTH }, (_, i) => events.readUInt32LE(at + 4 * i)));
// kind, frame, sample, id, w0..w4, cycle
const native = fs.readFileSync(nativeLog, 'utf8').trim().split('\n').slice(1).map((l) => {
  const p = l.split(' ');
  return { sample: Number(p[0]), frame: Number(p[1]), id: parseInt(p[2], 16), words: p.slice(3, 8).map(Number) };
}).sort((a, b) => a.sample - b.sample);
// The native audio clock starts before the console's capture; the native thread start is put on the console's, so that every placing is a distance from it.
const consoleStart = rows.find((r) => r[0] === 1 && r[3] === 0x6150 && r[4] === 1);
const nativeStart = native.find((n) => n.id === 0x6150 && n.words[0] === 1);
const shiftSamples = consoleStart[2] - nativeStart.sample, shiftFrames = consoleStart[1] - nativeStart.frame;
for (const n of native) {
  n.sample += shiftSamples;
  n.frame += shiftFrames;
}

const classes = [
  { label: 'clock thread start 6150,1', is: (r) => r[3] === 0x6150 && r[4] === 1, take: (n) => n.id === 0x6150 && n.words[0] === 1 },
  { label: 'S/PDIF 8070', is: (r) => r[3] === 0x8070 && r[4] === 10, take: (n) => n.id === 0x8070 && n.words[0] === 10 },
  { label: 'ramp 60D0', is: (r) => r[3] === 0x60d0, take: (n) => n.id === 0x60d0 },
  { label: 'set-up 6150,6', is: (r) => r[3] === 0x6150 && r[4] === 6, take: (n) => n.id === 0x6150 && n.words[0] === 6 },
  { label: 'set-up 6140,2', is: (r) => r[3] === 0x6140 && r[4] === 2, take: (n) => n.id === 0x6140 && n.words[0] === 2 },
];
const group = (label) => (label.startsWith('clock thread') || label.startsWith('S/PDIF') ? 'start' : label.startsWith('ramp') ? 'ramp' : 'pair');
// placing: the groups whose commands take the native sample and frame; offset: every command moves by this many samples instead.
const variant = (placing, offset = 0) => {
  const out = rows.map((r) => r.slice());
  const note = [];
  for (const c of classes) {
    const mine = out.filter((r) => r[0] === 1 && c.is(r));
    const theirs = native.filter(c.take);
    if (mine.length !== theirs.length) throw new Error(`${c.label}: ${mine.length} console events, ${theirs.length} native`);
    mine.forEach((r, i) => {
      const n = theirs[i];
      const was = { sample: r[2], words: r.slice(4, 7) };
      for (let k = 0; k < 3; k++) r[4 + k] = n.words[k] >>> 0;
      if (offset !== 0) {
        r[2] += offset;
        r[9] = (r[9] + offset * 768) >>> 0;
      } else if (placing.has(group(c.label))) {
        const delta = n.sample - r[2];
        r[1] = n.frame;
        r[2] = n.sample;
        r[9] = (r[9] + delta * 768) >>> 0;
        r[7] = r[7]; r[8] = r[8];
        note.push(`${c.label} #${i}: console sample ${was.sample}, native ${n.sample} (${delta >= 0 ? '+' : ''}${delta}); words console ${was.words.join(',')} native ${n.words.slice(0, 3).join(',')}`);
      } else if (was.words.some((w, k) => w !== (n.words[k] >>> 0))) {
        note.push(`${c.label} #${i}: words console ${was.words.join(',')} native ${n.words.slice(0, 3).join(',')}`);
      }
    });
  }
  const ordered = out.map((r, i) => ({ r, i })).sort((a, b) => a.r[2] - b.r[2] || a.i - b.i).map((x) => x.r);
  return { ordered, note };
};
fs.mkdirSync(outDir, { recursive: true });
const all = new Set(['start', 'ramp', 'pair']);
const variants = [['native-v1', new Set()], ['native-v2', all], ['native-v2-start', new Set(['start'])], ['native-v2-ramp', new Set(['ramp'])], ['native-v2-pair', new Set(['pair'])], ['native-v2-offset', new Set(), -9]];
for (const [stem, placing, offset] of variants) {
  const { ordered, note } = variant(placing, offset);
  const buf = Buffer.alloc(4 * WIDTH * ordered.length);
  ordered.forEach((r, i) => r.forEach((v, k) => buf.writeUInt32LE(v >>> 0, 4 * (WIDTH * i + k))));
  fs.writeFileSync(file(outDir, stem, 'events.bin'), buf);
  for (const suffix of ['observed.bin', 'tickenvx.bin', 'allocenvx.bin', 'ram.bin', 'dma.bin', 'frames.bin', 'meta.txt']) fs.copyFileSync(file(renderDir, name, suffix), file(outDir, stem, suffix));
  console.log(`${stem}: ${ordered.length} events`);
  for (const n of note) console.log(`  ${n}`);
}
