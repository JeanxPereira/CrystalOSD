// The whole clock sound scenario in the JS model: the cold boot (boot-a) and the clock screen with its four effects (boot-b),
// HDD OSD 1.10U, every SPU2 write of both captures; or any capture that starts from a saved state.
//
// The model (../model/sound_osdsnd.mjs) owns the event loop and nothing else: the RPCs the OSDSND handler received (probed at its
// entry) and the sequencer ticks (probed at the tick function's entry), in the order of the IOP cycle counter; each event runs
// the behaviour verified by the other verifiers (verify_sound_init, _effects, _sequencer, _ramp). The values the hardware gives
// the code (ENVX of the voices the tick and the allocator read) are probed. The DMA of the banks and the effect work area (the
// transfer engine's writes, libsd 0x8D200..0x8D600) is not part of the compared stream.
// The writes are compared in two streams, each in order and with its frame: the voice, mix and key writes of core 1 (the sequencer's,
// the boot's voice reset and the stop commands' key-off), and every other write (commands). The threads that make the two
// streams (the timer thread and the RPC thread) interleave as the IOP schedules them, which this does not compare.
// With a capture that has its own start state (<capture>.start.osdsnd.bin ...) the model starts from that state and its register
// values (the stop, pause and resume commands, the stimulated effects and the long runs); with boot-a first it starts cold, the
// template of the driver's memory being the state boot-b starts from (0x6010 clears every table the boot defines).
// A cold capture (boot-a, the PAL boot) takes its template from hddosd-110U-sound-boot-b's start state, beside it (SOUND_TEMPLATE_STEM
// names another).
// node verify_sound_scenario.mjs <capture>.spu.jsonl [<next capture>.spu.jsonl ...]
import fs from 'node:fs';
import path from 'node:path';
import { readSpuTrace, rpcCommands, spuRegister } from '../model/sound_trace.mjs';
import { loadSnapshot } from '../model/sound_snapshot.mjs';
import { makeModel, runScenario } from '../model/sound_osdsnd.mjs';
import { TICK_CYCLES } from '../model/sound_osdsnd_sequencer.mjs';

const CAPTURES = process.env.CRYSTALOSD_CAPTURES ?? 'D:/CodingProjects/Watson/Runtime/captures';
const files = process.argv.slice(2);
const traces = files.map((f) => readSpuTrace(f));
const stems = files.map((f) => f.replace(/\.spu\.jsonl(\.gz)?$/, ''));
const warm = fs.existsSync(`${stems[0]}.start.osdsnd.bin`);
const templateStem = process.env.SOUND_TEMPLATE_STEM ?? (warm ? stems[0] : path.join(path.dirname(stems[0]), 'hddosd-110U-sound-boot-b'));

const TICK = 0x925a0;
const TICK_ENVX = 0x95e20;
const ALLOC_ENVX = 0x98358;
const events = [];
const tickGroups = [];
const allocationReads = Array.from({ length: 24 }, () => []);
const writes = [];
const frames = [];
let frameBase = 0;
for (const trace of traces) {
  for (const f of trace.frames) frames.push({ cycle: f.cycle, frame: frameBase + f.captureFrame });
  for (const p of trace.probes) {
    if (p.pcValue === TICK) { tickGroups.push([]); events.push({ kind: 'tick', cycle: p.cycle }); }
    else if (p.pcValue === TICK_ENVX && tickGroups.length > 0) tickGroups.at(-1).push(p.gpr[2] & 0xffff);
    else if (p.pcValue === ALLOC_ENVX) {
      const at = p.gpr[4] - 0xbf900000;
      if (at >= 0 && at < 0x400) allocationReads[(at >> 4) & 0x1f].push(p.gpr[2] & 0xffff);
    }
  }
  for (const command of rpcCommands(trace)) events.push({ kind: 'rpc', cycle: command.cycle, command });
  for (const w of trace.writes) writes.push({ ...w, frame: frameBase + w.captureFrame });
  frameBase += trace.frames.length;
}
events.sort((a, b) => a.cycle - b.cycle);
const frameOf = (cycle) => {
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (frames[mid].cycle <= cycle) lo = mid; else hi = mid - 1; }
  return frames[lo].frame;
};

let tickIndex = 0;
let allocationIndex = -1;
const feeds = {
  tick: (voice) => { if (voice === 0) tickIndex += 1; return tickGroups[tickIndex - 1]?.[voice] ?? 0; },
  allocation: (voice) => { if (voice === 0) allocationIndex += 1; return allocationReads[voice][allocationIndex] ?? 0; },
};
const model = makeModel(loadSnapshot(templateStem), fs.readFileSync(`${CAPTURES}/hddosd-110U-sound-libsd.bin`), feeds, warm);
const predicted = runScenario(model, events).map((w) => ({ ...w, frame: frameOf(w.cycle) }));

const sequencerClass = /^(VMIXEL|VMIXER|VMIXL|VMIXR|KON|KOFF)[01]$/;
const classOf = (w) => { const r = spuRegister(w.address); return r.core === 1 && (r.kind === 'voice' || r.kind === 'voiceaddr' || sequencerClass.test(r.name)) ? 'voices' : 'commands'; };
const isTransfer = (w) => w.pc >= 0x8d200 && w.pc < 0x8d600;
const observed = writes.filter((w) => !isTransfer(w));

let compared = 0;
const failures = [];
const check = (ok, what) => { compared += 1; if (!ok) failures.push(what); };
let frameMismatches = 0;
let total = 0;
for (const cls of ['voices', 'commands']) {
  const want = predicted.filter((w) => classOf(w) === cls);
  const got = observed.filter((w) => classOf(w) === cls);
  check(want.length === got.length, { why: 'write count', class: cls, want: want.length, got: got.length });
  for (let k = 0; k < Math.min(want.length, got.length); k++) {
    total += 1;
    check(want[k].address === got[k].address && want[k].value === got[k].value, { why: 'write', class: cls, k, want: want[k], got: { address: got[k].address, value: got[k].value, frame: got[k].frame } });
    if (want[k].frame !== got[k].frame) frameMismatches += 1;
  }
}
check(true, { why: 'frames' });
const ticksPerFrame = new Map();
for (const e of events) if (e.kind === 'tick') ticksPerFrame.set(frameOf(e.cycle), (ticksPerFrame.get(frameOf(e.cycle)) ?? 0) + 1);
let periodic = 0;
let t0 = events.find((e) => e.kind === 'tick').cycle;
const bounds = new Map();
frames.forEach((f, i) => bounds.set(f.frame, [f.cycle, frames[i + 1]?.cycle ?? Infinity]));
for (const [frame, count] of ticksPerFrame) {
  const [from, to] = bounds.get(frame);
  const k0 = Math.ceil((from - t0) / TICK_CYCLES.ntsc);
  const k1 = Math.ceil((to - t0) / TICK_CYCLES.ntsc);
  if (k1 - k0 === count) periodic += 1;
}

const tickCycles = events.filter((e) => e.kind === 'tick').map((e) => e.cycle);
const period = (tickCycles.at(-1) - tickCycles[0]) / (tickCycles.length - 1);
console.log(`tick period in IOP cycles: mean ${period.toFixed(1)} over ${tickCycles.length} ticks`);
console.log(`events: ${events.filter((e) => e.kind === 'rpc').length} RPCs, ${events.filter((e) => e.kind === 'tick').length} ticks; writes predicted ${predicted.length}, observed ${observed.length} of ${writes.length} (the rest is the transfer engine's)`);
console.log(`compared ${total} writes in order; frame of the write differs in ${frameMismatches} of them; ticks per frame from the period ${TICK_CYCLES.ntsc} cycles agree in ${periodic} of ${ticksPerFrame.size} frames`);
if (compared === 0) throw new Error('compared nothing: not a verifier');
console.log(`compared ${compared} items, ${failures.length} differ`);
for (const f of failures.slice(0, 10)) console.log(JSON.stringify(f));
console.log(failures.length === 0 ? `verdict: FOUND ${compared} items equal` : `verdict: PARTIAL ${failures.length} of ${compared} differ`);
process.exit(failures.length === 0 ? 0 : 1);
