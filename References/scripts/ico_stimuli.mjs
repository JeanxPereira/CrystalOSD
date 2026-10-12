// Stimuli for verify_ico_decode.mjs: synthetic .ico members written over the resident ones (HDD OSD 1.10U destinations)
// before the Browser loads them, to drive module_browser_23B130 through the parts of its input space the shipped members never reach
// (shape counts 2..8, flag combinations, the RLE16 zero count, keyframe block limits, every rejection).
//
//   node ico_stimuli.mjs <case> [out.json] [rom]   the writes for `capture.mjs --writes @out.json` (frame 0)
//   node ico_stimuli.mjs list
//
// The destinations are those of the resource rows after the boot (verify_ico_decode.mjs compares them with the rows at every load).
// Cases that load one icon patch func_00253F90 0x00253F90 (kind -> ICOB index) so that every row asks for that member.
import fs from 'node:fs';

const DEST = { PS1M: 0x1e5a780, PS2M: 0x1e5dbc0, FHDD: 0x1e86bb0, FDIR: 0x1e8fa90, FFIL: 0x1ea0770 };
// ROM 2.30: only the 13 members the BIOS holds; no kind patch (the mapping function is not located).
const DEST_ROM = { PS1M: 0x1dcf4a0, PS2M: 0x1dd28e0 };
const INDEX = { DISC: 0, QUES: 12, FDIR: 14, FFIL: 15 };

class Out {
  constructor() { this.parts = []; }
  u32(value) { const b = Buffer.alloc(4); b.writeUInt32LE(value >>> 0); this.parts.push(b); return this; }
  f32(value) { const b = Buffer.alloc(4); b.writeFloatLE(value); this.parts.push(b); return this; }
  s16(value) { const b = Buffer.alloc(2); b.writeInt16LE(value); this.parts.push(b); return this; }
  u8(value) { this.parts.push(Buffer.from([value & 255])); return this; }
  bytes() { return Buffer.concat(this.parts); }
}

/** The RLE16 halfword streams: literal run (n < 0), repeat (n > 0), a zero count (consumes only itself). */
export const RLE_GOOD = [-3, 0x1111, 0x2222, 0x3333, 5, 0x4444, 0, 1, 0x6666, 16375, 0x5555];
export const RLE_SHORT = [-3, 0x1111, 0x2222, 0x3333, 5, 0x4444, 0, 1, 0x6666, 16300, 0x5555];

const keyDefault = [{ length: 59, scale: 1, offset: 0, shapeTracks: [{ shape: 0, keys: [[0, 1]] }] }];

/** One member. `header` overrides the five header words, `trackCount` the keyframe block's first word. */
export function buildIco({ shapes = 1, count = 3, flags = 3, headerFloat = 0, seed = 7, tracks = keyDefault, trackCount, rle = RLE_GOOD, header = {} }) {
  let x = seed >>> 0;
  const next = (range) => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return (x % (2 * range)) - range; };
  const o = new Out();
  o.u32(header.magic ?? 0x10000).u32(header.shapes ?? shapes).u32(header.flags ?? flags);
  if (header.float !== undefined) o.u32(header.float); else o.f32(headerFloat);
  o.u32(header.count ?? count);
  for (let v = 0; v < count; v++) {
    for (let k = 0; k < shapes; k++) o.s16(next(3000)).s16(next(3000)).s16(next(3000)).s16(0x7b7b);
    o.s16(next(4096)).s16(next(4096)).s16(next(4096)).s16(0x7b7b);
    o.s16(next(8192)).s16(next(8192));
    o.u8(next(128) + 128).u8(next(128) + 128).u8(next(128) + 128).u8(next(128) + 128);
  }
  o.u32(trackCount ?? tracks.length);
  for (const track of tracks) {
    o.u32(track.length).f32(track.scale).u32(track.offset).u32(track.shapeTracks.length);
    for (const shapeTrack of track.shapeTracks) {
      o.u32(shapeTrack.shape).u32(shapeTrack.keys.length);
      for (const [time, value] of shapeTrack.keys) o.f32(time).f32(value);
    }
  }
  if (flags & 4) {
    if (!(flags & 8)) throw new Error('a raw texture is 32 KB: not written by a stimulus');
    o.u32(rle.length * 2);
    for (const h of rle) o.s16(h);
  }
  const bytes = o.bytes();
  return Buffer.concat([bytes, Buffer.alloc((4 - (bytes.length % 4)) % 4)]);
}

const manyKeys = (n) => Array.from({ length: n }, (_, i) => [i, 1 + i / 4]);
const spread = (shape, tracks, keys) => [{ length: 1440, scale: 1, offset: 5, shapeTracks: Array.from({ length: tracks }, () => ({ shape, keys: manyKeys(keys) })) }];

export const CASES = {
  disc: { kind: 'DISC' },
  ques: { kind: 'QUES' },
  ffil: { kind: 'FFIL' },
  fdir: { kind: 'FDIR' },
  shapes: { PS1M: { shapes: 2, count: 150, flags: 15, headerFloat: 1.5 }, FHDD: { shapes: 4, count: 102, flags: 3, headerFloat: 0.3 }, PS2M: { shapes: 6, count: 87, flags: 14 } },
  keys: {
    PS1M: { shapes: 8, count: 60, flags: 8, headerFloat: 1 },
    FHDD: { shapes: 1, count: 138, flags: 3, tracks: spread(1, 8, 10) },
    PS2M: { shapes: 2, count: 30, flags: 9, tracks: spread(2, 0, 0) },
  },
  cap: { FDIR: { shapes: 1, count: 1800, flags: 3 }, kind: 'FDIR' },
  rej1: { PS1M: { header: { magic: 0x10001 } }, FHDD: { header: { shapes: 3 } }, PS2M: { header: { shapes: 9 } } },
  rej2: { PS1M: { header: { count: 397 } }, FHDD: { header: { count: 1803 } }, PS2M: { header: { float: 0xbf800000 } } },
  rej3: { PS1M: { trackCount: 2 }, FHDD: { tracks: spread(0, 9, 1) }, PS2M: { tracks: spread(2, 1, 1) } },
  rej4: { PS1M: { tracks: spread(0, 1, 11) }, FHDD: { flags: 15, rle: RLE_SHORT }, PS2M: { header: { shapes: 8, count: 1203 } } },
  rej5: { PS1M: { shapes: 2, header: { count: 1653 } }, FHDD: { shapes: 4, header: { count: 1503 } }, PS2M: { shapes: 6, header: { count: 1353 } } },
};

export function writesOf(name, rom = false) {
  const spec = CASES[name];
  if (!spec) throw new Error(`no case ${name}`);
  const dest = rom ? DEST_ROM : DEST;
  const writes = [];
  for (const [member, options] of Object.entries(spec)) {
    if (member === 'kind' || dest[member] === undefined) continue;
    writes.push({ frame: 0, address: `0x${dest[member].toString(16)}`, hex: buildIco(options).toString('hex') });
  }
  if (spec.kind && !rom) {
    writes.push({ frame: 0, address: '0x253f90', hex: `${INDEX[spec.kind].toString(16).padStart(2, '0')}000224` });
    writes.push({ frame: 0, address: '0x253f9c', hex: '00000000' });
  }
  return writes;
}

if (process.argv[1] && process.argv[1].endsWith('ico_stimuli.mjs')) {
  const [name, file, mode] = process.argv.slice(2);
  if (!name || name === 'list') { console.log(Object.keys(CASES).join(' ')); process.exit(0); }
  const text = JSON.stringify(writesOf(name, mode === 'rom'));
  if (file) fs.writeFileSync(file, text); else console.log(text);
}
