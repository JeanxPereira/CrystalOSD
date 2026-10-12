// The OSD font of HDD OSD 1.10U: expand FNTOSD (the OSDSYS scheme), walk its blocks as the pfont
// library does (scePFontGetGlyph, 0x002905A0), and write
//   <model>/font-osd.json    the layout of the file, every block's header and code ranges, the
//                            metrics of the Latin block, the colour table
//   <textures>/font-osd-block<N>.png   every glyph of a block, in glyph order, through the table
// The glyph pictures are Sony's and stay out of the tracked files.
//
// node extract_font.mjs <FNTOSD> <model directory> <textures directory>
//
// ROM 2.30 has the same pictures packaged another way: four whole pages of 32 x 40 cells in the
// ROM file FNTIMAGE (a directory of expanded-on-load files), and tables of left edge and width
// in the program's data. With --rom:
//   <model>/font-rom.json    the pages, and the tables as an EE memory dump holds them
//   <textures>/font-rom-<file>.png
// node extract_font.mjs --rom <bios.bin> <ee dump from 0x00100000> <model directory> <textures directory>
//
// Both are checked against GS memory by verify_text.mjs when a capture's dump is beside its trace.
import fs from 'node:fs';
import zlib from 'node:zlib';

export function expand(src) {
  const length = src.readUInt32LE(0);
  const dst = Buffer.alloc(length);
  let s = 4, d = 0, run = 0, desc = 0, shift = 0, mask = 0;
  while (d < length) {
    if (run === 0) {
      run = 30;
      desc = src.readUInt32BE(s); s += 4;
      const n = desc & 3;
      shift = 14 - n;
      mask = 0x3fff >> n;
    }
    if ((desc & (1 << (run + 1))) === 0) dst[d++] = src[s++];
    else {
      const h = src.readUInt16BE(s); s += 2;
      let from = d - ((h & mask) + 1);
      for (let i = 0; i < 3 + (h >> shift) && d < length; i++) dst[d++] = dst[from++];
    }
    run -= 1;
  }
  return dst;
}

/**
 * The font as the library reads it. `data` is the expanded file; the library is handed its first
 * byte (two zero words, or it refuses the data).
 *   +0x50 s16 ascent, +0x52 s16 descent, +0x54 s16 the width the program uses for a blank
 *   +0x58 number of blocks, +0x5C offsets of the blocks
 * A block: +0x10 flags (low 3 bits: pixel format, 0 is 4 bits; bit 3: metrics per glyph),
 *   +0x14, +0x18 floats: scale of x and y, +0x1C, +0x1E s16 width and height of a glyph picture,
 *   +0x20, +0x22 s16 ascent and descent, +0x28 glyphs, +0x2C pictures, +0x30 number of ranges,
 *   +0x34 ranges (start, end, first index entry, added to the entry), +0x3C index (u16 per code,
 *   0xFFFF none), +0x44 metrics (seven s16 and a pad per glyph), +0x54 colour table.
 */
export function readFont(data) {
  if (data.readUInt32LE(0) !== 0 || data.readUInt32LE(4) !== 0) throw new Error('not font data: the first two words are not zero');
  const font = { ascent: data.readInt16LE(0x50), descent: data.readInt16LE(0x52), blank: data.readInt16LE(0x54), blocks: [] };
  for (let i = 0; i < data.readUInt32LE(0x58); i++) {
    const at = data.readUInt32LE(0x5c + 4 * i);
    const u32 = (o) => data.readUInt32LE(at + o), s16 = (o) => data.readInt16LE(at + o);
    const flags = u32(0x10);
    const depth = (flags & 7) === 0 ? 4 : (flags & 7) << 3;
    const width = s16(0x1c), height = s16(0x1e);
    const bits = width * height * depth;
    const block = { at, flags, depth, scaleX: data.readFloatLE(at + 0x14), scaleY: data.readFloatLE(at + 0x18), width, height,
      ascent: s16(0x20), descent: s16(0x22), glyphs: u32(0x28), pictures: at + u32(0x2c), pictureSize: (((bits < 0 ? bits + 7 : bits) >> 3) + 15) & ~15,
      ranges: [], index: at + u32(0x3c), metrics: at + u32(0x44), perGlyph: (flags >> 3) & 1, table: at + u32(0x54) };
    for (let r = 0; r < u32(0x30); r++) {
      const o = at + u32(0x34) + 16 * r;
      block.ranges.push({ start: data.readInt32LE(o), end: data.readInt32LE(o + 4), first: data.readInt32LE(o + 8), add: data.readInt32LE(o + 12) });
    }
    font.blocks.push(block);
  }
  return font;
}

/** scePFontGetGlyph: the first block that has the code. Null when none has. */
export function glyphOf(font, data, code) {
  for (const block of font.blocks) {
    const ranges = block.ranges;
    if (code < ranges[0].start || ranges[ranges.length - 1].end < code) continue;
    let low = -1, high = ranges.length, found = null;
    while (low + 1 !== high) {
      const middle = (low + high) >> 1;
      if (code < ranges[middle].start) high = middle;
      else if (ranges[middle].end < code) low = middle;
      else { found = ranges[middle]; break; }
    }
    if (!found) continue;
    const entry = data.readUInt16LE(block.index + 2 * (found.first + code - found.start));
    if (entry === 0xffff) continue;
    const glyph = found.add + entry;
    const m = block.metrics + (block.perGlyph ? 16 * glyph : 0);
    return { block, glyph, picture: block.pictures + block.pictureSize * glyph,
      metrics: [0, 2, 4, 6, 8, 10, 12].map((o) => data.readInt16LE(m + o)) };
  }
  return null;
}

/** One pixel of a glyph picture: the pictures are one stream of pixels, low bits first, rows not padded. */
export function pixel(data, glyph, x, y) {
  const { block } = glyph;
  const n = y * block.width + x;
  if (block.depth === 4) return (data[glyph.picture + (n >> 1)] >> ((n & 1) * 4)) & 0xf;
  if (block.depth === 8) return data[glyph.picture + n];
  throw new Error(`pixel format of ${block.depth} bits is not read here`);
}

function png(width, height, rgba) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buffer) => { let c = 0xffffffff; for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, body) => { const head = Buffer.alloc(8); head.writeUInt32BE(body.length, 0); head.write(type, 4, 'latin1'); const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), body])), 0); return Buffer.concat([head, body, tail]); };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

/** A ROM directory: 16-byte entries (name, extra-info size, size) from RESET on, the files in order, each padded to 16. */
export function romDirectory(image) {
  let at = image.indexOf('RESET');
  const files = new Map();
  let offset = 0;
  for (; image[at]; at += 16) {
    const name = image.toString('latin1', at, at + 10).replace(/[ \0].*$/, '');
    const size = image.readUInt32LE(at + 12);
    files.set(name, image.subarray(offset, offset + size));
    offset += (size + 15) & ~15;
  }
  return files;
}

/** ROM 2.30's pages: the file, the cells across, where the GS holds it, and the table of the glyphs' left edge and width. */
export const ROM_PAGES = [
  { file: 'FNTASCII', width: 256, height: 480, across: 8, base: 0x2f05, bufferWidth: 4, table: 'pointer at 0x002800CC', glyphs: 97, use: 'the characters from 0x20' },
  { file: 'FNTEX000', width: 512, height: 760, across: 16, base: 0x3005, bufferWidth: 8, table: 0x0027ecb0, glyphs: 304, use: 'extended characters 0 to 303' },
  { file: 'FNTEX001', width: 512, height: 760, across: 16, base: 0x3405, bufferWidth: 8, table: 0x0027f630, glyphs: 304, use: 'extended characters from 304' },
  { file: 'FNTEXOSD', width: 512, height: 80, across: 16, base: 0x3805, bufferWidth: 8, table: 0x0027ffb0, glyphs: 32, use: 'marks reached by escapes' },
];
/** The four pages of ROM 2.30, expanded: 4 bits a pixel, rows of `width`, low bits first. */
export function romPages(bios) {
  const files = romDirectory(romDirectory(bios).get('FNTIMAGE'));
  return ROM_PAGES.map((page) => ({ ...page, pixels: expand(files.get(page.file)) }));
}

if (process.argv[1] && process.argv[1].endsWith('extract_font.mjs') && process.argv[2] === '--rom') {
  const [biosFile, memoryFile, modelDirectory, textureDirectory] = process.argv.slice(3);
  const memory = fs.readFileSync(memoryFile), base = 0x00100000;
  const pages = romPages(fs.readFileSync(biosFile));
  // The colour table is not in FNTIMAGE; HDD OSD's file has the same sixteen colours in each block.
  const TABLE = [0, 0x19000000, 0x32000000, 0x4b000000, 0x64000000, 0x32333333, 0x4b333333, 0x64333333, 0x7d333333, 0x4b666666, 0x64666666, 0x7d666666, 0x64999999, 0x7d999999, 0x7dcccccc, 0x7dffffff];
  const model = { source: 'FNTIMAGE of ROM 2.30 (BIOS 0230AC20080220), expanded; tables from EE memory', cell: [32, 40], pages: [] };
  for (const page of pages) {
    const at = (typeof page.table === 'number' ? page.table : memory.readUInt32LE(0x002800cc - base)) - base;
    const glyphs = Array.from({ length: page.glyphs }, (_, i) => [memory.readInt32LE(at + 8 * i), memory.readInt32LE(at + 8 * i + 4)]);
    console.log(`${page.file}: ${page.pixels.length} bytes expanded, ${page.width} x ${page.height}, ${page.across} cells across, ${page.glyphs} glyphs in the table at 0x${(at + base).toString(16)}`);
    model.pages.push({ file: page.file, width: page.width, height: page.height, across: page.across, base: page.base, use: page.use, table: at + base, leftAndWidth: glyphs });
    if (textureDirectory) {
      const rgba = Buffer.alloc(page.width * page.height * 4);
      for (let n = 0; n < page.width * page.height; n++) {
        const c = TABLE[(page.pixels[n >> 1] >> ((n & 1) * 4)) & 0xf];
        rgba[4 * n] = c & 0xff; rgba[4 * n + 1] = (c >> 8) & 0xff; rgba[4 * n + 2] = (c >> 16) & 0xff; rgba[4 * n + 3] = Math.min(255, (c >>> 24) * 2);
      }
      fs.mkdirSync(textureDirectory, { recursive: true });
      fs.writeFileSync(`${textureDirectory}/font-rom-${page.file}.png`, png(page.width, page.height, rgba));
    }
  }
  if (modelDirectory) {
    fs.mkdirSync(modelDirectory, { recursive: true });
    fs.writeFileSync(`${modelDirectory}/font-rom.json`, `${JSON.stringify(model)}\n`);
    console.log(`wrote ${modelDirectory}/font-rom.json`);
  }
  console.log('verdict: FOUND the four pages and their tables');
} else if (process.argv[1] && process.argv[1].endsWith('extract_font.mjs')) {
  const [file, modelDirectory, textureDirectory] = process.argv.slice(2);
  const data = expand(fs.readFileSync(file));
  const font = readFont(data);
  const label = data.subarray(0x10, 0x30).toString('latin1').replace(/\0.*$/, '');
  console.log(`${file}: ${data.length} bytes expanded, "${label}", ascent ${font.ascent}, descent ${font.descent}, blank ${font.blank}, ${font.blocks.length} blocks`);

  const model = { source: 'FNTOSD of HDD OSD 1.10U, expanded', label, ascent: font.ascent, descent: font.descent, blank: font.blank, blocks: [] };
  font.blocks.forEach((block, n) => {
    const table = Array.from({ length: 16 }, (_, i) => data.readUInt32LE(block.table + 4 * i));
    const codes = block.ranges.reduce((sum, r) => sum + r.end - r.start + 1, 0);
    console.log(`  block ${n}: ${block.glyphs} glyphs of ${block.width} x ${block.height}, ${block.depth} bits, ascent ${block.ascent}, descent ${block.descent}, ${block.ranges.length} ranges over ${codes} codes (${block.ranges.map((r) => `${r.start.toString(16)}..${r.end.toString(16)}`).join(' ')}), metrics ${block.perGlyph ? 'per glyph' : 'one for all'}`);
    const entry = { flags: block.flags, depth: block.depth, scale: [block.scaleX, block.scaleY], width: block.width, height: block.height, ascent: block.ascent, descent: block.descent,
      glyphs: block.glyphs, perGlyph: block.perGlyph === 1, ranges: block.ranges.map((r) => [r.start, r.end]),
      table: table.map((c) => [c & 0xff, (c >> 8) & 0xff, (c >> 16) & 0xff, c >>> 24]) };
    // The codes and metrics of every glyph: origin x, baseline y (both inside the picture), left, right, top, bottom, advance.
    const glyphs = {};
    for (const r of block.ranges) for (let code = r.start; code <= r.end; code++) {
      const glyph = glyphOf(font, data, code);
      if (glyph && glyph.block === block) glyphs[code.toString(16)] = glyph.metrics;
    }
    if (block.perGlyph) entry.metrics = glyphs;
    else { entry.metrics = { all: Object.values(glyphs)[0] }; entry.codes = Object.keys(glyphs).length; }
    model.blocks.push(entry);

    if (textureDirectory) {
      const columns = 32, rowsOf = Math.ceil(block.glyphs / columns);
      const rgba = Buffer.alloc(columns * block.width * rowsOf * block.height * 4);
      for (let g = 0; g < block.glyphs; g++) {
        const glyph = { block, picture: block.pictures + block.pictureSize * g };
        for (let y = 0; y < block.height; y++) for (let x = 0; x < block.width; x++) {
          const c = table[pixel(data, glyph, x, y)];
          const o = (((Math.floor(g / columns) * block.height + y) * columns * block.width) + (g % columns) * block.width + x) * 4;
          rgba[o] = c & 0xff; rgba[o + 1] = (c >> 8) & 0xff; rgba[o + 2] = (c >> 16) & 0xff; rgba[o + 3] = Math.min(255, (c >>> 24) * 2);
        }
      }
      fs.mkdirSync(textureDirectory, { recursive: true });
      fs.writeFileSync(`${textureDirectory}/font-osd-block${n}.png`, png(columns * block.width, rowsOf * block.height, rgba));
    }
  });
  if (modelDirectory) {
    fs.mkdirSync(modelDirectory, { recursive: true });
    fs.writeFileSync(`${modelDirectory}/font-osd.json`, `${JSON.stringify(model)}\n`);
    console.log(`wrote ${modelDirectory}/font-osd.json`);
  }
  console.log('verdict: FOUND the font: every block walked, every code of every range resolved');
}
