// Where the opening's code and data of HDD OSD 1.10U sit in ROM 2.30. Every function of the
// CrystalOSD disassembly's opening and graph modules (and those of core they call) is looked for
// in a ROM 2.30 memory dump by its first instructions; when the two have the same instructions
// (apart from call targets, upper immediates, the low halves of addresses and gp-relative
// offsets), every address either one forms is paired with the other's. The result maps HDD OSD
// function, data and gp-relative addresses to ROM 2.30's, so that a probe written for one build
// can be placed in the other.
//
// node extract_opening_rom_map.mjs            writes References/model/opening-rom-map.json
import { dataPath } from '../lib/data.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { readElf } from './extract_opening_vu1.mjs';

const ASM = process.env.CRYSTALOSD_ASM ?? 'D:/CodingProjects/CrystalOSD-Decomp-Legacy/asm';
const DUMP = dataPath('dumps/rom-0230A-clock-ee-00100000.bin');
const DUMP_BASE = 0x00100000;
const GP = { hdd: 0x00377970, rom: null };
const MODULES = ['opening', 'graph', 'core'];

/** [address, size, name] of every function of a module. */
function functionsOf(module) {
  const out = [];
  const dir = path.join(ASM, module);
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.s')) continue;
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    const size = /^nonmatching (\S+), (0x[0-9A-Fa-f]+)/m.exec(text);
    const first = /^glabel (\S+)[^\n]*\n\s*\/\* \S+ ([0-9A-F]{8}) /m.exec(text);
    if (size && first) out.push([parseInt(first[2], 16), parseInt(size[2], 16), first[1], module]);
  }
  return out;
}

const simm = (w) => ((w & 0xffff) << 16) >> 16;
/** An instruction with what moves between builds removed. */
function norm(w) {
  const op = w >>> 26;
  if (op === 2 || op === 3) return (op << 26) >>> 0;                 // j, jal
  if (op === 15) return (w & 0xffff0000) >>> 0;                      // lui
  const rs = (w >>> 21) & 31;
  if (op >= 8 && ![16, 17, 18, 28].includes(op)) return (w & 0xffff0000) >>> 0;   // immediates, loads, stores
  if (op === 1 || (op >= 4 && op <= 7) || (op >= 20 && op <= 23)) return w >>> 0; // branches keep their offsets
  void rs;
  return w >>> 0;
}

export function build(gpRom) {
  const elf = readElf();
  const dump = fs.readFileSync(DUMP);
  const rom = (address) => dump.readUInt32LE(address - DUMP_BASE);
  const hdd = (address) => elf(address, 4).readUInt32LE(0);
  const all = MODULES.flatMap(functionsOf);
  // The ROM's words by normalised value, to find a function's head quickly.
  const index = new Map();
  for (let a = 0x00200000; a < 0x002a0000; a += 4) { const key = norm(rom(a)); if (!index.has(key)) index.set(key, []); index.get(key).push(a); }

  const map = { gp: { hdd: GP.hdd, rom: gpRom }, functions: {}, different: {}, data: {}, conflicts: [] };
  const pair = (from, to, where) => {
    const known = map.data[from];
    if (known !== undefined && known !== to) { map.conflicts.push(`0x${from.toString(16)}: 0x${known.toString(16)} and 0x${to.toString(16)} (${where})`); return; }
    map.data[from] = to;
  };
  for (const [address, size, name, module] of all) {
    const count = size >> 2;
    const head = Math.min(count, 12);
    const candidates = (index.get(norm(hdd(address))) ?? []).filter((a) => {
      for (let i = 1; i < head; i++) if (norm(rom(a + i * 4)) !== norm(hdd(address + i * 4))) return false;
      return true;
    });
    // Short functions are found in many places; keep those that match over their whole length.
    const whole = candidates.filter((a) => { for (let i = 0; i < count; i++) if (norm(rom(a + i * 4)) !== norm(hdd(address + i * 4))) return false; return true; });
    if (whole.length !== 1) {
      if (module !== 'core') map.different[`0x${address.toString(16)}`] = { name, size, candidates: candidates.map((a) => `0x${a.toString(16)}`), whole: whole.length };
      continue;
    }
    const at = whole[0];
    map.functions[address] = { rom: at, size, name };
    const upperH = new Array(32).fill(null), upperR = new Array(32).fill(null);
    for (let i = 0; i < count; i++) {
      const a = hdd(address + i * 4), b = rom(at + i * 4);
      const op = a >>> 26, rs = (a >>> 21) & 31, rt = (a >>> 16) & 31;
      if (op === 15) { upperH[rt] = (a & 0xffff) << 16; upperR[rt] = (b & 0xffff) << 16; continue; }
      if (op === 3 || op === 2) { pair(((a & 0x3ffffff) << 2) >>> 0, ((b & 0x3ffffff) << 2) >>> 0, name); continue; }
      const uses = op === 9 || op === 13 || (op >= 32 && op <= 63 && ![47, 51].includes(op)) || op === 26 || op === 27 || op === 24 || op === 25 || op === 30 || op === 31;
      if (uses && rs === 28) { pair((GP.hdd + simm(a)) >>> 0, (gpRom + simm(b)) >>> 0, `${name} gp`); continue; }
      if (!uses || upperH[rs] === null) {
        // Nothing here may move between builds: the two words must be the same.
        if (a !== b) (map.functions[address].unequal ??= []).push(`+0x${(i * 4).toString(16)}: ${a.toString(16).padStart(8, '0')} / ${b.toString(16).padStart(8, '0')}`);
        continue;
      }
      if (upperH[rs] !== null) {
        const fromAddress = op === 13 ? (upperH[rs] | (a & 0xffff)) >>> 0 : (upperH[rs] + simm(a)) >>> 0;
        const toAddress = op === 13 ? (upperR[rs] | (b & 0xffff)) >>> 0 : (upperR[rs] + simm(b)) >>> 0;
        if (fromAddress >= 0x00100000 && fromAddress < 0x02000000) pair(fromAddress, toAddress, name);
        // An addiu or ori into the same register finishes the address; a load or store uses it once.
        if ((op === 9 || op === 13) && rt === rs) { upperH[rs] = null; upperR[rs] = null; }
      }
    }
  }
  return map;
}

/** A translator from HDD OSD addresses to ROM 2.30's, from the saved map. */
export function translator() {
  const saved = JSON.parse(fs.readFileSync(new URL('../model/opening-rom-map.json', import.meta.url), 'utf8'));
  const functions = Object.entries(saved.functions).map(([from, f]) => [parseInt(from, 16), parseInt(f.rom, 16), f.size]).sort((a, b) => a[0] - b[0]);
  const data = new Map(Object.entries(saved.data).map(([from, to]) => [parseInt(from, 16), parseInt(to, 16)]));
  const sorted = [...data.keys()].sort((a, b) => a - b);
  return {
    code(address) {
      const found = functions.find(([from, , size]) => address >= from && address < from + size);
      return found ? found[1] + (address - found[0]) : null;
    },
    /** A data address: its own pair, else the pair of the nearest address below it within 0x4000, kept only when the one above agrees. */
    data(address) {
      if (address >= 0x70000000) return address;
      if (data.has(address)) return data.get(address);
      let lo = 0, hi = sorted.length - 1, below = null;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (sorted[mid] <= address) { below = mid; lo = mid + 1; } else hi = mid - 1; }
      if (below === null || address - sorted[below] > 0x4000) return null;
      const shift = data.get(sorted[below]) - sorted[below];
      const above = sorted[below + 1];
      if (above !== undefined && data.get(above) - above !== shift) return null;
      return address + shift;
    },
  };
}

if (process.argv[1] && process.argv[1].endsWith('extract_opening_rom_map.mjs')) {
  const gpRom = parseInt(process.argv[2] ?? '0', 16);
  if (!gpRom) throw new Error('give ROM 2.30\'s gp (hex), as a probe of any ROM trace records it');
  const map = build(gpRom);
  const hex = (x) => `0x${x.toString(16).padStart(8, '0')}`;
  const out = {
    builds: 'HDD OSD 1.10U -> ROM 2.30', gp: { hdd: hex(map.gp.hdd), rom: hex(map.gp.rom) },
    functions: Object.fromEntries(Object.entries(map.functions).map(([from, f]) => [hex(Number(from)), { rom: hex(f.rom), size: f.size, name: f.name, ...(f.unequal ? { unequal: f.unequal } : {}) }])),
    different: map.different,
    data: Object.fromEntries(Object.entries(map.data).sort((a, b) => a[0] - b[0]).map(([from, to]) => [hex(Number(from)), hex(to)])),
    conflicts: map.conflicts,
  };
  fs.writeFileSync(new URL('../model/opening-rom-map.json', import.meta.url), JSON.stringify(out, null, 1));
  console.log(`functions found whole in ROM 2.30: ${Object.keys(out.functions).length}; opening and graph functions not found whole: ${Object.keys(out.different).length}; addresses paired: ${Object.keys(out.data).length}; conflicts: ${out.conflicts.length}`);
  for (const [address, d] of Object.entries(out.different)) console.log(`  not the same code: ${address} ${d.name} (0x${d.size.toString(16)} bytes; heads found: ${d.candidates.join(' ') || 'none'})`);
  for (const [address, f] of Object.entries(out.functions)) if (f.unequal) console.log(`  same shape, ${f.unequal.length} words unequal: ${address} ${f.name}: ${f.unequal.slice(0, 4).join('  ')}`);
  for (const text of out.conflicts.slice(0, 12)) console.log(`  conflict ${text}`);
}
