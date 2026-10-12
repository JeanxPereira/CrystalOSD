// Find the HDD OSD 1.10U function whose first 16 instructions match a ROM 2.30 function.
// node References/scripts/find_in_hdd.mjs <rom hex> ...
import fs from 'node:fs';
import { dataPath } from '../lib/data.mjs';
const dump = fs.readFileSync(dataPath('dumps/rom-0230A-clock-ee-00100000.bin')); const base = 0x100000;
const elf = fs.readFileSync(new URL('../../../hddosd-recomp-artifacts/hddosd.elf', import.meta.url));
const phoff = elf.readUInt32LE(28), phentsize = elf.readUInt16LE(42), phnum = elf.readUInt16LE(44);
const segs = []; for (let i = 0; i < phnum; i++) { const at = phoff + i * phentsize; if (elf.readUInt32LE(at) === 1) segs.push({ off: elf.readUInt32LE(at + 4), va: elf.readUInt32LE(at + 8), fsz: elf.readUInt32LE(at + 16) }); }
const ew = (a) => { for (const s of segs) if (a >= s.va && a + 4 <= s.va + s.fsz) return elf.readUInt32LE(s.off + a - s.va); return 0; };
const norm = (w) => { const op = w >>> 26; if (op === 2 || op === 3) return (op << 26) >>> 0; if (op === 15) return (w & 0xffff0000) >>> 0; const rs = (w >>> 21) & 31; if (op >= 8 && ![16, 17, 18, 28].includes(op) && rs === 28) return (w & 0xffff0000) >>> 0; return w >>> 0; };
for (const rom of process.argv.slice(2).map((t) => parseInt(t, 16))) {
  const head = []; for (let i = 0; i < 16; i++) head.push(norm(dump.readUInt32LE(rom - base + 4 * i)));
  let best = { same: -1, at: 0 };
  for (let a = 0x200000; a < 0x2a0000; a += 4) { let same = 0; for (let i = 0; i < 16; i++) if (norm(ew(a + 4 * i)) === head[i]) same++; if (same > best.same) best = { same, at: a }; }
  console.log(`ROM 0x${rom.toString(16)} -> HDD 0x${best.at.toString(16)} head ${best.same}/16`);
}
