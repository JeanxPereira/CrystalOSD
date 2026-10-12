// Read words from the HDD OSD 1.10U ELF by virtual address.
// node elf_words.mjs <hex address> <count> [f: as floats]
import { dataPath } from '../lib/data.mjs';
import fs from 'node:fs';
const elf = fs.readFileSync(dataPath('dumps/hddosd-host/hddosd.elf'));
const phoff = elf.readUInt32LE(28), phentsize = elf.readUInt16LE(42), phnum = elf.readUInt16LE(44);
const segs = [];
for (let i = 0; i < phnum; i++) { const at = phoff + i * phentsize; if (elf.readUInt32LE(at) === 1) segs.push({ off: elf.readUInt32LE(at + 4), va: elf.readUInt32LE(at + 8), fsz: elf.readUInt32LE(at + 16) }); }
export const word = (a) => { for (const s of segs) if (a >= s.va && a + 4 <= s.va + s.fsz) return elf.readUInt32LE(s.off + a - s.va); return null; };
if (process.argv[1].endsWith('elf_words.mjs')) {
  const [at, n = 1, as] = process.argv.slice(2);
  const b = Buffer.alloc(4);
  for (let i = 0; i < Number(n); i++) { const a = parseInt(at, 16) + 4 * i, w = word(a); b.writeUInt32LE(w ?? 0); console.log(`0x${a.toString(16)}: 0x${(w ?? 0).toString(16).padStart(8, '0')}${as === 'f' ? ` ${b.readFloatLE(0)}` : ''}`); }
}
