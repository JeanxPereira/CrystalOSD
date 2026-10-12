// The static tables behind the opening's towers (HDD OSD 1.10U), read from the ELF and written to
// References/model/opening-towers.json: which cells each play-history entry owns, the two curves
// by play count, the cells' places before set-up, the face signs and the constants. The rules
// that use them are in verify_opening_towers_ee.mjs (setup, brightness, tower).
//
// node extract_opening_towers.mjs
import fs from 'node:fs';
import { readElf } from './extract_opening_vu1.mjs';

const read = readElf();
const floats = (address, count) => { const b = read(address, count * 4); return [...Array(count).keys()].map((i) => b.readFloatLE(i * 4)); };
const ints = (address, count) => { const b = read(address, count * 4); return [...Array(count).keys()].map((i) => b.readInt32LE(i * 4)); };
const rows = (list, width) => [...Array(list.length / width).keys()].map((i) => list.slice(i * width, i * width + width));

const out = {
  build: 'HDD OSD 1.10U',
  history: { address: '0x001F0198', entries: 21, bytes: 22, fields: 'name (a string; an empty one is skipped), +0x10 play count, +0x11 mask of the six cells, +0x12 which of the six is the main cell' },
  cells: { address: '0x002B0F90', what: 'for each history entry, six (column, row) pairs; columns 0..13, rows 0..8', values: rows(rows(ints(0x002b0f90, 21 * 12), 2), 6) },
  swayByCount: { address: '0x002B1C10', what: 'main cell, by play count (counts of 14 and more use entry ((count - 14) % 10) + 4): below 1 the tower sways and is faded in', values: floats(0x002b1c10, 14) },
  heightByCount: { address: '0x002B1C48', what: 'main cell, by play count: height = value x 30, at least 3', values: floats(0x002b1c48, 14) },
  places: { address: '0x002B13A0', what: 'x, y, z, w of the 14 x 9 cells before set-up: x = (x + shift) x 4, y = (y - 6.5) x 4, z = (z + 4) x 12 + 150 + sway x 30 - height', values: rows(rows(floats(0x002b13a0, 14 * 9 * 4), 4), 9) },
  faceSigns: { address: '0x002B1B80', what: 'for each of the six faces, per vertex: z = +height when set, -height when not', values: rows(ints(0x002b1b80, 24), 4) },
  origin: { address: '0x002B1BF0', values: floats(0x002b1bf0, 4) },
  rotation: { address: '0x002B1C00', values: floats(0x002b1c00, 4) },
  texture: { address: '0x002B1BE0', value: ints(0x002b1be0, 1)[0] },
  constants: { address: '0x0036FA74', what: 'brightness: radius squared, step, base, centre a, centre b, scale; side face factor; degree; quarter turn; (unused here); x shift', values: floats(0x0036fa74, 11) },
};
fs.writeFileSync(new URL('../model/opening-towers.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(`wrote opening-towers.json: ${out.cells.values.length} entries of 6 cells, ${out.places.values.length} columns`);
