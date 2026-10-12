// The IOP side of the boot sound timeline, HDD OSD 1.10U: the OSDSND tick timer and the first EE command against the sound init.
//
// The tick function (OSDSND 0x925A0, probed at its entry) is called by the timer thread (0x2224) woken by an HLINE hard timer (0x2274).
// From a power-on the timer fires 14 times at half the regular period (299872 IOP cycles), then at the regular period (599776 cycles,
// `TICK_CYCLES.ntsc` of sound_osdsnd_sequencer.mjs); individual regular calls run late and the next one early (EE and IOP contention), so
// the median gap is the period. The first call is at the same absolute IOP cycle in every boot. The first EE command (the opening's
// 0x6140 or the clock's 0x6150) reaches the IOP about 15000 samples after the init command 0x6010 (printed, measured), 3 samples
// before the S/PDIF push when it is a 0x6140 and 23 when it is a 0x6150.
// node verify_sound_chain_timeline.mjs <capture>.spu.jsonl
import { readSpuTrace, rpcCommands } from '../model/sound_trace.mjs';
import { TICK_CYCLES } from '../model/sound_osdsnd_sequencer.mjs';
import { WARMUP_TICKS, WARMUP_CYCLES, FIRST_TICK_CYCLE } from '../model/sound_timer.mjs';

const TICK = 0x925a0;
const [file] = process.argv.slice(2);
const trace = readSpuTrace(file);
const commands = rpcCommands(trace);
const hits = trace.probes.filter((p) => p.pcValue === TICK).map((p) => p.cycle);

let compared = 0;
const failures = [];
const check = (ok, what) => { compared += 1; if (!ok) failures.push(what); };

check(hits.length > WARMUP_TICKS + 2, { why: 'ticks in the capture', got: hits.length });
check(hits[0] === FIRST_TICK_CYCLE, { why: 'first tick cycle', want: FIRST_TICK_CYCLE, got: hits[0] });
for (let i = 1; i < WARMUP_TICKS; i++) check(hits[i] - hits[i - 1] === WARMUP_CYCLES, { why: 'warm-up gap', i, want: WARMUP_CYCLES, got: hits[i] - hits[i - 1] });
const regular = hits.slice(WARMUP_TICKS + 1).map((h, i, a) => (i ? h - a[i - 1] : 0)).slice(1).sort((a, b) => a - b);
check(regular[regular.length >> 1] === TICK_CYCLES.ntsc, { why: 'median regular gap', want: TICK_CYCLES.ntsc, got: regular[regular.length >> 1] });

const init = commands.find((c) => c.id === 0x6010);
const first = commands.find((c) => c.id === 0x6140 || c.id === 0x6150);
const push = commands.find((c) => c.id === 0x8070 && c.words[0] === 0xa);
console.log(`ticks ${hits.length}; first at cycle ${hits[0]}; warm-up gaps ${WARMUP_CYCLES}; median regular gap ${regular[regular.length >> 1]} (min ${regular[0]}, max ${regular.at(-1)})`);
console.log(`init 0x6010 to first command 0x${first.id.toString(16)}: ${((first.cycle - init.cycle) / 768).toFixed(1)} samples; first command to push: ${((push.cycle - first.cycle) / 768).toFixed(1)} samples; first tick to first command: ${((first.cycle - hits[0]) / 768).toFixed(1)} samples`);
if (compared === 0) throw new Error('compared nothing: not a verifier');
console.log(`compared ${compared} items, ${failures.length} differ`);
for (const f of failures.slice(0, 10)) console.log(JSON.stringify(f));
console.log(failures.length === 0 ? `verdict: FOUND ${compared} items equal` : `verdict: PARTIAL ${failures.length} of ${compared} differ`);
process.exit(failures.length === 0 ? 0 : 1);
