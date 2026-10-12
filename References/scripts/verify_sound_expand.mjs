// The sound members: SNDIMAGE (the container) and Expand (the decompressor), recomputed bit for bit.
//
// do_load_resources (HDD OSD 1.10U 0x0020AB98) loads SNDIMAGE into a buffer (HDD OSD: the host file read to
// 0x00680000 and decrypted in place, 64 blocks of every 512 through a 16-round Feistel cipher, key from
// D_002AD970 / D_002AD978; ROM 2.30: the ROM file read to 0x00700000, plain), finds the ROMDIR (romdir_get_offset
// 0x0020E418, ROM 0x0020E930) and, for each member, searches it (romdir_search_entry 0x0020E4B0, ROM 0x0020E9C8)
// and calls Expand (0x00200EE8, ROM 0x00200ED0) with the member's address and the next slot of a bump allocator
// that rounds each slot up to 16 (it starts at 0x018F0000 on HDD OSD; ROM 2.30 presets the first entry's slot). load_sound_resources (0x00200258, ROM 0x00200250)
// then reads the decompressed members from those slots.
//
// What is recomputed, from the probed inputs and the model in ../model/sound_data.mjs:
//   - HDD OSD: the decrypted container = decryptImage(host file SNDIMAGE, the cipher tables and key words
//     probed at decryption_xommon1 0x00293D08) equals the memory at 0x00680000 after the decrypt;
//     ROM 2.30: the memory at 0x00700000 equals the SNDIMAGE member of the BIOS ROMDIR.
//   - the ROMDIR of that container (RESET, ROMDIR, EXTINFO and the 12 members, each stream read to its last byte): where romdir_get_offset puts the directory (the curname struct), and
//     every member's address = base + offset, offset = the sum of the sizes before it, each rounded up to 16
//     (the pointer Expand receives).
//   - the resource table: slot i = the entry's own slot if it has one before loading, else ((bump + 15) >> 4) << 4 (the program's ((bump - 1) >> 4) + 1) << 4 for any bump above 0, and 0 at 0),
//     bump = slot + size unless the entry's flags & 7 is 2 (bump starts at 0x018F0000 on HDD OSD, 0 on ROM 2.30,
//     whose first entry has its slot set in the table).
//   - Expand: the decompressed bytes of each of the member's stream equal the slot's memory, byte for byte,
//     and the table's size is the stream's first word (what ExpandGetSize returns).
// On HDD OSD it also reports how its members differ from the ROM 2.30 container (information only).
// CLOCK_BUILD=hdd|rom node verify_sound_expand.mjs <trace.jsonl>
import { dataPath } from '../lib/data.mjs';
import fs from 'node:fs';
import { loadTrace, probesOf, pick, range, pc, BUILD, BUILD_NAME } from '../lib/index.mjs';
import { expand, expandSize, decryptImage, imageKey, romdirStart, romdirEntries, CIPHER_TABLES, CIPHER_TABLE_SIZES } from '../model/sound_data.mjs';

const A = pick({
  hdd: { expand: 0x00200ee8, getOffset: 0x0020e418, search: 0x0020e4b0, load: 0x00200258, loader: 0x0020ab98, bump: 0x018f0000, curname: 0x00386bf8, table: 0x002ad240, names: [0x00347fe0, 0x180], base: 0x00680000, length: 0x63694, data: [0x01c72a10, 0x66814] },
  rom: { expand: 0x00200ed0, getOffset: 0x0020e930, search: 0x0020e9c8, load: 0x00200250, loader: 0x00206800, bump: 0, curname: 0x002da348, table: 0x0027b478, names: [0x002c3380, 0x1a0], base: 0x00700000, length: 0x63614, data: [0x01c1b5d0, 0x661d4] },
});
const TABLE_ENTRIES = 0x14;
const SOUND = ['SNDBOOTH', 'SNDBOOTB', 'SNDBOOTS', 'SNDTNNLS', 'SNDCLOKS', 'SNDTM30S', 'SNDTM60S', 'SNDOSDDH', 'SNDOSDDB', 'SNDLOGOS', 'SNDWARNS', 'SNDRCLKS'];
const KEY_WORDS = 0x002ad970;

// A probe range is at most 0x10000 bytes: a buffer is asked for in pieces and joined.
const pieces = (address, length) => Array.from({ length: Math.ceil(length / 0x10000) }, (_, k) => range(address + k * 0x10000, Math.min(0x10000, length - k * 0x10000)));
const joined = (record, from, count) => Buffer.concat(record.mem.slice(from, from + count).map((entry) => entry.bytes));
export const PROBES = [
  { pc: pc(A.expand), ranges: [] },
  { pc: pc(A.getOffset), ranges: pieces(A.base, A.length) },
  { pc: pc(A.search), ranges: [range(A.curname, 0xc)] },
  { pc: pc(A.loader), ranges: [range(A.table, 0x10 * TABLE_ENTRIES)] },
  { pc: pc(A.load), ranges: [range(A.table, 0x10 * TABLE_ENTRIES), range(A.names[0], A.names[1])].concat(pieces(A.data[0], A.data[1])) },
].concat(BUILD === 'hdd' ? [{ pc: pc(0x00293d08), ranges: [range(KEY_WORDS, 0x10)].concat(Object.keys(CIPHER_TABLES).map((k) => range(CIPHER_TABLES[k], CIPHER_TABLE_SIZES[k]))) }] : []);

const read = (relative) => fs.readFileSync(dataPath(relative));
const same = (a, b) => a.length === b.length && Buffer.compare(a, b) === 0;
const hex = (x) => `0x${(x >>> 0).toString(16)}`;

if (process.argv[1] && process.argv[1].endsWith('verify_sound_expand.mjs')) {
  const trace = loadTrace(process.argv[2]);
  const [expands, offsets, searches, starts, loads, ciphers = []] = probesOf(trace, PROBES);
  const problems = [];
  const fail = (text) => { if (problems.length < 12) problems.push(text); };
  console.log(`build: ${BUILD_NAME}`);
  console.log(`records: Expand ${expands.length}, romdir_get_offset ${offsets.length}, romdir_search_entry ${searches.length}, do_load_resources ${starts.length}, load_sound_resources ${loads.length}${BUILD === 'hdd' ? `, decryption_xommon1 ${ciphers.length}` : ''}`);

  const bios = read('bios/megadump/ps2-0230a-20080220.bin');
  const biosEntries = romdirEntries(bios, romdirStart(bios, 0x100000));
  const biosImage = biosEntries.find((entry) => entry.name === 'SNDIMAGE');
  const romContainer = bios.subarray(biosImage.offset, biosImage.offset + biosImage.size);

  // 1. The container as the program holds it after loading.
  let want;
  let source;
  if (BUILD === 'hdd') {
    const probe = ciphers[0];
    const same_inputs = ciphers.length > 0 && ciphers.every((record) => record.mem.every((entry, i) => same(entry.bytes, probe.mem[i].bytes)));
    if (!same_inputs) fail('the cipher tables and key words differ between the calls to decryption_xommon1');
    const key = imageKey(probe.mem[0].bytes.readBigUInt64LE(0), probe.mem[0].bytes.readBigUInt64LE(8));
    const tables = Object.fromEntries(Object.keys(CIPHER_TABLES).map((k, i) => [k, probe.mem[1 + i].bytes]));
    const file = read('dumps/hddosd-host/SNDIMAGE');
    want = decryptImage(file, tables, key).subarray(0, A.length);
    source = `decrypt of the host file SNDIMAGE (${file.length} bytes, key 0x${key.toString(16)})`;
    let changed = 0;
    for (let at = 0; at < A.length; at += 8) if (!same(want.subarray(at, at + 8), file.subarray(at, at + 8))) changed += 1;
    console.log(`decrypt: ${changed} of ${A.length >> 3} blocks differ from the file's`);
  } else {
    want = romContainer;
    source = `the SNDIMAGE member of the BIOS ROMDIR (offset ${hex(biosImage.offset)}, ${biosImage.size} bytes)`;
  }
  const containers = offsets.filter((record) => same(joined(record, 0, pieces(A.base, A.length).length), want));
  console.log(`container: ${containers.length} of ${offsets.length} romdir_get_offset records hold ${source}`);
  if (containers.length === 0) fail('no romdir_get_offset record holds the recomputed container');
  const container = want;

  // 2. Its ROMDIR.
  const start = romdirStart(container);
  const entries = romdirEntries(container, start);
  const base = A.base;
  if (containers.some((record) => record.gpr[4] >>> 0 !== base || record.gpr[5] >>> 0 !== base + 0x2000)) fail('romdir_get_offset was not called with (base, base + 0x2000)');
  const romdir = entries.find((entry) => entry.name === 'ROMDIR');
  const curname = searches.filter((record) => record.mem[0].bytes.readUInt32LE(8) === base + start + romdir.size);
  const structs = curname.filter((record) => record.mem[0].bytes.readUInt32LE(0) === base && record.mem[0].bytes.readUInt32LE(4) === base + start);
  const listed = entries.map((entry) => entry.name).join(' ');
  if (listed !== ['RESET', 'ROMDIR', 'EXTINFO'].concat(SOUND).join(' ')) fail(`the directory lists ${listed}`);
  console.log(`romdir: RESET entry at ${hex(start)}, ${entries.length} entries; curname struct (base, directory, extinfo) = (${hex(base)}, ${hex(base + start)}, ${hex(base + start + romdir.size)}) in ${structs.length} of ${searches.length} search records`);
  if (structs.length === 0) fail('no romdir_search_entry record carries the recomputed directory struct');

  // 3. The resource table and its bump allocator.
  const load = loads[0];
  if (!load) fail('load_sound_resources was not reached');
  const table = load.mem[0].bytes;
  const names = load.mem[1].bytes;
  const start0 = starts[0];
  if (!start0) fail('the resource loader was not reached');
  const preset = start0.mem[0].bytes;
  const slots = [];
  let bump = A.bump;
  let allocated = 0;
  for (let i = 0; i < TABLE_ENTRIES; i++) {
    const pointer = table.readUInt32LE(16 * i);
    const at = pointer - A.names[0];
    let end = at;
    while (end < names.length && names[end] !== 0) end += 1;
    const slot = { index: i, name: names.toString('latin1', at, end), dest: table.readUInt32LE(16 * i + 4), size: table.readUInt32LE(16 * i + 8), flags: table.readUInt32LE(16 * i + 12) };
    const given = preset.readUInt32LE(16 * i + 4);
    const wantDest = given !== 0 ? given : ((bump + 15) >>> 4) << 4;
    if (slot.dest === wantDest) allocated += 1;
    else fail(`table entry ${i} ${slot.name}: slot ${hex(slot.dest)}, the allocator gives ${hex(wantDest)}`);
    bump = slot.dest + ((slot.flags & 7) === 2 ? 0 : slot.size);
    slots.push(slot);
  }
  console.log(`allocator: ${allocated} of ${TABLE_ENTRIES} slots follow the allocator from ${hex(A.bump)}`);

  // 4. Expand, member by member.
  const memory = joined(load, 2, pieces(A.data[0], A.data[1]).length);
  let equal = 0;
  let bytes = 0;
  const lines = [];
  for (const name of SOUND) {
    const entry = entries.find((candidate) => candidate.name === name);
    const slot = slots.find((candidate) => candidate.name === name);
    if (!entry || !slot) { fail(`${name}: not in the container or the table`); continue; }
    const calls = expands.filter((record) => (record.gpr[4] >>> 0) === base + entry.offset && (record.gpr[5] >>> 0) === slot.dest);
    if (calls.length === 0) { fail(`${name}: no Expand call with (${hex(base + entry.offset)}, ${hex(slot.dest)})`); continue; }
    const result = expand(container, entry.offset);
    const got = memory.subarray(slot.dest - A.data[0], slot.dest - A.data[0] + slot.size);
    const sizeOk = expandSize(container, entry.offset) === slot.size && result.size === slot.size && result.consumed === entry.size;
    const outOk = got.length === slot.size && same(result.out, got);
    if (sizeOk && outOk) { equal += 1; bytes += slot.size; } else fail(`${name}: size ${sizeOk ? 'ok' : `stream ${result.size} read ${result.consumed} of ${entry.size}, table ${slot.size}`}, bytes ${outOk ? 'equal' : 'differ'}`);
    lines.push(`  ${name.padEnd(9)} stream ${String(entry.size).padStart(6)} -> ${String(slot.size).padStart(6)} bytes (${result.produced - result.size} past the end), read ${result.consumed}, ${calls.length} call${calls.length > 1 ? 's' : ''}, ${sizeOk && outOk ? 'equal' : 'DIFFERENT'}`);
  }
  for (const line of lines) console.log(line);
  console.log(`members: ${equal} of ${SOUND.length} equal, ${bytes} bytes`);

  // 5. Against ROM 2.30 (information).
  if (BUILD === 'hdd') {
    const other = romdirEntries(romContainer, romdirStart(romContainer));
    const diff = [];
    for (const name of SOUND) {
      const mine = entries.find((entry) => entry.name === name);
      const theirs = other.find((entry) => entry.name === name);
      if (!theirs || mine.size !== theirs.size || !same(container.subarray(mine.offset, mine.offset + mine.size), romContainer.subarray(theirs.offset, theirs.offset + theirs.size))) diff.push(`${name} (${mine.size} vs ${theirs?.size} bytes)`);
    }
    console.log(`against ROM 2.30: ${SOUND.length - diff.length} of ${SOUND.length} members byte-identical; differ: ${diff.join(', ') || 'none'}`);
  }

  for (const text of problems) console.log(`problem: ${text}`);
  const ok = problems.length === 0 && equal === SOUND.length && containers.length > 0 && structs.length > 0 && allocated === TABLE_ENTRIES;
  console.log(`verdict: ${ok ? `FOUND ${equal} sound members: container, ROMDIR, allocator and Expand output equal` : `PARTIAL ${equal} of ${SOUND.length} members equal, ${problems.length} problems`}`);
  process.exit(ok ? 0 : 3);
}
