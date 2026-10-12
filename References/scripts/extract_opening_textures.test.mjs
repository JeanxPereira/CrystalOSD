import test from 'node:test';
import assert from 'node:assert/strict';
import { word16, word32, decodeCt16, decodeCt32, replayUploads } from './extract_opening_textures.mjs';

const TEXA = { TA0: 127, TA1: 129, AEM: 1 };
const memoryImage = () => Buffer.alloc(0x400000);
const put16 = (memory, bp, bw, x, y, value) => memory.writeUInt16LE(value, word16(bp, bw, x, y) * 2);

test('word16 follows the GS block and column tables', () => {
  assert.equal(word16(0, 1, 0, 0), 0);
  assert.equal(word16(0, 1, 1, 0), 2);
  assert.equal(word16(0, 1, 2, 0), 8);
  assert.equal(word16(0, 1, 7, 0), 26);
  assert.equal(word16(0, 1, 8, 0), 1);
  assert.equal(word16(0, 1, 0, 1), 4);
  assert.equal(word16(0, 1, 0, 2), 32);
  assert.equal(word16(0, 1, 15, 7), 127);
  assert.equal(word16(0, 1, 16, 0), 2 * 128);
  assert.equal(word16(0, 1, 0, 8), 1 * 128);
  assert.equal(word16(0, 1, 32, 0), 8 * 128);
  assert.equal(word16(0, 1, 0, 32), 16 * 128);
  assert.equal(word16(0, 1, 63, 63), 31 * 128 + 127);
  assert.equal(word16(0, 1, 0, 64), 32 * 128);
  assert.equal(word16(0, 2, 64, 0), 32 * 128);
  assert.equal(word16(5, 1, 0, 0), 5 * 128);
});

test('word16 is a bijection over two pages', () => {
  const seen = new Set();
  for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) seen.add(word16(0, 2, x, y));
  assert.equal(seen.size, 128 * 64);
  assert.equal(Math.max(...seen), 128 * 64 - 1);
});

test('PSMCT16 texels expand as the GS does', () => {
  const memory = memoryImage();
  const texels = [0x7fff, 0x8000, 0x03e0, 0x001f, 0xffff, 0x0000];
  texels.forEach((value, x) => put16(memory, 100, 1, x, 0, value));
  const rgba = decodeCt16(memory, 100, 1, 6, 1, TEXA);
  const at = (x) => [...rgba.subarray(x * 4, x * 4 + 4)];
  assert.deepEqual(at(0), [248, 248, 248, 127]);
  assert.deepEqual(at(1), [0, 0, 0, 0]);
  assert.deepEqual(at(2), [0, 248, 0, 127]);
  assert.deepEqual(at(3), [248, 0, 0, 127]);
  assert.deepEqual(at(4), [248, 248, 248, 129]);
  assert.deepEqual(at(5), [0, 0, 0, 0]);
});

test('PSMCT16 black texels keep their alpha when AEM is clear', () => {
  const memory = memoryImage();
  put16(memory, 0, 1, 0, 0, 0x8000);
  put16(memory, 0, 1, 1, 0, 0x0000);
  const rgba = decodeCt16(memory, 0, 1, 2, 1, { TA0: 10, TA1: 200, AEM: 0 });
  assert.deepEqual([...rgba.subarray(0, 8)], [0, 0, 0, 200, 0, 0, 0, 10]);
});

test('PSMCT32 texels are read as the clock script reads them', () => {
  const memory = memoryImage();
  memory.writeUInt32LE(0x80402010, word32(32, 4, 130, 33) * 4);
  const rgba = decodeCt32(memory, 32, 4, 256, 64);
  assert.deepEqual([...rgba.subarray((33 * 256 + 130) * 4, (33 * 256 + 130) * 4 + 4)], [0x10, 0x20, 0x40, 0x80]);
});

const tag = (nloop, flg, nreg, regs, eop = 1) => {
  const b = Buffer.alloc(16);
  b.writeBigUInt64LE(BigInt(nloop) | (BigInt(eop) << 15n) | (BigInt(flg) << 58n) | (BigInt(nreg) << 60n), 0);
  b.writeBigUInt64LE(regs.reduce((v, r, i) => v | (BigInt(r) << BigInt(4 * i)), 0n), 8);
  return b;
};
const ad = (reg, value) => { const b = Buffer.alloc(16); b.writeBigUInt64LE(value, 0); b.writeBigUInt64LE(BigInt(reg), 8); return b; };
const upload = (dbp, dbw, psm, width, height, data) => Buffer.concat([
  tag(4, 0, 1, [0xe]),
  ad(0x50, BigInt(dbp) << 32n | BigInt(dbw) << 48n | BigInt(psm) << 56n),
  ad(0x51, 0n), ad(0x52, BigInt(width) | BigInt(height) << 32n), ad(0x53, 0n),
  tag(Math.ceil(data.length / 16), 2, 0, []),
  Buffer.concat([data, Buffer.alloc((16 - (data.length % 16)) % 16)]),
]);

test('replayUploads writes a PSMCT16 and a PSMCT32 transfer into the memory image, split across packets', () => {
  const half = Buffer.alloc(8 * 4 * 2);
  for (let i = 0; i < 32; i++) half.writeUInt16LE(0x8000 | i, i * 2);
  const word = Buffer.alloc(16 * 2 * 4);
  for (let i = 0; i < 32; i++) word.writeUInt32LE(0x01000000 + i, i * 4);
  const stream = Buffer.concat([upload(64, 1, 2, 8, 4, half), upload(96, 1, 0, 16, 2, word)]);
  const packets = [
    { type: 'transfer', path: 3, data: stream.subarray(0, 100) },
    { type: 'vsync', field: 0 },
    { type: 'transfer', path: 3, data: stream.subarray(100) },
  ];
  const memory = memoryImage();
  const result = replayUploads(memory, packets, { maxFrame: 10 });
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((u) => [u.frame, u.dbp, u.psm, u.width, u.height]), [[0, 64, 2, 8, 4], [1, 96, 0, 16, 2]]);
  assert.equal(memory.readUInt16LE(word16(64, 1, 3, 2) * 2), 0x8000 | (2 * 8 + 3));
  assert.equal(memory.readUInt32LE(word32(96, 1, 5, 1) * 4), 0x01000000 + 16 + 5);
});

test('replayUploads leaves transfers after maxFrame out', () => {
  const data = Buffer.alloc(16);
  const packets = [{ type: 'vsync', field: 0 }, { type: 'vsync', field: 1 }, { type: 'transfer', path: 3, data: upload(64, 1, 2, 8, 1, data) }];
  const memory = memoryImage();
  assert.equal(replayUploads(memory, packets, { maxFrame: 1 }).length, 0);
});

test('entries settled only by allocation order and draw counts are marked inferred, with their basis', async () => {
  const { TEXTURES } = await import('./extract_opening_textures.mjs');
  const mapping = Object.fromEntries(TEXTURES.map((t) => [t.index, t.mapping]));
  for (const index of [8, 10, 11, 12]) assert.equal(mapping[index], 'inferred', `index ${index}`);
  for (const index of [0, 2, 3, 5, 6]) assert.equal(mapping[index], 'settled', `index ${index}`);
  for (const t of TEXTURES) assert.ok(t.basis && t.basis.length > 10, `basis of index ${t.index}`);
});
