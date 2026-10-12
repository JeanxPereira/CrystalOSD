// The writers of the menu leaves of HDD OSD 1.10U: configEntries (9 entries of 0x38 bytes at 0x2B2BF0),
// configPage (0x2B2DE8), mainMenu (0x2B2E60), measured with write watchpoints over a cold-boot session
// (cold_record.mjs --route session2 --image menu=0x2B2BF0:0x2A0): power-on, main menu up and down, System
// Configuration, Clock Adjustment confirmed, every entry changed, the Options dialog, back, clock alone.
//
// For every leaf: the ELF value, the value at frame 330 (the menu has just taken input), the stores seen
// (pc, function, frames) and the class:
//   written-at-init   every store comes before the menu takes input (frame 330)
//   written-by-input  a store comes after it
//   constant          no store in the session; the value at frame 330 and at the end is the ELF's
//   unexplained       no store and a value that is not the ELF's
//
// node measure_cold_menu_leaves.mjs <capture>... [--list]
import { readWrites, covered, functionOf } from './cold_writes.mjs';
import { word } from './elf_words.mjs';

const ENTRY_LEAVES = ['id', 'valueCount', 'valueIndex', 'item', 'valueTable', 'enter', 'stringCallback', 'frameCallback', 'confirm', 'cancel', 'focus', 'rest[0]', 'rest[1]', 'rest[2]'];
const PAGE_LEAVES = ['word0', 'entries', 'count', 'titleWidth', 'selected', 'word14', 'level', 'ramp.length', 'ramp.counter', 'ramp.changed', 'ramp.state', 'word2c', 'word30', 'glow'];
const MENU_LEAVES = ['word0', 'items', 'count', 'word0c', 'selected', 'word14', 'ramp.length', 'ramp.counter', 'ramp.changed', 'ramp.state'];
const leaves = [];
for (let e = 0; e < 9; e++) ENTRY_LEAVES.forEach((name, i) => leaves.push({ name: `configEntries.${e}.${name}`, address: 0x2B2BF0 + 0x38 * e + 4 * i }));
PAGE_LEAVES.forEach((name, i) => leaves.push({ name: `configPage.${name}`, address: 0x2B2DE8 + 4 * i }));
MENU_LEAVES.forEach((name, i) => leaves.push({ name: `mainMenu.${name}`, address: 0x2B2E60 + 4 * i }));
const MENU_FRAME = 330;

let ok = true;
const args = process.argv.slice(2);
for (const capture of args.filter((a) => !a.startsWith('--'))) {
  const log = readWrites(capture);
  if (log.stopsWithoutStore?.count) { console.log(`${capture}: ${log.stopsWithoutStore.count} watchpoint stops without a store`); ok = false; }
  const image = log.images?.menu;
  if (!image) throw new Error(`${capture}: no menu image (record with --image menu=0x2B2BF0:0x2A0)`);
  const boot = Buffer.from(image.boot, 'hex');
  const end = Buffer.from(image.end, 'hex');
  const at = (buffer, address) => buffer.readUInt32LE(address - image.start);
  const counts = {};
  const rows = [];
  for (const leaf of leaves) {
    const mine = log.hits.filter((hit) => { const [from, to] = covered(hit); return from <= leaf.address + 3 && to >= leaf.address; });
    const elf = word(leaf.address);
    const row = { ...leaf, elf, boot: at(boot, leaf.address), end: at(end, leaf.address), writers: new Map(), first: null, last: null };
    for (const hit of mine) {
      const key = `${hit.store.pc} ${hit.store.op}`;
      const w = row.writers.get(key) ?? { pc: hit.store.pc, op: hit.store.op, count: 0, first: hit.frame, last: hit.frame, values: new Set() };
      w.count++; w.last = hit.frame; w.values.add(hit.store.value);
      row.writers.set(key, w);
      row.first = Math.min(row.first ?? Infinity, hit.frame);
      row.last = Math.max(row.last ?? 0, hit.frame);
    }
    if (mine.length === 0) row.class = row.boot === row.elf && row.end === row.elf ? 'constant' : 'unexplained';
    else row.class = row.last >= MENU_FRAME ? 'written-by-input' : 'written-at-init';
    if (row.class === 'unexplained') ok = false;
    counts[row.class] = (counts[row.class] ?? 0) + 1;
    rows.push(row);
  }
  console.log(`${capture}: ${log.frames} frames, ${log.hits.length} writes, ${leaves.length} leaves: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  for (const row of rows) {
    if (row.class === 'constant' && !args.includes('--list')) continue;
    const hex = (v) => `0x${(v >>> 0).toString(16)}`;
    const writers = [...row.writers.values()].map((w) => `${w.op} ${w.pc} ${functionOf(w.pc)} x${w.count} f${w.first}..${w.last} [${[...w.values].slice(0, 4).join(',')}${w.values.size > 4 ? ',...' : ''}]`).join('; ');
    console.log(`  ${row.name} ${hex(row.address)} ${row.class} elf ${hex(row.elf)} boot ${hex(row.boot)}${row.end !== row.boot ? ` end ${hex(row.end)}` : ''}${writers ? `  ${writers}` : ''}`);
  }
}
console.log(`verdict: ${ok ? 'FOUND every leaf has a writer or is constant' : 'PARTIAL a leaf differs from the ELF without a store'}`);
