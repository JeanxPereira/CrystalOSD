import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const [capturesDir, outDir, ...names] = process.argv.slice(2);

function readEntry(file, name) {
  const b = fs.readFileSync(file);
  let eocd = b.length - 22;
  while (b.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  const count = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = b.readUInt16LE(p + 10);
    const csize = b.readUInt32LE(p + 20);
    const nlen = b.readUInt16LE(p + 28);
    const elen = b.readUInt16LE(p + 30);
    const clen = b.readUInt16LE(p + 32);
    const off = b.readUInt32LE(p + 42);
    if (b.toString('latin1', p + 46, p + 46 + nlen) === name) {
      const start = off + 30 + b.readUInt16LE(off + 26) + b.readUInt16LE(off + 28);
      const data = b.subarray(start, start + csize);
      if (method === 93) return zlib.zstdDecompressSync(data);
      return method === 0 ? data : zlib.inflateRawSync(data);
    }
    p += 46 + nlen + elen + clen;
  }
  throw new Error(`no ${name} in ${file}`);
}

const SAVE_ID = 0x1227521;
const SAVE_VERSION = 14;
const RAM_AT = 4 + 0x10000;
const VERSION_AT = RAM_AT + 0x200000;
const CORES = VERSION_AT + 4;
const TAIL = 0x28;
const CORE_SIZE = 8128;
const VOICES = 488;
const VOICE_SIZE = 264;
const FIFO = 128;
const FIFO_WRITE = 256;
const DOWN = 6996;
const UP = 7508;
const POSITION = 8020;

function fail(name, why) {
  throw new Error(`${name}: SPU2.bin of the savestate ${why}`);
}

function validate(name, spu, state) {
  if (spu.readUInt32LE(0) !== SAVE_ID) fail(name, `has id 0x${spu.readUInt32LE(0).toString(16)}, expected 0x${SAVE_ID.toString(16)}`);
  if (spu.readUInt32LE(VERSION_AT) !== SAVE_VERSION) fail(name, `is version ${spu.readUInt32LE(VERSION_AT)}, this reader knows ${SAVE_VERSION}`);
  if (spu.length !== CORES + 2 * CORE_SIZE + TAIL) fail(name, `has ${spu.length} bytes, expected ${CORES + 2 * CORE_SIZE + TAIL}`);
  for (let c = 0; c < 2; c++) {
    const base = CORES + c * CORE_SIZE;
    if (spu.readUInt32LE(base + POSITION) !== state.cores[c].revbSampleBufPos) fail(name, `core ${c} reverb position disagrees with the state file`);
    for (let v = 0; v < 24; v++) {
      const at = base + VOICES + v * VOICE_SIZE + FIFO_WRITE;
      const want = state.cores[c].voices[v];
      if (spu.readUInt32LE(at) !== want.decPosWrite || spu.readUInt32LE(at + 4) !== want.decPosRead) fail(name, `core ${c} voice ${v} decode positions disagree with the state file`);
    }
  }
}

fs.mkdirSync(outDir, { recursive: true });
for (const name of names) {
  const spu = readEntry(path.join(capturesDir, `${name}.start.p2s`), 'SPU2.bin');
  const state = JSON.parse(fs.readFileSync(path.join(capturesDir, `${name}.start.spustate.json`), 'utf8'));
  validate(name, spu, state);
  const parts = [];
  for (let c = 0; c < 2; c++) {
    const base = CORES + c * CORE_SIZE;
    for (let v = 0; v < 24; v++) parts.push(spu.subarray(base + VOICES + v * VOICE_SIZE + FIFO, base + VOICES + v * VOICE_SIZE + FIFO + 128));
    parts.push(spu.subarray(base + DOWN, base + DOWN + 512));
    parts.push(spu.subarray(base + UP, base + UP + 512));
  }
  fs.writeFileSync(path.join(outDir, `${name}.start.history.bin`), Buffer.concat(parts));
  console.log(`${name}: history written`);
}
