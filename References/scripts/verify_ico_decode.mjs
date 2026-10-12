// The Browser's device icons, from ICOIMAGE to the GS, bit for bit.
//
// The program loads an icon with module_browser_23AFC8 (HDD OSD 1.10U 0x0023AFC8, ROM 2.30 0x00237608), which calls
// module_browser_23B130 (0x0023B130, ROM 0x002376B8) to turn the expanded .ico member into a vertex packet (buffer 0) and a
// texture packet (buffer 1) and to write the slot's DMA descriptor, shape count, header float, keyframe table and position box
// (the model: ../model/browser_icons.mjs). Every draw then uploads the texture packet to DBP 0x3A98, 128 x 128 PSMCT16.
//
// The recomputation, from the files alone: ICOIMAGE (HDD OSD: the host file decrypted with hddosd.elf's cipher tables and the
// key words at 0x002AD970; ROM: the BIOS ROMDIR member), its ROMDIR, Expand, the parse, the RLE16 decode, the packets.
// Compared with the capture:
//   a. at each load call the 16 [13 on ROM] expanded members in EE memory (resource rows -> destinations) equal the decoded members
//      (with the capture's stimulus writes laid over them), and the member the load is given (a1) is the one its row says;
//   b. at each load's return: the parser returns 0 for a member the model accepts and -1 (shape word cleared) for one it rejects; for an
//      accepted one the vertex words and texture words it reports, the vertex packet (buffer 0), the texture packet (buffer 1:
//      DIRECTHL word, A+D, IMAGE tag, 0x8000 texture bytes), the shape count, the header float, the keyframe table, the position box
//      (HDD OSD) and the descriptor words equal the model's;
//   c. every upload of 0x8000 bytes to DBP 0x3A98 in the trace's GS packets (with BITBLTBUF, TRXPOS, TRXREG, TRXDIR, TEX0_1 as the
//      program sets them) equals the texture of a member loaded in the capture, and
//   d. GS memory read after the capture (<name>.gsmem, GS bytes 0x3A9800..0x3B1800), through the PSMCT16 address function,
//      equals the last upload and the decoded texture.
// Positive controls: 16 [13] members parse and end within 6 bytes of their size; the common members are byte-equal in the two builds'
// containers. Negative controls: every comparison above is repeated on a copy of the capture's records with one value changed
// (a byte, a register, a word), and must fail; the verdict function must refuse each single missing condition.
// node verify_ico_decode.mjs <trace> [<gsmem>]   (default: <name>.gsmem beside the trace)
import fs from 'node:fs';
import crypto from 'node:crypto';
import { readTraceFor, GifPath, floatBits, pick, range, pc, BUILD, BUILD_NAME, dataPath } from '../lib/index.mjs';
import {
  ICON_NAMES, ICO_LIMIT, TEXTURE_BYTES, TEXTURE_PACKET_WORDS, TEXTURE_DBP, TEXTURE_DBW, PAIR_INDEX,
  BOX_INIT, cipherKit, decryptIcoImage, biosIcoImage, icoMembers, parseIco, vertexPacket, texturePacket, iconBox, keyTable, readTexture16,
} from '../model/browser_icons.mjs';

// The loader, the parser, the loader's return; the resource rows (ICOB members) and the first member row's offset in the slice;
// the buffers (vertex 0x48000 and texture 0x9000 per slot); the slot tables the parser writes; where it leaves its two words.
const A = pick({
  hdd: {
    load: 0x0023afc8, enter: 0x0023b130, ret: 0x0023b08c,
    rows: 0x002ad620, rowCount: 16, skip: 0, keyWords: 0x002ad970,
    bases: 0x0037082c, buf0: 0x00b5c000, buf1: 0x009d0000,
    members: [0x01e4b810, 0x0005d2f8],
    outs: [0x004da130],
    shapes: 0x0041eeb4, keys: 0x0041ef64, descTable: 0x00426c84, desc: 0x002a5a80, header: 0x002a8100, box: 0x00426d40, pairs: 0x002ba120,
  },
  rom: {
    load: 0x00237608, enter: 0x002376b8, ret: 0x00237680,
    rows: 0x0027b8b8, rowCount: 14, skip: 1, keyWords: null,
    bases: 0x002c8d8c, buf0: 0x00bdc000, buf1: 0x00a50000,
    members: [0x01dc0530, 0x0003b398],
    outs: [0x0040e780, 0x0040e7d0],
    shapes: 0x0038ae84, keys: 0x0038af34, descTable: 0x00392c54, desc: 0x00274c00, header: 0x00277280, box: null, pairs: 0x0029b380,
  },
});
const SLOTS = 4;
const SLOT_COUNT = 44;
const BUF0_SIZE = 0x1d000;
const BUF1_SIZE = 0x8050;
const CHUNK = 0x10000;
const pieces = (start, length) => Array.from({ length: Math.ceil(length / CHUNK) }, (_, i) => range(start + i * CHUNK, Math.min(CHUNK, length - i * CHUNK)));
export const PROBES = [
  { pc: pc(A.load), ranges: [range(A.rows, A.rowCount * 16)].concat(A.keyWords ? [range(A.keyWords, 16)] : [], [range(A.bases, 8)], pieces(A.members[0], A.members[1])) },
  { pc: pc(A.enter), ranges: A.box ? [range(A.box, SLOT_COUNT * 32)] : [] },
  {
    pc: pc(A.ret),
    ranges: A.outs.map((at) => range(at, 8)).concat([
      range(A.shapes, SLOT_COUNT * 4), range(A.keys, SLOT_COUNT * 0x2d8), range(A.descTable, SLOT_COUNT * 4), range(A.desc, SLOT_COUNT * 0x50), range(A.header, SLOT_COUNT * 0xe0), range(A.pairs, 0x28),
    ], A.box ? [range(A.box, SLOT_COUNT * 32)] : [],
    Array.from({ length: SLOTS }, (_, s) => pieces(A.buf0 + 0x48000 * s, BUF0_SIZE)).flat(),
    Array.from({ length: SLOTS }, (_, s) => range(A.buf1 + 0x9000 * s, BUF1_SIZE))),
  },
];

const hex = (x) => `0x${(x >>> 0).toString(16)}`;
const sha = (buffer) => crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 10);
const same = (a, b) => a.length === b.length && Buffer.compare(a, b) === 0;

// Probed memory: the bytes of [address, address + length) across the record's ranges, or null where a range is missing.
const bytesAt = (record, address, length) => {
  const out = Buffer.alloc(length);
  let at = address;
  while (at < address + length) {
    const m = record.mem.find((entry) => entry.bytes && at >= entry.address && at < entry.address + entry.bytes.length);
    if (!m) return null;
    const take = Math.min(address + length, m.address + m.bytes.length) - at;
    m.bytes.copy(out, at - address, at - m.address, at - m.address + take);
    at += take;
  }
  return out;
};
const wordAt = (record, address) => bytesAt(record, address, 4)?.readUInt32LE(0) ?? null;

// What the uploads must look like at the GS: the program's BITBLTBUF, TRXPOS, TRXREG, TRXDIR and TEX0_1 for the icon texture.
const WANT = { bitblt: 0x0202000000000000n | (BigInt(TEXTURE_DBP) << 32n), trxpos: 0n, trxreg: 0x0000008000000080n, trxdir: 0n, tex0: 0x1dc208000n | BigInt(TEXTURE_DBP) };
const isIconUpload = (u) => u.bitblt === WANT.bitblt && u.trxpos === WANT.trxpos && u.trxreg === WANT.trxreg && u.trxdir === WANT.trxdir;
const isIconTex0 = (u) => u.tex0 === WANT.tex0;

// One load: the loader's call, the parser's entry and its return. Returns what was compared; `problems` is empty when they agree.
// `context`: members (decoded), kit (HDD key words), writes (the capture's stimulus writes).
function inspect({ load, enter, ret }, context) {
  const problems = [];
  let compared = 0;
  const check = (ok, what) => { compared += 1; if (!ok) problems.push(what); return ok; };
  const { members, kit, writes } = context;
  const slot = enter.gpr[8];
  const rowBytes = load.mem[0].bytes;
  const label = `load (frame ${load.frame})`;
  // a. the members as the EE holds them, with the stimulus writes laid over the decode.
  let held = 0;
  const dests = [];
  const memberBytes = members.map((member, k) => {
    const row = (k + A.skip) * 16;
    const dest = rowBytes.readUInt32LE(row + 4);
    dests.push(dest);
    const want = Buffer.from(member.data);
    for (const w of writes) {
      const low = Math.max(dest, w.address), high = Math.min(dest + want.length, w.address + w.bytes.length);
      if (w.captureFrame <= load.captureFrame && low < high) w.bytes.copy(want, low - dest, low - w.address, high - w.address);
    }
    const memory = bytesAt(load, dest, member.data.length);
    if (check(rowBytes.readUInt32LE(row + 12) === 4 && rowBytes.readUInt32LE(row + 8) === member.data.length && memory !== null && same(memory, want), `${label}: member ${member.name} at ${hex(dest)} differs from the decode`)) held += 1;
    return want;
  });
  if (A.keyWords) check(same(load.mem[1].bytes, kit.words), `${label}: the key words in memory differ from the ELF's`);
  const baseWords = load.mem[A.keyWords ? 2 : 1].bytes;
  check(baseWords.readUInt32LE(0) === A.buf0, `${label}: the vertex buffer base is ${hex(baseWords.readUInt32LE(0))}`);
  check(baseWords.readUInt32LE(4) === A.buf1, `${label}: the texture buffer base is ${hex(baseWords.readUInt32LE(4))}`);
  const given = dests.indexOf(load.gpr[5]);
  if (!check(given >= 0, `${label}: the load is given ${hex(load.gpr[5])}, no member's destination`)) return { problems, compared, kind: 'skipped' };
  check(load.gpr[6] === ICO_LIMIT, `${label}: the limit is ${hex(load.gpr[6])}`);
  check(load.gpr[4] === slot, `${label}: slot ${load.gpr[4]} at the loader, ${slot} at the parser`);
  const member = members[given];
  let ico;
  try { ico = parseIco(memberBytes[given]); } catch (error) { ico = { ok: false, why: `unreadable (${error.message})` }; }
  const shown = `${member.name} (member ${given}, ${hex(load.gpr[5])})`;
  // b. the parser's call and its result.
  check(enter.gpr[4] === A.buf0 + 0x48000 * slot, `${label}: the parser's vertex buffer is ${hex(enter.gpr[4])}`);
  check(enter.gpr[5] === A.buf1 + 0x9000 * slot, `${label}: the parser's texture buffer is ${hex(enter.gpr[5])}`);
  check(enter.gpr[6] === load.gpr[5], `${label}: the parser reads ${hex(enter.gpr[6])}`);
  check(enter.gpr[7] === ICO_LIMIT, `${label}: the parser's limit is ${hex(enter.gpr[7])}`);
  const outAt = enter.gpr[9];
  check(enter.gpr[10] === outAt + 4, `${label}: the word outputs are not adjacent`);
  if (A.box) {
    const initial = bytesAt(enter, A.box + 32 * slot, 32);
    const words = BOX_INIT.min.concat(BOX_INIT.max).map((value) => floatBits(value));
    check(initial !== null && words.every((w, i) => initial.readUInt32LE(4 * i) === w), `${label}: the position box starts as ${initial ? initial.toString('hex') : '?'}`);
  }
  const shapeWord = wordAt(ret, A.shapes + 4 * slot);
  if (!ico.ok) {
    check(ret.gpr[2] === 0xffffffff, `${label}: the model rejects ${member.name} (${ico.why}), the parser returns ${hex(ret.gpr[2])}`);
    check(shapeWord === 0, `${label}: the slot's shape word is ${shapeWord} after the rejection`);
    return { problems, compared, kind: 'rejected', given, line: `${label}: slot ${slot} ${shown}: ${held}/${members.length} members in memory equal the decode; the parser returns -1, rejected by the model: ${ico.why}` };
  }
  check(ret.gpr[2] === 0, `${label}: the parser returns ${hex(ret.gpr[2])} for a member the model accepts`);
  const out = bytesAt(ret, outAt, 8);
  if (!check(out !== null, `${label}: no output words at ${hex(outAt)}`)) return { problems, compared, kind: 'skipped' };
  const vertexWords = out.readUInt32LE(0), textureWords = out.readUInt32LE(4);
  const model = vertexPacket(ico);
  check(vertexWords === model.length, `${label}: vertex words ${vertexWords}, model ${model.length}`);
  check(textureWords === (ico.textured ? TEXTURE_PACKET_WORDS : 0), `${label}: texture words ${hex(textureWords)}`);
  const buf0 = bytesAt(ret, enter.gpr[4], vertexWords * 4);
  check(buf0 !== null, `${label}: the vertex packet (${vertexWords} words) is not inside the probed ranges`);
  const vertexOk = check(buf0 !== null && same(buf0, Buffer.from(model.buffer, model.byteOffset, model.byteLength)), `${label}: the vertex packet differs from the model`);
  let textureOk = true;
  let textureKey = null;
  if (ico.textured) {
    const buf1 = bytesAt(ret, enter.gpr[5], BUF1_SIZE);
    check(buf1 !== null, `${label}: the texture packet is not inside the probed ranges`);
    textureOk = check(buf1 !== null && same(buf1, texturePacket(ico)), `${label}: the texture packet differs from the model`);
    if (buf1) textureKey = sha(buf1.subarray(0x50));
  }
  check(shapeWord === ico.shapes, `${label}: shape count ${shapeWord} in the slot table`);
  check(wordAt(ret, A.header + 0xe0 * slot + 0x40) === ico.headerFloat, `${label}: header float in the slot block`);
  const keysAt = A.keys + 0x2d8 * slot;
  for (const [offset, word] of keyTable(ico.keys)) check(wordAt(ret, keysAt + offset) === word, `${label}: keyframe table word +${hex(offset)}`);
  if (A.box) {
    const box = iconBox(ico);
    const got = bytesAt(ret, A.box + 32 * slot, 32);
    check(got !== null && box.min.concat(box.max).every((w, i) => got.readUInt32LE(4 * i) === w), `${label}: the position box differs from the model`);
  }
  const descAt = wordAt(ret, A.descTable + 4 * slot);
  const desc = descAt === null ? null : bytesAt(ret, descAt, 0x38);
  const pair = bytesAt(ret, A.pairs + 8 * PAIR_INDEX[ico.shapes], 8);
  const wantDesc = [[0, (0x30000000 | (textureWords >>> 2)) >>> 0], [4, (enter.gpr[5] & 0xfffffff) >>> 0], [0x10, pair?.readUInt32LE(0)], [0x14, pair?.readUInt32LE(4)], [0x30, (0x30000000 | (vertexWords >>> 2)) >>> 0], [0x34, (enter.gpr[4] & 0xfffffff) >>> 0]];
  for (const [offset, word] of wantDesc) check(desc !== null && pair !== null && desc.readUInt32LE(offset) === word, `${label}: descriptor word +${hex(offset)}`);
  const line = `${label}: slot ${slot} ${shown}: ${held}/${members.length} members in memory equal the decode; shapes ${ico.shapes}, ${ico.count} vertices, ${vertexWords} vertex words (${vertexOk ? 'packet equal' : 'DIFFERENT'}), ${textureWords} texture words (${ico.textured ? (textureOk ? `packet equal, texture ${sha(ico.texture)}` : 'DIFFERENT') : 'no texture'}); keyframe table, descriptor ${hex(descAt ?? 0)}${A.box ? ', box' : ''}`;
  return { problems, compared, kind: 'accepted', given, line, textureKey, texture: ico.texture, name: member.name, ico };
}

// A copy of a probe record with its registers and memory ranges copied, for a negative control to change.
const copyOf = (record) => ({ ...record, gpr: record.gpr.slice(), mem: record.mem.map((entry) => ({ ...entry, bytes: entry.bytes ? Buffer.from(entry.bytes) : null })) });
const copyView = (view) => ({ load: copyOf(view.load), enter: copyOf(view.enter), ret: copyOf(view.ret) });
const flip = (record, address, mask = 1) => {
  const m = record.mem.find((entry) => entry.bytes && address >= entry.address && address < entry.address + entry.bytes.length);
  m.bytes[address - m.address] ^= mask;
};

// The single-fault copies of a view: each must make `inspect` report a problem.
function faults(view, result, members) {
  const { load, enter, ret } = view;
  const slot = enter.gpr[8];
  const dest = load.gpr[5];
  const row = A.rows + 16 * (result.given + A.skip);
  const list = [];
  const add = (name, change) => list.push([name, change]);
  add('a byte of the loaded member', (v) => flip(v.load, dest + 7));
  add('the last byte of the loaded member', (v) => flip(v.load, dest + members[result.given].data.length - 1));
  add('the first byte of the first member', (v) => flip(v.load, A.members[0]));
  add('the last byte of the last member', (v) => flip(v.load, A.members[0] + A.members[1] - 1));
  add('a row type', (v) => flip(v.load, row + 12, 0x10));
  add('a row size', (v) => flip(v.load, row + 8, 0x10));
  if (A.keyWords) add('a key word', (v) => flip(v.load, A.keyWords + 5));
  add('the vertex buffer base', (v) => flip(v.load, A.bases, 0x10));
  add('the texture buffer base', (v) => flip(v.load, A.bases + 4, 0x10));
  add('the loader limit', (v) => { v.load.gpr[6] += 16; });
  add('the member pointer', (v) => { v.load.gpr[5] += 16; });
  add('the loader slot', (v) => { v.load.gpr[4] += 1; });
  add('the parser vertex buffer', (v) => { v.enter.gpr[4] += 16; });
  add('the parser texture buffer', (v) => { v.enter.gpr[5] += 16; });
  add('the parser member pointer', (v) => { v.enter.gpr[6] += 16; });
  add('the parser limit', (v) => { v.enter.gpr[7] += 16; });
  add('the second output pointer', (v) => { v.enter.gpr[10] += 4; });
  if (A.box) add('the initial position box', (v) => flip(v.enter, A.box + 32 * slot + 3));
  if (A.box) add('the initial box maximum', (v) => flip(v.enter, A.box + 32 * slot + 31));
  if (result.kind === 'rejected') {
    add('the return value', (v) => { v.ret.gpr[2] = 0; });
    add('the shape word', (v) => flip(v.ret, A.shapes + 4 * slot));
    return list;
  }
  const outAt = enter.gpr[9];
  add('the return value', (v) => { v.ret.gpr[2] = 0xffffffff; });
  add('the vertex word count', (v) => flip(v.ret, outAt, 0x10));
  add('the texture word count', (v) => flip(v.ret, outAt + 4, 0x10));
  add('the first vertex packet byte', (v) => flip(v.ret, enter.gpr[4]));
  add('a mid vertex packet byte', (v) => flip(v.ret, enter.gpr[4] + 4 * (result.ico.count >> 1)));
  add('the last vertex packet byte', (v) => flip(v.ret, enter.gpr[4] + 4 * wordAt(ret, outAt) - 1));
  add('the shape word', (v) => flip(v.ret, A.shapes + 4 * slot));
  add('the header float', (v) => flip(v.ret, A.header + 0xe0 * slot + 0x40));
  add('the first keyframe table word', (v) => flip(v.ret, A.keys + 0x2d8 * slot));
  add('the last keyframe table word', (v) => flip(v.ret, A.keys + 0x2d8 * slot + [...keyTable(result.ico.keys).keys()].pop()));
  if (A.box) add('the position box minimum', (v) => flip(v.ret, A.box + 32 * slot));
  if (A.box) add('the position box maximum', (v) => flip(v.ret, A.box + 32 * slot + 28));
  const descAt = wordAt(ret, A.descTable + 4 * slot);
  for (const offset of [0, 4, 0x10, 0x14, 0x30, 0x34]) add(`descriptor word +${hex(offset)}`, (v) => flip(v.ret, descAt + offset));
  add('the static descriptor pair', (v) => flip(v.ret, A.pairs + 8 * PAIR_INDEX[result.ico.shapes]));
  if (result.ico.textured) {
    add('the texture packet header', (v) => flip(v.ret, enter.gpr[5] + 12));
    add('the first texture byte', (v) => flip(v.ret, enter.gpr[5] + 0x50));
    add('the last texture byte', (v) => flip(v.ret, enter.gpr[5] + BUF1_SIZE - 1));
  }
  return list;
}

// The verdict as a function of what was found, so that it can be tested with one condition missing at a time.
const decide = (state) => state.problems === 0 && state.handled > 0 && state.handled === state.loads && state.compared > 0 && state.uploads >= state.needs
  && state.gs >= state.needs && state.parsed === state.members && state.controls > 0 && state.caught === state.controls;

if (process.argv[1] && process.argv[1].endsWith('verify_ico_decode.mjs')) {
  const [traceFile, given] = process.argv.slice(2);
  // The GS memory read of the capture lies beside its trace: <name>.gsmem.
  const gsFile = given ?? traceFile.replace(/\.trace\.jsonl(\.gz)?$/, '.gsmem');
  console.log(`build: ${BUILD_NAME}`);
  const problems = [];
  let compared = 0;
  const check = (ok, what) => { compared += 1; if (!ok) problems.push(what); return ok; };

  // The recomputed members.
  const elf = fs.readFileSync(dataPath('dumps/hddosd-host/hddosd.elf'));
  const kit = cipherKit(elf);
  const hddMembers = icoMembers(decryptIcoImage(fs.readFileSync(dataPath('dumps/hddosd-host/ICOIMAGE')), kit));
  const romMembers = icoMembers(biosIcoImage(fs.readFileSync(dataPath('bios/megadump/ps2-0230a-20080220.bin'))));
  const members = BUILD === 'hdd' ? hddMembers : romMembers;
  const expectedNames = BUILD === 'hdd' ? ICON_NAMES : ICON_NAMES.slice(0, 13);
  check(members.map((m) => m.name).join() === expectedNames.join(), `the container lists ${members.map((m) => m.name).join(' ')}`);
  const agree = (hdd, rom) => rom.filter((r) => hdd.some((h) => h.name === r.name && same(h.data, r.data))).length;
  const common = agree(hddMembers, romMembers);
  console.log(`positive control: key words 0x${kit.key.toString(16)}, ${members.length} members; the HDD container and the BIOS agree on ${common} of ${romMembers.length} common members`);
  check(common === romMembers.length, 'the BIOS and HDD containers differ on a common member');
  const parsed = members.map((m) => ({ ...m, ico: parseIco(m.data) }));
  let ended = 0;
  for (const m of parsed) {
    if (!check(m.ico.ok, `${m.name}: parse fails (${m.ico.why})`)) continue;
    const trailing = m.data.length - m.ico.end;
    if (trailing >= 0 && trailing <= 6) ended += 1;
    else problems.push(`${m.name}: the parse ends at ${m.ico.end} of ${m.data.length}`);
  }
  console.log(`positive control: ${parsed.filter((m) => m.ico.ok).length} of ${members.length} members parse, ${ended} end within 6 bytes of their size`);
  for (const m of parsed) {
    if (!m.ico.ok) continue;
    console.log(`  ${m.name.padEnd(5)} ${String(m.data.length).padStart(5)} bytes sha1 ${sha(m.data)}  shapes ${m.ico.shapes} flags ${m.ico.flags} vertices ${m.ico.count} keyframe words ${m.ico.keys.words}  texture ${m.ico.texture ? `${sha(m.ico.texture)}${m.ico.rle ? ' (RLE16)' : ' (raw)'}` : 'none'}`);
  }
  const textures = new Map();
  for (const m of parsed) if (m.ico.ok && m.ico.texture) textures.set(sha(m.ico.texture), (textures.get(sha(m.ico.texture)) ?? []).concat(m.name));

  const trace = readTraceFor(traceFile, PROBES);
  if (!trace.complete) { console.log(`trace: ${trace.reason}`); console.log('verdict: PARTIAL the trace is incomplete'); process.exit(3); }
  const loads = trace.probes.filter((record) => record.pc === A.load);
  const enters = trace.probes.filter((record) => record.pc === A.enter);
  const rets = trace.probes.filter((record) => record.pc === A.ret);
  console.log(`records: loads ${loads.length}, parser entries ${enters.length}, returns ${rets.length}`);
  check(loads.length === enters.length, 'a load has no matching parser entry');
  check(loads.length === rets.length, 'a load has no matching return');

  // Stimulus writes (the trace records them): the bytes the EE holds for a member are the decode with the writes laid over it.
  const writes = trace.inputs.filter((input) => input.type === 'write');
  if (writes.length > 0) console.log(`stimulus: ${writes.length} writes, ${writes.reduce((sum, w) => sum + w.bytes.length, 0)} bytes`);
  const context = { members, kit, writes };

  const loadedTextures = new Set();
  const results = [];
  const views = [];
  for (let j = 0; j < Math.min(loads.length, enters.length, rets.length); j++) {
    const view = { load: loads[j], enter: enters[j], ret: rets[j] };
    const result = inspect(view, context);
    views.push(view);
    results.push(result);
    compared += result.compared;
    for (const text of result.problems) problems.push(text);
    if (result.line) console.log(result.line);
    if (result.textureKey) {
      loadedTextures.add(result.textureKey);
      textures.set(sha(result.texture), [...new Set((textures.get(sha(result.texture)) ?? []).concat(result.name))]);
    }
  }
  const handled = results.filter((r) => r.kind === 'accepted' || r.kind === 'rejected').length;
  const rejected = results.filter((r) => r.kind === 'rejected').length;

  // c. the uploads in the GS packets.
  const state = new Map();
  const paths = new Map();
  const uploads = [];
  const feed = (packets, list) => {
    for (const packet of packets) {
      if (!paths.has(packet.path)) paths.set(packet.path, new GifPath());
      for (const event of paths.get(packet.path).feed(packet.bytes)) {
        if (event.kind === 'write') state.set(event.reg, event.value);
        else if (event.kind === 'image' && event.bytes === TEXTURE_BYTES && packet.bytes.length === TEXTURE_BYTES + 16) {
          list.push({ payload: packet.bytes.subarray(16), bitblt: state.get(0x50), trxpos: state.get(0x51), trxreg: state.get(0x52), trxdir: state.get(0x53), tex0: state.get(0x06) });
        }
      }
    }
  };
  const before = [];
  feed(trace.preroll, before);
  feed(trace.packets, uploads);
  // What is wrong with an upload to the icon texture: it must equal a decoded texture, and, after the first vsync, one loaded here.
  const uploadProblem = (u, afterVsync, known, loaded) => {
    const key = sha(u.payload);
    if (!isIconTex0(u)) return `TEX0_1 is not ${hex(Number(WANT.tex0))} at an upload`;
    if (!known.has(key)) return `an upload to DBP ${hex(TEXTURE_DBP)} (${key}) equals no decoded texture`;
    if (afterVsync && !loaded.has(key)) return `an upload (${key}, ${known.get(key).join('/')}) equals no texture loaded in this capture`;
    return null;
  };
  let toIcons = 0, inLoaded = 0;
  const counts = new Map();
  for (const [list, afterVsync] of [[before, false], [uploads, true]]) {
    for (const u of list) {
      if (!isIconUpload(u)) continue;
      toIcons += 1;
      compared += 1;
      const problem = uploadProblem(u, afterVsync, textures, loadedTextures);
      if (problem) { problems.push(problem); continue; }
      if (loadedTextures.has(sha(u.payload))) { inLoaded += 1; const name = textures.get(sha(u.payload)).join('/'); counts.set(name, (counts.get(name) ?? 0) + 1); }
    }
  }
  console.log(`uploads: ${toIcons} 128x128 PSMCT16 images to DBP ${hex(TEXTURE_DBP)} (BITBLTBUF, TRXPOS, TRXREG, TRXDIR, TEX0_1 as the program sets them), ${inLoaded} equal a texture loaded here: ${[...counts].map(([k, v]) => `${k} ${v}`).join(', ')}`);

  // d. GS memory after the capture.
  const gsProblem = (memory, last, known) => {
    if (memory.length !== TEXTURE_BYTES) return `the GS read is ${memory.length} bytes`;
    const picture = readTexture16(memory, TEXTURE_DBP * 256, TEXTURE_DBP, TEXTURE_DBW, 128, 128);
    if (!same(picture, last.payload)) return 'GS memory at DBP 0x3A98 differs from the last upload';
    if (!known.has(sha(picture))) return 'GS memory at DBP 0x3A98 equals no decoded texture';
    return null;
  };
  const last = [...uploads].reverse().find(isIconUpload);
  let gsCompared = 0;
  let gsMemory = null;
  if (last && !fs.existsSync(gsFile)) {
    problems.push(`no GS memory read at ${gsFile}`);
  } else if (last) {
    gsMemory = fs.readFileSync(gsFile);
    gsCompared = 1;
    compared += 1;
    const problem = gsProblem(gsMemory, last, textures);
    if (problem) problems.push(problem);
    else console.log(`GS memory: ${gsMemory.length} bytes from GS byte ${hex(TEXTURE_DBP * 256)}; the PSMCT16 image equals the last upload and the decoded texture of ${textures.get(sha(last.payload)).join('/')} (${sha(last.payload)})`);
  } else {
    console.log('GS memory: not compared (no upload)');
  }

  // Negative controls: one value changed in a copy, and the comparison must fail.
  const needs = results.some((r) => r.kind === 'accepted' && r.ico.textured) ? 1 : 0;
  let controls = 0, caught = 0;
  const control = (name, refused) => { controls += 1; if (refused) caught += 1; else problems.push(`negative control not caught: ${name}`); };
  const accepted = results.findIndex((r) => r.kind === 'accepted' && r.ico.textured && r.ico.count > 3);
  const plain = results.findIndex((r) => r.kind === 'accepted');
  const refused = results.findIndex((r) => r.kind === 'rejected');
  for (const index of new Set([accepted, plain, refused].filter((i) => i >= 0))) {
    for (const [name, change] of faults(views[index], results[index], members)) {
      const copy = copyView(views[index]);
      change(copy);
      control(`${name} of load ${index}`, inspect(copy, context).problems.length > 0);
    }
  }
  control('a changed byte of a member in the BIOS container', agree(hddMembers, romMembers.map((m, k) => (k === 2 ? { ...m, data: Buffer.concat([Buffer.from([m.data[0] ^ 1]), m.data.subarray(1)]) } : m))) < romMembers.length);
  control('buffers differing in one byte or in length', !same(Buffer.from([1, 2, 3]), Buffer.from([1, 2, 4])) && !same(Buffer.from([1, 2, 3]), Buffer.from([1, 2])) && same(Buffer.from([1, 2, 3]), Buffer.from([1, 2, 3])));
  const sample = uploads.find(isIconUpload) ?? before.find(isIconUpload);
  if (sample) {
    for (const field of ['bitblt', 'trxpos', 'trxreg', 'trxdir']) control(`a different ${field} at an upload`, !isIconUpload({ ...sample, [field]: (sample[field] ?? 0n) + 1n }));
    control('a different TEX0_1 at an upload', !isIconTex0({ ...sample, tex0: sample.tex0 + 1n }));
    const flipped = Buffer.from(sample.payload);
    flipped[0x4000] ^= 1;
    control('an upload with one texture byte changed', uploadProblem({ ...sample, payload: flipped }, true, textures, loadedTextures) !== null);
    control('an upload equal to no loaded texture', uploadProblem(sample, true, textures, new Set()) !== null);
    control('an unchanged upload is accepted', uploadProblem(sample, true, textures, loadedTextures) === null);
  }
  if (gsMemory && last) {
    const memory = Buffer.from(gsMemory);
    memory[0x1234] ^= 1;
    control('GS memory with one byte changed', gsProblem(memory, last, textures) !== null);
    control('GS memory shorter than the read', gsProblem(memory.subarray(1), last, textures) !== null);
    control('an unchanged GS read is accepted', gsProblem(gsMemory, last, textures) === null);
  }
  const good = { problems: 0, handled: 1, loads: 1, compared: 1, uploads: 1, needs: 1, gs: 1, parsed: 2, members: 2, controls: 3, caught: 3 };
  control('the verdict accepts a complete state', decide(good));
  for (const [name, change] of [['a problem', { problems: 1 }], ['no load handled', { handled: 0, loads: 0 }], ['a load not handled', { loads: 2 }], ['nothing compared', { compared: 0 }],
    ['no upload', { uploads: 0 }], ['no GS read', { gs: 0 }], ['a member that does not parse', { parsed: 1 }], ['more members than parsed', { members: 3 }], ['no negative control', { controls: 0, caught: 0 }],
    ['a negative control not refused', { caught: 2 }]]) control(`the verdict refuses ${name}`, !decide({ ...good, ...change }));
  control('the verdict accepts no uploads when no texture was loaded', decide({ ...good, uploads: 0, gs: 0, needs: 0 }));
  console.log(`negative controls: ${caught} of ${controls} changed copies refused`);

  console.log(`compares ${compared} items`);
  for (const line of problems.slice(0, 20)) console.log(`  ${line}`);
  const found = decide({ problems: problems.length, handled, loads: loads.length, compared, uploads: toIcons, needs, gs: gsCompared, parsed: ended, members: members.length, controls, caught });
  console.log(`verdict: ${found ? `FOUND ${handled} loads (${rejected} rejected), ${toIcons} uploads${gsCompared ? ', GS memory equal' : ''}, ${caught} negative controls` : `PARTIAL ${problems.length} problems, ${handled} loads compared, ${toIcons} uploads, GS memory ${gsCompared ? 'compared' : 'not compared'}`}`);
  process.exit(found ? 0 : 3);
}
