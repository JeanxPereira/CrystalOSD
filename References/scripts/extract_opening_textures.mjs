// The opening's textures (HDD OSD 1.10U, facts/opening.md section 2) decoded from GS memory as RGBA8 PNG files.
// The memory is the dump's start memory with the dump's own host-to-local transfers replayed into it (the module
// uploads its textures in dump frame 5). PSMCT32 and PSMCT16; PSMCT16 expands as the GS does: each 5-bit channel c
// becomes c << 3, alpha is TEXA.TA1 with bit 15 set else TEXA.TA0, TEXA.AEM zeroes alpha of black texels.
//   node extract_opening_textures.mjs <dump.gs> <out dir> [--check <passes.json>] [--max-frame N]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { word32, png } from './extract_buffers.mjs';

const BLOCK16 = [[0, 2, 8, 10], [1, 3, 9, 11], [4, 6, 12, 14], [5, 7, 13, 15], [16, 18, 24, 26], [17, 19, 25, 27], [20, 22, 28, 30], [21, 23, 29, 31]];
/** Halfword address of a PSMCT16 pixel: pages of 64 x 64, blocks of 16 x 8, columns of 16 x 2, all in the GS's order. */
const word16 = (bp, bw, x, y) => (bp + ((x >> 6) + (y >> 6) * bw) * 32 + BLOCK16[(y >> 3) & 7][(x >> 4) & 3]) * 128
  + ((y >> 1) & 3) * 32 + (y & 1) * 4 + (x & 1) * 2 + ((x >> 1) & 3) * 8 + ((x >> 3) & 1);

function decodeCt32(memory, bp, bw, width, height) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = word32(bp, bw, x, y) * 4;
    memory.copy(rgba, (y * width + x) * 4, at, at + 4);
  }
  return rgba;
}

function decodeCt16(memory, bp, bw, width, height, texa) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const v = memory.readUInt16LE(word16(bp, bw, x, y) * 2), o = (y * width + x) * 4;
    rgba[o] = (v & 31) << 3; rgba[o + 1] = ((v >> 5) & 31) << 3; rgba[o + 2] = ((v >> 10) & 31) << 3;
    rgba[o + 3] = texa.AEM && (v & 0x7fff) === 0 ? 0 : v & 0x8000 ? texa.TA1 : texa.TA0;
  }
  return rgba;
}

class GifPath {
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

const BYTES = { 0: 4, 1: 3, 2: 2 };

/** Replays the host-to-local transfers of the dump's packets up to frame maxFrame into `memory`; returns one entry per transfer. */
function replayUploads(memory, packets, { maxFrame = 10 } = {}) {
  const regs = { bitbltbuf: 0n, trxpos: 0n, trxreg: 0n };
  const paths = [new GifPath(), new GifPath(), new GifPath(), new GifPath()];
  const uploads = [];
  let frame = 0, current = null;
  const sink = {
    write(reg, value) {
      if (reg === 0x50) regs.bitbltbuf = value;
      else if (reg === 0x51) regs.trxpos = value;
      else if (reg === 0x52) regs.trxreg = value;
      else if (reg === 0x53) {
        current = null;
        if ((value & 3n) !== 0n || frame > maxFrame) return;
        const b = regs.bitbltbuf, p = regs.trxpos, r = regs.trxreg;
        const psm = Number((b >> 56n) & 63n);
        if (!(psm in BYTES)) throw new Error(`upload to unsupported PSM 0x${psm.toString(16)}`);
        current = {
          frame, dbp: Number((b >> 32n) & 0x3fffn), dbw: Number((b >> 48n) & 63n), psm,
          width: Number(r & 0xffffn), height: Number((r >> 32n) & 0xffffn),
          dsax: Number(p & 0x7ffn), dsay: Number((p >> 16n) & 0x7ffn), got: 0, bytes: BYTES[psm],
        };
        uploads.push(current);
      }
    },
    image(data) {
      const u = current;
      if (!u) return;
      const total = u.width * u.height * u.bytes;
      for (let i = 0; i < data.length && u.got < total; i++, u.got++) {
        const texel = Math.floor(u.got / u.bytes), within = u.got % u.bytes;
        const x = u.dsax + (texel % u.width), y = u.dsay + Math.floor(texel / u.width);
        const at = u.psm === 2 ? word16(u.dbp, u.dbw, x, y) * 2 + within : word32(u.dbp, u.dbw, x, y) * 4 + within;
        memory[at] = data[i];
      }
    },
  };
  for (const packet of packets) {
    if (packet.type === 'vsync') frame += 1;
    else if (packet.type === 'transfer') paths[packet.path].feed(packet.data, sink);
  }
  return uploads.map(({ frame, dbp, dbw, psm, width, height }) => ({ frame, dbp, dbw, psm, width, height }));
}

const TEXA = { TA0: 127, TA1: 129, AEM: 1 };
const RESOURCES = { 0: 35, 2: 29, 3: 34, 5: 30, 6: 26, 8: 36, 10: 31, 11: 27, 12: 32 };
const TEXTURES = [
  { index: 0, tbp0: 0x2bc0, tbw: 4, psm: 0, width: 256, height: 64, mapping: 'settled', basis: 'upload 0x2bc0 is the only 256x64 CT32; the logo draws (120) use it' },
  { index: 2, tbp0: 0x2cc0, tbw: 1, psm: 2, width: 64, height: 64, mapping: 'settled', basis: 'fog passes use 2d20, 2ce0, 2cc0 in that order = D_003653E8 (5, 3, 2); consecutive allocation 2cc0 = index 2' },
  { index: 3, tbp0: 0x2ce0, tbw: 1, psm: 2, width: 64, height: 64, mapping: 'settled', basis: 'fog passes use 2d20, 2ce0, 2cc0 in that order = D_003653E8 (5, 3, 2); consecutive allocation 2ce0 = index 3' },
  { index: 5, tbp0: 0x2d20, tbw: 1, psm: 2, width: 64, height: 64, mapping: 'settled', basis: 'fog passes use 2d20, 2ce0, 2cc0 in that order = D_003653E8 (5, 3, 2); consecutive allocation 2d20 = index 5' },
  { index: 6, tbp0: 0x2d40, tbw: 4, psm: 2, width: 256, height: 256, mapping: 'settled', basis: 'only 256x256 CT16; the tower draws of opening2-ee-a use 0x2d40' },
  { index: 8, tbp0: 0x3020, tbw: 1, psm: 0, width: 64, height: 64, mapping: 'inferred', basis: 'allocation order and draw count only: 3020 is drawn 217 times (lights run 7..224); the loader was not read' },
  { index: 10, tbp0: 0x3060, tbw: 2, psm: 2, width: 128, height: 128, mapping: 'inferred', basis: 'allocation order and size only: the only 128x128 CT16 that is drawn (3976 draws, mirror map); the loader was not read' },
  { index: 11, tbp0: 0x30e0, tbw: 1, psm: 0, width: 64, height: 64, mapping: 'inferred', basis: 'allocation order only: 30e0 before 3120, 1988 draws each, so 11 and 12 could be swapped; the loader was not read' },
  { index: 12, tbp0: 0x3120, tbw: 1, psm: 0, width: 64, height: 64, mapping: 'inferred', basis: 'allocation order only: 30e0 before 3120, 1988 draws each, so 11 and 12 could be swapped; the loader was not read' },
];
const textureId = (t) => `t${t.tbp0.toString(16).padStart(4, '0')}-${t.tbw}-${t.psm}-${Math.log2(t.width)}x${Math.log2(t.height)}`;

export { word16, word32, decodeCt16, decodeCt32, replayUploads, TEXTURES, textureId };

async function main(args) {
  const take = (flag) => { const i = args.indexOf(flag); return i < 0 ? null : args.splice(i, 2)[1]; };
  const checkFile = take('--check'), maxFrame = Number(take('--max-frame') ?? 10);
  const [dumpFile, outDir] = args;
  if (!dumpFile || !outDir) { console.error('usage: node extract_opening_textures.mjs <dump.gs> <out dir> [--check <passes.json>] [--max-frame N]'); process.exit(2); }
  const DIST = (process.env.WATSON_DIST ?? 'D:/CodingProjects/Watson/Server/dist').replace(/\\/g, '/').replace(/\/$/, '');
  const { dumpPackets } = await import(`file:///${DIST}/gsdump.js`);
  const dump = fs.readFileSync(dumpFile);
  const headerSize = dump.readUInt32LE(4), stateSize = dump.readUInt32LE(12);
  const TAIL = (16 + 4) * 4 + 4, MEMORY = 0x400000;
  const memory = Buffer.from(dump.subarray(8 + headerSize + stateSize - TAIL - MEMORY, 8 + headerSize + stateSize - TAIL));
  const uploads = replayUploads(memory, dumpPackets(dump), { maxFrame });
  console.log(`${uploads.length} uploads replayed: ${uploads.map((u) => `0x${u.dbp.toString(16)}@${u.frame}`).join(' ')}`);
  const capture = path.basename(dumpFile, '.gs');
  fs.mkdirSync(outDir, { recursive: true });
  const manifest = [];
  for (const t of TEXTURES) {
    const rgba = t.psm === 2 ? decodeCt16(memory, t.tbp0, t.tbw, t.width, t.height, TEXA) : decodeCt32(memory, t.tbp0, t.tbw, t.width, t.height);
    const upload = uploads.find((u) => u.dbp === t.tbp0 && u.psm === t.psm && u.width === t.width && u.height === t.height);
    const file = `tex${t.index}-${t.width}x${t.height}.png`;
    const target = path.join(outDir, file);
    if (fs.existsSync(target)) console.log(`${file}: exists, left as it is`);
    else fs.writeFileSync(target, png(t.width, t.height, rgba));
    let nonzero = 0, low = 255, high = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i] | rgba[i + 1] | rgba[i + 2]) nonzero += 1;
      low = Math.min(low, rgba[i + 3]); high = Math.max(high, rgba[i + 3]);
    }
    console.log(`${file}: mapping ${t.mapping}${t.mapping === 'inferred' ? ` (${t.basis})` : ''}; upload ${upload ? `frame ${upload.frame}` : 'NOT FOUND'}, alpha ${low}..${high}, ${nonzero} of ${t.width * t.height} texels not black`);
    manifest.push({
      index: t.index, resource: RESOURCES[t.index], width: t.width, height: t.height, tbp0: t.tbp0, tbw: t.tbw, psm: t.psm, file, mapping: t.mapping, basis: t.basis,
      ...(t.psm === 2 ? { texa: TEXA } : {}), source: { capture, frame: upload ? upload.frame : null },
    });
  }
  const manifestFile = path.join(outDir, 'manifest.json');
  if (fs.existsSync(manifestFile)) console.log('manifest.json: exists, left as it is');
  else fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  if (checkFile) {
    const passes = JSON.parse(fs.readFileSync(checkFile, 'utf8'));
    const seen = new Map();
    for (const f of passes.frames) if (f) for (const p of f.passes) if (p.texture?.source.image) seen.set(p.texture.source.image, (seen.get(p.texture.source.image) ?? 0) + 1);
    let bad = 0;
    for (const t of TEXTURES) {
      const n = seen.get(textureId(t)) ?? 0;
      console.log(`check ${textureId(t)} (index ${t.index}): ${n} draws`);
      if (t.mapping === 'inferred') console.log(`check index ${t.index}: INFERRED, ${t.basis}`);
      if (n < 5 && t.index !== 6) bad += 1;
    }
    for (const id of seen.keys()) if (!TEXTURES.some((t) => textureId(t) === id)) { console.log(`check: draws use ${id}, not in the manifest`); bad += 1; }
    if (bad) process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
