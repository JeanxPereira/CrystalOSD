// Write the mesh and the record of the System Configuration cubes as data, from the HDD OSD
// 1.10U file, and check them against the same tables in a ROM 2.30 memory dump.
// node References/scripts/extract_cube_mesh.mjs
import fs from 'node:fs';
import { dataPath } from '../lib/data.mjs';
const elf = fs.readFileSync(new URL('../../../hddosd-recomp-artifacts/hddosd.elf', import.meta.url));
const phoff = elf.readUInt32LE(28), phentsize = elf.readUInt16LE(42), phnum = elf.readUInt16LE(44);
const segs = []; for (let i = 0; i < phnum; i++) { const at = phoff + i * phentsize; if (elf.readUInt32LE(at) === 1) segs.push({ off: elf.readUInt32LE(at + 4), va: elf.readUInt32LE(at + 8), fsz: elf.readUInt32LE(at + 16) }); }
const hdd = (address, length) => { for (const s of segs) if (address >= s.va && address + length <= s.va + s.fsz) return elf.subarray(s.off + address - s.va, s.off + address - s.va + length); throw new Error(`0x${address.toString(16)} is not in the file`); };
const dump = fs.readFileSync(dataPath('dumps/rom-0230A-clock-ee-00100000.bin'));
const rom = (address, length) => dump.subarray(address - 0x100000, address - 0x100000 + length);
const hex = (address) => `0x${address.toString(16).padStart(8, '0')}`;

const TEMPLATE = { hdd: 0x002b5af0, rom: 0x00296ab0 };
const COLOURS = { hdd: 0x002b5750, rom: 0x00296710 };
const record = hdd(TEMPLATE.hdd, 0xe0), romRecord = rom(TEMPLATE.rom, 0xe0);
const faces = record.readInt32LE(4);
const ints = (bytes, at, count) => Array.from({ length: count }, (_, i) => bytes.readInt32LE(at + 4 * i));
const floats = (bytes, at, count) => Array.from({ length: count }, (_, i) => bytes.readFloatLE(at + 4 * i));

const out = {
  build: 'HDD OSD 1.10U', template: hex(TEMPLATE.hdd), faces, strip: 'each face is a triangle strip of four vertices',
  record: {
    scale: floats(record, 0x68, 3), colour: ints(record, 0x80, 4), highlightStrength: record.readFloatLE(0x90), grainColour: ints(record, 0xa0, 4),
    grainOffset: floats(record, 0xb0, 2), refractionStrength: record.readFloatLE(0xb8), reflectionColour: ints(record, 0xc0, 4),
  },
  colours: { address: hex(COLOURS.hdd), selected: ints(hdd(COLOURS.hdd, 0x20), 0, 4), plain: ints(hdd(COLOURS.hdd, 0x20), 0x10, 4) },
};
let same = true;
for (const [name, at, length] of [['positions', 8, faces * 64], ['normals', 12, faces * 16], ['coordinates', 16, faces * 64]]) {
  const a = record.readUInt32LE(at), b = romRecord.readUInt32LE(at);
  const bytes = hdd(a, length);
  const equal = bytes.equals(rom(b, length));
  same &&= equal;
  console.log(`${name}: HDD ${hex(a)}, ROM ${hex(b)}, ${length} bytes, ${equal ? 'equal' : 'DIFFERENT'}`);
  out[name] = { address: hex(a), bits: Array.from({ length: length / 4 }, (_, i) => bytes.readUInt32LE(i * 4).toString(16).padStart(8, '0')), values: floats(bytes, 0, length / 4) };
}
// The record but for its three table pointers, its two matrix pointers and what the code writes each frame.
const skipped = (at) => (at >= 8 && at < 0x14) || (at >= 0x20 && at < 0x74) || (at >= 0x80 && at < 0x90) || at === 0xcc;
let recordSame = true;
for (let at = 0; at < 0xe0; at += 4) if (!skipped(at) && record.readUInt32LE(at) !== romRecord.readUInt32LE(at)) { recordSame = false; console.log(`record +0x${at.toString(16)}: HDD ${record.readUInt32LE(at).toString(16)}, ROM dump ${romRecord.readUInt32LE(at).toString(16)}`); }
const coloursSame = hdd(COLOURS.hdd, 0x20).equals(rom(COLOURS.rom, 0x20));
console.log(`faces: HDD ${faces}, ROM ${romRecord.readInt32LE(4)}   constants of the record: ${recordSame ? 'equal' : 'DIFFERENT'}   the two colours: ${coloursSame ? 'equal' : 'DIFFERENT'}`);
const p = out.positions.values;
const extent = [0, 1, 2].map((axis) => { const xs = p.filter((_, i) => i % 4 === axis); return [Math.min(...xs), Math.max(...xs)]; });
console.log(`extent: x ${extent[0]}, y ${extent[1]}, z ${extent[2]}`);
out.extent = extent;
fs.mkdirSync('References/model', { recursive: true });
fs.writeFileSync('References/model/cube-mesh.json', JSON.stringify(out, null, 1) + '\n');
const whole = same && recordSame && coloursSame && faces === romRecord.readInt32LE(4);
console.log(`verdict: ${whole ? 'FOUND the cube mesh, record constants and colours, equal in both builds' : 'PARTIAL the builds differ'}`);
