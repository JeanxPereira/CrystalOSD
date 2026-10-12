// Reading the write logs of cold_record.mjs: <captures>/<name>.writes.json.
import fs from 'node:fs';
import path from 'node:path';

const ASM = process.env.CRYSTALOSD_ASM ?? 'D:/CodingProjects/CrystalOSD-Decomp-Legacy/asm';
const CAPTURES = process.env.CRYSTALOSD_CAPTURES ?? 'D:/CodingProjects/Watson/Runtime/captures';
/** A log named by path, by file name in the captures folder, or by capture name. */
export function logPath(name, kind = 'writes') {
  for (const candidate of [name, path.join(CAPTURES, name), path.join(CAPTURES, `${name}.${kind}.json`)]) if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  throw new Error(`no ${kind} log named ${name}`);
}
export function readWrites(name) {
  const log = JSON.parse(fs.readFileSync(logPath(name), 'utf8'));
  if (log.error) throw new Error(`${name}: recording stopped by ${log.error}`);
  return log;
}
/** Hits as writers: one row per (address, store pc, op, caller), with count, frames and the values seen. */
export function writers(hits) {
  const rows = new Map();
  for (const hit of hits) {
    const key = [hit.store.addr, hit.store.pc, hit.store.op, hit.store.ra].join(' ');
    const row = rows.get(key) ?? { addr: hit.store.addr, pc: hit.store.pc, op: hit.store.op, ra: hit.store.ra, count: 0, first: hit.frame, last: hit.frame, values: new Set() };
    row.count++;
    row.last = hit.frame;
    row.values.add(hit.store.value);
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => parseInt(a.addr, 16) - parseInt(b.addr, 16) || parseInt(a.pc, 16) - parseInt(b.pc, 16));
}
export const formatValues = (values) => [...values].sort((a, b) => Number(BigInt(a) - BigInt(b))).join(',');

const WIDTH = { sb: 1, sh: 2, sw: 4, swc1: 4, sd: 8, sdc1: 8, sq: 16 };
/** The bytes a store covers: [from, to]. sdl/sdr write the part of the doubleword on one side of the address. */
export function covered(hit) {
  const a = parseInt(hit.store.addr, 16);
  const op = hit.store.op;
  if (op === 'sdr') return [a, a | 7];
  if (op === 'sdl') return [a & ~7, a];
  if (op === 'swr') return [a, a | 3];
  if (op === 'swl') return [a & ~3, a];
  return [a, a + (WIDTH[op] ?? 4) - 1];
}

let functions = null;
export function functionOf(pc) {
  if (!fs.existsSync(ASM)) return '?';
  if (!functions) {
    functions = new Map();
    for (const dir of fs.readdirSync(ASM)) {
      const full = path.join(ASM, dir);
      if (!fs.statSync(full).isDirectory()) continue;
      for (const file of fs.readdirSync(full)) {
        if (!file.endsWith('.s')) continue;
        const text = fs.readFileSync(path.join(full, file), 'utf8');
        const label = /^glabel (\S+)/m.exec(text)?.[1] ?? file.replace(/\.s$/, '');
        for (const m of text.matchAll(/\/\* [0-9A-F]+ ([0-9A-F]{8}) [0-9A-F]{8} \*\//g)) functions.set(parseInt(m[1], 16), label);
      }
    }
  }
  return functions.get(parseInt(pc, 16)) ?? '?';
}

