// The sound banks as OSDSND holds them, HDD OSD 1.10U.
//
// SNDIMAGE (host file, decrypted with the cipher tables and key words of hddosd.elf, ROMDIR, Expand: see
// verify_sound_expand.mjs) yields the HD, BD and SQ members. What the program does with them:
//   - SNDBOOTB at SPU2 RAM byte 0x5010 and SNDOSDDB at 0x85010 (DMA, verify_sound_init.mjs), compared here with
//     the start capture's SPU2 RAM dump;
//   - the HD and SQ members stay in IOP RAM at the addresses the EE sends with 0x6060 (HD) and 0x6090 (SQ);
//     compared here with the IOP RAM the start capture dumped (0x000EB000..0x000FA000). OSDSND edits them in
//     place: 0x6130 writes the sequence volume to byte 0 of an SQ, 0x6310 the effect master to byte 0x80 of the
//     OSDD HD, and the sequencer writes the channel records of the running SQ; every other byte is equal.
//   - parseHd / parseSq (../model/sound_banks.mjs) are checked against the structure of those bytes.
// node verify_sound_banks.mjs <capture>.start.spuram.bin   (reads <capture>.start.iopsound.bin beside it)
import fs from 'node:fs';
import { decryptImage, imageKey, romdirStart, romdirEntries, expand, CIPHER_TABLES, CIPHER_TABLE_SIZES } from '../model/sound_data.mjs';
import { parseHd, parseSq } from '../model/sound_banks.mjs';

const DUMPS = process.env.CLOCK_DUMPS ?? 'D:/CodingProjects/CrystalOSD-Data/dumps/hddosd-host';
const KEY_WORDS = 0x002ad970;
const IOP_BASE = 0xeb000;
const HD_AT = { SNDBOOTH: 0xebc00, SNDOSDDH: 0xf1c00 };
const SQ_AT = { SNDBOOTS: 0xecc00, SNDTNNLS: 0xedc00, SNDCLOKS: 0xeec00, SNDTM30S: 0xefc00, SNDTM60S: 0xf0c00, SNDLOGOS: 0xf2c00, SNDWARNS: 0xf3c00, SNDRCLKS: 0xf4c00 };
const BD_AT = { SNDBOOTB: 0x5010, SNDOSDDB: 0x85010 };

const [spuFile] = process.argv.slice(2);
const iopFile = spuFile.replace('.start.spuram.bin', '.start.iopsound.bin');
const spuRam = fs.readFileSync(spuFile);
const iop = fs.readFileSync(iopFile);

const elf = fs.readFileSync(`${DUMPS}/hddosd.elf`);
const phoff = elf.readUInt32LE(0x1c);
const phnum = elf.readUInt16LE(0x2c);
const phsize = elf.readUInt16LE(0x2a);
const segments = Array.from({ length: phnum }, (_, i) => {
  const o = phoff + i * phsize;
  return { type: elf.readUInt32LE(o), off: elf.readUInt32LE(o + 4), vaddr: elf.readUInt32LE(o + 8), size: elf.readUInt32LE(o + 16) };
}).filter((s) => s.type === 1);
const fromElf = (vaddr, length) => {
  const s = segments.find((candidate) => vaddr >= candidate.vaddr && vaddr + length <= candidate.vaddr + candidate.size);
  if (!s) throw new Error(`0x${vaddr.toString(16)} is not in a file-backed segment of hddosd.elf`);
  return elf.subarray(s.off + vaddr - s.vaddr, s.off + vaddr - s.vaddr + length);
};
const tables = Object.fromEntries(Object.keys(CIPHER_TABLES).map((k) => [k, fromElf(CIPHER_TABLES[k], CIPHER_TABLE_SIZES[k])]));
const words = fromElf(KEY_WORDS, 16);
const key = imageKey(words.readBigUInt64LE(0), words.readBigUInt64LE(8));
const image = decryptImage(fs.readFileSync(`${DUMPS}/SNDIMAGE`), tables, key);
const entries = romdirEntries(image, romdirStart(image));
const member = (name) => {
  const entry = entries.find((e) => e.name === name);
  if (!entry) throw new Error(`${name} is not in SNDIMAGE`);
  return Buffer.from(expand(image, entry.offset).out);
};

let compared = 0;
const failures = [];
const check = (ok, what) => { compared += 1; if (!ok) failures.push(what); };
const same = (a, b) => a.length === b.length && Buffer.compare(a, b) === 0;
let bdBytes = 0;
const lines = [];

for (const [name, at] of Object.entries(BD_AT)) {
  const data = member(name);
  const held = spuRam.subarray(at, at + data.length);
  const equal = same(held, data);
  check(equal, { why: 'BD in SPU2 RAM', name, at });
  if (equal) bdBytes += data.length;
  lines.push(`${name}: ${data.length} bytes at SPU2 RAM 0x${at.toString(16)} ${equal ? 'equal' : 'DIFFERENT'}`);
}

const hdBoot = member('SNDBOOTH');
const hdOsd = member('SNDOSDDH');
const sqMembers = Object.fromEntries(Object.keys(SQ_AT).map((n) => [n, member(n)]));

const heldAt = (at, length) => iop.subarray(at - IOP_BASE, at - IOP_BASE + length);
const differing = (a, b) => { const out = []; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) out.push(i); return out; };

check(same(heldAt(HD_AT.SNDBOOTH, hdBoot.length), hdBoot), { why: 'SNDBOOTH in IOP RAM' });
lines.push(`SNDBOOTH: ${hdBoot.length} bytes in IOP RAM at 0x${HD_AT.SNDBOOTH.toString(16)}, ${differing(heldAt(HD_AT.SNDBOOTH, hdBoot.length), hdBoot).length} differ`);
{
  const diffs = differing(heldAt(HD_AT.SNDOSDDH, hdOsd.length), hdOsd);
  const master = parseHd(hdOsd).effectTable;
  check(diffs.length === 1 && diffs[0] === master, { why: 'SNDOSDDH differs only at the effect master', diffs });
  check(heldAt(HD_AT.SNDOSDDH, hdOsd.length)[master] === 0x1c, { why: 'effect master after 0x6310', got: heldAt(HD_AT.SNDOSDDH, hdOsd.length)[master] });
  lines.push(`SNDOSDDH: ${hdOsd.length} bytes in IOP RAM at 0x${HD_AT.SNDOSDDH.toString(16)}; byte 0x${master.toString(16)} ${hdOsd[master].toString(16)} -> ${heldAt(HD_AT.SNDOSDDH, hdOsd.length)[master].toString(16)}`);
}
const volumes = [];
for (const [name, at] of Object.entries(SQ_AT)) {
  const data = sqMembers[name];
  const held = heldAt(at, data.length);
  const diffs = differing(held, data);
  const running = name === 'SNDCLOKS';
  const outside = diffs.filter((d) => d !== 0 && !(running && d >= 0x10 && d < 0x110));
  check(outside.length === 0, { why: 'SQ differs outside its volume byte and channel records', name, outside: outside.slice(0, 8) });
  check(same(held.subarray(0x110), data.subarray(0x110)), { why: 'SQ events equal', name });
  volumes.push(`${name} ${held[0].toString(16)}`);
  lines.push(`${name}: ${data.length} bytes in IOP RAM at 0x${at.toString(16)}; ${diffs.length} bytes differ (volume byte${running ? ' and channel records' : ''})`);
}
lines.push(`sequence volume bytes: ${volumes.join(', ')}`);

for (const [name, hd, bdName] of [['SNDBOOTH', hdBoot, 'SNDBOOTB'], ['SNDOSDDH', hdOsd, 'SNDOSDDB']]) {
  const parsed = parseHd(hd);
  const bdLength = member(bdName).length;
  if (name === 'SNDBOOTH') {
    const wanted = [60, 70, 42, 40, 50, 51, 52];
    for (const id of wanted) check(parsed.programs.some((p) => p.id === id), { why: 'program present', id });
    const ordered = [...parsed.programs].sort((a, b) => a.offset - b.offset);
    ordered.forEach((p, i) => {
      const next = ordered[i + 1];
      if (next) check(next.offset - p.offset === 8 + 16 * p.tones.length, { why: 'tone count from the program spacing', id: p.id, tones: p.tones.length, span: next.offset - p.offset });
      for (const t of p.tones) check(t.sampleStart * 8 < bdLength && t.keyLow <= t.keyHigh, { why: 'tone inside the BD', id: p.id, t: t.sampleStart });
    });
    check(parsed.velocity !== null && parsed.velocity.length === 128 && parsed.velocity.every((v, i) => v === i), { why: 'velocity table', head: parsed.velocity?.slice(0, 4) });
    lines.push(`${name}: ${parsed.programs.length} programs, ${parsed.programs.reduce((n, p) => n + p.tones.length, 0)} tones`);
  } else {
    check(parsed.effects !== null && parsed.effectMaster === 0x64, { why: 'effect table', master: parsed.effectMaster });
    const used = parsed.effects.filter((e) => e.bdOffset !== 0 || e.pitch !== 0);
    for (const e of used) check(e.bdOffset < bdLength, { why: 'effect inside the BD', bd: e.bdOffset });
    const expectedBd = { 0: 0x3c60, 1: 0x3c60, 2: 0x9d0, 3: 0x9d0, 4: 0x81d0, 5: 0xa890, 6: 0x7dc0 };
    for (const [n, bd] of Object.entries(expectedBd)) check(parsed.effects[Number(n)]?.bdOffset === bd, { why: 'effect BD offset', n, got: parsed.effects[Number(n)]?.bdOffset });
    lines.push(`${name}: ${parsed.effects.length} effect records, ${used.length} used`);
  }
}

{
  const sq = parseSq(sqMembers.SNDCLOKS);
  const noteOns = sq.events.filter((e) => (e.status & 0xf0) === 0x90 && e.data[1] > 0).length;
  const loops = sq.events.filter((e) => (e.status & 0xf0) === 0xb0 && e.data[0] === 99);
  check(sq.resolution === 480 && sq.tempo === 120, { why: 'resolution and tempo', res: sq.resolution, tempo: sq.tempo });
  check(sq.events.find((e) => e.status === 0xff && e.data[0] === 0x51)?.data[1] === 120, { why: 'tempo meta' });
  check(sq.channels.length === 7 && JSON.stringify(sq.channels.map((c) => c.program)) === JSON.stringify([60, 70, 42, 40, 50, 51, 52]), { why: 'channels', got: sq.channels.map((c) => c.program) });
  check(sq.events.length === 278, { why: 'events', got: sq.events.length });
  check(noteOns === 126, { why: 'note-ons', got: noteOns });
  check(loops.length === 2 && loops[0].tick === 18240 && loops[0].data[1] === 20 && loops[1].tick === 288000 && loops[1].data[1] === 30, { why: 'loop markers', loops });
  check(sq.events.at(-1).status === 0xff && sq.events.at(-1).data[0] === 0x2f, { why: 'end marker' });
  const bootProgramIds = new Set(parseHd(hdBoot).programs.map((p) => p.id));
  for (const c of sq.channels) check(bootProgramIds.has(c.program), { why: 'channel program exists in SNDBOOTH', program: c.program });
  lines.push(`SNDCLOKS: volume ${sq.volume}, resolution ${sq.resolution}, tempo ${sq.tempo}, ${sq.channels.length} channels, ${sq.events.length} events, ${noteOns} note-ons, loops at ${loops.map((l) => l.tick).join(' and ')}`);
}

for (const [name, data] of Object.entries(sqMembers)) {
  const sq = parseSq(data);
  check(sq.events.at(-1).data[0] === 0x2f, { why: 'SQ ends with FF 2F', name });
}

for (const line of lines) console.log(line);
console.log(`BD bytes compared: ${bdBytes}`);
if (compared === 0) throw new Error('compared nothing: not a verifier');
console.log(`compared ${compared} items, ${failures.length} differ`);
for (const f of failures.slice(0, 10)) console.log(JSON.stringify(f));
console.log(failures.length === 0 ? `verdict: FOUND ${compared} items equal` : `verdict: PARTIAL ${failures.length} of ${compared} differ`);
process.exit(failures.length === 0 ? 0 : 1);
