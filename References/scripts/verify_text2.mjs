// Text: every packet the font code sends, recomputed and compared byte for byte with what was
// sent. The two builds have different font code. HDD OSD 1.10U (Sony's pfont library, the file
// FNTOSD, a cache of glyphs in GS memory, a fan of twelve vertices per glyph) is checked at two
// levels; ROM 2.30 (its own code, whole pages of glyphs loaded once, a sprite per glyph) is the
// second half of this file.
//
//   glyph   from the font library's context as it stood when a character was asked for
//           (_scePFont_Putc, 0x00291858) and the font file: the cache entry the character gets,
//           the picture uploaded when it is not in the cache, the texture set-up, and the
//           twelve-vertex fan.
//   string  from the string and the program's font state at Font_PutsPackets (0x00213BA8) or at
//           calcDrawArea (0x00213D38, which runs a string through the library without drawing,
//           to learn its width): the characters asked for, in order, and for each the pen
//           position, the colour and the font matrix the library is then found to hold.
//   place   for the callers read so far (date and time, the main menu's items, the button
//           hints, the title and the selected entry of System Configuration): where the string
//           is put, its colour and its size, from the screen size, the measured width and the
//           program's tables.
//
//   alpha   the alpha of every string, from the ramps its caller reads (verify_text2 only)
//
// verify_text2.mjs is verify_text.mjs with the alpha of every string, the places of the
// remaining callers (the list's entries, values and arrow, the clock's value, the version page)
// and PAL. CLOCK_BUILD=hdd [CLOCK_VIDEO=pal] node verify_text2.mjs <trace.jsonl> [FNTOSD]
import { dataPath } from '../lib/data.mjs';
import fs from 'node:fs';
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { GifPath } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/gif.js';
import { word as elfWord } from './elf_words.mjs';
import { pick, range, pc, BUILD, BUILD_NAME, PAL, FPS } from './builds.mjs';
import { sinf } from '../model/opening-libm.mjs';
import { quotient } from '../model/opening-lib.mjs';
import { expand, readFont, glyphOf, pixel, romPages } from './extract_font.mjs';

const A = { putsPackets: 0x00213ba8, measure: 0x00213d38, putc: 0x00291858, state: 0x003969b0, screen: 0x001f0cb4,
  items: 0x00409130, tables: 0x002b2460, ratios: 0x0036fb94, language: 0x00371818, icon: 0x00226508, iconPlaces: 0x002b22a0 };
// The library's context is 0x1000 bytes at `state`; the program's own font state follows it.
const OWN = A.state + 0x1000;
// ROM 2.30: the two string functions, the character function, and what it reads.
const R = { strings: [0x0020c6f8, 0x0020c938], character: 0x0020aca8, settings: 0x002800b0, pen: 0x002803a0, colour: 0x00300ea0, screen: 0x001f0c50,
  tables: 0x0027e6b0, tags: 0x002c3c20 };
// Where the alpha of a string comes from (HDD OSD): the functions whose state is probed.
const T = { setColor: 0x00212870, dateAlpha: 0x00230008, menu: 0x00232170, panels: 0x002269e0, panel: 0x00226770, list: 0x00231388,
  entry: 0x002311e8, clockValue: 0x002270a8, version: 0x0022a410 };
const RAMPS = range(0x002b2e00, 0x90), ADJUST = range(0x002b2fe8, 0x28), CLOSING = range(0x002b46b8, 0x30), CLOCK = range(0x002b5780, 0x10),
  GP = range(0x00370130, 0x1c0), WEIGHT = range(0x00370ab8, 4), DIALOG = '*0x003701c0:0x30', ROWS = '*0x002b2fec:0x100', LIST = range(0x002b2de8, 0xa0);
// ==== ROM 2.30 beyond the glyph: strings, widths, places, alpha ========================================

/**
 * ROM 2.30's text functions: Font_SetColor 0x0020A710 (four ints at 0x00300EA0), Font_SetLocate
 * 0x0020A418 (x and y in sixteenths at 0x002803A8), Font_SetRatio 0x0020A4E8 (the float at
 * 0x00300EC4 and 0x00300EC8), the string functions, the measure 0x0020CBA0 (its result at its
 * jr 0x0020CF30), and the callers whose arguments the place rules need.
 */
const RT = { setColor: 0x0020a710, setLocate: 0x0020a418, setRatio: 0x0020a4e8, measure: 0x0020cba0, measured: 0x0020cf30,
  date: 0x0022c028, menu: 0x0022e3e0, panels: 0x00222160, panel: 0x00221e48, list: 0x0022d728, clockValue: 0x00222830 };
const ROM_GP = 0x002cfef0;
const ROM_RAMPS = range(0x0028aff0, 0x130), ROM_GPWORDS = range(0x002c8730, 0x1e0), ROM_WEIGHT = range(0x002c8f70, 4), ROM_CLOSING = range(0x00293ba8, 0x10),
  ROM_CLOSING2 = range(0x002953f0, 0x10), ROM_CLOCK = range(0x00296740, 0x10), ROM_DIALOG = '*0x002c87c8:0x30', ROM_ENTRIES = range(0x00296b90, 0x120);
export const ROM_PROBES = [
  ...R.strings.map((address) => ({ pc: pc(address), ranges: ['a0:0x80', range(R.pen, 0x28), range(R.colour, 0x40), range(R.settings, 0x80), range(R.screen, 8), range(0x00375100, 0x40), range(0x0028a650, 0x160)] })),
  { pc: pc(R.character), ranges: ['a1:0x4', range(R.settings, 0x80), range(R.pen, 0x28), range(R.colour, 0x40), range(R.screen, 8), range(R.tables, 0x1a00), range(R.tags, 0x50)] },
  { pc: pc(RT.measure), ranges: ['a0:0x80', range(R.settings, 0x80), range(R.pen, 0x28), range(R.colour, 0x40), range(R.tables, 0x1a00), range(0x0027b388, 0x10)] },
  { pc: pc(RT.measured), ranges: [] },
  { pc: pc(RT.setColor), ranges: [] }, { pc: pc(RT.setLocate), ranges: [] }, { pc: pc(RT.setRatio), ranges: [] },
  { pc: pc(RT.date), ranges: [ROM_RAMPS, ROM_GPWORDS, ROM_WEIGHT, ROM_CLOSING, ROM_CLOSING2] },
  { pc: pc(RT.menu), ranges: [ROM_RAMPS, ROM_GPWORDS, ROM_WEIGHT, ROM_CLOSING, ROM_CLOSING2, range(R.screen, 8)] },
  { pc: pc(RT.panels), ranges: [ROM_RAMPS, ROM_GPWORDS, ROM_WEIGHT, ROM_CLOSING, ROM_CLOSING2, ROM_CLOCK, ROM_DIALOG, range(0x001f1240, 0x60)] },
  { pc: pc(RT.panel), ranges: [] },
  { pc: pc(RT.list), ranges: [ROM_RAMPS, ROM_GPWORDS, ROM_WEIGHT, ROM_CLOCK, ROM_ENTRIES, range(R.screen, 8), range(0x002c81a0, 4), range(0x0028ae30, 0x118)] },
  { pc: pc(RT.clockValue), ranges: [] },
];

export const PROBES = pick({
  hdd: [
    { pc: pc(T.setColor), ranges: [] },
    { pc: pc(T.dateAlpha), ranges: [RAMPS, CLOSING, GP, WEIGHT] },
    { pc: pc(T.menu), ranges: [RAMPS, ADJUST, CLOSING, GP, WEIGHT] },
    { pc: pc(T.panels), ranges: [RAMPS, ADJUST, CLOSING, CLOCK, GP, WEIGHT, DIALOG, ROWS] },
    { pc: pc(T.panel), ranges: [] },
    { pc: pc(T.list), ranges: [LIST, CLOSING, CLOCK, GP, WEIGHT, range(0x0036fc04, 4), range(A.screen, 8)] },
    { pc: pc(T.entry), ranges: [LIST] },
    { pc: pc(T.clockValue), ranges: [range(0x002b2580, 0x48), GP, range(A.items, 0x40)] },
    { pc: pc(T.version), ranges: [ADJUST, ROWS, DIALOG, range(A.screen, 8), GP] },
    { pc: pc(A.putsPackets), ranges: ['a0:0x100', range(OWN, 0x160), range(A.state, 0x3a0), range(A.screen, 8), range(A.items, 0x40), range(A.tables, 0x120), range(A.ratios, 8), range(A.language, 4)] },
    { pc: pc(A.measure), ranges: ['a0:0x100', range(OWN, 0x160), range(A.state, 0x3a0)] },
    { pc: pc(A.putc), ranges: ['a0:0x1000', range(OWN, 0x160)] },
    { pc: pc(A.icon), ranges: [range(A.iconPlaces, 0x80), range(A.screen, 8)] },
  ],
  rom: ROM_PROBES,
});

const bits = new DataView(new ArrayBuffer(4));
/** A single-precision result cut toward zero, as the EE's FPU and VU0 give it. */
export const f = (x) => {
  const near = Math.fround(x);
  if (Math.abs(near) <= Math.abs(x) || !Number.isFinite(near)) return near;
  bits.setFloat32(0, near);
  bits.setUint32(0, bits.getUint32(0) - 1);
  return bits.getFloat32(0);
};
const toInt = (x) => (x >= 2147483647 ? 2147483647 : x <= -2147483648 ? -2147483648 : Math.trunc(x));
const floatBits = (x) => { bits.setFloat32(0, x); return bits.getUint32(0); };

// ---- the library's context --------------------------------------------------------------------

const ENTRIES = 0x3a0;   // cache entries follow the context proper, 0x20 bytes each

/** The context as plain values; the cache list is walked through its pointers. */
export function readContext(bytes, base) {
  const u32 = (o) => bytes.readUInt32LE(o), u16 = (o) => bytes.readUInt16LE(o), fl = (o) => bytes.readFloatLE(o);
  const rows = (o) => [0, 16, 32, 48].map((r) => [0, 4, 8, 12].map((c) => fl(o + r + c)));
  const entry = (address) => {
    const o = address - base;
    return { address, code: bytes.readInt32LE(o), loaded: u32(o + 4), cell: bytes.readInt32LE(o + 8), next: u32(o + 12),
      block: u32(o + 0x10), picture: u32(o + 0x14), metrics: u32(o + 0x18) };
  };
  const list = [];
  for (let address = u32(0x37c); address !== 0; address = list[list.length - 1].next) list.push(entry(address));
  return { base, screen: rows(0), matrix: rows(0x2d0), colour: [0x310, 0x314, 0x318, 0x31c].map(fl), locate: [0x320, 0x324, 0x328, 0x32c].map(fl),
    fresh: u32(0x2c0), measuring: u32(0x2c4), drawing: u32(0x2c8),
    memory: u32(0x350), texture: u32(0x354), table: u32(0x358), format: u16(0x35c), cellW: u16(0x35e), cellH: u16(0x360), cells: u16(0x362),
    width: u16(0x364), height: u16(0x366), logW: u16(0x368), logH: u16(0x36a), setUp: u32(0x36c), block: u32(0x370), data: u32(0x380), room: bytes.readInt32LE(0x384), list };
}

// ---- GIF bytes --------------------------------------------------------------------------------

const qword = (low, high) => { const b = Buffer.alloc(16); b.writeBigUInt64LE(BigInt.asUintN(64, low), 0); b.writeBigUInt64LE(BigInt.asUintN(64, high), 8); return b; };
const AD = 0xen;
const tagAD = (count, eop) => qword(BigInt(count) | (eop ? 0x8000n : 0n) | (1n << 60n), AD);
const write = (reg, value) => qword(BigInt(value), BigInt(reg));

/** What Font_PutsPackets opens every string with: depth test always, blend (Cs - Cd) x As + Cd. */
export const openString = () => Buffer.concat([tagAD(2, true), write(0x47, 0x30000n), write(0x42, 0x44n)]);

/** _scePFontSetupTexEnv (0x002915C0): bilinear, the cache as a texture with its colour table. */
function textureSetUp(ctx) {
  const tex0 = BigInt(ctx.texture >>> 6) | (BigInt(ctx.width >>> 6) << 14n) | (BigInt(ctx.format) << 20n) | (BigInt(ctx.logW) << 26n) | (BigInt(ctx.logH) << 30n)
    | (1n << 34n) | (BigInt(ctx.table >>> 6) << 37n) | (1n << 61n);
  return Buffer.concat([tagAD(2, true), write(0x14, 0x60n), write(0x06, tex0)]);
}

/** Where a cell of the cache is: the cells fill the texture row by row. */
const cellOrigin = (ctx, cell) => { const columns = Math.trunc(ctx.width / ctx.cellW); return [(cell % columns) * ctx.cellW, Math.trunc(cell / columns) * ctx.cellH]; };

/**
 * _scePFontUpdateTex (0x00290EE8): the picture goes into its cell one pixel in from the left
 * and the top, the rest of the row and the row under the picture cleared. The rows of the cell
 * below that are not written by the code: they leave as whatever the packet buffer held.
 * Returns the bytes and how many of the picture's bytes the code wrote.
 */
function upload(ctx, font, data, glyph, cell) {
  const { block } = glyph;
  const [x, y] = cellOrigin(ctx, cell);
  const bitblt = (BigInt(ctx.texture >>> 6) << 32n) | (BigInt(ctx.width >> 6) << 48n) | (BigInt(ctx.format) << 56n);
  const head = Buffer.concat([tagAD(4, false), write(0x50, bitblt), write(0x51, (BigInt(x) << 32n) | (BigInt(y) << 48n)),
    write(0x52, BigInt(ctx.cellW) | (BigInt(ctx.cellH) << 32n)), write(0x53, 0n)]);
  const rowBits = ctx.cellW * block.depth, total = rowBits * ctx.cellH;
  const quads = (total + 127) >> 7;
  const picture = Buffer.alloc(quads * 16);
  const rowBytes = ((rowBits + 31) >> 5) * 4;
  for (let row = 0; row < block.height; row++) for (let column = 0; column < block.width; column++) {
    const n = (row + 1) * ctx.cellW + column + 1;
    picture[n >> 1] |= pixel(data, glyph, column, row) << ((n & 1) * 4);
  }
  if (block.depth !== 4) throw new Error('uploading a picture that is not 4 bits a pixel is not modelled');
  const written = rowBytes * (block.height + 2);
  return { bytes: Buffer.concat([head, qword(BigInt(quads) | (2n << 58n), 0n), picture, tagAD(1, true), write(0x3f, 0n)]),
    pictureAt: head.length + 16, written: Math.min(written, picture.length), pictureBytes: picture.length };
}

/**
 * _scePFontSetupTexCache (0x00290B10): the cache laid out for a block's pictures, and the block's
 * colour table sent. Tables at 0x0036D7E8.., indexed by the block's pixel format; 4 bits is 0.
 * A cell is the picture with a pixel of margin all round, its width rounded up to 8 and its
 * height to 4; the texture is as near a square of 128 x 128 pages as the memory given divides.
 */
function setUpCache(ctx, data, block) {
  const format = block.flags & 7;
  if (format !== 0) throw new Error('a block that is not 4 bits a pixel: its cache is not modelled');
  const cellW = (block.width + 2 + 7) & ~7, cellH = (block.height + 2 + 3) & ~3;
  if (!(ctx.format === 0x14 && ctx.cellW === cellW && ctx.cellH === cellH)) {
    const pages = (ctx.memory + 0x7ff) >>> 11;
    let across = toInt(f(Math.sqrt(pages)));
    while (pages % across !== 0) across -= 1;
    ctx.format = 0x14; ctx.cellW = cellW; ctx.cellH = cellH;
    ctx.width = across * 0x80; ctx.height = Math.trunc(pages / across) * 0x80;
    ctx.cells = Math.trunc(ctx.width / cellW) * Math.trunc(ctx.height / cellH);
    ctx.logW = 32 - Math.clz32(ctx.width - 1); ctx.logH = 32 - Math.clz32(ctx.height - 1);
    ctx.list.forEach((entry, i) => { entry.loaded = 0; entry.cell = i < ctx.cells ? i : -1; });
  }
  ctx.setUp = 1;
  ctx.block = ctx.data + block.at;
  // The colour table: 16 colours as 8 x 2 pixels of 32 bits, sent from the file itself.
  const bitblt = (BigInt(ctx.table >>> 6) << 32n) | (1n << 48n);
  const head = Buffer.concat([tagAD(4, false), write(0x50, bitblt), write(0x51, 0n), write(0x52, 8n | (2n << 32n)), write(0x53, 0n), qword(4n | 0x8000n | (2n << 58n), 0n)]);
  return [{ kind: 'table', bytes: Buffer.concat([head, data.subarray(block.table, block.table + 0x40)]) }];
}

/**
 * _scePFont_Putc (0x00291858) for one character: the cache entry, then the packets, then where
 * the pen is left. `ctx` is the context at entry; nothing of the trace's packets is read.
 */
export function putCharacter(ctx, font, data, code, room = Infinity) {
  // The cache list, most recently used first. Stop at the character, at an entry never used, or
  // at the end; `spare` is the last entry passed that holds a cell.
  const list = ctx.list;
  let at = 0, spare = null;
  if (list[0].code !== code) {
    spare = list[0].cell !== -1 ? list[0] : null;
    if (list.length > 1 && list[0].code !== 0) {
      for (at = 1; ; at++) {
        if (list[at].code === code) break;
        if (list[at].cell !== -1) spare = list[at];
        if (at === list.length - 1 || list[at].code === 0) break;
      }
    }
  }
  const entry = { ...list[at] };
  if (at !== 0 && entry.cell === -1 && spare && spare !== list[at]) { entry.cell = spare.cell; entry.loaded = 0; }
  let glyph;
  if (entry.code !== code) {
    entry.loaded = 0;
    glyph = glyphOf(font, data, code);
    if (!glyph) return { result: -2, packets: [], ctx };
  } else {
    if (entry.block === 0) return { result: -2, packets: [], ctx };
    // The entry already names its block, picture and metrics by address.
    const block = font.blocks.find((candidate) => candidate.at === entry.block - ctx.data);
    const m = entry.metrics - ctx.data;
    glyph = { block, picture: entry.picture - ctx.data, metrics: [0, 2, 4, 6, 8, 10, 12].map((o) => data.readInt16LE(m + o)) };
    const again = glyphOf(font, data, code);
    if (!again || again.block !== block || again.picture !== glyph.picture) throw new Error(`cache entry of ${code.toString(16)} does not name the glyph the file gives`);
  }
  const { block, metrics } = glyph;
  const [originX, baseline, left, right, top, bottom, advance] = metrics;
  const packets = [];

  if (ctx.drawing) {
    // Each part asks for its room in the packet buffer, in quadwords; without it the character
    // is given up (-1) and asked for again once the buffer has been sent.
    if (entry.loaded === 0) {
      if (ctx.block !== ctx.data + block.at) {
        // The entry is at the head of the list by now, and the cells are dealt out in list order.
        const moved = [entry, ...list.filter((_, i) => i !== at)];
        ctx = { ...ctx, list: moved };
        if (room < 8) return { result: -1, packets, ctx };
        room -= 8;
        packets.push(...setUpCache(ctx, data, block));
      }
      const picture = upload(ctx, font, data, glyph, entry.cell);
      const needs = (picture.pictureBytes >> 4) + 9;
      if (room < needs) return { result: -1, packets, ctx };
      room -= needs;
      packets.push({ kind: 'picture', ...picture });
    }
    if (ctx.setUp) {
      if (room < 4) return { result: -1, packets, ctx };
      room -= 4;
      packets.push({ kind: 'texture', bytes: textureSetUp(ctx) });
    }
    if (room < 0x28) return { result: -1, packets, ctx };
  }

  // Twelve vertices about the pen: the pen itself, then round the picture's box, with a point
  // where the pen's column and the advance's column cross its top and bottom and where the
  // baseline crosses its sides.
  const x0 = left - 1, x1 = right + 1, yTop = -(top + 1), yBottom = -(bottom - 1);
  const shape = [[0, 0], [0, yTop], [x0, yTop], [x0, 0], [x0, yBottom], [0, yBottom], [advance, yBottom], [x1, yBottom], [x1, 0], [x1, yTop], [advance, yTop]];
  // The font matrix with x and y scaled by the block's own scale, moved to the pen.
  const scale = [block.scaleX, block.scaleY, 1, 1];
  const m = ctx.matrix.map((row) => row.map((value, i) => f(value * scale[i])));
  m[3] = m[3].map((value, i) => f(value + ctx.locate[i]));
  const through = (rows, v) => [0, 1, 2, 3].map((i) => f(f(f(f(rows[0][i] * v[0]) + f(rows[1][i] * v[1])) + f(rows[2][i] * v[2])) + f(rows[3][i] * v[3])));
  const placed = shape.map(([x, y]) => through(m, [x, y, 0, 1]));
  // The first character after the pen was set starts at the pen: the column through the pen
  // (vertices 1 and 5) is brought back to it.
  if (ctx.fresh) {
    const rise = f(placed[5][1] - placed[1][1]);
    const shift = rise === 0 ? f(placed[1][0] - ctx.locate[0])
      : f(f(f(f(f(ctx.locate[1] - placed[1][1]) * f(placed[5][0] - placed[1][0])) / rise) + placed[1][0]) - ctx.locate[0]);
    for (const vertex of placed) vertex[0] = f(vertex[0] - shift);
  }
  // The pen moves to where the advance's column (vertices 6 and 10) crosses the pen's height.
  const rise = f(placed[10][1] - placed[6][1]);
  const penX = rise === 0 ? placed[6][0] : f(f(f(f(ctx.locate[1] - placed[6][1]) * f(placed[10][0] - placed[6][0])) / rise) + placed[6][0]);

  if (ctx.drawing) {
    const [cellX, cellY] = cellOrigin(ctx, entry.cell);
    const s0 = cellX + 1, t0 = cellY + 1;
    const clamp = 0xan | (BigInt(s0 - 1) << 4n) | (BigInt(s0 + block.width) << 14n) | (BigInt(t0 - 1) << 24n) | (BigInt(t0 + block.height) << 34n);
    const sPen = originX + s0, tBase = baseline + t0;
    const sLeft = left - 1 + sPen, sRight = right + 1 + sPen, sAdvance = advance + sPen, tTop = -(top + 1) + tBase, tBottom = -(bottom - 1) + tBase;
    const texel = [[sPen, tBase], [sPen, tTop], [sLeft, tTop], [sLeft, tBase], [sLeft, tBottom], [sPen, tBottom], [sAdvance, tBottom], [sRight, tBottom], [sRight, tBase], [sRight, tTop], [sAdvance, tTop]];
    const perS = f(1 / (1 << ctx.logW)), perT = f(1 / (1 << ctx.logH));
    const colour = ctx.colour.map((c) => toInt(f(c * 128)));
    const vertices = placed.map((position, k) => {
      const on = through(ctx.screen, position);
      const q = f(1 / on[3]);
      const out = Buffer.alloc(0x30);
      out.writeFloatLE(f(f(texel[k][0] * perS) * q), 0);
      out.writeFloatLE(f(f(texel[k][1] * perT) * q), 4);
      out.writeFloatLE(f(f(1 * 1) * q), 8);
      colour.forEach((c, i) => out.writeInt32LE(c, 0x10 + 4 * i));
      out.writeInt32LE(toInt(f(f(on[0] * q) * 16)), 0x20);
      out.writeInt32LE(toInt(f(f(on[1] * q) * 16)), 0x24);
      out.writeInt32LE(toInt(f(on[2] * q)), 0x28);
      return out;
    });
    vertices.push(vertices[1]);
    // PRIM 0x5D: triangle fan, Gouraud, textured, blended; ST, RGBAQ, XYZ2 per vertex.
    const fan = qword(12n | 0x8000n | (1n << 46n) | (0x5dn << 47n) | (3n << 60n), 0x512n);
    packets.push({ kind: 'glyph', bytes: Buffer.concat([tagAD(1, false), write(0x08, clamp), fan, ...vertices]) });
  }
  return { result: 0, packets, penX, glyph, cell: entry.cell, ctx };
}

// ---- the program's filter: from a string to characters ------------------------------------------

/** The eight colours of the escape `c`, and 9 and 10 beyond them (D_00348B20). */
const COLOURS = [[96, 96, 96], [110, 110, 0], [47, 87, 127], [190, 128, 150], [44, 44, 44], [80, 140, 140], [98, 56, 56], [60, 60, 60], [90, 90, 90], [20, 90, 60]];

/** UTF-8 as _scePFont_Getc (0x002928F8) reads it: 0 at the end, -1 on a broken sequence. */
function* characters(bytes) {
  let i = 0;
  for (;;) {
    let c = bytes[i++];
    if (c === 0 || c === undefined) return;
    if (c >= 0x80) {
      let more;
      if (c < 0xc0) { yield -1; continue; }
      else if (c < 0xe0) { c &= 0x1f; more = 1; } else if (c < 0xf0) { c &= 0x0f; more = 2; } else if (c < 0xf8) { c &= 7; more = 3; } else { yield -1; continue; }
      for (; more > 0; more--) { const next = bytes[i++]; if ((next & 0xc0) !== 0x80) { c = -1; break; } c = (c << 6) | (next & 0x3f); }
    }
    yield c;
  }
}

/**
 * Font_PutsPackets (0x00213BA8), updateTransMatrix (0x00213380) and fontFilter (0x00212D78):
 * what the library is asked for, character by character. `own` is the program's font state at
 * entry (0x160 bytes at state + 0x1000). Yields { code, locate, colour, matrix, fresh } as the
 * library's context must read when the character arrives; `advance(penX)` is given back by the
 * caller, since the pen is moved by the library.
 */
export function* stringOf(text, own, font, data, measuring = null) {
  const s = { lineHeight: own.readInt32LE(0), fixed: own.readInt32LE(4), percent: own.readInt32LE(8), pitch: own.readInt32LE(0xc),
    decoration: own.readInt32LE(0x1c), clip: own.readInt32LE(0x20), tv: own.readFloatLE(0x24), ratio: own.readFloatLE(0x28),
    locate: [0x30, 0x34, 0x38, 0x3c].map((o) => own.readFloatLE(o)), colour: [0x40, 0x44, 0x48, 0x4c].map((o) => own.readFloatLE(o)),
    blank: own.readInt32LE(0xa8), ascent: own.readInt32LE(0xb0), dirty: own.readInt32LE(0xb4),
    matrix: [0, 16, 32, 48].map((r) => [0, 4, 8, 12].map((c) => own.readFloatLE(0x110 + r + c))) };
  // Measuring starts from (0, 0) with the colour the library already holds, and draws no decoration.
  if (measuring) { s.locate = [0, 0, 0, 0]; s.colour = measuring.colour; s.decoration = 0; }
  const update = () => {
    if (!s.dirty) return;
    s.dirty = 0;
    const x = s.percent ? f(f(s.ratio * s.percent) / 100) : s.ratio;
    s.matrix = [[x, 0, 0, 0], [0, f(x * s.tv), 0, 0], [0, 0, 1, 0], [f(s.pitch * x), f(f(f(s.ascent * f(0.7)) * s.tv) * s.ratio), 0, 1]];
  };
  update();
  const startX = s.locate[0], startY = s.locate[1];
  const pen = [...s.locate];
  let fresh = 1;
  // The farthest the pen went: what a measurement returns.
  const reach = [startX, startY];
  const widest = () => { if (reach[0] < pen[0]) reach[0] = pen[0]; if (reach[1] < pen[1]) reach[1] = pen[1]; };
  const next = characters(text);
  const take = () => { const { value, done } = next.next(); return done ? 0 : value; };
  for (let c = take(); c > 0; c = take()) {
    if (c >= 0x20) {
      if (c === 0xfeff || c === 0xfffe || c === 0xffff) continue;
      yield* character(c);
    } else if (c === 9) {
      const along = f(f(pen[0] + 63) - 1);
      pen[0] = f(along - f(along % 63));
    } else if (c === 10) {
      fresh = 1;
      pen[0] = startX;
      pen[1] = f(pen[1] + s.lineHeight);
    } else if (c === 7) {
      const letter = String.fromCharCode(take());
      const digit = () => take() - 0x30;
      if (letter === 'c') { const n = digit(); s.colour = [f(COLOURS[n][0] * 0.0078125), f(COLOURS[n][1] * 0.0078125), f(COLOURS[n][2] * 0.0078125), s.colour[3]]; }
      else if (letter === 'a') { const n = digit() * 100 + digit() * 10 + digit(); s.colour = [s.colour[0], s.colour[1], s.colour[2], f(n / 255)]; }
      else if (letter === 'p') {
        const first = take();
        if (first === 0x40) { const glyph = glyphOf(font, data, take()); if (glyph) s.fixed = glyph.metrics[6]; }
        else s.fixed = (first - 0x30) * 10 + digit();
      } else if (letter === 'r') {
        // Written as a decimal, `r0.90`: the character after the first digit is read and dropped.
        let n = digit() * 100; take(); n += digit() * 10; n += digit();
        s.percent = n; s.dirty = 1; update();
      }
      else if (letter === 's') pen[0] = f(pen[0] + s.blank);
      else if (letter === 'y') {
        const sign = take();
        const hex = (v) => (v >= 0x30 && v <= 0x39 ? v - 0x30 : (v | 0x20) >= 0x61 && (v | 0x20) <= 0x66 ? (v | 0x20) - 0x57 : 0);
        let n = hex(take()) * 16; n += hex(take());
        if (n !== 0 && sign === 0x2d) n = -n;
        pen[1] = f(startY + f(n * 0.0625));
      } else if (letter === 'o') yield* character(0xd800 + digit() * 100 + digit() * 10 + digit());
    }
    widest();
  }
  return { reach, pen, x: s.matrix[0][0], pitch: s.pitch };

  // fontFilterPutc (0x00212A20).
  function* character(code) {
    if (s.decoration) throw new Error('a string with a background or an underline: not modelled');
    let after = null;
    if (s.fixed !== 0 || s.clip !== 0) {
      const glyph = glyphOf(font, data, code) ?? glyphOf(font, data, 0xd818);
      if (!glyph) return;
      const before = pen[0], x = s.matrix[0][0], pitch = s.matrix[3][0];
      if (s.fixed !== 0) {
        // A fixed width: the character is centred in it and the pen moves by the width.
        pen[0] = f(before + f(Math.trunc((s.fixed - glyph.metrics[6]) / 2) * x));
        after = f(f(before + pitch) + f(s.fixed * x));
      } else after = f(f(before + pitch) + f(glyph.metrics[6] * x));
      if (s.clip && (640 < before || after < 0)) { pen[0] = after; widest(); return; }
    }
    const penX = yield { code, locate: [...pen], colour: [...s.colour], matrix: s.matrix, fresh, fixed: s.fixed };
    pen[0] = s.fixed !== 0 ? after : penX;
    fresh = 0;
  }
}

// ---- the alpha of a string ----------------------------------------------------------------------

/**
 * Where the ramps and words the alpha rules read are, per build. A ramp is four ints: length,
 * value, changed, state (func_00234A68 gives the value, func_00234A98 tests the state,
 * func_00234A70 scales: value x n / length, truncated). ROM 2.30's gp is 0x002CFEF0.
 */
const MAP = pick({
  hdd: { E04: 0x002b2e04, E78: 0x002b2e78, R3000: 0x002b3000, R46B8: 0x002b46b8, R46D0: 0x002b46d0, R5780: 0x002b5780,
    tail: 0x003702d0, offset: 0x003702cc, lead: 0x003702e0, weight: 0x00370ab8, first: 0x0037029c, second: 0x003702a0, secondIndex: 0x003702a4,
    selected: 0x002b2df8, panel7: 0x002b2e00, panel8On: 0x00370140, panel8: 0x0037013c, dialog: 0x003701c0, adjustIndex: 0x002b2ff8,
    panel8Only: false, adjustRows: (word, index) => word(word(0x002b2fec) + index * 16 + 8), panelCap: (a) => (a > 0x80 ? 0x80 : a), counter: 0x002b2e1c, divisor: 0x0036fc04 },
  rom: { E04: 0x0028b00c, E78: 0x0028b070, R3000: 0x0028b110, R46B8: 0x00293ba8, R46D0: 0x002953f0, R5780: 0x00296740,
    tail: 0x002c88f4, offset: 0x002c88f0, lead: 0x002c8904, weight: 0x002c8f70, first: 0x002c88b4, second: 0x002c88b8, secondIndex: 0x002c88bc,
    selected: 0x0028b000, panel7: 0x0028b008, panel8On: 0x002c8740, panel8: 0x002c873c, dialog: 0x002c87c8, adjustIndex: 0x0028b108,
    // ROM 2.30 keeps the adjustment rows in a table of 12-byte rows, and drops a panel whose alpha is under 128.
    panel8Only: true, panel8First: true, adjustRows: (word, index) => word(0x001f1240 + index * 12), panelCap: (a) => (a < 0x80 ? 0 : a), counter: 0x0028b024, divisor: 0x002c81a0 },
});
/** Every word a probe's ranges hold, by address; a pointer's target is a range of its own. */
function stateOf(probe) {
  const word = (address) => {
    for (const m of probe.mem) if (m.bytes && address >= m.address && address + 4 <= m.address + m.bytes.length) return m.bytes.readInt32LE(address - m.address);
    throw new Error(`0x${(address >>> 0).toString(16)} was not probed at 0x${probe.pc.toString(16)}`);
  };
  const ramp = (address) => ({ length: word(address), value: word(address + 4), changed: word(address + 8), state: word(address + 12) });
  return { word, ramp, dialog: () => ramp(word(MAP.dialog) + 0x1c) };
}
const div = (a, b) => Math.trunc(a / b);
const scale = (r, n) => div(Math.imul(r.value, n), r.length);
const by128 = (x) => (x < 0 ? x + 127 : x) >> 7;
const clampTo = (v, top) => (v < 0 ? 0 : v > top ? top : v);

/** func_00230008 (ROM 0x0022C028): date and time. */
function dateAlpha(S) {
  let a;
  if (S.ramp(MAP.R46B8).state !== 0) a = 0x80;
  else if (S.ramp(MAP.R46D0).state !== 0) a = 0;
  else {
    const tail = S.word(MAP.tail);
    a = div(clampTo(S.ramp(MAP.E04).value - (S.word(MAP.lead) + S.word(MAP.offset)), tail) << 7, tail);
  }
  return by128(Math.imul(a, S.word(MAP.weight)));
}
/** func_00231E78 (ROM 0x0022E0E8): the main menu's items and its button panel. */
function menuAlpha(S) {
  const tail = S.word(MAP.tail);
  let a = scale(S.ramp(MAP.E78), 0x80);
  a = div(Math.imul(a, clampTo(tail - S.ramp(MAP.E04).value, tail)), tail);
  a = by128(Math.imul(a, 0x80 - scale(S.ramp(MAP.R3000), 0x80)));
  a = by128(Math.imul(a, S.word(MAP.weight)));
  if (S.ramp(MAP.R46B8).state !== 0) a = 0;
  if (S.ramp(MAP.R46D0).state !== 0) a = 0;
  return a;
}
/** func_00230E10 (ROM 0x0022CF90): System Configuration's list. */
function configAlpha(S) {
  const tail = S.word(MAP.tail);
  const a = div(clampTo(S.ramp(MAP.E04).value - (S.word(MAP.offset) + S.word(MAP.lead)), tail) << 7, tail);
  return div(Math.imul(a, clampTo(tail - S.ramp(MAP.R5780).value, tail)), tail);
}
/** func_00230C28 (ROM 0x0022CDA8): the clock alone. */
const clockAlpha = (S) => { const tail = S.word(MAP.tail); return div(clampTo(S.ramp(MAP.R5780).value - S.word(MAP.offset), tail) << 7, tail); };
/** func_0022A1D8 (ROM 0x00226048): Clock Adjustment's and the version page's text. */
const adjustAlpha = (S) => by128(Math.imul(scale(S.ramp(MAP.R3000), 0x80), 0x80 - scale(S.dialog(), 0x80)));
/** func_0022A238 (ROM 0x002260A8): the adjustment panel whose side matches the row's flag. */
function adjustPanel(S, side) {
  const a = adjustAlpha(S);
  if (a <= 0) return 0;
  const flag = MAP.adjustRows(S.word, S.word(MAP.adjustIndex)) !== 0 ? 1 : 0;
  return (flag ^ side) === 0 ? a : 0;
}
/**
 * func_002269E0 (ROM 0x00222160): which button panels are drawn, with what alpha. Panel 7 alone
 * while its flag is 1; otherwise panel 8 when its own flag is set, then panels 1 to 6 by
 * func_002326F0: HDD OSD caps the alpha at 128, ROM 2.30 draws a panel only at 128.
 */
function panelsOf(S) {
  if (MAP.panel8First && S.word(MAP.panel8On) !== 0) return [[8, S.word(MAP.panel8)]];
  if (S.word(MAP.panel7) === 1) return [[7, 0x80]];
  const out = [];
  if (S.word(MAP.panel8On) !== 0) { out.push([8, S.word(MAP.panel8)]); if (MAP.panel8Only) return out; }
  const alphas = [null, menuAlpha, configAlpha, (s) => adjustPanel(s, 1), (s) => adjustPanel(s, 0), (s) => scale(s.dialog(), 0x80), clockAlpha];
  for (let i = 1; i < 7; i++) {
    const a = MAP.panelCap(alphas[i](S));
    if (a > 0) out.push([i, a]);
  }
  return out;
}
/** The pulse of the arrow after the chosen entry: |(int)(sinf(counter x 0x7AA8 / (fps x 0x7AA8 / 60) / 10000) x 128)|. */
function arrowAlpha(S) {
  const period = div(Math.imul(PAL ? 50 : 60, 0x7aa8), 60);
  const angle = quotient(f(div(Math.imul(S.word(MAP.counter), 0x7aa8), period)), asFloatBits(S.word(MAP.divisor)));
  return Math.abs(toInt(f(sinf(angle) * 128)));
}
const asFloatBits = (word) => { bits.setInt32(0, word); return bits.getFloat32(0); };

// ---- where the program puts its strings ---------------------------------------------------------

const half = (n) => (n + (n >>> 31)) >> 1;
/**
 * The callers read so far, by the address the string function returns to. Each gives where the
 * string goes, its colour and its size; `null` where a part is not this caller's to decide.
 * NTSC; the PAL branches (heights scaled by 0.5405 / 0.47) are read and not exercised.
 *   width   what func_00213EE8 gave for this string: (int)((int)reach + pitch x scale)
 *   n       how many strings this caller drew before this one in the frame
 */
const PLACES = {
  // func_00226300: the date at the left, the time ending 22 from the right; lower when item 0 is 2.
  0x00226464: ({ items, ratios }) => ({ x: 22, y: dateY(items[0]), rgb: [96, 96, 96], ratio: ratios[0] }),
  0x002264e0: ({ items, ratios, width, screenW }) => ({ x: screenW - width - 22, y: dateY(items[0]), rgb: [96, 96, 96], ratio: ratios[0] }),
  // draw_clock_menu_items: centred on 430, 16 apart from 14 above the middle; the chosen one in D_002B2540.
  0x00232270: ({ tables, width, screenH, n }) => ({ x: 430 - half(width), y: half(screenH) - 14 + 16 * n, rgb: tables.chosen, ratio: 1 }),
  0x0023229c: ({ tables, width, screenH, n }) => ({ x: 430 - half(width), y: half(screenH) - 14 + 16 * n, rgb: tables.plain, ratio: 1 }),
  // draw_button_panel: 28 right of the slot's place for the language, one below the panel's line;
  // the fourth slot ends 24 from the right.
  0x00226908: ({ items, tables, ratios, locate }) => ({ x: tables.slots.slice(0, 3).map((slot) => slot + 28).includes(locate[0]) ? locate[0] : tables.slots[0] + 28,
    y: hintY(items[0]) + 1, rgb: tables.hint, ratio: ratios[1] }),
  0x002268c4: ({ items, tables, ratios, width, screenW }) => ({ x: screenW - (width + 24), y: hintY(items[0]) + 1, rgb: tables.hint, ratio: ratios[1] }),
  // The list of System Configuration (0x00231388): its title centred on 430 at 88.
  0x002314f4: ({ tables, width }) => ({ x: 430 - half(width), y: LIST_Y.title, rgb: tables.title, ratio: 1 }),
  // func_002311E8: the selected entry under the title, centred on 430 unless it and the arrows
  // (16 further right) would pass 24 from the right edge; then it moves left by the excess.
  0x00231338: ({ tables, width, widths, screenW }) => {
    const end = 430 + half(width) + widths.get('\u0007o018') + 16;
    const centre = end < screenW - 24 ? 430 : 430 - (end + 24 - screenW);
    return { x: centre - half(width), y: LIST_Y.chosen, rgb: tables.chosen, ratio: 1 };
  },
  // The same entry while it is being changed: the third colour.
  0x002312d0: ({ tables, width, widths, screenW }) => {
    const end = 430 + half(width) + widths.get('\u0007o018') + 16;
    const centre = end < screenW - 24 ? 430 : 430 - (end + 24 - screenW);
    return { x: centre - half(width), y: LIST_Y.chosen, rgb: tables.value, ratio: 1 };
  },
  // The entry's value (clock_config_get_item_str through draw_menu_item): centred on 430, under it.
  0x00231354: ({ tables, width }) => ({ x: 430 - half(width), y: LIST_Y.value, rgb: tables.value, ratio: 1 }),
  // The arrow after the chosen entry (0x00231560..0x0023161C): 16 right of the entry's half width
  // from the same centre, which moves left as the entry's does.
  0x00231624: ({ tables, widths, screenW, list }) => {
    if (!list) return undefined;
    const reach = half(list.readInt32LE(0xc)) + widths.get('\u0007o018') + 0x1be;
    const centre = reach < screenW - 24 ? 430 : 430 - (reach + 24 - screenW);
    return { x: centre + half(list.readInt32LE(0xc)) + 16, y: LIST_Y.chosen, rgb: tables.value, ratio: 1 };
  },
};
/** The y of date and time, and of the button hints: PAL scales them by 0.5405 / 0.47 in double precision. */
const PAL_RATIO = 0.5404999986290931 / 0.4699999988079071;
const dateY = (item0) => { const y = item0 === 2 ? 32 : 14; return PAL ? Math.trunc((y * 0.5404999986290931) / 0.4699999988079071) : y; };
const hintY = (item0) => { const y = item0 === 2 ? 0xb6 : 0xc8; return PAL ? Math.trunc((y * 0.5404999986290931) / 0.4699999988079071) : y; };
/** The list of System Configuration (0x00231388): title, chosen entry, its value. */
const LIST_Y = (() => { const top = PAL ? 0x65 : 0x58; return { title: top, chosen: Math.trunc(top + (PAL ? 27.599999999999998 : 24)), value: Math.trunc(top + (PAL ? 48.3 : 42)) }; })();

// ---- GS memory -----------------------------------------------------------------------------------

/**
 * The cache as GS memory holds it at the start of a dump, against the file: every cell the
 * library counts as loaded must hold its glyph's picture one pixel in, with a clear top row and
 * left column, and the colour table must be the block's. 4-bit pixels: pages of 128 x 128, blocks
 * of 32 x 16 in the order below, and within a block the GS's column order.
 */
const BLOCKS4 = [[0, 2, 8, 10], [1, 3, 9, 11], [4, 6, 12, 14], [5, 7, 13, 15], [16, 18, 24, 26], [17, 19, 25, 27], [20, 22, 28, 30], [21, 23, 29, 31]];
function nibbleAt(x, y, base, bufferWidth) {
  const page = (y >> 7) * (bufferWidth >> 1) + (x >> 7);
  const block = BLOCKS4[(y & 127) >> 4][(x & 127) >> 5];
  const column = (y >> 2) & 3, row = y & 3, quarter = (x >> 3) & 3;
  let i = x & 7;
  if ((row >> 1) ^ (column & 1)) i ^= 4;
  const byte = column * 64 + (i >> 1) * 16 + (row & 1) * 8 + (i & 1) * 4 + quarter;
  return base * 512 + page * 16384 + block * 512 + byte * 2 + (row >> 1);
}
export function checkDump(dumpFile, ctx, font, data) {
  const dump = fs.readFileSync(dumpFile);
  const headerSize = dump.readUInt32LE(4), stateSize = dump.readUInt32LE(12);
  const memory = dump.subarray(8 + headerSize + stateSize - 84 - 0x400000, 8 + headerSize + stateSize - 84);
  const texel = (x, y) => { const n = nibbleAt(x, y, ctx.texture >>> 6, ctx.width >> 6); return (memory[n >> 1] >> ((n & 1) * 4)) & 0xf; };
  const out = { cells: 0, equal: 0, pixels: 0, table: false, problems: [] };
  for (const entry of ctx.list) {
    if (entry.code === 0 || entry.loaded === 0 || entry.cell < 0) continue;
    const glyph = glyphOf(font, data, entry.code);
    const [cellX, cellY] = cellOrigin(ctx, entry.cell);
    out.cells += 1;
    let same = true;
    for (let y = -1; y < glyph.block.height && same; y++) for (let x = -1; x < glyph.block.width; x++) {
      const expected = x < 0 || y < 0 ? 0 : pixel(data, glyph, x, y);
      out.pixels += 1;
      if (texel(cellX + 1 + x, cellY + 1 + y) !== expected) { same = false; out.problems.push(`cell ${entry.cell} (character ${entry.code.toString(16)}) differs at (${x}, ${y})`); break; }
    }
    if (same) out.equal += 1;
  }
  // The colour table: 8 x 2 pixels of 32 bits in the first block at its base.
  const WORDS = [0, 1, 4, 5, 8, 9, 12, 13, 2, 3, 6, 7, 10, 11, 14, 15];
  const block = font.blocks.find((candidate) => candidate.at === ctx.block - ctx.data);
  out.table = !!block && WORDS.every((word, i) => memory.readUInt32LE((ctx.table >>> 6) * 256 + word * 4) === data.readUInt32LE(block.table + 4 * i));
  return out;
}

// ---- the trace ----------------------------------------------------------------------------------

export function verify(traceFile, fontFile = dataPath('dumps/hddosd-host/FNTOSD'), dumpFile = null) {
  if (BUILD !== 'hdd') throw new Error('verify() is HDD OSD 1.10U; ROM 2.30 is verifyRom()');
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const data = expand(fs.readFileSync(fontFile));
  const font = readFont(data);
  const result = { strings: 0, measured: 0, again: 0, places: [0, 0], callers: new Map(), icons: [0, 0], characters: 0, glyphs: [0, 0], pictures: [0, 0], tables: [0, 0], textures: [0, 0], opens: [0, 0], bytes: 0, unwritten: 0,
    layout: [0, 0], problems: [], texts: new Map(), codes: new Set(),
    alphas: [0, 0], alphaCallers: new Map(), alphaValues: {}, panels: [0, 0], entries: [0, 0], skipped: 0 };
  const problem = (text) => { if (result.problems.length < 12) result.problems.push(text); };

  const probes = trace.probes.filter((probe) => !probe.preroll);
  const frame = { number: -1, widths: new Map(), drawn: new Map() };
  const NAMES = {
    [T.dateAlpha]: ['ramps', 'closing', 'gp', 'weight'], [T.menu]: ['ramps', 'adjust', 'closing', 'gp', 'weight'],
    [T.panels]: ['ramps', 'adjust', 'closing', 'clock', 'gp', 'weight', 'dialog', 'rows'],
    [T.list]: ['list', 'closing', 'clock', 'gp', 'weight', 'divisor', 'screen'], [T.entry]: ['list'],
    [T.clockValue]: ['fields', 'gp', 'items'], [T.version]: ['adjust', 'rows', 'dialog', 'screen'],
  };
  const latest = {};
  const contextAt = probes.map((probe) => {
    if (probe.pc in NAMES || probe.pc === T.setColor || probe.pc === T.panel) latest[probe.pc] = probe;
    return { ...latest };
  });
  const alive = (probe) => probe.mem.every((m) => m.bytes);

  // The button panels drawn after each func_002269E0, against the rule.
  probes.forEach((probe, n) => {
    if (probe.pc !== T.panels || !alive(probe)) return;
    let expected;
    try { expected = panelsOf(stateOf(probe)); } catch (error) { problem(`frame ${probe.frame}: panels: ${error.message}`); return; }
    const sent = [];
    for (let i = n + 1; i < probes.length && probes[i].pc !== T.panels && probes[i].frame === probe.frame; i++) if (probes[i].pc === T.panel) sent.push([probes[i].gpr[4] | 0, probes[i].gpr[5] | 0]);
    result.panels[1] += 1;
    if (JSON.stringify(sent) === JSON.stringify(expected)) result.panels[0] += 1;
    else problem(`frame ${probe.frame}: button panels drawn ${JSON.stringify(sent)}, computed ${JSON.stringify(expected)}`);
  });
  // The entries of System Configuration's list (func_002311E8) after each list call, against the rule.
  probes.forEach((probe, n) => {
    if (probe.pc !== T.list || !alive(probe)) return;
    const S = stateOf(probe);
    const expected = [];
    if (S.ramp(MAP.E04).state !== 0 && S.ramp(MAP.R5780).state !== 2) {
      const a = configAlpha(S);
      expected.push([S.word(MAP.selected), by128(Math.imul(S.word(MAP.first), a)), 430, LIST_Y.chosen, LIST_Y.value]);
      if (S.word(MAP.second) !== 0) expected.push([S.word(MAP.secondIndex), by128(Math.imul(S.word(MAP.second), a)), 430, LIST_Y.chosen, LIST_Y.value]);
    }
    const sent = [];
    for (let i = n + 1; i < probes.length && probes[i].pc !== T.list && probes[i].frame === probe.frame; i++) if (probes[i].pc === T.entry) sent.push([4, 5, 6, 7, 8].map((r) => probes[i].gpr[r] | 0));
    result.entries[1] += 1;
    if (JSON.stringify(sent) === JSON.stringify(expected)) result.entries[0] += 1;
    else problem(`frame ${probe.frame}: list entries called with ${JSON.stringify(sent)}, computed ${JSON.stringify(expected)}`);
  });
  // The clock's value (clock_str_related) is drawn field by field, the pen carried by the code.
  const clock = { x: null, field: 0 };
  const version = { y: null };
  // DrawIcon (0x00226508): a button's picture beside its hint. Pictures 0 and 1 are 28 wide from
  // texture 8, the others 25 wide from texture 9; the height is half the width, the fields being
  // half a frame; the picture's place in the texture is a row of four ints per picture.
  // PAL branch of DrawIcon (0x0022661C..0x00226684): the bottom, in sixteenths, becomes
  // dptoli(litodp(top) + dpdiv(dpmul(fptodp((float)(bottom - top)), D_00365580), D_00365588)); both
  // constants are in the ELF (0x3FE14BC6A7333333 and 0x3FDE147AE0000000, the floats 0.5405 and 0.47).
  const elfDouble = (at) => { const bytes = Buffer.alloc(8); bytes.writeUInt32LE(elfWord(at), 0); bytes.writeUInt32LE(elfWord(at + 4), 4); return bytes.readDoubleLE(0); };
  const ICON_PAL = { mul: elfDouble(0x00365580), div: elfDouble(0x00365588) };
  const iconBottom = (top, bottom) => Math.trunc(top + (Math.fround(bottom - top) * ICON_PAL.mul) / ICON_PAL.div);
  for (const call of probes) {
    if (call.pc !== A.icon) continue;
    const [places, screen] = call.mem.map((range) => range.bytes);
    if (!places || !screen) continue;
    const [id, x, y, alpha] = [4, 5, 6, 7].map((r) => call.gpr[r] | 0);
    const size = id >= 0 && id < 2 ? 28 : 25;
    const [u0, v0, u1, v1] = [0, 4, 8, 12].map((o) => (places.readInt32LE(id * 16 + o) << 4) + 8);
    const originX = (0x800 - (screen.readInt32LE(0) >> 1)) << 4, originY = (0x800 - (screen.readInt32LE(4) >> 1)) << 4;
    const expected = [[3, BigInt(u0 & 0xffff) | (BigInt(v0 & 0xffff) << 16n)], [4, BigInt(((x << 4) + originX) & 0xffff) | (BigInt(((y << 4) + originY) & 0xffff) << 16n)],
      [3, BigInt(u1 & 0xffff) | (BigInt(v1 & 0xffff) << 16n)], [4, BigInt((((x + size) << 4) + originX) & 0xffff) | (BigInt(((PAL ? iconBottom(y << 4, (y + (size >> 1)) << 4) : (y + (size >> 1)) << 4) + originY) & 0xffff) << 16n)]];
    // After the call: the texture's binding, then the rectangle's two packets.
    const writes = (packet) => (packet ? [...new GifPath().feed(packet.bytes)].filter((event) => event.kind === 'write') : []);
    const head = writes(trace.packets[call.at + 1]), corners = writes(trace.packets[call.at + 2]);
    result.icons[1] += 1;
    const colour = head.find((event) => event.reg === 1);
    const same = corners.length === 4 && corners.every((event, i) => event.reg === expected[i][0] && (event.value & 0xffffffffn) === expected[i][1])
      && colour && Number((colour.value >> 24n) & 0xffn) === (alpha & 0xff);
    if (same) result.icons[0] += 1;
    else problem(`frame ${call.frame}: button picture ${id} at (${x}, ${y}) alpha ${alpha}: sent ${corners.map((event) => `${event.reg}=${event.value.toString(16)}`).join(' ')}, computed ${expected.map(([reg, value]) => `${reg}=${value.toString(16)}`).join(' ')}`);
  }
  /** The alpha a caller hands Font_SetColor, or undefined for a caller not read. */
  function alphaOf(caller, context, start) {
    const at = (pc) => (context[pc] && alive(context[pc]) ? stateOf(context[pc]) : null);
    if (caller === 0x00226464 || caller === 0x002264e0) { const S = at(T.dateAlpha); return S ? dateAlpha(S) : undefined; }
    if (caller === 0x00232270 || caller === 0x0023229c) { const S = at(T.menu); return S ? menuAlpha(S) : undefined; }
    if (caller === 0x00226908 || caller === 0x002268c4) return context[T.panel] ? context[T.panel].gpr[5] | 0 : undefined;
    if (caller === 0x002314f4) { const S = at(T.list); return S ? configAlpha(S) : undefined; }
    if ([0x00231338, 0x002312d0, 0x00231354, 0x002272e8, 0x00227304, 0x002273cc, 0x002273a8].includes(caller)) return context[T.entry] ? context[T.entry].gpr[5] | 0 : undefined;
    if ([0x002272c8, 0x00227318].includes(caller)) return null;      // they set the width and draw nothing
    if (caller === 0x00231624) { const S = at(T.list); return S ? arrowAlpha(S) : undefined; }
    if ([0x0022a5c0, 0x0022a6c0, 0x0022a6e8, 0x0022a708, 0x0022a72c, 0x0022a74c].includes(caller)) {
      const p = context[T.version];
      if (!p || !alive(p)) return undefined;
      const S = stateOf(p);
      return adjustAlpha(S);
    }
    return undefined;
  }
  /** Places that depend on the strings drawn before them in the same call: the clock's value, the version page. */
  function sequencePlace(caller, context, shown, advance) {
    const p = context[T.clockValue];
    if ([0x002272c8, 0x002272e8, 0x00227304, 0x00227318, 0x002273cc, 0x002273a8].includes(caller) && p && alive(p)) {
      if (clock.probe !== p) {
        // clock_str_related(record, x, y, alpha, editing): the fields start half the template's width left of x.
        const gp = p.mem[1].bytes;
        clock.probe = p; clock.field = 0; clock.space = false; clock.x = (p.gpr[5] | 0) - half(gp.readInt32LE(0x158 - 0x130)); clock.y = p.gpr[6] | 0; clock.editing = p.gpr[8] | 0;
        clock.record = p.gpr[4] >>> 0;
      }
      if (caller === 0x002272c8) return null;
      if (caller === 0x00227318) { clock.field += 1; if (clock.field === 3) clock.space = true; return null; }
      // After the third field the code moves on by twice the width of a space and draws nothing.
      if (clock.space) { clock.x += 2 * widthOf(' '); clock.space = false; }
      const plain = clock.editing ? [44, 44, 44] : [96, 96, 96];
      if (caller === 0x002273a8) return { x: clock.x, y: clock.y, rgb: plain, ratio: 1 };
      const out = { x: clock.x, y: clock.y, rgb: caller === 0x002272e8 && clock.editing ? [30, 110, 156] : plain, ratio: 1 };
      clock.x += advance;
      return out;
    }
    const v = context[T.version];
    if ([0x0022a5c0, 0x0022a6c0, 0x0022a6e8, 0x0022a708, 0x0022a72c, 0x0022a74c].includes(caller) && v && alive(v)) {
      const [adjust, rows, , screen] = v.mem.map((m) => m.bytes);
      const H = screen.readInt32LE(4);
      const top = Math.trunc(half(H) - (PAL ? 6.8999999999999995 : 6));
      if (caller === 0x0022a5c0) return { x: 404 - half(widthOf(shown)), y: Math.trunc(top - (PAL ? 31.049999999999997 : 27)), rgb: [110, 110, 0], ratio: 0.800000011920929 };
      if (version.probe !== v) { version.probe = v; version.row = adjust.readInt32LE(0x14) - 2; version.y = top + Math.trunc(0 - (PAL ? 19.549999999999997 : 17)); }
      // Rows are walked from two above the first shown; each row, shown or not, moves down a line.
      const step = PAL ? 13 : 11;
      const first = adjust.readInt32LE(0x14), count = adjust.readInt32LE(0xc), selected = adjust.readInt32LE(0x10);
      const label = [0x0022a6c0, 0x0022a6e8, 0x0022a72c].includes(caller);
      if (label) {
        for (;;) {
          const visible = version.row >= 0 && version.row < adjust.readInt32LE(8) && version.row >= first && version.row < first + count;
          if (visible) break;
          version.row += 1; version.y += step;
        }
      }
      const row = version.row, y = version.y;
      const chosen = row === selected;
      const flag = rows.readInt32LE(row * 16 + 8) !== 0;
      const rgb = chosen ? (label && flag ? [30, 110, 156] : [96, 96, 96]) : [44, 44, 44];
      if (!label) { version.row += 1; version.y += step; }
      return { x: label ? 391 - widthOf(shown) : 417, y, rgb, ratio: 0.800000011920929 };
    }
    return undefined;
  }
  const widthOf = (text) => frame.widths.get(text);

  probes.forEach((start, n) => {
    if (start.pc !== A.putsPackets && start.pc !== A.measure) return;
    const measuring = start.pc === A.measure;
    const calls = [];
    for (let i = n + 1; i < probes.length && probes[i].pc === A.putc; i++) calls.push(probes[i]);
    const [text, own, held, screen, items, tables, ratios, settings] = start.mem.map((range) => range.bytes);
    if (!text || !own || !held) { problem(`frame ${start.frame}: the string or the font state was not readable`); return; }
    if (start.frame !== frame.number) { frame.number = start.frame; frame.widths.clear(); frame.drawn.clear(); }
    const shown = text.subarray(0, text.indexOf(0)).toString('latin1');
    if (measuring) result.measured += 1;
    else {
      result.strings += 1;
      result.texts.set(shown, (result.texts.get(shown) ?? 0) + 1);
    }

    // The string level: what the library must be asked for.
    const asked = stringOf(text, own, font, data, measuring ? { colour: [0x310, 0x314, 0x318, 0x31c].map((o) => held.readFloatLE(o)) } : null);
    let step = asked.next();
    // The glyph level, and the packets.
    let at = start.at;
    const compare = (kind, expected, tally) => {
      const sent = trace.packets[at];
      at += 1;
      tally[1] += 1;
      if (!sent) { problem(`frame ${start.frame} "${shown}": the trace ends before the ${kind}`); return; }
      let equal = sent.bytes.length === expected.bytes.length;
      if (equal) {
        if (kind === 'picture') {
          // Rows the code does not write are left out of the comparison.
          const end = expected.pictureAt + expected.written, rest = expected.pictureAt + expected.pictureBytes;
          equal = sent.bytes.subarray(0, end).equals(expected.bytes.subarray(0, end)) && sent.bytes.subarray(rest).equals(expected.bytes.subarray(rest));
          result.unwritten += expected.pictureBytes - expected.written;
        } else equal = sent.bytes.equals(expected.bytes);
      }
      if (equal) { tally[0] += 1; result.bytes += expected.bytes.length; return; }
      let first = 0;
      while (first < Math.min(sent.bytes.length, expected.bytes.length) && sent.bytes[first] === expected.bytes[first]) first += 1;
      problem(`frame ${start.frame} "${shown}" packet ${at - 1} (${kind}): ${sent.bytes.length} bytes sent, ${expected.bytes.length} computed; first difference at byte 0x${first.toString(16)}: sent ${sent.bytes.subarray(first, first + 8).toString('hex')}, computed ${expected.bytes.subarray(first, first + 8).toString('hex')}`);
    };
    if (!measuring) compare('opening', { bytes: openString() }, result.opens);

    for (const call of calls) {
      const [bytes, ownNow] = call.mem.map((range) => range.bytes);
      if (!bytes || !ownNow) { problem(`frame ${call.frame}: the context was not readable`); return; }
      const ctx = readContext(bytes, A.state);
      const code = call.gpr[5];
      if (dumpFile && !result.memory) result.memory = checkDump(dumpFile, ctx, font, data);
      if ((ctx.drawing !== 0) === measuring) { problem(`frame ${call.frame} "${shown}": the library is ${ctx.drawing ? 'drawing' : 'measuring'} where the program is not`); return; }
      result.characters += 1;
      result.codes.add(code);
      let made;
      // The packet being built: its write pointer and its start are the program's, at +0x158.
      const room = ctx.room - ((ownNow.readUInt32LE(0x158) - ownNow.readUInt32LE(0x15c) + 15) >>> 4);
      try { made = putCharacter(ctx, font, data, code, room); } catch (error) { problem(`frame ${call.frame} "${shown}" character ${code.toString(16)}: ${error.message}`); return; }
      const tallies = { picture: result.pictures, texture: result.textures, glyph: result.glyphs, table: result.tables };
      for (const packet of made.packets) compare(packet.kind, packet, tallies[packet.kind]);

      // The string level against the context found.
      result.layout[1] += 1;
      if (step.done) { problem(`frame ${call.frame} "${shown}": the library was asked for ${code.toString(16)} after the string's last character`); continue; }
      const expected = step.value;
      const same = (a, b) => a.every((value, i) => floatBits(value) === floatBits(b[i]));
      const agree = expected.code === code && same(expected.locate, ctx.locate) && same(expected.colour, ctx.colour)
        && expected.matrix.every((row, i) => same(row, ctx.matrix[i])) && (expected.fresh !== 0) === (ctx.fresh !== 0);
      if (agree) result.layout[0] += 1;
      else problem(`frame ${call.frame} "${shown}" character ${code.toString(16)}: expected ${expected.code.toString(16)} at (${expected.locate[0]}, ${expected.locate[1]}) colour ${expected.colour} fresh ${expected.fresh} x ${expected.matrix[0][0]}; the library held (${ctx.locate[0]}, ${ctx.locate[1]}) colour ${ctx.colour} fresh ${ctx.fresh} x ${ctx.matrix[0][0]}`);
      if (made.result === -1) result.again += 1;
      else step = asked.next(made.penX);
    }
    if (!step.done) { problem(`frame ${start.frame} "${shown}": the string asks for ${step.value?.code?.toString(16)} and the library was not called`); return; }
    // What a measurement gives its caller, and where a known caller puts the string.
    if (measuring) frame.widths.set(shown, toInt(f(toInt(step.value.reach[0]) + f(step.value.pitch * step.value.x))));
    else {
      const caller = start.gpr[31] >>> 0;
      const context = contextAt[n];
      // The alpha: the program's colour is Font_SetColor's last call, its alpha a / 128.
      const set = context[T.setColor];
      const alphaHeld = own.readFloatLE(0x4c);
      let expectedAlpha;
      try { expectedAlpha = alphaOf(caller, context, start); } catch { expectedAlpha = undefined; }
      if (expectedAlpha === undefined) result.alphaCallers.set(`0x${caller.toString(16)}`, (result.alphaCallers.get(`0x${caller.toString(16)}`) ?? 0) + 1);
      else {
        result.alphas[1] += 1;
        const a = set ? set.gpr[7] | 0 : NaN;
        if (expectedAlpha !== null) { const key = `0x${caller.toString(16)}`; (result.alphaValues[key] ??= new Set()).add(expectedAlpha); }
        if (expectedAlpha === null || (a === expectedAlpha && floatBits(alphaHeld) === floatBits(f(a * 0.0078125)))) result.alphas[0] += 1;
        else problem(`frame ${start.frame} "${shown}" from 0x${caller.toString(16)}: alpha set ${a} (held ${alphaHeld * 128}), computed ${expectedAlpha}`);
      }
      const advance = toInt(f(toInt(f(step.value.reach[0] - own.readFloatLE(0x30))) + f(step.value.pitch * step.value.x)));
      const placed = sequencePlace(caller, context, shown, advance);
      const rule = placed === null ? () => null : placed ? () => placed : PLACES[caller];
      // The main menu's items are numbered together, whichever of the two calls draws them.
      const counted = caller === 0x00232270 || caller === 0x0023229c ? 0x00232270 : caller;
      const order = frame.drawn.get(counted) ?? 0;
      frame.drawn.set(counted, order + 1);
      const name = `0x${caller.toString(16)}`;
      if (!rule || !screen || !items || !tables || !ratios) result.callers.set(name, (result.callers.get(name) ?? 0) + 1);
      else {
        const ints = (buffer, o, count) => Array.from({ length: count }, (_, i) => buffer.readInt32LE(o + 4 * i));
        // config_get_osd_language (0x00203DD8): bits 4 to 8 of the console's settings word; 1 is English.
        const language = settings ? (settings.readUInt32LE(0) >> 4) & 0x1f : 1;
        const locate = [own.readFloatLE(0x30), own.readFloatLE(0x34)];
        const listProbe = context[T.list];
        const expected = rule({ items: ints(items, 0, 16), ratios: [ratios.readFloatLE(0), ratios.readFloatLE(4)], width: frame.widths.get(shown), widths: frame.widths, n: order, locate,
          screenW: screen.readInt32LE(0), screenH: screen.readInt32LE(4), list: listProbe?.mem[0].bytes,
          tables: { hint: ints(tables, 0, 3), slots: ints(tables, 0x10 + language * 16, 4), chosen: ints(tables, 0xe0, 3), plain: ints(tables, 0xf0, 3), value: ints(tables, 0x100, 3), title: ints(tables, 0x110, 3) } });
        if (expected === null) { result.skipped += 1; return; }
        if (expected === undefined) { result.callers.set(name, (result.callers.get(name) ?? 0) + 1); return; }
        const rgb = [0x40, 0x44, 0x48].map((o) => own.readFloatLE(o));
        const agree = locate[0] === expected.x && locate[1] === expected.y && floatBits(own.readFloatLE(0x28)) === floatBits(expected.ratio)
          && expected.rgb.every((c, i) => floatBits(f(c * 0.0078125)) === floatBits(rgb[i]));
        result.places[1] += 1;
        if (agree) result.places[0] += 1;
        else problem(`frame ${start.frame} "${shown}" from ${name}: expected at (${expected.x}, ${expected.y}) colour ${expected.rgb} size ${expected.ratio}; the program had (${locate}) colour ${rgb.map((c) => c * 128)} size ${own.readFloatLE(0x28)}`);
      }
    }
  });
  return result;
}

// ==== ROM 2.30 =====================================================================================

/**
 * The character function (0x0020ACA8): `set` 0 is the 97 characters from 0x20, 1 the two pages of
 * 304 extended ones, 2 the page of marks; a page holds cells of 32 x 40, 8 across for set 0 and
 * 16 for the others, and a table gives each glyph its left edge in the cell and its width.
 * Returns the packets (the page's binding when the function sends it, then the sprite) and the
 * advance in pixels.
 */
export function romCharacter(input) {
  const { set, bound, settings, pen, colour, screen, tables, tags } = input;
  let index = input.index, table, across;
  const packets = [];
  const u32 = (buffer, o) => buffer.readUInt32LE(o), s32 = (buffer, o) => buffer.readInt32LE(o);
  // A page as TEX0, then clamp, then bilinear: tag at +0x40 of the tags.
  const bind = (n) => {
    const o = 0x20 + n * 0x18;
    const tex0 = BigInt(u32(settings, o)) | (BigInt(u32(settings, o + 8)) << 14n) | (0x14n << 20n) | (BigInt(u32(settings, o + 0xc)) << 26n) | (BigInt(u32(settings, o + 0x10)) << 30n)
      | (1n << 34n) | (BigInt(u32(settings, o + 0x14)) << 37n) | (1n << 61n);
    const tag = Buffer.from(tags.subarray(0x40, 0x50));
    tag.writeUInt16LE((tag.readUInt16LE(0) & 0x8000) | 1, 0);
    packets.push({ kind: 'page', bytes: Buffer.concat([tag, qword(tex0, 0n), qword(5n, 0n), qword(0x61n, 0x14n)]) });
  };
  if (set === 0) {
    index -= 0x20;
    if (index < 0 || index >= 0x61) return { packets, advance: 0, drawn: false };
    if (!bound) bind(0);
    table = u32(settings, 0x1c) - R.tables; across = 8;
  } else if (set === 1) {
    if (index < 0x130) { bind(1); table = 0x0027ecb0 - R.tables; } else { index -= 0x130; bind(2); table = 0x0027f630 - R.tables; }
    across = 16;
  } else { bind(3); table = 0x0027ffb0 - R.tables; across = 16; }
  const column = index % across, row = Math.trunc(index / across);
  const left = s32(tables, table + index * 8), width = s32(tables, table + index * 8 + 4);
  const fixed = s32(settings, 0), lower = s32(settings, 8), times = s32(settings, 0xc);
  const sx = colour.readFloatLE(0x24), sy = colour.readFloatLE(0x28);
  const screenW = s32(screen, 0), screenH = s32(screen, 4);
  let x0 = s32(pen, 8) + (Math.trunc((4096 - screenW) / 2) << 4);
  if (fixed !== 0) x0 += toInt(f(f(f(sx * Math.imul(fixed - width, times)) * 0.5) * 16));
  const drop = toInt(f(sy * s32(pen, 0x14))) + s32(pen, 0x20);
  const wide = toInt(f(sx * Math.imul(width, times)));
  const y0 = s32(pen, 0xc) + (Math.trunc((4096 - screenH) / 2) << 4) + drop + lower;
  const y1 = y0 + s32(colour, 0x30), x1 = x0 + (wide << 4);
  const u = column * 32 + left;
  const u0 = (u << 4) + 8, u1 = ((u + width) << 4) - 8, v0 = ((row * 40) << 4) + 8, v1 = ((row * 40) << 4) + 0x278;
  const pair = (low, high) => BigInt.asUintN(64, BigInt(low >>> 0) | (BigInt(high >>> 0) << 32n));
  const which = s32(pen, 0x18) !== 0 ? 0x10 : 0;
  const tag = Buffer.from(tags.subarray(which, which + 0x10));
  tag.writeUInt16LE((tag.readUInt16LE(0) & 0x8000) | 1, 0);
  // The upper half of a quadword is whatever the one before left there: the colour's under the
  // first UV, the first corner's under the second.
  const blueAlpha = pair(u32(colour, 8), u32(colour, 0xc)), noKick = 0x0000800000000001n;
  packets.push({ kind: 'glyph', bytes: Buffer.concat([tag, qword(pair(u32(colour, 0), u32(colour, 4)), blueAlpha), qword(pair(u0, v0), blueAlpha), qword(pair(x0, y0), noKick),
    qword(pair(u1, v1), noKick), qword(pair(x1, y1), 1n)]) });
  const advance = toInt(f(sx * s32(pen, 0x10))) + toInt(f(sx * Math.imul(fixed !== 0 ? fixed : width, times)));
  return { packets, advance, drawn: true };
}

/** What a string function opens with (0x0020A9D8): TEST_1 (pixels of alpha 0 dropped) and ALPHA_1, its unused FIX at 0x80. */
const romOpen = () => Buffer.concat([qword(0x1000000000008002n, AD), write(0x47, 0x3000dn), write(0x42, 0x8000000044n)]);

/** ROM 2.30's four pages as GS memory holds them at the start of a dump, against FNTIMAGE expanded. */
export function checkRomDump(dumpFile, biosFile) {
  const dump = fs.readFileSync(dumpFile);
  const headerSize = dump.readUInt32LE(4), stateSize = dump.readUInt32LE(12);
  const memory = dump.subarray(8 + headerSize + stateSize - 84 - 0x400000, 8 + headerSize + stateSize - 84);
  return romPages(fs.readFileSync(biosFile)).map((page) => {
    let equal = 0;
    for (let y = 0; y < page.height; y++) for (let x = 0; x < page.width; x++) {
      const n = y * page.width + x, at = nibbleAt(x, y, page.base, page.bufferWidth);
      if (((page.pixels[n >> 1] >> ((n & 1) * 4)) & 0xf) === ((memory[at >> 1] >> ((at & 1) * 4)) & 0xf)) equal += 1;
    }
    return { file: page.file, equal, pixels: page.width * page.height };
  });
}

export function verifyRom(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const result = { strings: 0, characters: 0, opens: [0, 0], glyphs: [0, 0], pages: [0, 0], pens: [0, 0], bytes: 0, texts: new Map(), problems: [] };
  const problem = (text) => { if (result.problems.length < 12) result.problems.push(text); };
  const probes = trace.probes.filter((probe) => !probe.preroll);
  probes.forEach((start, n) => {
    if (!R.strings.includes(start.pc)) return;
    const calls = [];
    for (let i = n + 1; i < probes.length && probes[i].pc === R.character; i++) calls.push(probes[i]);
    const [text] = start.mem.map((range) => range.bytes);
    if (!text) { problem(`frame ${start.frame}: the string was not readable`); return; }
    const shown = text.subarray(0, text.indexOf(0)).toString('latin1');
    result.strings += 1;
    result.texts.set(shown, (result.texts.get(shown) ?? 0) + 1);
    let at = start.at;
    const compare = (kind, bytes, tally) => {
      const sent = trace.packets[at];
      at += 1;
      tally[1] += 1;
      if (sent && sent.bytes.equals(bytes)) { tally[0] += 1; result.bytes += bytes.length; return; }
      let first = 0;
      while (sent && first < Math.min(sent.bytes.length, bytes.length) && sent.bytes[first] === bytes[first]) first += 1;
      problem(`frame ${start.frame} "${shown}" packet ${at - 1} (${kind}): ${sent ? sent.bytes.length : 'no'} bytes sent, ${bytes.length} computed; first difference at byte 0x${first.toString(16)}: sent ${sent ? sent.bytes.subarray(first, first + 8).toString('hex') : ''}, computed ${bytes.subarray(first, first + 8).toString('hex')}`);
    };
    compare('opening', romOpen(), result.opens);
    let expectedPen = null;
    for (const call of calls) {
      const [bound, settings, pen, colour, screen, tables, tags] = call.mem.map((range) => range.bytes);
      if (!bound || !settings || !pen || !colour || !screen || !tables || !tags) { problem(`frame ${call.frame}: a probed range was not readable`); return; }
      result.characters += 1;
      const made = romCharacter({ set: call.gpr[4], index: call.gpr[6], bound: bound.readInt32LE(0) !== 0, settings, pen, colour, screen, tables, tags });
      for (const packet of made.packets) compare(packet.kind, packet.bytes, packet.kind === 'page' ? result.pages : result.glyphs);
      // The string function moves the pen by the advance, in sixteenths.
      if (expectedPen !== null) {
        result.pens[1] += 1;
        if (pen.readInt32LE(8) === expectedPen) result.pens[0] += 1;
      }
      expectedPen = pen.readInt32LE(8) + (made.advance << 4);
    }
  });
  return result;
}

/**
 * A string as ROM 2.30's string function (0x0020C6F8) walks it: bytes below 0x81 are set 0 with
 * the byte as index; 7 starts an escape (0x0020C380): `p` sets the fixed width (`p@c` the width of
 * c from the table, `pNN` the number), `o` asks for mark NNN of set 2 (16, 4 and 5 mapped to 0x16,
 * 0x18 and 0x19 while the table is the ASCII one), the others are not met here.
 */
function* romWalk(text, table, widthOf) {
  let i = 0;
  for (;;) {
    const c = text[i];
    if (!c) return;
    if (c === 7) {
      const letter = String.fromCharCode(text[i + 1]);
      if (letter === 'p') {
        if (text[i + 2] === 0x40) yield { fixed: widthOf(text[i + 3]) };
        else yield { fixed: (text[i + 2] - 0x30) * 10 + (text[i + 3] - 0x30) };
        i += 4;
      } else if (letter === 'o') {
        let n = (text[i + 2] - 0x30) * 100 + (text[i + 3] - 0x30) * 10 + (text[i + 4] - 0x30);
        if (table === 0x0027e9b0) n = n === 0x10 ? 0x16 : n === 4 ? 0x18 : n === 5 ? 0x19 : n;
        yield { set: 2, index: n };
        i += 5;
      } else throw new Error(`escape ${letter}: not modelled`);
    } else if (c === 10 || c === 9 || c >= 0x81) throw new Error(`byte 0x${c.toString(16)}: not modelled`);
    else { yield { set: 0, index: c }; i += 1; }
  }
}

/**
 * The measure (0x0020CBA0): for every character its width and the pitch, each through sx:
 * (int)((sx x w) x times) + (int)(sx x pitch), w being the fixed width when one is set, else the
 * table's. No trimming: that branch is for languages other than this one.
 */
function romWidth(text, settings, pen, colour, tables, languageBlock) {
  let fixed = settings.readInt32LE(0);
  const times = settings.readInt32LE(0xc), table = settings.readUInt32LE(0x1c);
  const sx = colour.readFloatLE(0x24), pitch = toInt(f(sx * pen.readInt32LE(0x10)));
  const tableWidth = (base, index) => tables.readInt32LE(base - R.tables + index * 8 + 4);
  let width = 0, code = null;
  for (const step of romWalk(text, table, (c) => tableWidth(table, c - 0x20))) {
    if ('fixed' in step) { fixed = step.fixed; continue; }
    const w = fixed !== 0 ? fixed : step.set === 0 ? tableWidth(table, step.index - 0x20) : tableWidth(0x0027ffb0, step.index);
    width += toInt(f(f(sx * w) * times)) + pitch;
    code = step.index;
  }
  // 0x0020CE44 (when settings+0x14 is set): the language's trimming applies only when the last code
  // is one of 0x8141/0x8142 (language 0), 0xA3BF/0xA1A3/0xA1A2 (3), 0xF240/0xF3F8/0xF3F9 (6): all
  // double-byte codes. The codes this walk yields are ASCII or an escape's number (at most 999,
  // 0x16, 0x18, 0x19), so the trimming never fires for them, in any language, and the width stands.
  if (settings.readInt32LE(0x14) !== 0 && code !== null && code >= 0x8141) throw new Error(`the trimming for last code 0x${code.toString(16)} is not modelled`);
  return width;
}

export function verifyRom2(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const result = { strings: 0, characters: 0, opens: [0, 0], glyphs: [0, 0], pages: [0, 0], pens: [0, 0], walk: [0, 0], colours: [0, 0], coloursBeforeSetter: 0, widths: [0, 0],
    places: [0, 0], alphas: [0, 0], panels: [0, 0], callers: new Map(), alphaCallers: new Map(), bytes: 0, texts: new Map(), problems: [] };
  const problem = (text) => { if (result.problems.length < 14) result.problems.push(text); };
  const probes = trace.probes.filter((probe) => !probe.preroll);
  const latest = {};
  for (const probe of trace.probes) if (probe.preroll && (probe.pc === RT.setColor || probe.pc === RT.setRatio)) latest[probe.pc] = probe;
  const contextAt = probes.map((probe) => { latest[probe.pc] = probe; return { ...latest }; });
  const alive = (probe) => probe && probe.mem.every((m) => m.bytes);
  const text = (bytes) => bytes.subarray(0, bytes.indexOf(0));
  const W = (screen) => screen.readInt32LE(0), H = (screen) => screen.readInt32LE(4);
  const widths = new Map();
  let frameNumber = -1;
  const ropen = () => Buffer.concat([qword(0x1000000000008002n, AD), write(0x47, 0x3000dn), write(0x42, 0x8000000044n)]);

  // The button panels after each 0x00222160, against the rule.
  probes.forEach((probe, n) => {
    if (probe.pc !== RT.panels || !alive(probe)) return;
    const expected = panelsOf(stateOf(probe));
    const sent = [];
    for (let i = n + 1; i < probes.length && probes[i].pc !== RT.panels && probes[i].frame === probe.frame; i++) if (probes[i].pc === RT.panel) sent.push([probes[i].gpr[4] | 0, probes[i].gpr[5] | 0]);
    result.panels[1] += 1;
    if (JSON.stringify(sent) === JSON.stringify(expected)) result.panels[0] += 1;
    else problem(`frame ${probe.frame}: button panels drawn ${JSON.stringify(sent)}, computed ${JSON.stringify(expected)}`);
  });

  // Measures: the model's width against what the function returned.
  probes.forEach((probe, n) => {
    if (probe.pc !== RT.measure || !alive(probe)) return;
    const end = probes.slice(n + 1).find((p) => p.pc === RT.measured);
    const [bytes, settings, pen, colour, tables, languageBlock] = probe.mem.map((m) => m.bytes);
    const shown = text(bytes);
    let model;
    try { model = romWidth(shown, settings, pen, colour, tables, languageBlock); } catch (error) { problem(`measure "${shown.toString('latin1')}": ${error.message}`); return; }
    result.widths[1] += 1;
    if (end && (end.gpr[2] | 0) === model) result.widths[0] += 1;
    else problem(`frame ${probe.frame} measure "${shown.toString('latin1')}": returned ${end?.gpr[2] | 0}, computed ${model}`);
    widths.set(`${probe.frame}:${shown.toString('latin1')}`, model);
  });
  const widthOf = (frame, string) => widths.get(`${frame}:${string}`);

  const clock = { probe: null };
  probes.forEach((start, n) => {
    if (!R.strings.includes(start.pc)) return;
    const calls = [];
    for (let i = n + 1; i < probes.length && !R.strings.includes(probes[i].pc) && probes[i].pc !== RT.measure; i++) if (probes[i].pc === R.character) calls.push(probes[i]);
    const [bytes, pen, colour, settings, screen, items, tablesOfColour] = start.mem.map((range) => range.bytes);
    if (!bytes || !pen || !colour || !settings) { problem(`frame ${start.frame}: the string or the font state was not readable`); return; }
    const raw = text(bytes), shown = raw.toString('latin1');
    result.strings += 1;
    result.texts.set(shown, (result.texts.get(shown) ?? 0) + 1);
    let at = start.at;
    const compare = (kind, packet, tally) => {
      const sent = trace.packets[at];
      at += 1;
      tally[1] += 1;
      if (sent && sent.bytes.equals(packet)) { tally[0] += 1; result.bytes += packet.length; return; }
      problem(`frame ${start.frame} "${shown}" packet ${at - 1} (${kind}) differs`);
    };
    compare('opening', ropen(), result.opens);

    // The string level: the characters asked for, the fixed width each is drawn with, and the
    // pen: the first character at the place the caller set, the next ones moved by the advance.
    let walk;
    try { walk = [...romWalk(raw, settings.readUInt32LE(0x1c), (c) => 0)]; } catch (error) { problem(`frame ${start.frame} "${shown}": ${error.message}`); return; }
    let fixed = settings.readInt32LE(0), expectedPen = pen.readInt32LE(8), k = 0;
    for (const step of walk) {
      if ('fixed' in step) { fixed = null; continue; }
      const call = calls[k++];
      result.walk[1] += 1;
      if (!call) { problem(`frame ${start.frame} "${shown}": the string asks for more characters than were drawn`); break; }
      const [, cSettings, cPen, cColour, cScreen, cTables, cTags] = call.mem.map((range) => range.bytes);
      const agree = (call.gpr[4] | 0) === step.set && (call.gpr[6] | 0) === step.index && cPen.readInt32LE(8) === expectedPen && (fixed === null || cSettings.readInt32LE(0) === fixed);
      if (agree) result.walk[0] += 1;
      else problem(`frame ${start.frame} "${shown}" character ${k}: asked (${call.gpr[4] | 0}, ${call.gpr[6] | 0}) at ${cPen.readInt32LE(8)}, computed (${step.set}, ${step.index}) at ${expectedPen}`);
      fixed = cSettings.readInt32LE(0);
      result.characters += 1;
      const made = romCharacter({ set: call.gpr[4], index: call.gpr[6], bound: call.mem[0].bytes.readInt32LE(0) !== 0, settings: cSettings, pen: cPen, colour: cColour, screen: cScreen, tables: cTables, tags: cTags });
      for (const packet of made.packets) compare(packet.kind, packet.bytes, packet.kind === 'page' ? result.pages : result.glyphs);
      expectedPen = cPen.readInt32LE(8) + (made.advance << 4);
    }
    if (k !== calls.length) problem(`frame ${start.frame} "${shown}": ${calls.length} characters drawn, the string has ${k}`);

    // The colour block holds Font_SetColor's last four ints and Font_SetRatio's float.
    const context = contextAt[n];
    const set = context[RT.setColor], ratio = context[RT.setRatio];
    const rgba = [0, 4, 8, 12].map((o) => colour.readInt32LE(o));
    if (!set) result.coloursBeforeSetter += 1;
    else result.colours[1] += 1;
    if (set && [4, 5, 6, 7].every((r, i) => (set.gpr[r] | 0) === rgba[i]) && (!ratio || floatBits(colour.readFloatLE(0x24)) === ratio.fpr[12] >>> 0)) result.colours[0] += 1;
    else if (set) problem(`frame ${start.frame} "${shown}": colour block ${rgba} and size ${colour.readFloatLE(0x24)} against the setters' ${set ? [4, 5, 6, 7].map((r) => set.gpr[r] | 0) : '-'}`);

    // The place level and the alpha.
    const caller = start.gpr[31] >>> 0;
    let expected;
    try { expected = romPlace(caller, context, shown, start, screen, items, (s) => widthOf(start.frame, s), tablesOfColour); } catch (error) { problem(`frame ${start.frame} "${shown}" from 0x${caller.toString(16)}: ${error.message}`); return; }
    const name = `0x${caller.toString(16)}`;
    if (expected === undefined) { result.callers.set(name, (result.callers.get(name) ?? 0) + 1); return; }
    if (expected === null) return;
    result.places[1] += 1;
    const placed = [pen.readInt32LE(8), pen.readInt32LE(0xc)];
    const okX = expected.xs ? expected.xs.includes(placed[0] >> 4) && (placed[0] & 15) === 0 : placed[0] === expected.x << 4;
    const okPlace = okX && placed[1] === expected.y << 4 && expected.rgb.every((c, i) => c === rgba[i]) && floatBits(colour.readFloatLE(0x24)) === floatBits(f(expected.ratio));
    if (okPlace) result.places[0] += 1;
    else problem(`frame ${start.frame} "${shown}" from ${name}: at (${placed.map((v) => v / 16)}) colour ${rgba.slice(0, 3)} size ${colour.readFloatLE(0x24)}; computed (${expected.x}, ${expected.y}) ${expected.rgb} ${expected.ratio}`);
    if (expected.alpha === undefined) { result.alphaCallers.set(name, (result.alphaCallers.get(name) ?? 0) + 1); return; }
    result.alphas[1] += 1;
    if (rgba[3] === expected.alpha) result.alphas[0] += 1;
    else problem(`frame ${start.frame} "${shown}" from ${name}: alpha ${rgba[3]}, computed ${expected.alpha}`);
  });

  /** Where ROM 2.30's callers put a string; the same rules as HDD OSD's where the code is the same. */
  function romPlace(caller, context, shown, start, screen, items, width, colours) {
    const table = (address, n = 3) => Array.from({ length: n }, (_, i) => colours.readInt32LE(address - 0x0028a650 + 4 * i));
    const half2 = (v) => half(v);
    const S = (pc) => (alive(context[pc]) ? stateOf(context[pc]) : null);
    const item0 = items.readInt32LE(0);
    const lang = 1;
    if (caller === 0x00221b30 || caller === 0x00221ba0) {
      const s = S(RT.date);
      return { x: caller === 0x00221b30 ? 22 : W(screen) - width(shown) - 22, y: dateY(item0), rgb: [96, 96, 96], ratio: 0.8299999833106995, alpha: s ? dateAlpha(s) : undefined };
    }
    if (caller === 0x0022e554 || caller === 0x0022e584) {
      const m = context[RT.menu];
      const s = S(RT.menu);
      // 0x0022E3E0: from (int)(H/2 - 14) (17.25 in PAL), a line of 16 (18 in PAL); items are numbered by their order in the frame.
      const top = Math.trunc(half(H(m.mem[5].bytes)) - (PAL ? 17.25 : 14)), step = PAL ? 18 : 16;
      const key = `${start.frame}`;
      if (menuCount.frame !== key) { menuCount.frame = key; menuCount.n = 0; }
      const order = menuCount.n++;
      const rgb = caller === 0x0022e554 ? table(0x0028a770) : table(0x0028a780);
      const a = s ? menuAlpha(s) : undefined;
      return { x: 430 - half2(width(shown)), y: top + order * step, rgb, ratio: 1, alpha: a };
    }
    if (caller === 0x00222088 || caller === 0x00222018) {
      const panel = context[RT.panel];
      const a = panel ? panel.gpr[5] | 0 : undefined;
      const y = panel.gpr[6] | 0;
      if (caller === 0x00222018) return { x: W(screen) - (width(shown) + 0x18), y, rgb: table(0x0028a650), ratio: 0.800000011920929, alpha: a };
      // Slots 0 to 2: 28 right of the slot's place for the language (0x0028A660 + language x 16; English).
      return { xs: table(0x0028a660 + lang * 16, 3).map((x) => x + 0x1c), y, rgb: table(0x0028a650), ratio: 0.800000011920929, alpha: a };
    }
    const list = context[RT.list];
    if ([0x0022d88c, 0x0022d9d4, 0x0022db34, 0x0022db98].includes(caller)) {
      const s = S(RT.list);
      const top = PAL ? 0x65 : 0x58, chosen = Math.trunc(top + (PAL ? 27.599999999999998 : 24));
      const listAlpha = s ? configAlpha(s) : undefined;
      if (caller === 0x0022d88c) return { x: 430 - half2(width(shown)), y: top, rgb: table(0x0028a7a0), ratio: 1, alpha: listAlpha };
      const record = (o) => s.word(0x0028aff0 + o);
      const space = width(' '), mark = width('\u0007o020');
      if (caller === 0x0022d9d4) {
        const reach = space + half(record(0xc)) + mark + 430;
        const x0 = reach < W(screen) - 24 ? 430 : 430 - (reach + 24 - W(screen));
        const a = arrowAlpha(s);
        return { x: x0 + half(record(0xc)) + space, y: chosen, rgb: table(0x0028a790), ratio: 1, alpha: a };
      }
      // An entry: centred on 430 unless it and the arrow would pass 24 from the right edge.
      const w = width(shown);
      const reach = space + half(w) + mark + 430;
      const x0 = reach < W(screen) - 24 ? 430 : 430 - (reach + 24 - W(screen));
      // The entries drawn are those whose alpha (each entry's own, at 0x00296B90 + 0x30 i + 0x24,
      // times the list's) is 16 or more, in order; the k-th string of the frame is the k-th of them.
      if (romList.frame !== start.frame) {
        romList.frame = start.frame; romList.k = 0;
        romList.drawn = [];
        for (let i = 0; i < record(8); i++) { const a = by128(Math.imul(s.word(0x00296b90 + i * 0x30 + 0x24), listAlpha)); if (a >= 16) romList.drawn.push(a); }
      }
      const a = romList.drawn[romList.k++];
      romList.lastAlpha = a;
      return { x: x0 - half2(w), y: chosen, rgb: caller === 0x0022db98 ? table(0x0028a770) : table(0x0028a790), ratio: 1, alpha: a };
    }
    if (caller === 0x002224b8) {
      const top = PAL ? 0x65 : 0x58;
      return { x: 430 - (width(shown) >>> 1), y: Math.trunc(top + (PAL ? 48.3 : 42)), rgb: table(0x0028a790), ratio: 1, alpha: romList.lastAlpha };
    }
    if ([0x00222a30, 0x00222a50, 0x00222a6c, 0x00222a80, 0x00222b30, 0x00222b08].includes(caller)) {
      const p = context[RT.clockValue];
      if (clock.probe !== p) {
        clock.probe = p; clock.field = 0; clock.space = false; clock.y = p.gpr[6] | 0; clock.editing = p.gpr[8] | 0; const sl = S(RT.list);
        const itemBase = sl.word(0x0028aff4), count = sl.word(0x0028aff8);
        let own = -1;
        for (let i = 0; i < count; i++) if (sl.word(itemBase + i * 0x38 + 0x18) === 0x00222b88) own = i;
        if (own < 0) throw new Error('no list entry has the clock value callback');
        clock.alpha = by128(Math.imul(sl.word(0x00296b90 + own * 0x30 + 0x24), configAlpha(sl)));
        if ((p.gpr[7] | 0) !== clock.alpha) throw new Error(`the clock's value was handed alpha ${p.gpr[7] | 0}, its entry's is ${clock.alpha}`);
        if ((p.gpr[5] | 0) !== 430 || (p.gpr[6] | 0) !== Math.trunc((PAL ? 0x65 : 0x58) + (PAL ? 48.3 : 42))) throw new Error(`the clock's value was handed (${p.gpr[5] | 0}, ${p.gpr[6] | 0})`);
        const template = probes.slice(probes.indexOf(p) + 1).find((q) => q.pc === RT.measure);
        clock.x = (p.gpr[5] | 0) - half(width(text(template.mem[0].bytes).toString('latin1')));
      }
      if (caller === 0x00222a30) return null;
      if (caller === 0x00222a80) { clock.field += 1; if (clock.field === 3) clock.space = true; return null; }
      if (clock.space) { clock.x += width(' '); clock.space = false; }
      const plain = clock.editing ? table(0x0028a780) : table(0x0028a790);
      const rgb = caller === 0x00222a50 && clock.editing ? table(0x0028a770) : plain;
      const out = { x: clock.x, y: clock.y, rgb, ratio: 1, alpha: clock.alpha };
      if (caller !== 0x00222b08) clock.x += width(shown);
      return out;
    }
    return undefined;
  }
  return result;
}
const menuCount = { frame: null, n: 0 };
const romList = { frame: null, k: 0, drawn: [], lastAlpha: undefined };

if (process.argv[1] && process.argv[1].endsWith('verify_text2.mjs') && BUILD === 'rom') {
  const result = verifyRom2(process.argv[2]);
  const line = (name, [equal, total]) => console.log(`  ${name.padEnd(52)} ${equal} of ${total} equal`);
  console.log(`build: ${BUILD_NAME}${PAL ? ' (PAL)' : ''}   strings drawn: ${result.strings}   characters: ${result.characters}`);
  line('opening packet of a string (TEST_1, ALPHA_1)', result.opens);
  line('page binding (TEX0_1, CLAMP_1, TEX1_1)', result.pages);
  line('glyph packet (sprite)', result.glyphs);
  line('string level: character, set, fixed width, pen', result.walk);
  line('colour block = Font_SetColor and Font_SetRatio', result.colours);
  if (result.coloursBeforeSetter) console.log(`  strings drawn before the capture's first Font_SetColor, block not comparable: ${result.coloursBeforeSetter}`);
  line('measured width (0x0020CBA0) against the model', result.widths);
  line('place level: position, colour, size by caller', result.places);
  line('alpha of a string, by the rule of its caller', result.alphas);
  line('button panels drawn, id and alpha', result.panels);
  if (result.callers.size) console.log(`  strings from callers whose placing is not recomputed: ${[...result.callers].map(([name, count]) => `${name} x ${count}`).join(', ')}`);
  if (result.alphaCallers.size) console.log(`  strings whose alpha is not recomputed: ${[...result.alphaCallers].map(([name, count]) => `${name} x ${count}`).join(', ')}`);
  for (const [text, count] of [...result.texts].sort((x, y) => y[1] - x[1]).slice(0, 30)) console.log(`  ${String(count).padStart(4)} x ${JSON.stringify(text)}`);
  for (const text of result.problems) console.log(`  ! ${text}`);
  const whole = result.strings > 0 && [result.opens, result.glyphs, result.pages, result.walk, result.colours, result.widths, result.places, result.alphas, result.panels].every(([equal, total]) => equal === total) && result.problems.length === 0;
  console.log(`verdict: ${whole ? `FOUND ${result.strings} strings, ${result.glyphs[1]} glyphs (${BUILD_NAME}), every byte, character, width, place and alpha equal` : 'PARTIAL see the lines marked !'}`);
  process.exit(whole ? 0 : 3);
}

if (process.argv[1] && process.argv[1].endsWith('verify_text2.mjs') && BUILD === 'hdd') {
  const dumpFile = process.argv[2].replace(/\.trace\.jsonl$/, '.gs');
  const result = verify(process.argv[2], process.argv[3] || undefined, fs.existsSync(dumpFile) ? dumpFile : null);
  const line = (name, [equal, total]) => console.log(`  ${name.padEnd(46)} ${equal} of ${total} equal`);
  console.log(`build: ${BUILD_NAME}   strings drawn: ${result.strings}   strings measured: ${result.measured}   characters asked for: ${result.characters} (${result.codes.size} distinct)`);
  line('opening packet of a string (TEST_1, ALPHA_1)', result.opens);
  line('glyph packet (CLAMP_1, fan of 12 vertices)', result.glyphs);
  line('picture uploaded to the cache', result.pictures);
  line('colour table sent when the cache is laid out', result.tables);
  line('texture set-up (TEX1_1, TEX0_1)', result.textures);
  line('string level: character, pen, colour, matrix', result.layout);
  line('place level: position, colour, size by caller', result.places);
  line('button pictures beside the hints (DrawIcon)', result.icons);
  line('alpha of a string, by the rule of its caller', result.alphas);
  line('button panels drawn, id and alpha', result.panels);
  line('list entries drawn: index, alpha, x, y, y of value', result.entries);
  for (const [key, values] of Object.entries(result.alphaValues)) { const v = [...values].sort((x, y) => x - y); console.log(`  alphas by ${key}: ${v.length} distinct, ${v[0]}..${v[v.length - 1]}`); }
  if (result.alphaCallers.size) console.log(`  strings whose alpha is not recomputed: ${[...result.alphaCallers].map(([name, count]) => `${name} x ${count}`).join(', ')}`);
  if (result.callers.size) console.log(`  strings from callers whose placing is not recomputed: ${[...result.callers].map(([name, count]) => `${name} x ${count}`).join(', ')}`);
  console.log(`  characters given up for want of room in the packet and asked for again: ${result.again}`);
  console.log(`  bytes compared and equal: ${result.bytes}; picture bytes the code leaves unwritten, not compared: ${result.unwritten}`);
  if (result.memory) {
    const m = result.memory;
    if (m.cells === 0) console.log('  GS memory at the start of the dump: the cache held nothing yet');
    else console.log(`  GS memory at the start of the dump: ${m.equal} of ${m.cells} loaded cells hold their glyph's picture (${m.pixels} pixels), colour table ${m.table ? 'equal' : 'DIFFERENT'}`);
    for (const text of m.problems.slice(0, 4)) console.log(`  ! ${text}`);
  }
  for (const [text, count] of [...result.texts].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`  ${String(count).padStart(4)} x ${JSON.stringify(text)}`);
  for (const text of result.problems) console.log(`  ! ${text}`);
  const whole = result.strings > 0 && [result.opens, result.glyphs, result.pictures, result.tables, result.textures, result.layout, result.places, result.icons, result.alphas, result.panels, result.entries].every(([equal, total]) => equal === total) && result.problems.length === 0
    && (!result.memory || result.memory.cells === 0 || (result.memory.equal === result.memory.cells && result.memory.table));
  console.log(`verdict: ${whole ? `FOUND ${result.strings} strings, ${result.glyphs[1]} glyphs (${BUILD_NAME}), every byte sent and every pen position equal` : 'PARTIAL see the lines marked !'}`);
  process.exit(whole ? 0 : 3);
}
