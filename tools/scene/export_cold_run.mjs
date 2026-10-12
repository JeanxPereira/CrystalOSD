// A cold-run capture (References/scripts/cold_run_probes.mjs: every piece of clock_memory.mjs at the frame function's entry,
// once per frame, from power-on) as an input log and start JSONs.
//
//   node tools/scene/export_cold_run.mjs <capture> --out <dir> [--at <counter>,<counter>...] [--match <old.json>]
//   <dir>/input-log.json : per frame { frame, counter, pad, rtcMirror, time, field, mode, screenCode } and the first frame's start values
//   <dir>/start-<counter>.json : the pieces of the frame whose counter is <counter>, in the key order of the start JSONs
//   --match: only the pieces the given old JSON holds (the JSON a start-<counter>.json is compared with)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const capture = argv[0];
const option = (name) => { const at = argv.indexOf(`--${name}`); return at >= 0 ? argv[at + 1] : undefined; };
if (!capture || !option('out')) { console.error('usage: node export_cold_run.mjs <capture> --out <dir> [--at <counter>,...] [--match <old.json>]'); process.exit(2); }
process.env.CLOCK_BUILD = 'hdd';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const url = (file) => pathToFileURL(file).href;
const REFERENCES = path.join(HERE, '../../References');
const probes = await import(url(path.join(REFERENCES, 'scripts/cold_run_probes.mjs')));
const { readTraceFor } = await import(url(path.join(REFERENCES, 'lib/trace.mjs')));
const { Memory } = await import(url(path.join(REFERENCES, 'model/clock_memory.mjs')));
const { decode } = await import(url(path.join(HERE, 'instrument.mjs')));

const CAPTURES = process.env.CRYSTALOSD_CAPTURES ?? 'D:/CodingProjects/Watson/Runtime/captures';
const file = path.isAbsolute(capture) ? capture : path.join(CAPTURES, `${capture}.trace.jsonl`);
const trace = readTraceFor(file, probes.PROBES);
if (!trace.complete) throw new Error(`${capture}: ${trace.reason}`);

const per = probes.PROBES.length;
const frames = [];
const records = trace.probes.filter((p) => !p.preroll);
for (let i = 0; i + per <= records.length; i += per) {
  const group = records.slice(i, i + per);
  if (group.some((r, k) => r.index !== k)) throw new Error(`${capture}: probe records out of step at ${i}`);
  frames.push({ frame: group[0].frame, captureFrame: group[0].captureFrame, memory: new Memory('hdd', group.flatMap((r) => r.mem.filter((m) => m.bytes).map((m) => ({ address: m.address, bytes: m.bytes })))) });
}
const out = option('out');
fs.mkdirSync(out, { recursive: true });

const int = (m, name, offset = 0) => m.int(name, offset);
const quick = (m) => {
  const piece = (name) => (m.has(name) ? decode({ has: (n) => n === name, at: () => m.at(name) })[name] : undefined);
  return {
    counter: int(m, 'counter'), pad: piece('pad'), rtcMirror: piece('rtcMirror'), time: piece('time'), field: m.has('scene') ? int(m, 'scene', 8) : undefined,
    mode: int(m, 'mode'), screenCode: m.has('screenCode') ? int(m, 'screenCode') : undefined,
  };
};
const log = frames.map((f) => ({ frame: f.frame, captureFrame: f.captureFrame, ...quick(f.memory) }));
const first = frames[0].memory;
const angles = (state) => Array.from({ length: 7 }, () => { state = (Math.imul(state, 0x41c64e6d) + 0x3039) >>> 0; return (state & 0x7fffffff) % 65536; });
const orb = first.has('orbRandom') ? decode({ has: (n) => n === 'orbRandom', at: () => first.at('orbRandom') }).orbRandom : undefined;
const startValues = {
  randState: orb && JSON.stringify(angles(1)) === JSON.stringify(orb) ? 1 : null,
  counter: log[0].counter, orbRandom: m_orb(first), mechaconParam: first.has('mechaconParam') ? decode({ has: (n) => n === 'mechaconParam', at: () => first.at('mechaconParam') }).mechaconParam : undefined,
  videoMode: first.has('videoMode') ? first.int('videoMode') : undefined, rtcMirror: log[0].rtcMirror, time: log[0].time,
};
function m_orb(m) { return m.has('orbRandom') ? decode({ has: (n) => n === 'orbRandom', at: () => m.at('orbRandom') }).orbRandom : undefined; }
fs.writeFileSync(path.join(out, 'input-log.json'), `${JSON.stringify({ capture, frames: log.length, first: startValues, log })}\n`);
console.log(`${capture}: ${log.length} frames, counters ${log[0].counter}..${log.at(-1).counter}`);

const wanted = (option('at') ?? '').split(',').filter(Boolean).map(Number);
const old = option('match') ? JSON.parse(fs.readFileSync(option('match'), 'utf8')) : null;
for (const counter of wanted) {
  const f = frames.find((x) => int(x.memory, 'counter') === counter);
  if (!f) { console.log(`no frame with counter ${counter}`); continue; }
  const all = decode(f.memory);
  const keys = old ? Object.keys(old).filter((k) => k in all) : Object.keys(all);
  const json = { capture, build: 'hdd', frame: f.captureFrame };
  for (const key of keys) json[key] = all[key];
  const text = `{\n${Object.entries(json).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n}\n`;
  fs.writeFileSync(path.join(out, `start-${counter}.json`), text);
  console.log(`start-${counter}.json: capture frame ${f.captureFrame}, ${keys.length} pieces`);
}
