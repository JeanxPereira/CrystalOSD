// The Browser's device icons: the .ico members of ICOIMAGE as the program reads and loads them.
// HDD OSD 1.10U addresses first; ROM 2.30 in brackets (the same code with other registers, diff_rom.mjs).
//
// Source of the bytes: ICOIMAGE (host file on the HDD OSD, decrypted with the cipher tables and the key words of
// hddosd.elf: do_load_resources 0x0020AB98; a plain ROMDIR member of the BIOS on ROM 2.30), its ROMDIR, and Expand
// (sound_data.mjs). Member k of browser_icon_indices (resources 62..77 [70..82 on ROM]) is ICOB<name k>.
//
// Parser: module_browser_23B130 0x0023B130 [0x002376B8], called by module_browser_23AFC8 0x0023AFC8 [0x00237608]
//   (a0 vertex buffer, a1 texture buffer, a2 the expanded member, a3 limit 0x51000, t0 slot, t1/t2 -> words out).
//   0x00 magic 0x00010000 | 0x04 shape count S in {1,2,4,6,8} | 0x08 flags (bit0 IIP, bit2 texture, bit3 RLE16)
//   0x0C float >= 0 | 0x10 vertex count n (n % 3 == 0, n <= limit by S, n * (8S + 16) <= limit - 0x14)
//   0x14 n records of 8S + 16 bytes: S positions (s16 x y z, pad), normal (s16 x y z, pad), uv (s16 u v), colour (u8 r g b a)
//   then the keyframe block (func_0023AA08 0x0023AA08 [0x00237048]), then the texture: raw 0x8000 bytes (flag bit3 clear)
//   or u32 compressed size + RLE16 (func_0023BDC8 0x0023BDC8 [0x00238218]), 128 x 128 PSMCT16.
import { mul, floatBits } from '../lib/ee-float.mjs';
import { decryptImage, imageKey, romdirStart, romdirEntries, expand, CIPHER_TABLES, CIPHER_TABLE_SIZES } from './sound_data.mjs';

// browser_icon_indices (0x002BD180) order: member k is the file ICOB<ICON_NAMES[k]>.
export const ICON_NAMES = ['DISC', 'CDDA', 'PS1M', 'PS2M', 'PKST', 'PS1D', 'PS2D', 'DVDD', 'YSYS', 'FSCE', 'FNOR', 'FBRK', 'QUES', 'FHDD', 'FDIR', 'FFIL'];
export const ICO_LIMIT = 0x51000;
export const TEXTURE_BYTES = 0x8000;
export const TEXTURE_PACKET_WORDS = 0x2014;
// The GS address of the icon texture: DBP 0x3A98, DBW 2, PSMCT16, 128 x 128 (func_0023A708 0x0023A708 [0x00236D48]).
export const TEXTURE_DBP = 0x3a98;
export const TEXTURE_DBW = 2;

const SHAPE_CAP = { 1: 0x708, 2: 0x672, 4: 0x5dc, 6: 0x546, 8: 0x4b0 };
const POSITION_SCALE = 0.0009765625;
const NORMAL_SCALE = 0.000244140625;
const ONE = 0x3f800000;

// Reads file-backed bytes of hddosd.elf by virtual address.
export function elfReader(elf) {
  const phoff = elf.readUInt32LE(0x1c);
  const phnum = elf.readUInt16LE(0x2c);
  const phsize = elf.readUInt16LE(0x2a);
  const segments = Array.from({ length: phnum }, (_, i) => {
    const o = phoff + i * phsize;
    return { type: elf.readUInt32LE(o), off: elf.readUInt32LE(o + 4), vaddr: elf.readUInt32LE(o + 8), size: elf.readUInt32LE(o + 16) };
  }).filter((s) => s.type === 1);
  return (vaddr, length) => {
    const s = segments.find((candidate) => vaddr >= candidate.vaddr && vaddr + length <= candidate.vaddr + candidate.size);
    if (!s) throw new Error(`0x${vaddr.toString(16)} is not in a file-backed segment of hddosd.elf`);
    return elf.subarray(s.off + vaddr - s.vaddr, s.off + vaddr - s.vaddr + length);
  };
}

// The cipher tables (CIPHER_TABLES), the key words at 0x002AD970 and the key do_load_resources builds from them.
export function cipherKit(elf) {
  const at = elfReader(elf);
  const tables = Object.fromEntries(Object.keys(CIPHER_TABLES).map((k) => [k, at(CIPHER_TABLES[k], CIPHER_TABLE_SIZES[k])]));
  const words = Buffer.from(at(0x002ad970, 16));
  return { tables, words, key: imageKey(words.readBigUInt64LE(0), words.readBigUInt64LE(8)) };
}

// The HDD OSD's ICOIMAGE container: the host file with the first 64 of every 512 blocks decrypted.
export const decryptIcoImage = (file, kit) => decryptImage(file, kit.tables, kit.key);

// The BIOS's ICOIMAGE member (plain).
export function biosIcoImage(bios) {
  const entry = romdirEntries(bios, romdirStart(bios, 0x100000)).find((e) => e.name === 'ICOIMAGE');
  if (!entry) throw new Error('the BIOS has no ICOIMAGE');
  return bios.subarray(entry.offset, entry.offset + entry.size);
}

// Every ICOB member of a container, expanded: [{ name, packed, data }] in directory order.
export function icoMembers(container) {
  const entries = romdirEntries(container, romdirStart(container));
  return entries.filter((e) => /^ICOB/.test(e.name)).map((e) => ({ name: e.name.slice(4), packed: e.size, data: Buffer.from(expand(container, e.offset).out) }));
}

// func_0023BDC8: signed halfword n; n > 0 repeats the next halfword n times; n < 0 copies -n halfwords; n == 0 consumes only itself.
export function rle16(src, bytes) {
  const limit = bytes >> 1;
  const out = [];
  let at = 0;
  let used = 0;
  while (used < limit) {
    const n = src.readInt16LE(at);
    at += 2;
    used += 1;
    if (n > 0) {
      const value = src.readUInt16LE(at);
      at += 2;
      used += 1;
      for (let k = 0; k < n; k++) out.push(value);
    } else if (n < 0) {
      for (let k = 0; k < -n; k++) { out.push(src.readUInt16LE(at)); at += 2; }
      used += -n;
    }
  }
  const data = Buffer.alloc(out.length * 2);
  out.forEach((value, i) => data.writeUInt16LE(value, 2 * i));
  return data;
}

// func_0023AA08: the keyframe block at `at`; returns the words it consumes and its tracks, or a reason it fails.
export function parseKeys(buf, at, shapes) {
  const word = (i) => buf.readUInt32LE(at + 4 * i);
  const count = word(0);
  if (count !== 1) return { ok: false, why: `track count ${count}` };
  let words = 1;
  let index = 1;
  const tracks = [];
  for (let t = 0; t < count; t++) {
    const track = { length: word(index), scale: word(index + 1), offset: word(index + 2), shapes: [] };
    const shapeTracks = word(index + 3);
    index += 4;
    words += 4;
    if (shapeTracks > 8) return { ok: false, why: `shape tracks ${shapeTracks}` };
    for (let j = 0; j < shapeTracks; j++) {
      const shape = word(index);
      if (shapes < shape) return { ok: false, why: `shape index ${shape}` };
      const keys = word(index + 1);
      if (keys > 10) return { ok: false, why: `key count ${keys}` };
      index += 2;
      words += 2;
      const pairs = [];
      for (let k = 0; k < keys; k++) { pairs.push([word(index), word(index + 1)]); index += 2; words += 2; }
      track.shapes.push({ shape, keys: pairs });
    }
    tracks.push(track);
  }
  return { ok: true, words, tracks };
}

const s16 = (buf, at) => buf.readInt16LE(at);

// The whole parse module_browser_23B130 makes of a member; { ok: false, why } where it returns -1.
// The check n * (8S + 16) <= limit - 0x14 (0x0023B2F8) cannot fail once the shape cap holds: 1200 * 80 < 0x51000.
export function parseIco(buf) {
  if (buf.readUInt32LE(0) !== 0x00010000) return { ok: false, why: 'magic' };
  const shapes = buf.readUInt32LE(4);
  const flags = buf.readUInt32LE(8);
  const headerFloat = buf.readUInt32LE(12);
  if (buf.readFloatLE(12) < 0) return { ok: false, why: 'negative float' };
  const cap = SHAPE_CAP[shapes];
  if (cap === undefined) return { ok: false, why: 'shape count' };
  const count = buf.readUInt32LE(16);
  if (cap < count) return { ok: false, why: 'vertex count' };
  if (count % 3 !== 0) return { ok: false, why: 'vertex count % 3' };
  const stride = 8 * shapes + 16;
  const vertices = [];
  for (let v = 0; v < count; v++) {
    const at = 0x14 + v * stride;
    const positions = [];
    for (let k = 0; k < shapes; k++) positions.push([s16(buf, at + 8 * k), s16(buf, at + 8 * k + 2), s16(buf, at + 8 * k + 4)]);
    const n = at + 8 * shapes;
    vertices.push({
      positions,
      normal: [s16(buf, n), s16(buf, n + 2), s16(buf, n + 4)],
      uv: [s16(buf, n + 8), s16(buf, n + 10)],
      colour: [buf[n + 12], buf[n + 13], buf[n + 14], buf[n + 15]],
    });
  }
  const keysAt = 0x14 + count * stride;
  const keys = parseKeys(buf, keysAt, shapes);
  if (!keys.ok) return { ok: false, why: `keyframes: ${keys.why}` };
  const textured = (flags >> 2) & 1;
  const rle = (flags >> 3) & 1;
  const textureAt = keysAt + 4 * keys.words;
  let texture = null;
  let end = textureAt;
  if (textured) {
    if (!rle) {
      texture = Buffer.from(buf.subarray(textureAt, textureAt + TEXTURE_BYTES));
      end = textureAt + TEXTURE_BYTES;
    } else {
      const size = buf.readUInt32LE(textureAt);
      texture = rle16(buf.subarray(textureAt + 4), size);
      if (texture.length !== TEXTURE_BYTES) return { ok: false, why: `RLE16 gives ${texture.length} bytes` };
      end = textureAt + 4 + size;
    }
  }
  return { ok: true, shapes, flags, headerFloat, count, stride, vertices, keys, keysAt, textureAt, texture, end, textured, rle };
}

// cvt.s.w then mul.s by a power of two, as the parser converts a halfword.
const scaled = (value, scale) => floatBits(mul(Math.fround(value), scale));

// The vertex qwords of one vertex: S positions, normal, uv, colour (0x0023B4F0..0x0023B6A0).
function vertexQwords(vertex) {
  const qwords = [];
  for (const p of vertex.positions) qwords.push([scaled(p[0], POSITION_SCALE), scaled(p[1], POSITION_SCALE), scaled(p[2], POSITION_SCALE), ONE]);
  qwords.push([scaled(vertex.normal[0], NORMAL_SCALE), scaled(vertex.normal[1], NORMAL_SCALE), scaled(vertex.normal[2], NORMAL_SCALE), ONE]);
  qwords.push([scaled(vertex.uv[0], NORMAL_SCALE), scaled(vertex.uv[1], NORMAL_SCALE), ONE, 0]);
  qwords.push(vertex.colour.map((c) => floatBits(Math.fround(c))));
  return qwords;
}

// The vertex packet module_browser_23B130 writes into the vertex buffer (0x0023B2EC..0x0023BA70): chunks of
// 3 * floor(floor(0x1F0 / (S + 6)) / 3) vertices, then the remainder. A chunk is a header of 12 words
// ([0, 0, STCYCL (first chunk, and always for the remainder), 0x6C018000], [0x8000 | vertices, GIF tag high word, 0x412, 0],
// [0, 0, STCYCL (remainder), UNPACK of the vertex qwords]), the vertex qwords split into UNPACKs of fewer than 0x100 qwords
// (each split writes [0, 0, STCYCL, UNPACK] before the next vertex), and MSCNT 0x17000000 ([0, 0, 0, MSCNT] after a full
// chunk, [0, 0, MSCNT, 0] after the remainder). Returns the words.
export function vertexPacket(ico) {
  const S = ico.shapes;
  const per = S + 3;
  const chunk = 3 * Math.floor(Math.floor(0x1f0 / (S + 6)) / 3);
  const full = Math.floor(ico.count / chunk);
  const rest = ico.count - full * chunk;
  const tagHigh = (0x30418000 | ((ico.flags & 1) << 18) | (((ico.flags >> 2) & 1) << 19)) >>> 0;
  const words = [];
  let next = 0;
  let at = 0;
  const emit = (list) => { for (const word of list) words[next++] = word >>> 0; };
  const unpack = (offset, qwords) => (0x6c000000 | offset | (qwords << 16) | 0x8000) >>> 0;
  const run = (vertices, first, remainder, chunkIndex) => {
    emit([0, 0, first || remainder ? 0x01000404 : 0, 0x6c018000]);
    emit([0x8000 | vertices, chunkIndex === 0 ? (tagHigh | 0x4000) >>> 0 : tagHigh, 0x412, 0]);
    emit([0, 0, remainder ? 0x01000404 : 0]);
    let placeholder = next++;
    let offset = 1;
    let held = 0;
    for (let v = 0; v < vertices; v++) {
      if (held + per >= 0x100) {
        words[placeholder] = unpack(offset, held);
        emit([0, 0, 0x01000404]);
        placeholder = next++;
        offset += held;
        held = 0;
      }
      held += per;
      for (const qword of vertexQwords(ico.vertices[at++])) emit(qword);
    }
    words[placeholder] = unpack(offset, held);
    emit(remainder ? [0, 0, 0x17000000, 0] : [0, 0, 0, 0x17000000]);
  };
  for (let c = 0; c < full; c++) run(chunk, c === 0, false, c);
  if (rest !== 0) run(rest, false, true, full);
  return Uint32Array.from(words);
}

// The texture packet at the texture buffer: DIRECTHL, A+D (TEXFLUSH, TRXDIR), the IMAGE tag, then 0x8000 bytes.
export function texturePacket(ico) {
  const packet = Buffer.alloc(TEXTURE_PACKET_WORDS * 4);
  const word = (i, value) => packet.writeUInt32LE(value >>> 0, 4 * i);
  word(3, 0x51000804);
  word(4, 0x8002);
  word(5, 0x10000000);
  word(6, 0xe);
  word(10, 0x3f);
  word(14, 0x53);
  word(16, 0x8800);
  word(17, 0x08000000);
  ico.texture.copy(packet, 0x50);
  return packet;
}

// The position box module_browser_23A450 folds (vmini, vmax) from its initial (10, 0, 10, 1) and (-10, -20, -10, 1).
export const BOX_INIT = { min: [10, 0, 10, 1], max: [-10, -20, -10, 1] };
export function iconBox(ico) {
  const min = BOX_INIT.min.slice();
  const max = BOX_INIT.max.slice();
  for (const vertex of ico.vertices) {
    for (const p of vertex.positions) {
      const position = [mul(Math.fround(p[0]), POSITION_SCALE), mul(Math.fround(p[1]), POSITION_SCALE), mul(Math.fround(p[2]), POSITION_SCALE), 1];
      for (let k = 0; k < 4; k++) {
        min[k] = Math.min(min[k], position[k]);
        max[k] = Math.max(max[k], position[k]);
      }
    }
  }
  return { min: min.map(floatBits), max: max.map(floatBits) };
}

// func_0023AA08's table for a slot (HDD OSD D_0041EF64 + 0x2D8 * slot, ROM 0x0038AF34 + ...): word offset -> word. Count, a cleared
// word, then per track at 8 + 0x2D0 * t: length, scale, offset, shape-track count, and per shape track at +0x10 + 0x58 * j: shape, key count, (time, value) pairs.
export function keyTable(keys) {
  const table = new Map([[0, keys.tracks.length], [4, 0]]);
  keys.tracks.forEach((track, t) => {
    const at = 8 + 0x2d0 * t;
    table.set(at, track.length);
    table.set(at + 4, track.scale);
    table.set(at + 8, track.offset);
    table.set(at + 0xc, track.shapes.length);
    track.shapes.forEach((shape, j) => {
      const base = at + 0x10 + 0x58 * j;
      table.set(base, shape.shape);
      table.set(base + 4, shape.keys.length);
      shape.keys.forEach(([time, value], i) => {
        table.set(base + 8 + 8 * i, time);
        table.set(base + 12 + 8 * i, value);
      });
    });
  });
  return table;
}

// The static pair D_002BA120 (ROM 0x0029B380) the parser copies into the descriptor at +0x10/+0x14, by shape count.
export const PAIR_INDEX = { 1: 0, 2: 1, 4: 2, 6: 3, 8: 4 };

// GS memory, PSMCT16 (page 64 x 64, block 16 x 8, column word table), as a word index.
const BLOCK16 = [[0, 2, 8, 10], [1, 3, 9, 11], [4, 6, 12, 14], [5, 7, 13, 15], [16, 18, 24, 26], [17, 19, 25, 27], [20, 22, 28, 30], [21, 23, 29, 31]];
const COLUMN16 = [[0, 1, 4, 5, 8, 9, 12, 13, 0, 1, 4, 5, 8, 9, 12, 13], [2, 3, 6, 7, 10, 11, 14, 15, 2, 3, 6, 7, 10, 11, 14, 15]];

// The byte offset in GS memory of the 16-bit pixel (x, y) of a buffer at block `dbp`, width `dbw` pages.
export function psmct16Offset(dbp, dbw, x, y) {
  const page = (x >> 6) + (y >> 6) * dbw;
  const block = BLOCK16[(y >> 3) & 7][(x >> 4) & 3];
  const word = (dbp + page * 32 + block) * 64 + ((y >> 1) & 3) * 16 + COLUMN16[y & 1][x & 15];
  return word * 4 + ((x & 15) >= 8 ? 2 : 0);
}

// The width x height PSMCT16 buffer at block `dbp` as raster bytes (little-endian halfwords), from GS memory
// `memory` whose first byte is GS byte `origin` (0 for the whole 4 MB, dbp * 256 for a read that starts at the buffer).
export function readTexture16(memory, origin, dbp, dbw, width, height) {
  const out = Buffer.alloc(width * height * 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) out.writeUInt16LE(memory.readUInt16LE(psmct16Offset(dbp, dbw, x, y) - origin), 2 * (y * width + x));
  }
  return out;
}
