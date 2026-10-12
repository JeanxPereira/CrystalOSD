// GS local memory as the fixtures need it: the dump's start memory with its host-to-local transfers replayed, PSMCT16 texels,
// and a reader for the oracle's PNG files.
import zlib from 'node:zlib';
import { word32 } from '../../References/scripts/extract_buffers.mjs';
import { word16, replayUploads as replay } from '../../References/scripts/extract_opening_textures.mjs';

export { word16 };

/** A PSMCT16 texture as RGBA: each 5-bit channel shifted left by 3, alpha 0x80 when bit 15 is set (TEXA is the pass's, not the pixels'). */
export function pixels16(memory, block, pages, width, height) {
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const v = memory.readUInt16LE((word16(block, pages, x, y) * 2) % memory.length), o = (y * width + x) * 4;
    out[o] = (v & 31) << 3; out[o + 1] = ((v >> 5) & 31) << 3; out[o + 2] = ((v >> 10) & 31) << 3; out[o + 3] = v & 0x8000 ? 0x80 : 0;
  }
  return out;
}

export function pixels32(memory, block, pages, width, height) {
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = (word32(block, pages, x, y) % 0x100000) * 4;
    memory.copy(out, (y * width + x) * 4, at, at + 4);
  }
  return out;
}

export class GifPath {
  buffer = Buffer.alloc(0);
  tag = null;
  remaining = 0;
  index = 0;
  skip = 0;

  feed(chunk, sink) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    let offset = 0;
    for (;;) {
      let available = this.buffer.length - offset;
      if (!this.tag) {
        const drop = Math.min(this.skip, available);
        offset += drop; this.skip -= drop; available -= drop;
        if (this.skip > 0 || available < 16) break;
        const lo = this.buffer.readBigUInt64LE(offset), hi = this.buffer.readBigUInt64LE(offset + 8);
        offset += 16;
        const nloop = Number(lo & 0x7fffn), flg = Number((lo >> 58n) & 3n), nreg = Number((lo >> 60n) & 15n) || 16;
        if (nloop === 0) continue;
        this.tag = { flg, nreg, regs: Array.from({ length: nreg }, (_, i) => Number((hi >> BigInt(4 * i)) & 15n)) };
        this.index = 0;
        this.remaining = flg >= 2 ? nloop * 16 : nloop * nreg;
        continue;
      }
      const { flg, nreg, regs } = this.tag;
      if (flg === 0) {
        if (available < 16) break;
        const lo = this.buffer.readBigUInt64LE(offset), hi = this.buffer.readBigUInt64LE(offset + 8);
        offset += 16;
        if (regs[this.index % nreg] === 0xe) sink.write(Number(hi & 0x7fn), lo);
        this.index += 1; this.remaining -= 1;
      } else if (flg === 1) {
        if (available < 8) break;
        const value = this.buffer.readBigUInt64LE(offset);
        offset += 8;
        const descriptor = regs[this.index % nreg];
        if (descriptor !== 0xe && descriptor !== 0xf) sink.write(descriptor, value);
        this.index += 1; this.remaining -= 1;
        if (this.remaining === 0 && this.index % 2 === 1) this.skip = 8;
      } else {
        if (available === 0) break;
        const take = Math.min(this.remaining, available);
        sink.image(this.buffer.subarray(offset, offset + take));
        offset += take; this.remaining -= take;
      }
      if (this.remaining === 0) this.tag = null;
    }
    this.buffer = offset === this.buffer.length ? Buffer.alloc(0) : Buffer.from(this.buffer.subarray(offset));
  }
}

/** Writes the dump's host-to-local transfers up to dump frame `lastFrame` into `memory`; returns what was written. */
export const replayUploads = (memory, packets, lastFrame) => replay(memory, packets, { maxFrame: lastFrame });

/** An 8-bit grey, RGB or RGBA PNG as { width, height, channels, data }. */
export function readPng(bytes) {
  if (bytes.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let at = 8, width = 0, height = 0, type = 0;
  const chunks = [];
  while (at < bytes.length) {
    const length = bytes.readUInt32BE(at), name = bytes.toString('latin1', at + 4, at + 8), body = bytes.subarray(at + 8, at + 8 + length);
    if (name === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); type = body[9]; if (body[8] !== 8 || body[12] !== 0) throw new Error('PNG is not 8-bit and not interlaced'); }
    else if (name === 'IDAT') chunks.push(body);
    at += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[type];
  if (!channels) throw new Error(`PNG colour type ${type}`);
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * channels, data = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? data[y * stride + i - channels] : 0, b = y ? data[(y - 1) * stride + i] : 0, c = i >= channels && y ? data[(y - 1) * stride + i - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      else if (filter === 2) predictor = b;
      else if (filter === 3) predictor = (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      data[y * stride + i] = (line[i] + predictor) & 255;
    }
  }
  return { width, height, channels, data };
}
