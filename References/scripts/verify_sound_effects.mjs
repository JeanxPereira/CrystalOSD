// The OSDSND effects (RPC 0x6300) as SPU2 writes, HDD OSD 1.10U.
//
// OSDSND 0x00007AD8 (module offsets; the module is loaded at IOP 0x00090130): with the HD of bank a0 and effect a1 it
// reads the effect record at table + 0x20 + 64 * a1 of the OSDD HD (table = hd + u32 at hd + 0x2c), refuses an effect
// above the u32 at table + 4, allocates a core 0 voice (0x8170: the highest voice whose bit is clear in the busy mask
// 0x9184, else the quietest stealable one; voices whose ENVX reads below 2 are released), and writes through libsd:
// VOLL, VOLR (record volume * table[0] >> 7), PITCH (44100 * record pitch / 48000), SSA (bank BD base * 8 + record
// offset), ADSR1, ADSR2, then the wet mix bit of the voice (when record + 0xe has 0x80) or a toggle of it, in
// VMIXEL and VMIXER, then KON. The words of the RPC after the bank and the effect are not read by this handler.
// (0x6310, which stores a1 as the u32 table[0] of bank a0, writes nothing: verify_sound_init.mjs compares what it leaves in the HD.)
// The model is given the bank and the effect only: the other words of each command are zeroed before the writes are recomputed, so
// the captures' a3 values (printed) are not an input of the 0x6300 handler.
// The ENVX values the allocator reads are probed (the return of the libsd read at 0x00098358); the state at the capture's
// start is <capture>.start.osdsnd.bin, .start.iopsound.bin and .start.spustate.json.
// node verify_sound_effects.mjs <capture>.spu.jsonl
import { readSpuTrace, rpcCommands } from '../model/sound_trace.mjs';
import { loadSnapshot } from '../model/sound_snapshot.mjs';
import { initEffects, effectWrites } from '../model/sound_osdsnd_effects.mjs';

const ENVX = 0x98358;
const [file] = process.argv.slice(2);
const stem = file.replace(/\.spu\.jsonl(\.gz)?$/, '');
const trace = readSpuTrace(file);
const state = initEffects(loadSnapshot(stem));

const commands = rpcCommands(trace);
const reads = Array.from({ length: 24 }, () => []);
for (const p of trace.probes) {
  if (p.pcValue !== ENVX) continue;
  const at = p.gpr[4] - 0xbf900000;
  if (at < 0 || at >= 0x400) continue;
  const voice = (at >> 4) & 0x1f;
  reads[voice].push({ value: p.gpr[2] & 0xffff, cycle: p.cycle });
}
let allocation = -1;
const envx = (core, voice) => {
  if (voice === 0) allocation += 1;
  check(reads[voice][allocation] !== undefined, { why: 'no ENVX probe for the allocation', allocation, voice });
  return reads[voice][allocation]?.value ?? 0;
};

let compared = 0;
const failures = [];
const check = (ok, what) => { compared += 1; if (!ok) failures.push(what); };
const voices = [];
const a3Values = new Set();
let effectsRun = 0;
let refused = 0;

commands.forEach((command, i) => {
  if (command.id !== 0x6300) return;
  const nextCycle = commands[i + 1]?.cycle ?? Infinity;
  const result = effectWrites(state, { ...command, words: [command.words[0], command.words[1], 0, 0, 0] }, envx);
  a3Values.add(command.words[2] >>> 0);
  const observed = trace.writes.filter((w) => w.cycle >= command.cycle && w.cycle < nextCycle && w.address >= 0x1f900000 && w.address < 0x1f900400);
  effectsRun += 1;
  if (result.voice === null) refused += 1;
  check(result.writes.length === observed.length, { why: 'write count', frame: command.captureFrame, effect: command.words[1], want: result.writes.length, got: observed.length });
  for (let k = 0; k < Math.min(result.writes.length, observed.length); k++) {
    check(result.writes[k].address === observed[k].address && result.writes[k].value === observed[k].value, { why: 'write', frame: command.captureFrame, k, want: result.writes[k], got: { address: observed[k].address, value: observed[k].value } });
  }
  voices.push(`f${command.captureFrame} effect ${command.words[1]} -> voice ${result.voice}`);
});

for (const line of voices) console.log(line);
console.log(`effects ${effectsRun} (refused ${refused}), allocations probed ${allocation + 1}; the words after the bank and the effect are replaced by 0 in the model, the capture's a3 takes ${a3Values.size} values`);
if (compared === 0) throw new Error('compared nothing: not a verifier');
console.log(`compared ${compared} items, ${failures.length} differ`);
for (const f of failures.slice(0, 10)) console.log(JSON.stringify(f));
console.log(failures.length === 0 ? `verdict: FOUND ${compared} items equal` : `verdict: PARTIAL ${failures.length} of ${compared} differ`);
process.exit(failures.length === 0 ? 0 : 1);
