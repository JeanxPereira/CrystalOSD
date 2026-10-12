// Decode the clock's four frame-sized buffers from the GS memory saved at the start of a GS dump
// (what the previous frame left in them) and write each as two PNG files: the colour, and the
// alpha as grey. Prints, per buffer, the alpha histogram and the mean colour.
//   display 0  FBP 0                  display 1  FBP W*H/2048
//   work 1     FBP W*H/512 (0x118)    work 0     FBP 3*W*H/2048 (0xD2)
// node References/scripts/extract_buffers.mjs <dump.gs> <out dir> [height]
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

export { word32, png };

if (process.argv[1] && /extract_buffers\.mjs$/.test(process.argv[1])) {
const [dumpFile, outDir, rows] = process.argv.slice(2);
const dump = fs.readFileSync(dumpFile);
const headerSize = dump.readUInt32LE(4), stateSize = dump.readUInt32LE(12);
const TAIL = (16 + 4) * 4 + 4, MEMORY = 0x400000;
const memory = dump.subarray(8 + headerSize + stateSize - TAIL - MEMORY, 8 + headerSize + stateSize - TAIL);
const W = 640, H = Number(rows ?? 224), bw = W >> 6;
const BUFFERS = [['display-0', 0], ['display-1', (W * H) >> 11], ['work-1', (W * H) >> 9], ['work-0', (3 * W * H) >> 11]];
fs.mkdirSync(outDir, { recursive: true });
for (const [name, fbp] of BUFFERS) {
  const bp = fbp * 32;
  const rgba = Buffer.alloc(W * H * 4), alpha = Buffer.alloc(W * H * 4);
  const histogram = new Map(); const sum = [0, 0, 0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const at = word32(bp, bw, x, y) * 4, o = (y * W + x) * 4;
    for (let c = 0; c < 3; c++) { rgba[o + c] = memory[at + c]; sum[c] += memory[at + c]; }
    rgba[o + 3] = 255;
    const a = memory[at + 3];
    histogram.set(a, (histogram.get(a) ?? 0) + 1);
    alpha[o] = alpha[o + 1] = alpha[o + 2] = Math.min(255, a * 2); alpha[o + 3] = 255;
  }
  fs.writeFileSync(`${outDir}/${name}.png`, png(W, H, rgba));
  fs.writeFileSync(`${outDir}/${name}-alpha.png`, png(W, H, alpha));
  const top = [...histogram].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([a, n]) => `${a}:${n}`).join(' ');
  console.log(`${name} (FBP 0x${fbp.toString(16)}): mean colour ${sum.map((v) => (v / (W * H)).toFixed(1)).join(', ')}; alpha values ${histogram.size}, most common ${top}`);
}
}
