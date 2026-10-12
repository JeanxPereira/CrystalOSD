import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

process.env.CLOCK_BUILD = 'hdd';
const [referencesDir, capturesDir, outDir, ...names] = process.argv.slice(2);
const lib = (rel) => import(pathToFileURL(path.join(referencesDir, rel)).href);
const { readTraceFor, probesOf } = await lib('lib/trace.mjs');
const { range, pc } = await lib('scripts/builds.mjs');
const { makeRing, enqueue, drain } = await lib('model/sound_ee.mjs');
const eeProbes = (await lib('scripts/verify_sound_ee_queue.mjs')).PROBES;

const ENQUEUE = { pc: pc(0x00200c00), ranges: [range(0x001f0a5c, 8)] };
const DRAIN = { pc: pc(0x00200a80), ranges: [] };
const u16 = (n) => Number(BigInt.asUintN(16, BigInt(n)));
const args = (r) => [r.gpr[4], r.gpr[5], r.gpr[6], r.gpr[7]].map(u16);
const line = (tag, values) => `${tag} ${values.join(' ')}`;

function exportWire(file) {
  const trace = readTraceFor(file, eeProbes);
  const [, drains, wires, ramps] = probesOf(trace, eeProbes);
  const kind = new Map();
  probesOf(trace, eeProbes).forEach((records, i) => records.forEach((r) => kind.set(r, ['enqueue', 'drain', 'wire', 'ramp'][i])));
  const records = trace.probes.filter((r) => kind.has(r));
  const ops = [];
  let started = false;
  let counter = null;
  let expectRamp = false;
  let current = null;
  let dropped = 0;
  for (const r of records) {
    const k = kind.get(r);
    if (k === 'enqueue') {
      if (expectRamp) { expectRamp = false; continue; }
      if (started) ops.push({ q: args(r) });
    } else if (k === 'drain') {
      const bytes = r.mem[0].bytes;
      const words = r.mem[1].bytes;
      const flag = words.readUInt32LE(0);
      const tail = words.readUInt32LE(4);
      const head = words.readUInt32LE(8);
      if (!started) {
        started = true;
        for (let at = tail; at < head; at++) {
          const slot = [0, 1, 2, 3].map((j) => bytes.readUInt16LE(8 * (at & 127) + 2 * j));
          ops.push({ q: slot });
        }
      }
      current = flag === 0 ? { d: [] } : null;
      if (current) ops.push(current);
    } else if (k === 'wire') {
      if (current) current.d.push([r.gpr[5], r.gpr[6], r.gpr[7], r.gpr[8]].map(u16));
    } else if (k === 'ramp') {
      current = null;
      const c = r.mem[0].bytes.readInt32LE(0);
      if (counter === null) counter = c;
      if (c < (r.gpr[4] | 0)) expectRamp = true;
    }
  }
  return { counter, ops, align: null, dropped };
}

function exportModelled(file, drainProbe) {
  const probes = drainProbe ? [ENQUEUE, DRAIN] : [ENQUEUE];
  const trace = readTraceFor(file, probes);
  const groups = probesOf(trace, probes);
  const kind = new Map();
  groups.forEach((records, i) => records.forEach((r) => kind.set(r, i)));
  const records = trace.probes.filter((r) => kind.has(r) && !r.preroll);
  const ring = makeRing();
  const ops = [];
  let align = null;
  let frame = null;
  const closeFrame = () => {
    if (!drainProbe && frame !== null) ops.push({ d: drain(ring, 0x6300).map((s) => s.slice(1)) });
  };
  for (const r of records) {
    if (kind.get(r) === 0) {
      if (!drainProbe && frame !== r.captureFrame) { closeFrame(); frame = r.captureFrame; }
      const head = r.mem[0].bytes.readUInt32LE(4);
      const tail = r.mem[0].bytes.readUInt32LE(0);
      if (align === null) {
        if (head !== tail) throw new Error(`${file}: ring not empty at the first enqueue`);
        align = head;
      }
      const a = args(r);
      enqueue(ring, ...a);
      ops.push({ q: a, head });
    } else {
      ops.push({ d: drain(ring, 0x6300).map((s) => s.slice(1)) });
    }
  }
  closeFrame();
  return { counter: 15, ops, align, dropped: 0 };
}

fs.mkdirSync(outDir, { recursive: true });
for (const name of names) {
  const file = path.join(capturesDir, `${name}.trace.jsonl`);
  const result = name.includes('-sound-ee-') ? exportWire(file) : exportModelled(file, name.includes('-sound-menu-'));
  const out = [line('capture', [name]), line('counter', [result.counter]), line('align', [result.align ?? -1])];
  for (const op of result.ops) {
    if (op.q) out.push(line('Q', [...op.q, op.head ?? -1]));
    else {
      out.push('D');
      for (const s of op.d) out.push(line('S', s));
      out.push('.');
    }
  }
  fs.writeFileSync(path.join(outDir, `${name}.queue.txt`), `${out.join('\n')}\n`);
}
