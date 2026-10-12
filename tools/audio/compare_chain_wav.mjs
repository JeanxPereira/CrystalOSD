// node compare_chain_wav.mjs <console.wav> <native.wav> <console sample of the first command> [native sample of the first command]
// Differences between the console's WAV and the native WAV, with the native one shifted so that the first commands coincide.
import fs from 'node:fs';
const read = (file) => {
  const b = fs.readFileSync(file);
  const at = b.indexOf('data') + 8;
  return new Int16Array(b.buffer.slice(b.byteOffset + at, b.byteOffset + b.length - ((b.length - at) % 2)));
};
const [consoleFile, nativeFile, first, nativeFirst = '0'] = process.argv.slice(2);
const c = read(consoleFile);
const n = read(nativeFile);
const shift = Number(first) - Number(nativeFirst);
let differ = 0, max = 0, firstAt = -1, compared = 0, sumSq = 0, peakC = 0;
const from = Math.max(0, Number(nativeFirst));
const to = Math.min(n.length / 2, c.length / 2 - shift);
for (let i = from; i < to; i++) {
  for (let ch = 0; ch < 2; ch++) {
    const a = c[2 * (i + shift) + ch], d = n[2 * i + ch];
    compared++;
    peakC = Math.max(peakC, Math.abs(a));
    if (a !== d) { differ++; if (firstAt < 0) firstAt = i; }
    max = Math.max(max, Math.abs(a - d));
    sumSq += (a - d) ** 2;
  }
}
console.log(JSON.stringify({ shift, samplesCompared: compared / 2, differ, differPercent: +(100 * differ / compared).toFixed(3), maxAbs: max, rms: +Math.sqrt(sumSq / compared).toFixed(3), firstDifferAtNativeSample: firstAt, consolePeak: peakC }));
