// The EE side of the opening's towers (HDD OSD 1.10U): from the play history to the VIF1 chain
// that func_002214F8 starts for each tower.
//
//   OpeningInitTowersFog 0x00221D30   history -> which cells have a tower, their heights, places
//   func_00220D60        0x00220D60   the brightness table (20 x 20)
//   func_002214F8        0x002214F8   per frame, per tower: matrices, blend packet, faces
//     func_00221140 blend packet, func_002211B8 face tags, func_00221248 heights and colours,
//     func_00221400 texture coordinates, func_002210B0 the three matrices
//
// Three things are recomputed and compared, word for word:
//   1. the tables the set-up leaves (flags, sway factor, height, fade count, places), from the
//      history at 0x001F0198 and the static tables;
//   2. the brightness table, from its constants;
//   3. every chain as it stands when it is started (0x002219B4): the file's bytes with what the
//      functions above write for that cell; and the three matrices in the scratch block.
//
// ROM 2.30: the same code (extract_opening_rom_map.mjs); a trace captured there and rewritten by
// extract_opening_rom_trace.mjs is verified with OPENING_BUILD=rom, which takes the chain's place
// and its bytes as loaded from ROM 2.30.
//
// [OPENING_BUILD=rom] node verify_opening_towers_ee.mjs <trace.jsonl>
import { dataPath } from '../lib/data.mjs';
import fs from 'node:fs';
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { readElf } from './extract_opening_vu1.mjs';
import { f, toInt, root, quotient, vector, matrix, mulMatrix, rotMatrix, transMatrix, subVector, asBits } from '../model/opening-lib.mjs';
import { sinf } from '../model/opening-libm.mjs';

const CHAIN = 0x002a4ee0, LENGTH = 0x840;
// Where the chain sits in the build the trace came from (its face pointers and its tag point there).
const ROM = process.env.OPENING_BUILD === 'rom';
const BASE = ROM ? 0x00274060 : CHAIN;
const romDump = () => fs.readFileSync(dataPath('dumps/rom-0230A-clock-ee-00100000.bin'));
export const PROBES = [
  { pc: '0x002214f8', ranges: ['0x003de920:0x7e0', '0x003ddca0:0x460', '0x003df4f0:0x310', '0x003df100:0x1f8', '0x003df2f8:0x1f8', '0x003de2e0:0x640', '0x002b0c60:0x10', '0x00370000:0x4'] },
  { pc: '0x002214fc', ranges: ['0x70000060:0x280', '0x0036fa74:0x2c', '0x002b1be0:0x30', '0x002b1380:0x18', '0x002b1b80:0x60', '0x003df800:0x310', '0x001f0198:0x1ce', '0x002b0f90:0x3f0'] },
  { pc: '0x00221500', ranges: ['0x002b13a0:0x7e0', '0x002b1c10:0x70', '0x003700d0:0x10', '0x00370058:0x4'] },
  { pc: '0x0022168c', ranges: [] },
  { pc: '0x002219b4', ranges: ['0x002a4ee0:0x840', '0x70000060:0x280'] },
];
const [ENTRY, ENTRY2, ENTRY3, AFTER_SINE, START] = PROBES.map((probe) => parseInt(probe.pc, 16));
const COLUMNS = 14, ROWS = 9;

/** OpeningInitTowersFog: the tables it leaves, from the history and the static tables. */
export function setup({ history, cells, heights, sways, source, shift, empty }) {
  const flag = Array.from({ length: COLUMNS }, () => Array(ROWS).fill(0));
  const sway = Array.from({ length: COLUMNS }, () => Array(ROWS).fill(0));     // D_003DF4F0
  const tall = Array.from({ length: COLUMNS }, () => Array(ROWS).fill(0));     // D_003DF800
  for (let e = 0; e < 21; e++) {
    const entry = history.subarray(e * 22, e * 22 + 22);
    const name = entry.subarray(0, entry.indexOf(0) < 0 ? 16 : entry.indexOf(0)).toString('latin1');
    if (name === empty) continue;
    const count = entry[0x10], mask = entry[0x11], main = entry[0x12];
    for (let k = 0; k < 6; k++) {
      const column = cells.readInt32LE(e * 0x30 + k * 8), row = cells.readInt32LE(e * 0x30 + k * 8 + 4);
      if (k === main) {
        const index = count < 14 ? count : ((count - 14) % 10) + 4;
        sway[column][row] = sways[index];
        tall[column][row] = heights[index];
        flag[column][row] = 1;
      } else if ((mask >> k) & 1) {
        flag[column][row] = 1;
        tall[column][row] = 1;
        sway[column][row] = 1;
      }
    }
  }
  const place = [], height = [], fade = [];
  for (let c = 0; c < COLUMNS; c++) {
    place.push([]); height.push([]); fade.push([]);
    for (let r = 0; r < ROWS; r++) {
      const s = vector(source, c * 0x90 + r * 0x10);
      const p = [f(f(s[0] + shift) * 4), f(f(s[1] - 6.5) * 4), f(f(f(s[2] + 4) * 12) + 150), s[3]];
      let h = f(tall[c][r] * 30);
      if (h < 3) h = 3;
      const factor = sway[c][r];
      p[2] = f(p[2] + f(f(factor * 30) - h));
      if (1 <= factor) { sway[c][r] = 1; fade[c].push(0); } else fade[c].push(toInt(f(f(1 - factor) * 128)));
      place[c].push(p);
      height[c].push(h);
    }
  }
  return { flag, sway, tall, place, height, fade };
}

/** func_00220D60: the 20 x 20 brightness table, [j][i]. */
export function brightness(k) {
  const [radius2, step, base, a, b, scale] = k;      // D_0036FA74, FA78, FA7C, FA80, FA84, FA88
  const R = root(radius2);
  const table = Array.from({ length: 20 }, () => Array(20).fill(0));
  for (let i = 0; i < 20; i++) {
    const s6 = 2 * i - 20;
    const row = f(f(s6 * step) * 0.5);
    for (let j = 0; j < 20; j++) {
      const s4 = 2 * j - 20;
      const y = f(row + base);
      const dy = f(0 - y);
      const x = f(f(f(s4 * step) * 0.5) + base);
      const dx = f(a - x);
      let d = root(f(f(dx * dx) + f(dy * dy)));
      d = f(d + d);
      let first = quotient(f(f(R - d) * 255), R);
      first = first < 32 ? 32 : 255 < first ? 255 : first;
      const y2 = f(f(f(s6 * step) * 0.5) + base), x2 = f(f(f(s4 * step) * 0.5) + base);
      const ey = f(step - y2), ex = f(b - x2);
      const d2 = f(root(f(f(ex * ex) + f(ey * ey))) * 4);
      const second = f(quotient(f(f(R - d2) * 255), R) * 0.5);
      let total = second < 32 ? f(first + 32) : 255 < second ? f(first + 255) : f(first + second);
      const wobble = ((Math.trunc(((j + i) * j) / (i + 1)) % 11) - 5) * 10;
      total = f(f(total * scale) - wobble);
      table[j][i] = total < 32 ? 32 : 220 < total ? 220 : total;
    }
  }
  return table;
}

/** What func_002214F8 leaves in the chain and in the scratch block for the cell (column, row). */
export function tower(template, column, row, frame) {
  const { tables, block, constants, counter, sine, bright, faces, signs } = frame;
  const s0 = column + 3, s2 = row + 6, s5 = row + 7, s1 = s0 + s2;
  const turn = Math.trunc((s1 * s0) / s5) % 4;
  const degree = constants.degree, quarter = constants.quarter;
  const swing = f(f(sine * 10) * degree);
  const twist = tables.sway[column][row] !== 1 ? f(swing + f(turn * quarter)) : f(turn * quarter);
  const rot = [f(constants.rotation[0] + 0), f(constants.rotation[1] + 0), f(constants.rotation[2] + twist), f(constants.rotation[3] + 0)];
  const turned = rotMatrix(matrix(block, 0), rot);
  const place = tables.place[column][row];
  const trans = [f(constants.origin[0] + place[0]), f(constants.origin[1] + place[1]), f(constants.origin[2] + place[2]), f(constants.origin[3] + 0)];
  const local = transMatrix(turned, trans);
  const normals = mulMatrix(matrix(block, 0x200), turned);

  const chain = Buffer.from(template);
  const at = (address) => address - CHAIN;
  // func_00221140(0, 0x80_00000044)
  chain.writeBigUInt64LE(0x1000000000008002n, at(0x2a5010));
  chain.writeBigUInt64LE(0xen, at(0x2a5018));
  chain.writeBigUInt64LE(0x8000000044n, at(0x2a5020));
  chain.writeBigUInt64LE(0x42n, at(0x2a5028));
  chain.writeBigUInt64LE(0n, at(0x2a5030));
  chain.writeBigUInt64LE(0x49n, at(0x2a5038));
  chain.fill(0, at(0x2a5040), at(0x2a5050));
  // func_002211B8(0, 1)
  chain.writeUInt32LE(BASE + 0x180, 4);
  for (const pointer of faces) {
    const base = pointer - BASE + CHAIN;
    chain.writeUInt32LE(0x8004, at(base));
    chain.writeUInt32LE((((1 << 7) | 0x1c) << 15 | 0x30004000) >>> 0, at(base) + 4);
    chain.writeUInt32LE(0x412, at(base) + 8);
    chain.writeUInt32LE(0, at(base) + 12);
  }
  // func_00221248(column, row, brightness)
  const count = tables.fade[column][row], h = tables.height[column][row];
  let light = bright[s0][s2];
  light = count === 0 ? f(light * quotient(h, 30)) : f(light * f(count * 0.0078125));
  const side = f(light * constants.side);
  faces.forEach((pointer, face) => {
    const base = pointer - BASE + CHAIN;
    for (let v = 0; v < 4; v++) {
      const z = signs.readInt32LE(face * 16 + v * 4) !== 0 ? h : f(0 - h);
      chain.writeFloatLE(z, at(base) + 0x10 + v * 16 + 8);
      const colour = at(base) + 0x90 + v * 16;
      if (0 < z) { chain.writeUInt32LE(0, colour); chain.writeUInt32LE(0, colour + 4); chain.writeUInt32LE(0, colour + 8); }
      else for (const k of [0, 4, 8]) chain.writeFloatLE(face === 0 ? light : side, colour + k);
      chain.writeFloatLE(128, colour + 12);
    }
  });
  // func_00221400
  const picked = Math.trunc((s1 * (s0 + 5)) / (s2 + 1)) + Math.trunc((s1 * (s0 + 4)) / (s2 + 3));
  const v = picked !== 0 ? f(picked * 0.00390625) : 0;
  const low = f(v + 0), high = f(v + 1);
  for (const pointer of faces) {
    const base = pointer - BASE + CHAIN;
    [[low, low], [high, low], [low, high], [high, high]].forEach(([s, t], n) => {
      const where = at(base) + 0xd0 + n * 16;
      chain.writeFloatLE(s, where); chain.writeFloatLE(t, where + 4); chain.writeFloatLE(1, where + 8); chain.writeUInt32LE(0, where + 12);
    });
  }
  // func_002210B0
  const put = (m, address) => m.flat().forEach((x, i) => chain.writeFloatLE(x, at(address) + i * 4));
  block.copy(chain, at(0x2a4ef0), 0xc0, 0x100);
  put(local, 0x2a4f30);
  put(normals, 0x2a4fb0);
  return { chain, turned, local, normals, moved: tables.sway[column][row] !== 1 };
}

const words = (buffer) => [...Array(buffer.length >> 2).keys()].map((i) => buffer.readUInt32LE(i * 4));

export function verify(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const read = readElf();
  const template = ROM ? romDump().subarray(BASE - 0x00100000, BASE - 0x00100000 + LENGTH) : read(CHAIN, LENGTH);
  const result = { frames: 0, setup: {}, bright: [0, 0], sine: [0, 0], towers: 0, swaying: 0, chain: [0, 0], scratch: [0, 0], order: [0, 0], cells: new Set(), problems: [] };
  const problem = (text) => { if (result.problems.length < 16) result.problems.push(text); };
  const tally = (name, got, want) => {
    const t = (result.setup[name] ??= [0, 0]);
    got.forEach((x, i) => { t[1] += 1; if (x === want[i]) t[0] += 1; else problem(`set-up table ${name}[${i}]: in memory 0x${x.toString(16)}, computed 0x${want[i].toString(16)}`); });
  };

  const probes = trace.probes.filter((probe) => !probe.preroll);
  for (let n = 0; n < probes.length; n++) {
    if (probes[n].pc !== ENTRY) continue;
    const second = probes[n + 1], third = probes[n + 2];
    if (!second || second.pc !== ENTRY2 || !third || third.pc !== ENTRY3) continue;
    if ([...probes[n].mem, ...second.mem, ...third.mem].some((range) => !range.bytes)) { problem(`frame ${probes[n].frame}: a probed range was not readable`); continue; }
    const [places, flags, sways, fades, heights, bright, camera, counterBytes] = probes[n].mem.map((range) => range.bytes);
    const [block, k, statics, facesBytes, signs, talls, history, cells] = second.mem.map((range) => range.bytes);
    const [source, curves, emptyName, pointer] = third.mem.map((range) => range.bytes);
    if (pointer.readUInt32LE(0) !== 0x70000060) { problem(`frame ${probes[n].frame}: the scratch block is at 0x${pointer.readUInt32LE(0).toString(16)}`); continue; }
    result.frames += 1;

    // 1. The set-up's tables.
    const floats = (bytes, at, count) => [...Array(count).keys()].map((i) => bytes.readFloatLE(at + i * 4));
    const empty = emptyName.subarray(0, emptyName.indexOf(0)).toString('latin1');
    const tables = setup({ history, cells, sways: floats(curves, 0, 14), heights: floats(curves, 0x38, 14), source, shift: k.readFloatLE(0x28), empty });
    if (result.frames === 1) {
      const flat = (grid, stride, make) => { const out = []; for (let c = 0; c < COLUMNS; c++) for (let r = 0; r < ROWS; r++) out.push(make(grid[c][r])); return out; };
      const pick = (bytes, stride) => { const out = []; for (let c = 0; c < COLUMNS; c++) for (let r = 0; r < ROWS; r++) out.push(bytes.readUInt32LE(c * stride + r * 4)); return out; };
      tally('flags', pick(flags, 0x50), flat(tables.flag, 0x50, (x) => x));
      tally('sway factor', pick(sways, 0x38), flat(tables.sway, 0x38, asBits));
      tally('height factor', pick(talls, 0x38), flat(tables.tall, 0x38, asBits));
      tally('height', pick(heights, 0x24), flat(tables.height, 0x24, asBits));
      tally('fade count', pick(fades, 0x24), flat(tables.fade, 0x24, (x) => x >>> 0));
      tally('places', words(places), tables.place.flat().flat().map(asBits));
      // 2. The brightness table.
      const made = brightness(floats(k, 0, 6));
      for (let j = 0; j < 20; j++) for (let i = 0; i < 20; i++) {
        result.bright[1] += 1;
        if (asBits(made[j][i]) === bright.readUInt32LE(j * 0x50 + i * 4)) result.bright[0] += 1;
        else problem(`brightness[${j}][${i}]: in memory ${bright.readFloatLE(j * 0x50 + i * 4)}, computed ${made[j][i]}`);
      }
    }
    // The set-up's tables as they stand in memory are what the frame uses.
    const live = { flag: [], sway: [], height: [], fade: [], place: [] };
    for (let c = 0; c < COLUMNS; c++) {
      live.flag.push([]); live.sway.push([]); live.height.push([]); live.fade.push([]); live.place.push([]);
      for (let r = 0; r < ROWS; r++) {
        live.flag[c].push(flags.readInt32LE(c * 0x50 + r * 4));
        live.sway[c].push(sways.readFloatLE(c * 0x38 + r * 4));
        live.height[c].push(heights.readFloatLE(c * 0x24 + r * 4));
        live.fade[c].push(fades.readInt32LE(c * 0x24 + r * 4));
        live.place[c].push(vector(places, c * 0x90 + r * 0x10));
      }
    }
    const brightTable = Array.from({ length: 20 }, (_, j) => Array.from({ length: 20 }, (_, i) => bright.readFloatLE(j * 0x50 + i * 4)));

    // The sway: sinf(((counter % 360) - 180) x degree).
    const counter = counterBytes.readUInt32LE(0);
    const degree = k.readFloatLE(0x1c), quarter = k.readFloatLE(0x20);
    const angle = f(((counter % 360) - 180) * degree);
    let sine = sinf(angle);
    const after = probes.slice(n + 1).find((probe) => probe.pc === AFTER_SINE || probe.pc === ENTRY);
    if (after && after.pc === AFTER_SINE) {
      result.sine[1] += 1;
      if (after.fpr[0] === asBits(sine)) result.sine[0] += 1;
      else problem(`frame ${probes[n].frame}: sinf(${angle}) returned 0x${after.fpr[0].toString(16)}, computed 0x${asBits(sine).toString(16)}`);
      bits32.setUint32(0, after.fpr[0]);
      sine = bits32.getFloat32(0);
    }

    const frame = { tables: live, block, counter, sine, bright: brightTable, signs,
      faces: [0, 1, 2, 3, 4, 5].map((i) => facesBytes.readUInt32LE(i * 4)),
      constants: { degree, quarter, side: k.readFloatLE(0x18), origin: vector(statics, 0x10), rotation: vector(statics, 0x20) } };

    // The cells drawn, in order: every cell with a tower whose distance key is above 0.
    const eye = vector(camera);
    const expected = [];
    for (let c = 0; c < COLUMNS; c++) for (let r = 0; r < ROWS; r++) {
      const d = subVector(live.place[c][r], eye);
      const key = d[1] < 0 ? f(Math.abs(d[0]) - d[1]) : f(Math.abs(d[0]) + d[1]);
      if (0 < key && live.flag[c][r] !== 0) expected.push([c, r]);
    }
    const starts = [];
    for (let m = n + 3; m < probes.length && probes[m].pc !== ENTRY; m++) if (probes[m].pc === START) starts.push(probes[m]);
    const whole = probes.slice(n + 3).some((probe) => probe.pc === ENTRY);
    if (whole) {
      result.order[1] += 1;
      if (starts.length === expected.length && starts.every((probe, i) => probe.gpr[20] === expected[i][0] && probe.gpr[23] === expected[i][1])) result.order[0] += 1;
      else problem(`frame ${probes[n].frame}: ${starts.length} towers started, ${expected.length} expected in column, row order`);
    }

    // 3. Each chain.
    for (const start of starts) {
      if (start.mem.some((range) => !range.bytes)) { problem(`frame ${start.frame}: a chain was not readable`); continue; }
      const column = start.gpr[20], row = start.gpr[23];
      const made = tower(template, column, row, frame);
      result.towers += 1;
      if (made.moved) result.swaying += 1;
      result.cells.add(`${column},${row}`);
      const got = words(start.mem[0].bytes), want = words(made.chain);
      let bad = -1;
      want.forEach((x, i) => { result.chain[1] += 1; if (x === got[i]) result.chain[0] += 1; else if (bad < 0) bad = i; });
      if (bad >= 0) problem(`frame ${start.frame} cell ${column},${row}: chain word at 0x${(CHAIN + bad * 4).toString(16)}: in memory 0x${got[bad].toString(16)}, computed 0x${want[bad].toString(16)}`);
      const scratch = start.mem[1].bytes;
      for (const [name, at, m] of [['tower matrix', 0x80, made.local], ['normal matrix', 0x180, made.normals], ['turn matrix', 0x240, made.turned]]) {
        const there = words(scratch.subarray(at, at + 0x40)), mine = m.flat().map(asBits);
        result.scratch[1] += 16;
        const same = mine.filter((x, i) => x === there[i]).length;
        result.scratch[0] += same;
        if (same !== 16) problem(`frame ${start.frame} cell ${column},${row}: ${name}: ${16 - same} of 16 values differ`);
      }
    }
  }
  return result;
}
const bits32 = new DataView(new ArrayBuffer(4));

if (process.argv[1] && process.argv[1].endsWith('verify_opening_towers_ee.mjs')) {
  const result = verify(process.argv[2]);
  console.log(`frames: ${result.frames}   towers: ${result.towers} (${result.swaying} swaying) on ${result.cells.size} cells`);
  for (const [name, [equal, total]] of Object.entries(result.setup)) console.log(`  set-up, ${name.padEnd(14)} ${equal} of ${total} equal`);
  console.log(`  brightness table        ${result.bright[0]} of ${result.bright[1]} equal`);
  console.log(`  sinf results            ${result.sine[0]} of ${result.sine[1]} equal`);
  console.log(`  draw order              ${result.order[0]} of ${result.order[1]} whole frames`);
  console.log(`  chain words             ${result.chain[0]} of ${result.chain[1]} equal`);
  console.log(`  scratch matrix values   ${result.scratch[0]} of ${result.scratch[1]} equal`);
  for (const text of result.problems) console.log(`  ! ${text}`);
  const whole = result.towers > 0 && result.problems.length === 0;
  console.log(`verdict: ${whole ? `FOUND ${result.towers} tower chains of the opening, every word equal` : 'PARTIAL see the lines marked !'}`);
  process.exit(whole ? 0 : 3);
}
