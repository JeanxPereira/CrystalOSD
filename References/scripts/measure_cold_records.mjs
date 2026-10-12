// The writers of the rod record `template` (HDD OSD 1.10U 0x002B5490, 0xE0 bytes, 41 leaves) and the cube
// record `cubeRecord` (0x002B5AF0), measured with write watchpoints over short windows of a cold-boot session
// (cold_record.mjs --windows 120:175,245:256,372:392,440:455,700:712 --image records=0x2B5490:0x740): the
// clock's first frames, counter about 100, System Configuration opening (rods in), the list with its cubes.
//
// For each leaf: the ELF value, the value at frame 330, every store (pc, function), how many frames of each
// window it was stored in, and the class:
//   per-frame     stored in every frame of every window that holds a store to the record: no init value matters
//   sometimes     stored, not in every frame
//   never         no store in any window; the value at frame 330 and at the end is the ELF's
//   unexplained   no store and a value that is not the ELF's
//
// node measure_cold_records.mjs <capture>...
import { readWrites, covered, functionOf } from './cold_writes.mjs';
import { word } from './elf_words.mjs';

const LEAVES = [['number', 0], ['faces', 4]];
for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) LEAVES.push([`local[${r}][${c}]`, 0x20 + 16 * r + 4 * c]);
for (const [n, at] of [['sx', 0x68], ['sy', 0x6c], ['sz', 0x70]]) LEAVES.push([n, at]);
for (let i = 0; i < 4; i++) LEAVES.push([`base[${i}]`, 0x80 + 4 * i]);
LEAVES.push(['strength', 0x90]);
for (let i = 0; i < 4; i++) LEAVES.push([`textured[${i}]`, 0xa0 + 4 * i]);
LEAVES.push(['pair[0]', 0xb0], ['pair[1]', 0xb4], ['refraction', 0xb8]);
for (let i = 0; i < 4; i++) LEAVES.push([`reflection[${i}]`, 0xc0 + 4 * i]);
for (let i = 0; i < 4; i++) LEAVES.push([`extra[${i}]`, 0xd0 + 4 * i]);
const RECORDS = [{ name: 'template', base: 0x2B5490 }, { name: 'cubeRecord', base: 0x2B5AF0 }];

let ok = true;
for (const capture of process.argv.slice(2)) {
  const log = readWrites(capture);
  if (log.stopsWithoutStore?.count) { console.log(`${capture}: ${log.stopsWithoutStore.count} watchpoint stops without a store`); ok = false; }
  const image = log.images.records;
  const boot = Buffer.from(image.boot, 'hex');
  const end = Buffer.from(image.end, 'hex');
  const windows = log.windows.opened.map((o, i) => ({ from: o.at, to: log.windows.closed[i].at }));
  console.log(`${capture}: ${log.frames} frames, ${log.hits.length} writes, windows ${windows.map((w) => `${w.from}..${w.to}`).join(' ')}`);
  for (const record of RECORDS) {
    const counts = {};
    const lines = [];
    const inRecord = log.hits.filter((hit) => { const a = parseInt(hit.store.addr, 16); return a >= record.base && a < record.base + 0xe0; });
    const active = windows.filter((w) => inRecord.some((hit) => hit.frame >= w.from && hit.frame < w.to));
    for (const [name, at] of LEAVES) {
      const address = record.base + at;
      const mine = inRecord.filter((hit) => { const [from, to] = covered(hit); return from <= address + 3 && to >= address; });
      const elf = word(address);
      const bootValue = boot.readUInt32LE(address - image.start);
      const endValue = end.readUInt32LE(address - image.start);
      const writers = new Map();
      for (const hit of mine) {
        const key = `${hit.store.pc} ${hit.store.op}`;
        const w = writers.get(key) ?? { pc: hit.store.pc, op: hit.store.op, count: 0 };
        w.count++;
        writers.set(key, w);
      }
      const frames = active.map((w) => new Set(mine.filter((hit) => hit.frame >= w.from && hit.frame < w.to).map((hit) => hit.frame)).size);
      const lengths = active.map((w) => new Set(inRecord.filter((hit) => hit.frame >= w.from && hit.frame < w.to).map((hit) => hit.frame)).size);
      let cls;
      if (mine.length === 0) cls = bootValue === elf && endValue === elf ? 'never' : 'unexplained';
      else cls = frames.every((n, i) => n === lengths[i]) ? 'per-frame' : 'sometimes';
      if (cls === 'unexplained') ok = false;
      counts[cls] = (counts[cls] ?? 0) + 1;
      const firstValue = mine[0]?.store.value;
      lines.push(`  ${record.name}.${name} 0x${address.toString(16)} ${cls} elf 0x${elf.toString(16)} boot 0x${bootValue.toString(16)}${endValue !== bootValue ? ` end 0x${endValue.toString(16)}` : ''}`
        + `${mine.length ? ` first-write ${firstValue} frames ${frames.join('/')} of ${lengths.join('/')}  ${[...writers.values()].map((w) => `${w.op} ${w.pc} ${functionOf(w.pc)} x${w.count}`).join('; ')}` : ''}`);
    }
    console.log(`${record.name}: ${LEAVES.length} leaves: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}; ${inRecord.length} stores in windows with stores: ${active.map((w) => `${w.from}..${w.to}`).join(' ') || 'none'}`);
    for (const line of lines) console.log(line);
  }
}
console.log(`verdict: ${ok ? 'FOUND every leaf is stored to or is the ELF value' : 'PARTIAL a leaf differs from the ELF without a store'}`);
