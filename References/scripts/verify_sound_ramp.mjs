// The OSDSND master ramp (RPC 0x60D0) and core volume (0x6120) as SPU2 writes, HDD OSD 1.10U.
//
// 0x6120 (OSDSND 0x6E74) is sceSdSetParam(core | 0x980, left) and sceSdSetParam(core | 0xA80, right): MVOLL, MVOLR of the core.
// 0x60D0 (0x6B08) reads the core's effect attribute (libsd 0x8C0DC), sets its two depths to the arguments and its mode flag 0x100
// (clear the work area), and writes it back (sceSdSetEffectAttr, libsd 0x8C14C): with the effect enabled in ATTR it clears bit
// 0x80, clears the work area (a transfer: the transfer engine's writes, libsd 0x8D200..0x8D600, are not compared; the
// DMA records are: 64-byte blocks, so the work area size rounded up to 64), writes EVOLL, EVOLR, the preset of the effect mode (libsd table 0x8F810 + 0x44 * mode, fields in
// the order of libsd 0x8B930: sizes, volumes, addresses, input coefficients), ESAH, ESAL (the start of the work area, from EEA
// and the preset's size, libsd table 0x8F7E8), clears the work area again and sets bit 0x80.
// The EE's ramp (verify_sound_ee_queue.mjs) sends this command once per drain with v = (0x9FFEC * k / 0x7F) / 15.
// The register values the commands read (ATTR, EEA) are the replay of the observed writes up to the command; the libsd
// image (0x80000..0x90130 of IOP RAM) is <captures>/hddosd-110U-sound-libsd.bin.
// node verify_sound_ramp.mjs <capture>.spu.jsonl
import fs from 'node:fs';
import { readSpuTrace, rpcCommands, spuRegister } from '../model/sound_trace.mjs';
import { makeLibsd, makeRegisters, write, LIBSD_BASE } from '../model/sound_libsd.mjs';
import { rampWrites } from '../model/sound_osdsnd_ramp.mjs';

const CAPTURES = process.env.CRYSTALOSD_CAPTURES ?? 'D:/CodingProjects/Watson/Runtime/captures';
const [file] = process.argv.slice(2);
const trace = readSpuTrace(file);
const commands = rpcCommands(trace);
const image = fs.readFileSync(`${CAPTURES}/hddosd-110U-sound-libsd.bin`);
void LIBSD_BASE;

const TRANSFER_LOW = 0x8d200;
const TRANSFER_HIGH = 0x8d600;
const sequencerClass = /^(VMIXEL|VMIXER|VMIXL|VMIXR|KON|KOFF)[01]$/;
const isSequencer = (w) => { const r = spuRegister(w.address); return r.kind === 'voice' || r.kind === 'voiceaddr' || sequencerClass.test(r.name); };
const isTransfer = (w) => w.pc >= TRANSFER_LOW && w.pc < TRANSFER_HIGH;

let compared = 0;
const failures = [];
const check = (ok, what) => { compared += 1; if (!ok) failures.push(what); };

const observedRegs = makeRegisters();
let replayed = 0;
let steps = 0;
let volumes = 0;
let fills = 0;
const lib = makeLibsd(Buffer.from(image));

commands.forEach((command, i) => {
  if (command.id !== 0x60d0 && command.id !== 0x6120) return;
  const nextCycle = commands[i + 1]?.cycle ?? Infinity;
  while (replayed < trace.writes.length && trace.writes[replayed].cycle < command.cycle) {
    write(observedRegs, trace.writes[replayed].address, trace.writes[replayed].value);
    replayed += 1;
  }
  const state = { lib, regs: makeRegisters() };
  for (const [address, value] of observedRegs.values) state.regs.values.set(address, value);
  const predicted = rampWrites(state, command);
  const window = trace.writes.filter((w) => w.cycle >= command.cycle && w.cycle < nextCycle && !isSequencer(w) && !isTransfer(w));
  check(predicted.writes.length === window.length, { why: 'write count', frame: command.captureFrame, id: command.id.toString(16), want: predicted.writes.length, got: window.length });
  for (let k = 0; k < Math.min(predicted.writes.length, window.length); k++) {
    check(predicted.writes[k].address === window[k].address && predicted.writes[k].value === window[k].value, { why: 'write', frame: command.captureFrame, k, want: predicted.writes[k], got: { address: window[k].address, value: window[k].value } });
  }
  if (command.id === 0x60d0) {
    steps += 1;
    const moved = trace.dmas.filter((d) => d.cycle >= command.cycle && d.cycle < nextCycle);
    const bytes = moved.reduce((n, d) => n + d.words * 2, 0);
    const wanted = predicted.events.reduce((n, e) => n + e.fill.transferred, 0);
    check(bytes === wanted, { why: 'work area cleared by DMA', frame: command.captureFrame, want: wanted, got: bytes });
    fills += predicted.events.length;
  } else volumes += 1;
});

console.log(`ramp steps ${steps} (work area clears ${fills}), core volumes ${volumes}`);
if (compared === 0) throw new Error('compared nothing: not a verifier');
console.log(`compared ${compared} items, ${failures.length} differ`);
for (const f of failures.slice(0, 10)) console.log(JSON.stringify(f));
console.log(failures.length === 0 ? `verdict: FOUND ${compared} items equal` : `verdict: PARTIAL ${failures.length} of ${compared} differ`);
process.exit(failures.length === 0 ? 0 : 1);
