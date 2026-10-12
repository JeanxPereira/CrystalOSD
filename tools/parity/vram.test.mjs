import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { png } from '../../References/scripts/extract_buffers.mjs';
import { pixels16, pixels32, readPng, word16 } from './vram.mjs';
import { oracleStart } from './make_fixture.mjs';

test('word16 addresses every halfword of a 64 x 64 page once', () => {
  const seen = new Set();
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) seen.add(word16(0, 1, x, y));
  assert.equal(seen.size, 4096);
  assert.ok([...seen].every((a) => a >= 0 && a < 4096));
  assert.equal(word16(0, 1, 0, 0), 0);
  assert.equal(word16(0, 1, 1, 0), 2);
  assert.equal(word16(0, 1, 0, 1), 4);
});

test('a PSMCT16 texel becomes five-bit channels shifted by three and a bit-15 flag', () => {
  const memory = Buffer.alloc(0x1000);
  const texels = [0xffff, 0x7fff, 0x8000, 0x0000, 0x03e0, 0x001f, 0x7c00, 0x8421];
  texels.forEach((v, x) => memory.writeUInt16LE(v, word16(0, 1, x, 0) * 2));
  const out = pixels16(memory, 0, 1, 8, 1);
  const px = (x) => [...out.subarray(x * 4, x * 4 + 4)];
  assert.deepEqual(px(0), [248, 248, 248, 0x80]);
  assert.deepEqual(px(1), [248, 248, 248, 0]);
  assert.deepEqual(px(2), [0, 0, 0, 0x80]);
  assert.deepEqual(px(3), [0, 0, 0, 0]);
  assert.deepEqual(px(4), [0, 248, 0, 0]);
  assert.deepEqual(px(5), [248, 0, 0, 0]);
  assert.deepEqual(px(6), [0, 0, 248, 0]);
  assert.deepEqual(px(7), [8, 8, 8, 0x80]);
});

test('readPng reads what the repository writes', () => {
  const rgba = Buffer.alloc(5 * 3 * 4);
  for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 37 + (i >> 3)) & 255;
  const read = readPng(png(5, 3, rgba));
  assert.equal(read.width, 5);
  assert.equal(read.height, 3);
  assert.equal(read.channels, 4);
  assert.deepEqual([...read.data], [...rgba]);
});

const writePair = (dir, name, width, height, fill) => {
  const rgba = Buffer.alloc(width * height * 4), alpha = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const [r, g, b, a] = fill(i % width, Math.floor(i / width));
    rgba.set([r, g, b, 255], i * 4);
    alpha.set([a, a, a, 255], i * 4);
  }
  fs.writeFileSync(path.join(dir, `${name}.png`), png(width, height, rgba));
  fs.writeFileSync(path.join(dir, `${name}_alpha.png`), png(width, height, alpha));
};

test('a frame starts from the first before-image that holds each pixel', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-start-'));
  // Draw 1 sees the top-left 4 x 2 of block 0x8c0 as 10s, draw 2 sees 6 x 4 where its first 4 x 2 is now 99s (draw 1 wrote them)
  // and the rest is still the frame's start (20s); the depth likewise.
  writePair(dir, '00001_f00060_rt0_008c0_C_32', 4, 2, () => [10, 10, 10, 10]);
  writePair(dir, '00001_f00060_rz0_01180_Z_24', 4, 2, () => [1, 2, 3, 0]);
  writePair(dir, '00002_f00060_rt0_008c0_C_32', 6, 4, (x, y) => (x < 4 && y < 2 ? [99, 99, 99, 99] : [20, 20, 20, 20]));
  writePair(dir, '00002_f00060_rz0_01180_Z_24', 6, 4, (x, y) => (x < 4 && y < 2 ? [9, 9, 9, 0] : [4, 5, 6, 0]));
  const names = fs.readdirSync(dir);
  const start = oracleStart(dir, ['00001', '00002'], names, new Map([[0x8c0, { width: 8, height: 6, pages: 1 }]]));
  const target = start.targets.get(0x8c0);
  const at = (x, y) => [...target.subarray((y * 8 + x) * 4, (y * 8 + x) * 4 + 4)];
  assert.deepEqual(at(0, 0), [10, 10, 10, 10]);
  assert.deepEqual(at(3, 1), [10, 10, 10, 10]);
  assert.deepEqual(at(4, 0), [20, 20, 20, 20]);
  assert.deepEqual(at(0, 2), [20, 20, 20, 20]);
  assert.deepEqual(at(5, 3), [20, 20, 20, 20]);
  assert.deepEqual(at(6, 0), [0, 0, 0, 0]);
  const depth = (x, y) => [...start.depth.data.subarray((y * start.depth.width + x) * 4, (y * start.depth.width + x) * 4 + 4)];
  assert.equal(start.depth.width, 6);
  assert.equal(start.depth.height, 4);
  assert.deepEqual(depth(0, 0), [1, 2, 3, 0]);
  assert.deepEqual(depth(4, 0), [4, 5, 6, 0]);
  assert.deepEqual(depth(0, 3), [4, 5, 6, 0]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('readPng undoes the filters None, Sub, Up, Average and Paeth', () => {
  const width = 6, height = 5, channels = 3;
  const image = Buffer.alloc(width * height * channels);
  for (let i = 0; i < image.length; i++) image[i] = (i * 53 + (i >> 2) * 7) & 255;
  const stride = width * channels;
  const rows = Buffer.alloc((stride + 1) * height);
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < height; y++) {
    rows[y * (stride + 1)] = y;
    for (let i = 0; i < stride; i++) {
      const raw = image[y * stride + i];
      const a = i >= channels ? image[y * stride + i - channels] : 0, b = y ? image[(y - 1) * stride + i] : 0, c = i >= channels && y ? image[(y - 1) * stride + i - channels] : 0;
      const predictor = [0, a, b, (a + b) >> 1, paeth(a, b, c)][y];
      rows[y * (stride + 1) + 1 + i] = (raw - predictor) & 255;
    }
  }
  const chunk = (type, data) => { const out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length, 0); out.write(type, 4, 'latin1'); data.copy(out, 8); return out; };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const file = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
  assert.deepEqual([...readPng(file).data], [...image]);
});
