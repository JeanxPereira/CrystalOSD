// The OSDSND commands of the boot, HDD OSD 1.10U, from a cold start to the clock's sequence: what each does to the driver's
// state in IOP RAM and the SPU2 writes it makes.
//
// 0x6010 (OSDSND 0x5EF8) clears the slot, context, voice and bank tables, runs sceSdInit(0) (libsd, a fixed sequence: SPDIF, master
//   volumes, attributes, key-off, the reverb area start, a clear of the first SPU2 RAM words, every voice reset, key-on and key-off
//   of all voices, mixer masks, master volumes again) and sets the effect attribute (sceSdSetEffectAttr, see verify_sound_ramp.mjs)
//   of both cores with depth 0; 0x6060 registers an HD bank, 0x6090 starts a sequence slot from an SQ, 0x60A0 sets the tick rate,
//   0x60C0 sets a core's effect mode, 0x6130 the sequence volume, 0x6140 starts a slot playing, 0x6150 stops, pauses or resumes one
//   (key-off of its voices, KOFF of the core 1 mask), 0x6310 the effect master, 0x8010 and 0x8070 are sceSdSetParam and
//   sceSdSetCoreAttr passed through; 0x61A0 and 0x6070 move the bank data (no SPU2 write of the driver).
// The memory the commands leave (the slot, bank and voice tables) is compared with the IOP RAM the next capture starts from
// (<boot-b>.start.osdsnd.bin) for the bytes the boot defines, and the SPU2 writes of each command with the capture's, the
// transfer engine's writes (libsd 0x8D200..0x8D600) left out. The libsd image is <captures>/hddosd-110U-sound-libsd.bin; the
// template of the driver's memory is <boot-b>.start.osdsnd.bin and .start.iopsound.bin (every table the boot defines is cleared by
// 0x6010 first).
// node verify_sound_init.mjs <boot-a>.spu.jsonl
import fs from 'node:fs';
import { readSpuTrace, rpcCommands, spuRegister } from '../model/sound_trace.mjs';
import { loadSnapshot, makeMemory } from '../model/sound_snapshot.mjs';
import { makeLibsd, makeRegisters, write } from '../model/sound_libsd.mjs';
import { initWrites, makeDriverState } from '../model/sound_osdsnd_init.mjs';
import { SLOTS, BANKS } from '../model/sound_osdsnd_sequencer.mjs';

const CAPTURES = process.env.CRYSTALOSD_CAPTURES ?? 'D:/CodingProjects/Watson/Runtime/captures';
const [file] = process.argv.slice(2);
const stem = file.replace(/\.spu\.jsonl(\.gz)?$/, '');
const next = stem.replace(/-boot-a$/, '-boot-b');
const trace = readSpuTrace(file);
const commands = rpcCommands(trace);
const state = makeDriverState(loadSnapshot(next), makeMemory, makeLibsd(Buffer.from(fs.readFileSync(`${CAPTURES}/hddosd-110U-sound-libsd.bin`))));

const sequencerClass = /^(VMIXEL|VMIXER|VMIXL|VMIXR|KON|KOFF)[01]$/;
const isSequencer = (w) => { const r = spuRegister(w.address); return r.core === 1 && (r.kind === 'voice' || r.kind === 'voiceaddr' || sequencerClass.test(r.name)); };
const isTransfer = (w) => w.pc >= 0x8d200 && w.pc < 0x8d600;
const WITH_VOICES = new Set([0x6010, 0x6150]);
const MODELLED = new Set([0x6010, 0x6060, 0x6090, 0x60a0, 0x60c0, 0x60d0, 0x6120, 0x6130, 0x6140, 0x6150, 0x6310, 0x8010, 0x8070]);
const NO_WRITES = new Set([0x61a0, 0x6070, 0x6200]);

let compared = 0;
const failures = [];
const check = (ok, what) => { compared += 1; if (!ok) failures.push(what); };
const observedRegs = makeRegisters();
let replayed = 0;
const handled = new Map();
const lastIndex = commands.reduce((n, c, i) => (c.id === 0x6140 ? i : n), -1);

commands.forEach((command, i) => {
  if (i > lastIndex) return;
  const nextCycle = commands[i + 1]?.cycle ?? Infinity;
  const window = trace.writes.filter((w) => w.cycle >= command.cycle && w.cycle < nextCycle && !isTransfer(w) && (WITH_VOICES.has(command.id) || !isSequencer(w)));
  handled.set(command.id, (handled.get(command.id) ?? 0) + 1);
  if (NO_WRITES.has(command.id)) {
    check(window.length === 0, { why: 'command without SPU2 writes wrote', id: command.id.toString(16), frame: command.captureFrame, n: window.length });
    return;
  }
  check(MODELLED.has(command.id), { why: 'command not modelled', id: command.id.toString(16) });
  if (!MODELLED.has(command.id)) return;
  while (replayed < trace.writes.length && trace.writes[replayed].cycle < command.cycle) {
    write(observedRegs, trace.writes[replayed].address, trace.writes[replayed].value);
    replayed += 1;
  }
  state.regs.values.clear();
  for (const [address, value] of observedRegs.values) state.regs.values.set(address, value);
  const result = initWrites(state, command);
  check(result.writes.length === window.length, { why: 'write count', id: command.id.toString(16), frame: command.captureFrame, want: result.writes.length, got: window.length });
  for (let k = 0; k < Math.min(result.writes.length, window.length); k++) {
    check(result.writes[k].address === window[k].address && result.writes[k].value === window[k].value, { why: 'write', id: command.id.toString(16), frame: command.captureFrame, k, want: result.writes[k], got: { address: window[k].address, value: window[k].value } });
  }
  if (result.events.length > 0) {
    const moved = trace.dmas.filter((d) => d.cycle >= command.cycle && d.cycle < nextCycle).reduce((n, d) => n + d.words * 2, 0);
    const wanted = result.events.reduce((n, e) => n + e.fill.transferred, 0);
    check(moved === wanted, { why: 'work area cleared by DMA', id: command.id.toString(16), frame: command.captureFrame, want: wanted, got: moved });
  }
});

const snapshot = loadSnapshot(next);
const reference = makeMemory(snapshot);
let tableBytes = 0;
const sameTable = (name, at, length, skip = () => false) => {
  for (let k = 0; k < length; k++) {
    if (skip(k)) continue;
    check(state.mem.ram[at + k] === reference.ram[at + k], { why: `${name} byte differs`, offset: k });
    tableBytes += 1;
  }
};
sameTable('bank table', BANKS - 4, 0x600);
sameTable('slot table', SLOTS, 0x44 * 8, (k) => ![0x08, 0x09, 0x0a, 0x0b, 0x18, 0x19, 0x1a, 0x1b, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x3e, 0x3f, 0x40, 0x41].includes(k % 0x44));

for (let i = 0; i < 8; i++) {
  const sq = state.mem.u32(SLOTS + 0x44 * i + 0x18);
  check(sq !== 0 && state.mem.u8(sq) === reference.u8(sq), { why: 'sequence volume byte', slot: i, got: state.mem.u8(sq), want: reference.u8(sq) });
  tableBytes += 1;
}
{
  const hd = state.mem.u32(BANKS + 12);
  const master = hd + state.mem.u32(hd + 0x2c);
  for (let k = 0; k < 4; k++) check(state.mem.u8(master + k) === reference.u8(master + k), { why: 'effect master byte', k });
  tableBytes += 4;
}
console.log(`commands replayed ${commands.slice(0, lastIndex + 1).length} (${[...handled.entries()].map(([id, n]) => `0x${id.toString(16)}x${n}`).join(' ')}), table bytes compared ${tableBytes}`);
if (compared === 0) throw new Error('compared nothing: not a verifier');
console.log(`compared ${compared} items, ${failures.length} differ`);
for (const f of failures.slice(0, 10)) console.log(JSON.stringify(f));
console.log(failures.length === 0 ? `verdict: FOUND ${compared} items equal` : `verdict: PARTIAL ${failures.length} of ${compared} differ`);
process.exit(failures.length === 0 ? 0 : 1);
