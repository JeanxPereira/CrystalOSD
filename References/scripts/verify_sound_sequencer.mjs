// The OSDSND sequencer tick as SPU2 writes, HDD OSD 1.10U.
//
// The timer thread (0x2224, woken by an HLINE hard timer, 0x2274) calls the tick at module offset 0x2470 (IOP 0x000925A0).
// One tick: 0x5c84 reads ENVX of the 24 core 1 voices (libsd read at 0x00095E20 returns) and frees finished voices; then
// for each running sequence slot (0x9ED0, 0x44 bytes) it reads events while the slot's countdown (+4) is not above 0:
// note on (0x2a04: voice from 0x3d34, tone from the program's key ranges, volume 0x45f4, pitch 0x4304, VOLL VOLR PITCH SSA
// ADSR1 ADSR2, VMIXEL/VMIXER set or toggled), note off (0x3f50), program change (0x4a94), controllers 6 7 99 (0x5458,
// 0x4f10, 0x5604), tempo (0x4920) and end of track (0x4814); every event adds its VLQ delta << 12 to the countdown (0x59e0),
// and the tick subtracts the step (+8, ((resolution * tempo) << 12) / tick rate / 60) from it. Key-off and key-on masks of
// the slots are written once at the end (KOFF 0x1601, KON 0x1501), and 0x34b0 updates voices with a vibrato.
// The state at the capture's start is <capture>.start.osdsnd.bin, .start.iopsound.bin and .start.spustate.json; the tick
// instants and the ENVX values are probed.
// node verify_sound_sequencer.mjs <capture>.spu.jsonl
import { readSpuTrace, spuRegister } from '../model/sound_trace.mjs';
import { loadSnapshot } from '../model/sound_snapshot.mjs';
import { makeSequencer } from '../model/sound_osdsnd_sequencer.mjs';

const TICK = 0x925a0;
const TICK_ENVX = 0x95e20;
const [file] = process.argv.slice(2);
const stem = file.replace(/\.spu\.jsonl(\.gz)?$/, '');
const trace = readSpuTrace(file);

const ticks = [];
for (const p of trace.probes) {
  if (p.pcValue === TICK) ticks.push({ cycle: p.cycle, frame: p.captureFrame, envx: [] });
  else if (p.pcValue === TICK_ENVX && ticks.length > 0) ticks.at(-1).envx.push(p.gpr[2] & 0xffff);
}

const kinds = new Set(['voice', 'voiceaddr']);
const isSequencerWrite = (w) => {
  const r = spuRegister(w.address);
  if (r.core !== 1) return false;
  if (kinds.has(r.kind)) return true;
  return /^(VMIXEL|VMIXER|KON|KOFF)[01]$/.test(r.name);
};
const observed = trace.writes.filter(isSequencerWrite);

let compared = 0;
const failures = [];
const check = (ok, what) => { compared += 1; if (!ok) failures.push(what); };

let reads = 0;
let current = null;
const model = makeSequencer(loadSnapshot(stem), {
  envx: (core, voice) => {
    reads += 1;
    check(current.envx.length === 24, { why: 'ENVX probes per tick', got: current.envx.length });
    return current.envx[voice] ?? 0;
  },
});

let at = 0;
let writesCompared = 0;
let noteOns = 0;
let noteOffs = 0;
const gaps = [];
ticks.forEach((tick, i) => {
  current = tick;
  const next = ticks[i + 1]?.cycle ?? Infinity;
  const predicted = model.tick().filter((w) => isSequencerWrite({ address: w.address }));
  model.state.notes.forEach((n) => { if (n.on !== undefined) noteOns += 1; else noteOffs += 1; });
  const window = [];
  while (at < observed.length && observed[at].cycle < next) {
    if (observed[at].cycle >= tick.cycle) window.push(observed[at]);
    at += 1;
  }
  check(predicted.length === window.length, { why: 'writes in the tick', tick: i, frame: tick.frame, want: predicted.length, got: window.length });
  for (let k = 0; k < Math.min(predicted.length, window.length); k++) {
    writesCompared += 1;
    check(predicted[k].address === window[k].address && predicted[k].value === window[k].value, { why: 'write', tick: i, frame: tick.frame, k, want: predicted[k], got: { address: window[k].address, value: window[k].value } });
  }
  if (i > 0) gaps.push(tick.cycle - ticks[i - 1].cycle);
});
check(at === observed.length || ticks.length === 0 || observed.slice(at).every((w) => w.cycle < ticks[0].cycle), { why: 'sequencer writes outside any tick', left: observed.length - at });

gaps.sort((a, b) => a - b);
const median = gaps[Math.floor(gaps.length / 2)];
console.log(`ticks ${ticks.length}, sequencer writes compared ${writesCompared} (observed ${observed.length}), note-ons ${noteOns}, note-offs ${noteOffs}, ENVX reads ${reads}`);
const mean = (ticks.at(-1).cycle - ticks[0].cycle) / (ticks.length - 1);
console.log(`tick period in IOP cycles: min ${gaps[0]}, median ${median}, max ${gaps.at(-1)}, mean ${mean.toFixed(1)} (${(36864000 / mean).toFixed(3)} Hz at 36.864 MHz)`);
if (compared === 0 || ticks.length === 0) throw new Error('compared nothing: not a verifier');
console.log(`compared ${compared} items, ${failures.length} differ`);
for (const f of failures.slice(0, 10)) console.log(JSON.stringify(f));
console.log(failures.length === 0 ? `verdict: FOUND ${compared} items equal` : `verdict: PARTIAL ${failures.length} of ${compared} differ`);
process.exit(failures.length === 0 ? 0 : 1);
