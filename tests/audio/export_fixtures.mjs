import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [modelDir, capturesDir, outDir, ...items] = process.argv.slice(2);
const { readSpuTrace, rpcCommands } = await import(pathToFileURL(path.join(modelDir, 'sound_trace.mjs')).href);
fs.mkdirSync(outDir, { recursive: true });

for (const item of items) {
  const [name, parts] = item.includes('=') ? [item.split('=')[0], item.split('=')[1].split('+')] : [item, [item]];
  const writes = [];
  const commands = [];
  let frameBase = 0;
  let sampleBase = 0;
  for (const part of parts) {
    const trace = readSpuTrace(path.join(capturesDir, `${part}.spu.jsonl`));
    for (const w of trace.writes) writes.push([w.captureFrame + frameBase, w.sample + sampleBase, w.address, w.value]);
    for (const c of rpcCommands(trace)) commands.push([c.captureFrame + frameBase, c.sample + sampleBase, c.id, ...c.words]);
    frameBase += trace.frames.length;
    sampleBase += trace.frames.length === 0 ? 0 : trace.frames[trace.frames.length - 1].sample;
  }
  const w = Buffer.alloc(16 * writes.length);
  writes.forEach((r, i) => r.forEach((v, k) => w.writeUInt32LE(v >>> 0, 16 * i + 4 * k)));
  const c = Buffer.alloc(32 * commands.length);
  commands.forEach((r, i) => r.forEach((v, k) => c.writeUInt32LE(v >>> 0, 32 * i + 4 * k)));
  fs.writeFileSync(path.join(outDir, `${name}.writes.bin`), w);
  fs.writeFileSync(path.join(outDir, `${name}.commands.bin`), c);
  console.log(`${name}: ${writes.length} writes, ${commands.length} commands`);
}
