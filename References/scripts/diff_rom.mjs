// Compare a HDD OSD 1.10U function with its ROM 2.30 counterpart word by word, ignoring call
// targets, upper immediates and gp-relative offsets. Prints every word that still differs.
// node References/scripts/diff_rom.mjs <hdd hex> <rom hex> <length hex> ...
import fs from 'node:fs';
import { dataPath } from '../lib/data.mjs';
const dump = fs.readFileSync(dataPath('dumps/rom-0230A-clock-ee-00100000.bin')); const base = 0x100000;
const elf = fs.readFileSync(new URL('../../../hddosd-recomp-artifacts/hddosd.elf', import.meta.url));
const phoff = elf.readUInt32LE(28), phentsize = elf.readUInt16LE(42), phnum = elf.readUInt16LE(44);
const segs = []; for (let i = 0; i < phnum; i++) { const at = phoff + i * phentsize; if (elf.readUInt32LE(at) === 1) segs.push({ off: elf.readUInt32LE(at + 4), va: elf.readUInt32LE(at + 8), fsz: elf.readUInt32LE(at + 16) }); }
const ew = (a) => { for (const s of segs) if (a >= s.va && a + 4 <= s.va + s.fsz) return elf.readUInt32LE(s.off + a - s.va); return null; };
const norm = (w) => { const op = w >>> 26; if (op === 2 || op === 3) return (op << 26) >>> 0; if (op === 15) return (w & 0xffff0000) >>> 0; const rs = (w >>> 21) & 31; if (op >= 8 && ![16, 17, 18, 28].includes(op) && rs === 28) return (w & 0xffff0000) >>> 0; return w >>> 0; };
const args = process.argv.slice(2).map((t) => parseInt(t, 16));
for (let n = 0; n + 2 < args.length; n += 3) {
  const [hdd, rom, length] = args.slice(n, n + 3);
  const different = [];
  for (let i = 0; i < length; i += 4) {
    const a = ew(hdd + i), b = dump.readUInt32LE(rom - base + i);
    if (norm(a) !== norm(b)) different.push(`+0x${i.toString(16)} hdd ${a.toString(16).padStart(8, '0')} rom ${b.toString(16).padStart(8, '0')}`);
  }
  console.log(`HDD 0x${hdd.toString(16)} vs ROM 0x${rom.toString(16)}, 0x${length.toString(16)} bytes: ${different.length} words differ`);
  for (const line of different) console.log('  ' + line);
}
