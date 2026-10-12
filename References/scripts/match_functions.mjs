// Find, for functions of one OSDSYS build given by entry address, where the same code sits in
// the HDD OSD ELF. Instructions are compared after removing what moves between builds: jump
// targets, upper immediates and gp-relative offsets.
//
// Step 1 looks for the function's first instructions anywhere in the ELF's code. Step 2 aligns
// the two whole functions (longest common subsequence), so inserted or removed instructions do
// not count against everything after them.
//
// node match_functions.mjs <ee dump.bin> <dump base hex> <hddosd.elf> <symbol_addrs.txt> <entry hex>...
import fs from 'node:fs';

const [dumpFile, baseText, elfFile, symbolFile, ...entries] = process.argv.slice(2);
const dump = fs.readFileSync(dumpFile);
const base = parseInt(baseText, 16);
const elf = fs.readFileSync(elfFile);

function loadSegments(file) {
  if (file.readUInt32BE(0) !== 0x7f454c46) throw new Error('not an ELF');
  const phoff = file.readUInt32LE(28);
  const phentsize = file.readUInt16LE(42);
  const phnum = file.readUInt16LE(44);
  const segments = [];
  for (let i = 0; i < phnum; i++) {
    const at = phoff + i * phentsize;
    if (file.readUInt32LE(at) !== 1) continue;
    segments.push({ offset: file.readUInt32LE(at + 4), vaddr: file.readUInt32LE(at + 8), size: file.readUInt32LE(at + 16) });
  }
  return segments;
}
const segments = loadSegments(elf);
function elfWord(address) {
  for (const s of segments) if (address >= s.vaddr && address + 4 <= s.vaddr + s.size) return elf.readUInt32LE(s.offset + address - s.vaddr);
  return null;
}
const dumpWord = (address) => (address >= base && address + 4 <= base + dump.length ? dump.readUInt32LE(address - base) : null);

function normalize(word) {
  const op = word >>> 26;
  if (op === 2 || op === 3) return (op << 26) >>> 0;                 // j, jal: target moves
  if (op === 15) return (word & 0xffff0000) >>> 0;                    // lui: upper half of an address
  const rs = (word >>> 21) & 31;
  const immediate = op >= 8 && op !== 16 && op !== 17 && op !== 18 && op !== 28;
  if (immediate && rs === 28) return (word & 0xffff0000) >>> 0;       // gp-relative
  return word >>> 0;
}

const JR_RA = 0x03e00008;
const isPrologue = (word) => word !== null && (word >>> 16) === 0x27bd && (word & 0x8000) !== 0;   // addiu sp,sp,-N

/** Words of the function at `entry`: up to the delay slot of the last `jr ra` before the next prologue. */
function functionWords(read, entry) {
  const words = [];
  let lastReturn = -1;
  for (let i = 0; i < 4000; i++) {
    const word = read(entry + 4 * i);
    if (word === null) break;
    if (i > 0 && isPrologue(word) && lastReturn >= 0 && i > lastReturn + 1) break;
    words.push(word);
    if (word === JR_RA) lastReturn = i;
  }
  return lastReturn >= 0 ? words.slice(0, lastReturn + 2) : words;
}

const symbols = [];
for (const line of fs.readFileSync(symbolFile, 'utf8').split('\n')) {
  const match = /^(\w+)\s*=\s*0x([0-9a-fA-F]+);/.exec(line);
  if (match) symbols.push({ name: match[1], address: parseInt(match[2], 16) });
}
symbols.sort((a, b) => a.address - b.address);
function nameOf(address) {
  let found = null;
  for (const symbol of symbols) { if (symbol.address > address) break; found = symbol; }
  if (!found) return '?';
  return found.address === address ? found.name : `${found.name}+0x${(address - found.address).toString(16)}`;
}

// The ELF's code, normalized once.
const code = segments.find((s) => s.vaddr <= 0x200000 + 8 && s.vaddr + s.size > 0x200000 + 8) ?? segments[0];
const TEXT_END = 0x2b0000;
const hdd = [];
for (let address = code.vaddr; address < Math.min(code.vaddr + code.size, TEXT_END); address += 4) hdd.push(normalize(elfWord(address)));

const WINDOW = 16;
function candidates(mine) {
  const head = mine.slice(0, WINDOW).map(normalize);
  const found = [];
  for (let at = 0; at + head.length <= hdd.length; at++) {
    let same = 0;
    for (let i = 0; i < head.length; i++) if (hdd[at + i] === head[i]) same += 1;
    if (same >= head.length - 3) found.push({ address: code.vaddr + 4 * at, same });
  }
  return found.sort((a, b) => b.same - a.same).slice(0, 3);
}

function lcs(a, b) {
  let previous = new Uint32Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    const current = new Uint32Array(b.length + 1);
    for (let j = 1; j <= b.length; j++) {
      current[j] = a[i - 1] === b[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
    }
    previous = current;
  }
  return previous[b.length];
}

const hex = (value) => `0x${value.toString(16).padStart(8, '0')}`;
console.log(`dump ${dumpFile} at ${hex(base)}; ELF code ${hex(code.vaddr)}..${hex(code.vaddr + 4 * hdd.length)}; ${symbols.length} symbols`);
console.log('ROM entry   words  -> HDD address  symbol                              words  common  share of ROM  head');
for (const text of entries) {
  const entry = parseInt(text, 16);
  const mine = functionWords(dumpWord, entry);
  const found = candidates(mine);
  if (found.length === 0) { console.log(`${hex(entry)} ${String(mine.length).padStart(6)}  -> no place in the ELF starts like it`); continue; }
  for (const [rank, candidate] of found.entries()) {
    const theirs = functionWords(elfWord, candidate.address);
    const common = lcs(mine.map(normalize), theirs.map(normalize));
    console.log(`${rank === 0 ? hex(entry) : ' '.repeat(10)} ${String(rank === 0 ? mine.length : '').padStart(6)}  -> ${hex(candidate.address)}  ${nameOf(candidate.address).padEnd(34)} ${String(theirs.length).padStart(6)}  ${String(common).padStart(6)}  ${(100 * common / mine.length).toFixed(1).padStart(6)}%      ${candidate.same}/${Math.min(WINDOW, mine.length)}`);
  }
}
