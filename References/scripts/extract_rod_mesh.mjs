// Write the rod mesh of the crystal clock as data, from the HDD OSD 1.10U file, and check it
// against the same tables in a ROM 2.30 memory dump.
// node References/scripts/extract_rod_mesh.mjs
import fs from 'node:fs';
import { dataPath } from '../lib/data.mjs';
const elf = fs.readFileSync(new URL('../../../hddosd-recomp-artifacts/hddosd.elf', import.meta.url));
const phoff = elf.readUInt32LE(28), phentsize = elf.readUInt16LE(42), phnum = elf.readUInt16LE(44);
const segs = []; for (let i = 0; i < phnum; i++) { const at = phoff + i * phentsize; if (elf.readUInt32LE(at) === 1) segs.push({ off: elf.readUInt32LE(at + 4), va: elf.readUInt32LE(at + 8), fsz: elf.readUInt32LE(at + 16) }); }
const hdd = (address, length) => { for (const s of segs) if (address >= s.va && address + length <= s.va + s.fsz) return elf.subarray(s.off + address - s.va, s.off + address - s.va + length); throw new Error(`0x${address.toString(16)} is not in the file`); };
const dump = fs.readFileSync(dataPath('dumps/rom-0230A-clock-ee-00100000.bin'));
const rom = (address, length) => dump.subarray(address - 0x100000, address - 0x100000 + length);

const TEMPLATE = { hdd: 0x002b5490, rom: 0x00296450 };
const record = hdd(TEMPLATE.hdd, 0xe0), romRecord = rom(TEMPLATE.rom, 0xe0);
const faces = record.readInt32LE(4);
const tables = [['positions', 8, faces * 64], ['normals', 12, faces * 16], ['coordinates', 16, faces * 64]];
const out = { build: 'HDD OSD 1.10U', template: '0x002B5490', faces, strip: 'each face is a triangle strip of four vertices' };
let same = true;
for (const [name, at, length] of tables) {
  const a = record.readUInt32LE(at), b = romRecord.readUInt32LE(at);
  const bytes = hdd(a, length);
  const equal = bytes.equals(rom(b, length));
  same &&= equal;
  console.log(`${name}: HDD 0x${a.toString(16)}, ROM 0x${b.toString(16)}, ${length} bytes, ${equal ? 'equal' : 'DIFFERENT'}`);
  out[name] = { address: `0x${a.toString(16).padStart(8, '0')}`, bits: Array.from({ length: length / 4 }, (_, i) => bytes.readUInt32LE(i * 4).toString(16).padStart(8, '0')), values: Array.from({ length: length / 4 }, (_, i) => bytes.readFloatLE(i * 4)) };
}
console.log(`faces: HDD ${faces}, ROM ${romRecord.readInt32LE(4)}`);
fs.writeFileSync('facts/data/rod-mesh.json', JSON.stringify(out, null, 1) + '\n');
console.log(`verdict: ${same && faces === romRecord.readInt32LE(4) ? 'FOUND the mesh, equal in both builds' : 'PARTIAL the builds differ'}`);
