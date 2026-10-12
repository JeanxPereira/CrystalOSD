// The sound chain of a power-on through the opening to the clock (SkipSearchLater BootOpening), HDD OSD 1.10U.
//
// What the console does with the ramp and the S/PDIF push: sound_handler_2009E0 (0x002009E0) adds one to the counter
// D_002AAF80 after each 0x60D0 it enqueues and nothing else writes it, so the ramp is a function of the drains since power-on and
// is not restarted by the opening or by the clock thread. The drain (0x00200A80) runs in pad_sound_handler_thread_proc (0x0020CD20);
// the S/PDIF push (0x8070, 0xA) follows the first drain once main stored the word 0x001F0114 (0x0020DD5C).
// Recomputed from the probes: the ramp counter and its enqueues per drain, the next drain frame from the sends of a drain, the ring
// head at each enqueue and the ring temporaries of the set-up pair, the push and its a3, the hand-off frame against the thread start.
// CLOCK_BUILD=hdd node verify_sound_chain.mjs <trace.jsonl>
import { readTraceFor, probesOf } from '../lib/trace.mjs';
import { BUILD_NAME, pc, range } from './builds.mjs';
import { rampCounterAtDrain, nextDrainFrame, spdifA3, ringHead, ringTemporaries, counterOfFrame, RAMP_STEPS, RAMP_COMMAND, SPDIF_COMMAND } from '../model/sound_chain.mjs';
import { rampStep } from '../model/sound_ee.mjs';

export const PROBES = [
  { pc: pc(0x00200c00), ranges: [range(0x001f0a5c, 8)] },
  { pc: pc(0x00200a80), ranges: [range(0x001f0658, 0x400), range(0x001f0a58, 0x10)] },
  { pc: pc(0x00294738), ranges: [] },
  { pc: pc(0x002009e0), ranges: [range(0x002aaf80, 4)] },
  { pc: pc(0x0020cd58), ranges: [] },
  { pc: pc(0x0020cd68), ranges: [range(0x001f0d40, 4), range(0x001f0a58, 4)] },
  { pc: pc(0x0020ca40), ranges: [] },
  { pc: pc(0x0020ce2c), ranges: [range(0x001f0114, 4)] },
  { pc: pc(0x0020dd5c), ranges: [range(0x001f0114, 4)] },
  { pc: pc(0x0021ae78), ranges: [range(0x001f0648, 4)] },
  { pc: pc(0x00225d50), ranges: [] },
  { pc: pc(0x0021aee0), ranges: [range(0x00370000, 4)] },
];
const [ENQUEUE, DRAIN, WIRE, RAMP, , , , SPDIF, SPDIF_STORE, OPENING_START, THREAD_START, HANDOFF] = PROBES.map((_, i) => i);

const u16 = (n) => n & 0xffff;
const hex = (n) => `0x${(n >>> 0).toString(16)}`;

if (process.argv[1] && process.argv[1].endsWith('verify_sound_chain.mjs')) {
  const trace = readTraceFor(process.argv[2], PROBES);
  if (!trace.complete) throw new Error(`${process.argv[2]}: ${trace.reason}`);
  const groups = probesOf(trace, PROBES);
  const kind = new Map();
  groups.forEach((records, i) => records.forEach((r) => kind.set(r, i)));
  const records = trace.probes.filter((r) => kind.has(r) && !r.preroll);

  let compared = 0;
  const failures = [];
  const check = (ok, what) => { compared += 1; if (!ok) failures.push(what); };

  let enqueues = 0;
  let pendingDrain = null;
  const drains = [];
  const enqueueLog = [];
  let spdifSends = 0;
  let spdifFrame = null;
  let spdifStoreFrame = null;
  let handoff = null;
  let threadStart = null;
  let openingStart = null;
  let rampCalls = 0;

  for (const r of records) {
    const k = kind.get(r);
    if (k === OPENING_START) openingStart = r.frame;
    else if (k === THREAD_START) threadStart = r.frame;
    else if (k === HANDOFF) handoff = { frame: r.frame, counter: r.mem[0].bytes.readInt32LE(0) };
    else if (k === SPDIF_STORE) spdifStoreFrame ??= r.frame;
    else if (k === ENQUEUE) {
      const head = r.mem[0].bytes.readUInt32LE(4);
      const entry = { frame: r.frame, head, args: [4, 5, 6, 7].map((i) => u16(r.gpr[i])), ra: r.gpr[31] >>> 0 };
      check(head === ringHead(enqueues), { why: 'ring head at enqueue', frame: r.frame, want: ringHead(enqueues), got: head });
      enqueues += 1;
      enqueueLog.push(entry);
    } else if (k === DRAIN) {
      pendingDrain = { frame: r.frame, sent: [] };
      drains.push(pendingDrain);
    } else if (k === WIRE) {
      const cmd = u16(r.gpr[5]);
      if (cmd === SPDIF_COMMAND && u16(r.gpr[6]) === 0xa) {
        spdifSends += 1;
        spdifFrame ??= r.frame;
      } else if (pendingDrain) pendingDrain.sent.push(cmd);
    } else if (k === SPDIF) {
      const word = r.mem[0].bytes.readUInt32LE(0);
      check(spdifA3(word) !== undefined && u16(r.gpr[7]) === spdifA3(word), { why: 'push a3', word: hex(word), want: spdifA3(word), got: u16(r.gpr[7]) });
    } else if (k === RAMP) {
      const counter = r.mem[0].bytes.readInt32LE(0);
      check(counter === rampCounterAtDrain(rampCalls), { why: 'ramp counter', call: rampCalls, frame: r.frame, want: rampCounterAtDrain(rampCalls), got: counter });
      rampCalls += 1;
    }
  }

  const rampEntries = enqueueLog.filter((e) => e.args[0] === RAMP_COMMAND);
  rampEntries.forEach((e, i) => {
    const want = rampStep(i, RAMP_STEPS, RAMP_COMMAND);
    check(JSON.stringify(e.args) === JSON.stringify([RAMP_COMMAND, ...want.args]), { why: 'ramp step', i, want: want.args, got: e.args });
  });
  check(rampEntries.length === RAMP_STEPS, { why: 'ramp enqueues', got: rampEntries.length });
  check(rampCalls === drains.length, { why: 'one ramp call per drain', calls: rampCalls, drains: drains.length });

  drains.forEach((d, i) => {
    const next = drains[i + 1];
    if (next) check(next.frame === nextDrainFrame(d.frame, d.sent), { why: 'next drain frame', frame: d.frame, sent: d.sent.map(hex), want: nextDrainFrame(d.frame, d.sent), got: next.frame });
  });

  check(drains.length > 0, { why: 'no drain in the capture' });
  check(rampEntries[0]?.frame === drains[0]?.frame, { why: 'the ramp starts at the first drain', first: drains[0]?.frame, ramp: rampEntries[0]?.frame });
  check(openingStart !== null, { why: 'no opening start' });
  check(enqueueLog[0].frame === openingStart, { why: 'the opening start is the first enqueue', openingStart, first: enqueueLog[0].frame });
  check(drains[0].frame - openingStart === 1, { why: 'first drain follows the opening start', openingStart, drain: drains[0].frame });
  check(spdifSends === 1, { why: 'one push', got: spdifSends });
  check(spdifFrame === drains[0].frame, { why: 'the push is in the first drain pass', push: spdifFrame, drain: drains[0].frame });
  check(spdifFrame - spdifStoreFrame === 1, { why: 'main stores the word the frame before', store: spdifStoreFrame, push: spdifFrame });
  check(handoff !== null, { why: 'no hand-off' });
  check(threadStart === handoff.frame, { why: 'thread start in the hand-off frame', handoff, threadStart });
  check(counterOfFrame(handoff.frame) === handoff.counter, { why: 'hand-off counter', handoff });

  const threadEnqueue = enqueueLog.find((e) => e.ra === 0x00225d58);
  const setupFirst = enqueueLog.find((e) => e.ra === 0x00232620);
  const setupSecond = enqueueLog.find((e) => e.ra === 0x00225e50);
  check(JSON.stringify(threadEnqueue?.args) === JSON.stringify([0x6150, 1, 0, 0]), { why: 'thread start command', got: threadEnqueue?.args });
  check(JSON.stringify(setupFirst?.args) === JSON.stringify([0x6150, 6, 0, 0xf]), { why: 'set-up first command', got: setupFirst?.args });
  check(JSON.stringify(setupSecond?.args.slice(0, 2)) === JSON.stringify([0x6140, 2]), { why: 'set-up second command', got: setupSecond?.args });
  const t = ringTemporaries(setupFirst.head);
  check(setupSecond.args[2] === t.a2, { why: 'set-up second a2', head: setupFirst.head, want: t.a2, got: setupSecond.args[2] });
  check(setupSecond.args[3] === t.a3, { why: 'set-up second a3', head: setupFirst.head, want: t.a3, got: setupSecond.args[3] });

  console.log(`build: ${BUILD_NAME}`);
  console.log(`opening start enqueue frame ${openingStart}, first drain ${drains[0]?.frame}, ramp enqueues ${rampEntries.length} from frame ${rampEntries[0]?.frame} to ${rampEntries.at(-1)?.frame}, drains ${drains.length}`);
  console.log(`hand-off frame ${handoff?.frame} (counter ${handoff?.counter}), thread start enqueue ${threadStart}, set-up pair enqueue ${setupFirst?.frame}`);
  console.log(`ring head at each sender: opening start ${enqueueLog[0]?.head}, stage 2 ${enqueueLog.find((e) => e.ra === 0x0021f200)?.head}, thread start ${threadEnqueue?.head}, set-up ${setupFirst?.head}`);
  console.log(`push: ${spdifSends} send at frame ${spdifFrame}, word stored in frame ${spdifStoreFrame}`);
  if (compared === 0) throw new Error('compared nothing: not a verifier');
  console.log(`compared ${compared} items, ${failures.length} differ`);
  for (const f of failures.slice(0, 10)) console.log(JSON.stringify(f));
  console.log(failures.length === 0 ? `verdict: FOUND ${compared} items equal` : `verdict: PARTIAL ${failures.length} of ${compared} differ`);
  process.exit(failures.length === 0 ? 0 : 1);
}
