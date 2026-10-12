// The writers of configItems[0], [5] and [12] (HDD OSD 1.10U 0x409130, 0x409144, 0x409160), measured with
// write watchpoints over a cold-boot session (cold_record.mjs --route session: power-on, main menu, System
// Configuration, Clock Adjustment confirmed, every other entry changed, back, clock alone).
//
//   item 0 : config_load_clock_osd (0x234F88) stores the aspect ratio with `sw v0, -0x6ED0($s2)` (0x234FC4),
//            $s2 = 0x410000 (lui), so the address never appears as %lo(D_00409130); the value callback of the
//            entries (D_00228660 0x228660) stores the chosen value through the item pointer, `sw a0, 0(v0)`
//            (0x228718), while an entry is open
//   item 5, item 12 : no store anywhere in the session; no static store either (the load writes offsets 0x4,
//            -0x6ED0, 0x8, 0xC, 0x10, 0x18..0x2C, 0x34..0x54, ..., the save reads the same set)
//
// node measure_cold_config_items.mjs <capture>...
import { readWrites, writers, formatValues, functionOf } from './cold_writes.mjs';

const ITEM0_WRITERS = ['0x00234fc4', '0x00228718'];
const ITEMS = [{ item: 0, address: 0x409130 }, { item: 5, address: 0x409144 }, { item: 12, address: 0x409160 }];
let ok = true;
for (const capture of process.argv.slice(2)) {
  const log = readWrites(capture);
  const rows = writers(log.hits);
  console.log(`${capture}: ${log.frames} frames, ${log.hits.length} writes, ${log.checkpoints.length} checkpoints`);
  const reached = new Set(log.checkpoints.map((c) => c.configPageSelected));
  console.log(`  entries visited: configPage.selected ${[...reached].sort((a, b) => a - b).join(',')}; rtcMirror year ${[...new Set(log.checkpoints.map((c) => c.rtcMirror))].join(',')}`);
  for (const { item, address } of ITEMS) {
    const mine = rows.filter((row) => parseInt(row.addr, 16) === address);
    if (mine.length === 0) console.log(`  item ${item} 0x${address.toString(16)}: no write`);
    for (const row of mine) console.log(`  item ${item} 0x${address.toString(16)}: ${row.op} at ${row.pc} ${functionOf(row.pc)}, ${row.count} writes, frames ${row.first}..${row.last}, values ${formatValues(row.values)}`);
  }
  const others = rows.filter((row) => !ITEMS.some((i) => i.address === parseInt(row.addr, 16)));
  if (others.length) { console.log(`  unexpected writes to other watched words: ${others.length}`); ok = false; }
  const written = ITEMS.filter(({ address }) => rows.some((row) => parseInt(row.addr, 16) === address)).map((i) => i.item);
  if (written.join() !== '0') ok = false;
  const pcs = rows.filter((row) => parseInt(row.addr, 16) === 0x409130).map((row) => row.pc);
  if (!pcs.every((pc) => ITEM0_WRITERS.includes(pc)) || !ITEM0_WRITERS.every((pc) => pcs.includes(pc))) ok = false;
  if (log.stopsWithoutStore?.count) { console.log(`  ${log.stopsWithoutStore.count} watchpoint stops without a store`); ok = false; }
}
console.log(`verdict: ${ok ? 'FOUND item 0 written by 0x234FC4 and 0x228718 only; items 5 and 12 never written' : 'PARTIAL'}`);
