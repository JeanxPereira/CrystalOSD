// Decode the clock's textures from the GS memory saved at the start of a GS dump (PCSX2 puts the
// whole 4 MB of GS local memory in the dump's state block) and write them as PNG files.
// Build of the dump: ROM 2.30. Only PSMCT32 textures; the font (4-bit) is left out.
// node References/scripts/extract_textures.mjs <dump.gs> <out dir>
import fs from 'node:fs';
import zlib from 'node:zlib';

const BLOCK = [[0, 1, 4, 5, 16, 17, 20, 21], [2, 3, 6, 7, 18, 19, 22, 23], [8, 9, 12, 13, 24, 25, 28, 29], [10, 11, 14, 15, 26, 27, 30, 31]];
const COLUMN = [[0, 1, 4, 5, 8, 9, 12, 13], [2, 3, 6, 7, 10, 11, 14, 15], [16, 17, 20, 21, 24, 25, 28, 29], [18, 19, 22, 23, 26, 27, 30, 31],
  [32, 33, 36, 37, 40, 41, 44, 45], [34, 35, 38, 39, 42, 43, 46, 47], [48, 49, 52, 53, 56, 57, 60, 61], [50, 51, 54, 55, 58, 59, 62, 63]];
/** Word address of a PSMCT32 pixel: pages of 64 x 32, blocks of 8 x 8, both in the GS's order. */
const word32 = (bp, bw, x, y) => (bp + ((x >> 6) + (y >> 5) * bw) * 32 + BLOCK[(y >> 3) & 3][(x >> 3) & 7]) * 64 + COLUMN[y & 7][x & 7];

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (bytes) => { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function png(width, height, rgba) {
  const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]); const out = Buffer.alloc(body.length + 8); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), body.length + 4); return out; };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

const [dumpFile, outDir] = process.argv.slice(2);
const dump = fs.readFileSync(dumpFile);
const headerSize = dump.readUInt32LE(4), stateSize = dump.readUInt32LE(12);
// The state ends with the four GIF paths (tag and register index each) and Q; the memory is before them.
const TAIL = (16 + 4) * 4 + 4, MEMORY = 0x400000;
const memory = dump.subarray(8 + headerSize + stateSize - TAIL - MEMORY, 8 + headerSize + stateSize - TAIL);
console.log(`state ${stateSize} bytes; GS memory taken from offset ${8 + headerSize + stateSize - TAIL - MEMORY}`);

const TEXTURES = [[0x2bc0, 1, 64, 64], [0x2c00, 2, 128, 128], [0x2d00, 1, 64, 64], [0x2d40, 1, 64, 64], [0x2d80, 1, 64, 64],
  [0x2dc0, 1, 64, 64], [0x2e00, 1, 64, 64], [0x2e40, 1, 64, 64], [0x2e80, 1, 64, 64], [0x2ec0, 1, 64, 64]];
for (const [bp, bw, width, height] of TEXTURES) {
  const rgba = Buffer.alloc(width * height * 4);
  let alphaLow = 255, alphaHigh = 0, nonzero = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = word32(bp, bw, x, y) * 4;
    memory.copy(rgba, (y * width + x) * 4, at, at + 4);
    const a = memory[at + 3]; alphaLow = Math.min(alphaLow, a); alphaHigh = Math.max(alphaHigh, a);
    if (memory.readUInt32LE(at)) nonzero += 1;
  }
  const name = `tbp-${bp.toString(16)}-${width}x${height}`;
  fs.writeFileSync(`${outDir}/${name}.png`, png(width, height, rgba));
  // The same picture with alpha forced opaque, to look at.
  const opaque = Buffer.from(rgba); for (let i = 3; i < opaque.length; i += 4) opaque[i] = 255;
  fs.writeFileSync(`${outDir}/${name}-opaque.png`, png(width, height, opaque));
  console.log(`${name}: alpha ${alphaLow}..${alphaHigh}, ${nonzero} of ${width * height} texels not zero, sha1 ${(await import('node:crypto')).createHash('sha1').update(rgba).digest('hex').slice(0, 12)}`);
}
