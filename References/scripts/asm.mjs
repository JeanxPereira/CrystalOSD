// One function of the HDD OSD 1.10U disassembly, its callers and the stores that name a symbol, in one call.
//   node References/scripts/asm.mjs <name|0xADDR> [--callers] [--writers <symbol>] [--rom]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ASM_HOME } from '../lib/data.mjs';

const LINE = /^\s*\/\*\s+[0-9A-F]+\s+([0-9A-F]{8})\s+[0-9A-F]{8}\s+\*\/\s+(.*)$/;
const STORE = /^(sb|sh|sw|sd|sq|swc1|sqc2) /;
let index = null;

function load() {
  if (index) return index;
  index = [];
  for (const module of fs.readdirSync(ASM_HOME)) {
    const dir = path.join(ASM_HOME, module);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.s'))) {
      const lines = [];
      for (const raw of fs.readFileSync(path.join(dir, file), 'utf8').split(/\r?\n/)) {
        const m = LINE.exec(raw);
        if (m) lines.push({ addr: parseInt(m[1], 16), text: m[2].trim().replace(/\s+/g, ' ') });
      }
      if (lines.length) index.push({ name: file.slice(0, -2), module, file: path.join(dir, file).split(path.sep).join('/'), start: lines[0].addr, lines });
    }
  }
  return index;
}

export function findFunction(key) {
  const all = load();
  const addr = /^0x[0-9a-f]+$/i.test(key) ? parseInt(key, 16) : null;
  const hit = addr === null ? all.find((f) => f.name === key) : all.find((f) => addr >= f.start && addr <= f.lines.at(-1).addr);
  if (!hit) {
    const control = all.some((f) => f.name === 'clock_config_change_cb_aspect_ratio');
    throw new Error(`${key} not found in ${ASM_HOME}; the same search: clock_config_change_cb_aspect_ratio found=${control}`);
  }
  return hit;
}

export function callers(name) {
  const out = [];
  for (const f of load()) for (const l of f.lines) if (l.text === `jal ${name}` || l.text === `j ${name}`) out.push({ name: f.name, addr: l.addr });
  return out;
}

export function writers(symbol) {
  const named = new RegExp(`(^|[^\\w])${symbol.replace(/[^\w]/g, '\\$&')}([^\\w]|$)`);
  const out = [];
  for (const f of load()) for (const l of f.lines) if (STORE.test(l.text) && named.test(l.text)) out.push({ name: f.name, addr: l.addr, text: l.text });
  return out;
}

const hex = (n) => `0x${n.toString(16).toUpperCase()}`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [key, ...flags] = process.argv.slice(2);
  const f = findFunction(key);
  console.log(`${f.name}  ${f.module}  ${hex(f.start)}..${hex(f.lines.at(-1).addr)}  ${f.file}`);
  for (const l of f.lines) console.log(`${hex(l.addr)}  ${l.text}`);
  if (flags.includes('--callers')) {
    const found = callers(f.name);
    for (const c of found) console.log(`caller ${c.name} @ ${hex(c.addr)}`);
    if (!found.length) console.log('callers: no direct jal/j; a call through a pointer is not found by this search');
  }
  const w = flags.indexOf('--writers');
  if (w >= 0) {
    const symbol = flags[w + 1];
    if (!symbol || symbol.startsWith('--')) throw new Error('--writers needs a symbol');
    for (const s of writers(symbol)) console.log(`writer ${s.name} @ ${hex(s.addr)}  ${s.text}`);
  }
  if (flags.includes('--rom')) process.stdout.write(execFileSync(process.execPath, [fileURLToPath(new URL('./find_in_rom.mjs', import.meta.url)), f.start.toString(16)], { encoding: 'utf8' }));
}
