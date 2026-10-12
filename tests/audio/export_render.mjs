import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [modelDir, capturesDir, outDir, name] = process.argv.slice(2);
const { readSpuTrace, rpcCommands } = await import(pathToFileURL(path.join(modelDir, 'sound_trace.mjs')).href);
fs.mkdirSync(outDir, { recursive: true });

const TICK = 0x925a0;
const TICK_ENVX = 0x95e20;
const ALLOC_ENVX = 0x98358;
const CYCLES_PER_SAMPLE = 768;

const trace = readSpuTrace(path.join(capturesDir, `${name}.spu.jsonl`));
const origin = trace.header.cycle;
const sampleOf = (cycle) => Math.floor((cycle - origin) / CYCLES_PER_SAMPLE);
const frameCycles = trace.frames.map((f) => f.cycle);
const frameOf = (cycle) => {
  if (cycle < frameCycles[0]) return -1;
  let lo = 0;
  let hi = frameCycles.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (frameCycles[mid] <= cycle) lo = mid; else hi = mid - 1; }
  return trace.frames[lo].captureFrame;
};

const events = [];
const tickGroups = [];
const allocationReads = Array.from({ length: 24 }, () => []);
for (const p of trace.probes) {
  if (p.pcValue === TICK) { tickGroups.push([]); events.push({ kind: 0, cycle: p.cycle, id: 0, words: [0, 0, 0, 0, 0] }); }
  else if (p.pcValue === TICK_ENVX && tickGroups.length > 0) tickGroups.at(-1).push(p.gpr[2] & 0xffff);
  else if (p.pcValue === ALLOC_ENVX) {
    const at = p.gpr[4] - 0xbf900000;
    if (at >= 0 && at < 0x400) allocationReads[(at >> 4) & 0x1f].push(p.gpr[2] & 0xffff);
  }
}
for (const c of rpcCommands(trace)) events.push({ kind: 1, cycle: c.cycle, id: c.id, words: c.words });
events.sort((a, b) => a.cycle - b.cycle);

const records = (rows) => {
  const width = rows.length === 0 ? 0 : rows[0].length;
  const b = Buffer.alloc(4 * width * rows.length);
  rows.forEach((r, i) => r.forEach((v, k) => b.writeUInt32LE(v >>> 0, 4 * (width * i + k))));
  return b;
};
fs.writeFileSync(path.join(outDir, `${name}.render.events.bin`), records(events.map((e) => [e.kind, frameOf(e.cycle), sampleOf(e.cycle), e.id, ...e.words, e.cycle])));
const observed = trace.writes.filter((w) => !(w.pc >= 0x8d200 && w.pc < 0x8d600));
fs.writeFileSync(path.join(outDir, `${name}.render.observed.bin`), records(observed.map((w) => [frameOf(w.cycle), w.sample, w.address, w.value, w.cycle])));
fs.writeFileSync(path.join(outDir, `${name}.render.tickenvx.bin`), records(tickGroups.map((g) => Array.from({ length: 24 }, (_, v) => g[v] ?? 0))));
fs.writeFileSync(path.join(outDir, `${name}.render.allocenvx.bin`), records(allocationReads.flatMap((list, voice) => list.map((value) => [voice, value]))));
const ramParts = [];
for (const r of trace.rams) {
  const data = Buffer.from(r.hex, 'hex');
  const head = Buffer.alloc(16);
  head.writeUInt32LE(r.sample, 0);
  head.writeUInt32LE(r.core, 4);
  head.writeUInt32LE(Number.parseInt(r.address, 16), 8);
  head.writeUInt32LE(data.length / 2, 12);
  ramParts.push(head, data);
}
fs.writeFileSync(path.join(outDir, `${name}.render.ram.bin`), Buffer.concat(ramParts));
const dmaDone = trace.writes.filter((w) => w.pc >= 0x8d200 && w.pc < 0x8d600 && (w.address & 0x3ff) === 0x19a && (w.value & 0x30) === 0);
fs.writeFileSync(path.join(outDir, `${name}.render.dma.bin`), records(dmaDone.map((w) => [w.cycle])));
fs.writeFileSync(path.join(outDir, `${name}.render.frames.bin`), records(trace.frames.map((f) => [f.cycle])));
fs.writeFileSync(path.join(outDir, `${name}.render.meta.txt`), `${trace.header.cycle} ${trace.end.samples} ${trace.frames.length} ${trace.header.lClocks}\n`);
console.log(`${name}: ${events.length} events, ${observed.length} observed non-DMA writes, ${trace.end.samples} samples`);
