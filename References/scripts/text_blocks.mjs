// Which font blocks of FNTOSD hold the characters of each language table, and their format.
import { dataPath } from '../lib/data.mjs';
import fs from 'node:fs';
import { word } from './elf_words.mjs';
import { expand, readFont, glyphOf } from './extract_font.mjs';
const elf = fs.readFileSync(dataPath('dumps/hddosd-host/hddosd.elf'));
const phoff = elf.readUInt32LE(28), n = elf.readUInt16LE(44);
const str = (a) => { for (let i = 0; i < n; i++) { const at = phoff + i * 32, off = elf.readUInt32LE(at + 4), va = elf.readUInt32LE(at + 8), sz = elf.readUInt32LE(at + 16); if (a >= va && a < va + sz) { let e = off + a - va; const s = e; while (elf[e]) e++; return elf.subarray(s, e); } } return null; };
const raw = fs.readFileSync(dataPath('dumps/hddosd-host/FNTOSD'));
const data = expand(raw); const font = readFont(data);
console.log('blocks', font.blocks.map((b, i) => `${i}: ${b.width}x${b.height} depth ${b.depth} glyphs ${b.glyphs}`).join(' | '));
for (let l = 0; l < 8; l++) {
  const t = word(0x2ad200 + 4 * l), used = new Map();
  for (let id = 0; id < 0x160; id++) {
    const p = word(t + 4 * id); if (!p) continue; const s = str(p); if (!s) continue;
    const text = s.toString('utf8');
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\u0007') { i += 3; continue; }
      const c = text.codePointAt(i); const g = glyphOf(font, data, c); const b = g ? font.blocks.indexOf(g.block) : -1; used.set(b, (used.get(b) ?? new Set()).add(c)); if (b < 0 && process.env.SHOWNONE) console.log('none', l, id.toString(16), c.toString(16), JSON.stringify(text));
    }
  }
  console.log(l, [...used].map(([b, s]) => `block ${b}: ${s.size}`).join(', '));
}
if (process.argv[2]) {
  const set = new Map();
  for (const s of process.argv.slice(2)) for (const ch of s) { const c = ch.codePointAt(0); const g = glyphOf(font, data, c); console.log(ch, c.toString(16), g ? `block ${font.blocks.indexOf(g.block)} glyph ${g.glyph}` : 'none'); }
}
