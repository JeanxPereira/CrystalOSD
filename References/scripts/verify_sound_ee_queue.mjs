// The EE side of the sound commands: the command ring, its drain with the 0x6300 dedup, and the master ramp.
//
// HDD OSD 1.10U: sound_handler_queue_cmd 0x00200C00 (ROM 2.30 0x00200BE8) stores {cmd, a1, a2, a3} as four
// halfwords at 0x001F0658 + 8 * (head & 127) when head - tail < 128 (head 0x001F0A60, tail 0x001F0A5C, busy flag
// 0x001F0A58 set around the store); sound_handler_exec_queue_cmd 0x00200A80 walks tail..head, skips empty slots,
// sends sceSdRemote(1, cmd, a1, a2, a3) (0x00294738), drops a 0x6300 whose a2 equals the a2 of the entry before
// it in the same drain (the first entry of a drain is never dropped), zeroes the slot, sets tail = head and calls
// sound_handler_2009E0(15): while the counter at 0x002AAF80 is below 15 it enqueues 0x60D0 (1, v, v) with
// v = (0x9FFEC * counter / 0x7F) / 15 and counts up.
// CLOCK_BUILD=hdd node verify_sound_ee_queue.mjs <trace.jsonl>
import { readTraceFor, probesOf } from '../lib/trace.mjs';
import { BUILD_NAME, pick, range, pc } from './builds.mjs';
import { makeRing, enqueue, drain, rampStep, RING_ENTRIES } from '../model/sound_ee.mjs';

const A = pick({
  hdd: { enqueue: 0x00200c00, drain: 0x00200a80, wire: 0x00294738, ramp: 0x002009e0, counter: 0x002aaf80, ring: 0x001f0658, rampCmd: 0x60d0, steps: 15, dedup: 0x6300 },
  rom: { enqueue: 0x00200be8, drain: 0x00200a98, wire: 0x0026da20, ramp: 0x002009f8, counter: 0x0027a104, ring: 0x001f05f8, rampCmd: 0x500d, steps: 60, dedup: null },
});
const RING = A.ring;
const WORDS = A.ring + 0x400;
export const PROBES = [
  { pc: pc(A.enqueue), ranges: [] },
  { pc: pc(A.drain), ranges: [range(RING, RING_ENTRIES * 8), range(WORDS, 0x10)] },
  { pc: pc(A.wire), ranges: [] },
  { pc: pc(A.ramp), ranges: [range(A.counter, 4)] },
];

if (process.argv[1] && process.argv[1].endsWith('verify_sound_ee_queue.mjs')) {
  const trace = readTraceFor(process.argv[2], PROBES);
  if (!trace.complete) throw new Error(`${process.argv[2]}: ${trace.reason}`);
  const [enqueues, drains, wires, ramps] = probesOf(trace, PROBES);
  const kind = new Map();
  enqueues.forEach((r) => kind.set(r, 'enqueue'));
  drains.forEach((r) => kind.set(r, 'drain'));
  wires.forEach((r) => kind.set(r, 'wire'));
  ramps.forEach((r) => kind.set(r, 'ramp'));
  const records = trace.probes.filter((r) => kind.has(r));

  let compared = 0;
  const failures = [];
  const check = (ok, what) => { compared += 1; if (!ok) failures.push(what); };
  const u16 = (n) => Number(BigInt.asUintN(16, BigInt(n)));
  const ring = makeRing();
  let started = false;
  let drainsSeen = 0;
  let deduped = 0;
  let sentTotal = 0;
  let rampSteps = 0;
  let expectRampEnqueue = null;
  let pending = null;

  const finishDrain = () => {
    if (!pending) return;
    const got = pending.wires;
    const want = pending.sends;
    check(got.length === want.length, { why: 'send count', frame: pending.frame, want: want.length, got: got.length });
    for (let i = 0; i < Math.min(got.length, want.length); i++) {
      check(JSON.stringify(got[i]) === JSON.stringify(want[i]), { why: 'send', frame: pending.frame, i, want: want[i], got: got[i] });
    }
    sentTotal += got.length;
    pending = null;
  };

  for (const r of records) {
    const k = kind.get(r);
    if (k === 'enqueue') {
      const args = [r.gpr[4], r.gpr[5], r.gpr[6], r.gpr[7]].map(u16);
      if (expectRampEnqueue) {
        check(args[0] === expectRampEnqueue.cmd && args[1] === expectRampEnqueue.args[0] && args[2] === expectRampEnqueue.args[1] && args[3] === expectRampEnqueue.args[2], { why: 'ramp enqueue', want: expectRampEnqueue, got: args });
        expectRampEnqueue = null;
      }
      if (started) enqueue(ring, ...args);
    } else if (k === 'drain') {
      finishDrain();
      const ringBytes = r.mem[0].bytes;
      const words = r.mem[1].bytes;
      const flag = words.readUInt32LE(0);
      const tail = words.readUInt32LE(4);
      const head = words.readUInt32LE(8);
      if (!started) {
        ring.head = head;
        ring.tail = tail;
        for (let i = 0; i < RING_ENTRIES; i++) ring.slots[i] = [0, 1, 2, 3].map((j) => ringBytes.readUInt16LE(8 * i + 2 * j));
        started = true;
      } else {
        check(ring.head === head && ring.tail === tail, { why: 'ring counters', frame: r.frame, model: [ring.head, ring.tail], memory: [head, tail] });
        let equal = true;
        for (let at = tail; at < head; at++) {
          const slot = [0, 1, 2, 3].map((j) => ringBytes.readUInt16LE(8 * (at & (RING_ENTRIES - 1)) + 2 * j));
          const model = ring.slots[at & (RING_ENTRIES - 1)];
          if (JSON.stringify(slot) !== JSON.stringify(model)) equal = false;
        }
        check(equal, { why: 'ring contents', frame: r.frame });
      }
      drainsSeen += 1;
      if (flag !== 0) pending = { frame: r.frame, sends: [], wires: [] };
      else {
        const sends = drain(ring, A.dedup);
        pending = { frame: r.frame, sends, wires: [] };
        let count = 0;
        for (let at = tail; at < head; at++) {
          const slot = [0, 1, 2, 3].map((j) => ringBytes.readUInt16LE(8 * (at & (RING_ENTRIES - 1)) + 2 * j));
          if (slot[0] !== 0) count += 1;
        }
        deduped += count - sends.length;
      }
    } else if (k === 'wire') {
      if (pending) pending.wires.push([r.gpr[4], r.gpr[5], r.gpr[6], r.gpr[7], r.gpr[8]].map(u16));
    } else if (k === 'ramp') {
      finishDrain();
      const counter = r.mem[0].bytes.readInt32LE(0);
      const limit = r.gpr[4] | 0;
      if (counter < limit) {
        expectRampEnqueue = rampStep(counter, limit, A.rampCmd);
        rampSteps += 1;
        check(limit === A.steps, { why: 'ramp limit', limit });
      }
    }
  }
  finishDrain();
  check(drainsSeen > 0, { why: 'no drain in the capture' });

  console.log(`build: ${BUILD_NAME}`);
  console.log(`records: enqueue ${enqueues.length}, drain ${drains.length}, wire ${wires.length}, ramp ${ramps.length}; sends compared ${sentTotal}, 0x6300 dropped by the dedup ${deduped}, ramp steps ${rampSteps}`);
  if (compared === 0) throw new Error('compared nothing: not a verifier');
  console.log(`compared ${compared} items, ${failures.length} differ`);
  for (const f of failures.slice(0, 10)) console.log(JSON.stringify(f));
  console.log(failures.length === 0 ? `verdict: FOUND ${compared} items equal` : `verdict: PARTIAL ${failures.length} of ${compared} differ`);
  process.exit(failures.length === 0 ? 0 : 1);
}
