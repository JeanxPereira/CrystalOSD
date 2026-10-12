// The static tables and constants of the opening intro (HDD OSD 1.10U), read from the ELF and
// written to References/model/opening-tables.json. Tables the program builds when it starts (the
// fog mesh, the cube's vertices, the cubes' angles and places) are not in the file: their rules
// are in References/readings/opening-draft.md.
//
// node extract_opening_tables.mjs
import fs from 'node:fs';
import { readElf } from './extract_opening_vu1.mjs';

const read = readElf();
const floats = (address, count) => { const b = read(address, count * 4); return [...Array(count).keys()].map((i) => b.readFloatLE(i * 4)); };
const ints = (address, count) => { const b = read(address, count * 4); return [...Array(count).keys()].map((i) => b.readInt32LE(i * 4)); };
const rows = (list, width) => [...Array(list.length / width).keys()].map((i) => list.slice(i * width, i * width + width));
const hex = (address) => `0x${address.toString(16).padStart(8, '0')}`;

const out = { build: 'HDD OSD 1.10U', tables: {} };
const add = (name, address, what, make) => {
  try { out.tables[name] = { address: hex(address), what, values: make() }; }
  catch (error) { out.tables[name] = { address: hex(address), what, values: null, note: `not in the file: ${error.message}` }; }
};

add('stageThresholds', 0x002b0e08, 'camera z past which the stage advances, by stage', () => ints(0x002b0e08, 8));
add('cameraConstants', 0x0036f9d0, 'PAL step factor; stage constants (hard disk hold x4, disc wait acceleration, dive on hard disk x2, dive velocity, dive roll acceleration); pi, 2 pi, -pi, 2 pi', () => floats(0x0036f9d0, 14));
add('lightAngleFactors', 0x0036fa0c, 'the four factors of the lights\' two angles', () => floats(0x0036fa0c, 4));
add('lightColours', 0x002b0e30, 'r, g, b, w of the four lights', () => rows(floats(0x002b0e30, 16), 4));
add('lightQuads', 0x002b0e70, 'two quads of four corners: the glow and the core', () => rows(rows(floats(0x002b0e70, 32), 4), 4));
add('lightCoordinates', 0x002b0ef0, 's, t of the four corners', () => rows(floats(0x002b0ef0, 16), 4));
add('lightOrigin', 0x002b0f30, 'the point each light\'s matrix places', () => floats(0x002b0f30, 4));
add('lightAlphas', 0x003700b8, 'alpha of the glow and of the core, before the trail factor', () => ints(0x003700b8, 2));
add('cubeConstants', 0x0036fa1c, 'colour factors of the grain passes (scale; then slope and base for r, g, b); shifts of the four fixed passes and the pull of the near refraction; cube half size; init constants', () => floats(0x0036fa1c, 20));
add('cubeWraps', 0x0036fb60, 'angle limits and their wraps; the last one is the facing above which a refracting face is antialiased', () => floats(0x0036fb60, 9));
add('cubePlaces', 0x002b0f40, 'x, y, z of the five cubes before scaling (x 3.5, x 3.5, x -15 + 150)', () => rows(floats(0x002b0f40, 20), 4));
add('cubeFaces', 0x002b1d10, 'the four corners of each of the six faces', () => rows(ints(0x002b1d10, 24), 4));
add('cubeMirrorVectors', 0x002b1dc0, 'the vector each face\'s normal is measured against in the mirror passes', () => rows(floats(0x002b1dc0, 24), 4));
add('cubeFixedCoordinates', 0x002b1cd0, 'the four coordinate pairs of the fixed passes', () => rows(floats(0x002b1cd0, 16), 4));
add('cubeCentrePoint', 0x002b1db0, 'the point whose place on the screen the near refraction pulls toward', () => floats(0x002b1db0, 4));
add('blendModes', 0x002b0cc0, 'A, B, C, D of ALPHA for each blend mode number', () => rows(ints(0x002b0cc0, 44), 4));
add('fogScrollStep', 0x0036f990, 'the fog\'s scroll step', () => floats(0x0036f990, 1));
add('fogTextureOrder', 0x003653e8, 'texture number of each fog layer', () => ints(0x003653e8, 6));
add('logoRectangles', 0x00365158, 'x, y, width, height of the logo\'s two rectangles; NTSC then PAL', () => rows(ints(0x00365158, 16), 4));
add('logoSource', 0x003653a8, 'u, v, width, height of the first rectangle in the texture; the second is 32 rows lower', () => ints(0x003653a8, 4));
add('clipBox', 0x002b0c20, 'low and high bounds of the clip test: x, y as a fraction of w; w itself', () => rows(floats(0x002b0c20, 8), 4));
add('towerPlaces', 0x002b13a0, '14 x 9 raw tower positions', () => rows(floats(0x002b13a0, 14 * 9 * 4), 4));
add('towerCells', 0x002b0f90, 'row, column of the six cells of each of the 21 history entries', () => rows(rows(ints(0x002b0f90, 21 * 12), 2), 6));
add('towerScaleNow', 0x002b1c10, 'current scale by play count', () => floats(0x002b1c10, 14));
add('towerScaleTarget', 0x002b1c48, 'target scale by play count', () => floats(0x002b1c48, 14));
add('textures', 0x002af870, 'resource number, width, height, pixel format, load tag of the 21 textures', () => [...Array(21).keys()].map((i) => {
  const b = read(0x002af870 + i * 0xf0, 0xf0);
  return { resource: b.readInt32LE(4), width: b.readInt32LE(0x18), height: b.readInt32LE(0x1c), format: b.readInt32LE(0x28), tag: b.readInt32LE(0xc) };
}));

const file = new URL('../model/opening-tables.json', import.meta.url);
fs.writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
for (const [name, table] of Object.entries(out.tables)) console.log(`${name.padEnd(22)} ${table.address} ${table.values === null ? table.note : JSON.stringify(table.values).slice(0, 110)}`);
