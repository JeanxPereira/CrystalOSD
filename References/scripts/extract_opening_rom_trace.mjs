// Run the opening's HDD OSD 1.10U verifiers on ROM 2.30 without rewriting them. With the address
// map of extract_opening_rom_map.mjs this
//
//   plan <verifier.mjs,...>            prints the probes to capture with on ROM 2.30 (JSON): every
//                                      probed program counter and absolute range moved to where the
//                                      same code and data sit in the ROM;
//   back <rom trace> <out trace> <verifier.mjs,...>
//                                      rewrites a trace captured with those probes as the HDD OSD
//                                      verifiers expect it: program counters back to HDD OSD's, each
//                                      range rebuilt in HDD OSD's layout from the ROM's bytes.
//
// A range whose data is laid out differently in the ROM (a variable inserted, a field moved) is
// cut at the addresses the two builds' code refers to, and each piece is read where the ROM keeps
// it. Probes whose function is not the same code in the ROM are left out and listed.
import fs from 'node:fs';
import { translator } from './extract_opening_rom_map.mjs';

const saved = JSON.parse(fs.readFileSync(new URL('../model/opening-rom-map.json', import.meta.url), 'utf8'));
// Pairs that can anchor a piece: word aligned, and not the leftovers of an upper half reused by
// an unrelated instruction (those differ by whole multiples of 0x10000, or not at all inside a
// block that moved).
const anchors = Object.entries(saved.data).map(([a, b]) => [parseInt(a, 16), parseInt(b, 16)])
  .filter(([a, b]) => (a & 3) === 0 && ((b - a) % 0x10000 !== 0 || (b === a && a < 0x001f0100)))
  .sort((x, y) => x[0] - y[0]);
const t = translator();
const hex = (x) => `0x${(x >>> 0).toString(16).padStart(8, '0')}`;

/** The pieces of an absolute HDD OSD range: [offset in the range, length, ROM address]. */
function pieces(base, length) {
  if (base >= 0x70000000) return [[0, length, base]];
  const start = anchors.filter(([a]) => a <= base).pop();
  if (!start || base - start[0] > 0x4000) return null;
  const out = [[0, length, base + (start[1] - start[0])]];
  for (const [a, b] of anchors) {
    if (a <= base || a >= base + length) continue;
    const last = out[out.length - 1];
    if (last[2] + (a - base - last[0]) === b) continue;
    last[1] = a - base - last[0];
    out.push([a - base, base + length - a, b]);
  }
  return out;
}

// A verifier may export ROM: for a probe whose function is other code in ROM 2.30, the place read
// there by hand, { '<HDD OSD pc>': { pc: '<ROM pc>', ranges: [...] } }; a range is a ROM range to
// copy, or { rom, length, pieces } to rebuild HDD OSD's layout. Without ranges the probe's own
// are moved by the map.
const byHand = {};
async function load(verifiers) {
  const probes = [];
  for (const v of verifiers.split(',')) {
    const module = await import(new URL(`./${v}`, import.meta.url));
    Object.assign(byHand, module.ROM ?? {});
    for (const probe of module.PROBES) {
      if (!probes.some((p) => p.pc === probe.pc)) probes.push(probe);
      else if (JSON.stringify(probes.find((p) => p.pc === probe.pc).ranges ?? []) !== JSON.stringify(probe.ranges ?? [])) throw new Error(`${probe.pc} is probed twice with different ranges`);
    }
  }
  return probes;
}

/** For each HDD OSD probe: the ROM probe, and how to rebuild each range from the ROM probe's ranges. */
export async function plan(verifiers) {
  const out = [], dropped = [];
  for (const probe of await load(verifiers)) {
    const hand = byHand[probe.pc];
    const pc = hand ? parseInt(hand.pc, 16) : t.code(parseInt(probe.pc, 16));
    if (pc === null) { dropped.push(`${probe.pc}: its function is not the same code in ROM 2.30`); continue; }
    const romRanges = [], rebuild = [];
    let bad = null;
    if (hand?.ranges) {
      for (const range of hand.ranges) {
        if (typeof range === 'string') { rebuild.push({ copy: romRanges.length }); romRanges.push(range); }
        else { rebuild.push({ from: romRanges.length, length: range.length, pieces: range.pieces }); romRanges.push(range.rom); }
      }
      out.push({ hdd: probe.pc, rom: { pc: hex(pc), ranges: romRanges }, rebuild });
      continue;
    }
    for (const range of probe.ranges ?? []) {
      const m = /^(0x[0-9a-fA-F]+):(0x[0-9a-fA-F]+)$/.exec(range);
      if (!m) { rebuild.push({ copy: romRanges.length }); romRanges.push(range); continue; }
      const cut = pieces(parseInt(m[1], 16), parseInt(m[2], 16));
      if (!cut) { bad = range; break; }
      // The ROM bytes needed: one range from the lowest to the highest piece when they are close.
      const low = Math.min(...cut.map((p) => p[2])), high = Math.max(...cut.map((p) => p[2] + p[1]));
      if (high - low > parseInt(m[2], 16) + 0x100) { bad = `${range} (its pieces are far apart in the ROM)`; break; }
      rebuild.push({ from: romRanges.length, length: parseInt(m[2], 16), pieces: cut.map(([offset, length, address]) => [offset, length, address - low]) });
      romRanges.push(`${hex(low)}:0x${(high - low).toString(16)}`);
    }
    if (bad) { dropped.push(`${probe.pc}: range ${bad} has no place in ROM 2.30`); continue; }
    out.push({ hdd: probe.pc, rom: { pc: hex(pc), ranges: romRanges }, rebuild });
  }
  return { probes: out, dropped };
}

export async function back(romTrace, outTrace, verifiers) {
  const { probes } = await plan(verifiers);
  const byRom = new Map(probes.map((p) => [parseInt(p.rom.pc, 16), p]));
  const out = fs.openSync(outTrace, 'w');
  const text = fs.readFileSync(romTrace, 'utf8');
  let count = 0;
  for (const line of text.split('\n')) {
    if (!line.startsWith('{"type":"probe"')) { if (line) fs.writeSync(out, line + '\n'); continue; }
    const record = JSON.parse(line);
    const found = byRom.get(parseInt(record.pc, 16));
    if (!found) continue;
    record.pc = found.hdd;
    record.mem = found.rebuild.map((how) => {
      if (how.copy !== undefined) return record.mem[how.copy];
      const source = record.mem[how.from];
      if (typeof source.hex !== 'string') return { address: 0, hex: null };
      const bytes = Buffer.from(source.hex, 'hex'), made = Buffer.alloc(how.length);
      for (const [offset, length, at] of how.pieces) bytes.copy(made, offset, at, at + length);
      return { address: 0, hex: made.toString('hex') };
    });
    fs.writeSync(out, JSON.stringify(record) + '\n');
    count += 1;
  }
  fs.closeSync(out);
  return count;
}

if (process.argv[1] && process.argv[1].endsWith('extract_opening_rom_trace.mjs')) {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === 'plan') {
    const made = await plan(rest[0]);
    for (const text of made.dropped) console.error(`left out: ${text}`);
    for (const p of made.probes) if (p.rebuild.some((how) => how.pieces && how.pieces.length > 1)) console.error(`rebuilt in pieces: ${p.hdd} ${p.rebuild.filter((how) => how.pieces && how.pieces.length > 1).map((how) => `${p.rom.ranges[how.from]} -> ${how.pieces.map((x) => `+0x${x[0].toString(16)}:0x${x[1].toString(16)}@+0x${x[2].toString(16)}`).join(' ')}`).join('; ')}`);
    console.log(JSON.stringify(made.probes.map((p) => p.rom)));
  } else if (mode === 'back') {
    console.log(`${await back(rest[0], rest[1], rest[2])} probes rewritten`);
  } else console.error('plan <verifiers> | back <rom trace> <out trace> <verifiers>');
}
