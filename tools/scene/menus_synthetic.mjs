// Scripted pad words through the JS model, from the first whole frame of hddosd-110U-whole3-enter (the main menu at
// rest, System Configuration selected, Browser one up): every scenario starts from that snapshot, writes its pad
// words before the clock thread's step and the frame (verify_frame.mjs --carry's order), holds the time record of
// frame 0, and records the stages and the cubes' draws.
//   CLOCK_BUILD=hdd node tools/scene/menus_synthetic.mjs [outDir]
//   default outDir: <CRYSTALOSD_DATA>/fixtures/synthetic-menus
import fs from 'node:fs';
process.env.CLOCK_BUILD ??= 'hdd';
const { install, REFERENCES } = await import('./instrument.mjs');
const recording = await install({ stagesOnly: true });
const { frame, between } = await import(`${REFERENCES}model/clock_frame.mjs`);
const { Memory } = await import(`${REFERENCES}model/clock_memory.mjs`);
const { readTraceFor } = await import(`${REFERENCES}lib/trace.mjs`);
const { PROBES } = await import(`${REFERENCES}scripts/verify_frame.mjs`);

const TRACE = 'D:/CodingProjects/Watson/Runtime/captures/hddosd-110U-whole3-enter.trace.jsonl';
const START = 0x00225e80;
const B = { up: 0x1000, down: 0x4000, cross: 0x20, circle: 0x40, square: 0x80, triangle: 0x10 };
const bytesOf = (words) => { const out = Buffer.alloc(words.length * 4); words.forEach((word, i) => out.writeUInt32LE(parseInt(word, 16), i * 4)); return out; };
const meshOf = (file) => { const j = JSON.parse(fs.readFileSync(file, 'utf8')); return { positions: bytesOf(j.positions.bits), normals: bytesOf(j.normals.bits), coordinates: bytesOf(j.coordinates.bits) }; };
const mesh = { ...meshOf(new URL('../../facts/data/rod-mesh.json', import.meta.url)), cube: meshOf(new URL(`${REFERENCES}model/cube-mesh.json`)) };

function firstBlocks() {
  const trace = readTraceFor(TRACE, PROBES);
  if (!trace.complete) throw new Error(`${TRACE}: ${trace.reason}`);
  const probes = trace.probes.filter((p) => !p.preroll);
  const from = probes.findIndex((p) => p.pc === START);
  const to = probes.findIndex((p, i) => i > from && p.pc === START);
  if (from < 0 || to < 0) throw new Error(`${TRACE}: no whole frame`);
  const inside = probes.slice(from, to);
  const blocks = [];
  for (let k = 0; k < 5; k++) blocks.push(...(inside.find((p) => p.pc === START + 4 * k)?.mem ?? []));
  if (blocks.length === 0 || blocks.some((b) => !b.bytes)) throw new Error(`${TRACE}: the first snapshot is not whole`);
  return blocks;
}
const BLOCKS = firstBlocks();
// Memory copies the blocks' bytes, so every scenario starts from the same snapshot.
const snapshot = () => new Memory('hdd', BLOCKS);
const MASH = ['cross', 'circle', 'square', 'up', 'down', 'triangle'];
const mash = (from, to) => Array.from({ length: Math.floor((to - from) / 4) + 1 }, (_, i) => [from + 4 * i, MASH[i % MASH.length]]);

/** [frame, button] pairs; each press is one frame of `pressed` and six of `held`. */
const presses = (list) => (k) => list.filter(([at]) => k === at).reduce((w, [, b]) => w | B[b], 0);
const heldOf = (list) => (k) => list.filter(([at]) => k >= at && k < at + 6).reduce((w, [, b]) => w | B[b], 0);
function adjustIndex(m) { const e = m.at('configEntries'); for (let n = 0; n < 9; n++) if (e.readUInt32LE(n * 0x38 + 0x14) === 0x00226fd0) return n; throw new Error('no Clock Adjustment entry'); }
const SCENARIOS = {
  'menu-cursor': () => ({ frames: 40, list: [[2, 'down'], [8, 'down'], [14, 'up'], [20, 'up'], [26, 'up']] }),
  'enter-mash': () => ({ frames: 130, list: [[2, 'down'], [6, 'cross'], ...Array.from({ length: 23 }, (_, i) => [10 + 4 * i, ['cross', 'circle', 'square', 'up', 'down', 'triangle'][i % 6]])] }),
  'config-wrap': () => ({ frames: 200, list: [[2, 'down'], [6, 'cross'], [110, 'up'], [118, 'up'], [126, 'down'], [134, 'down'], [142, 'down'], [150, 'triangle']] }),
  square: () => ({ frames: 300, list: [[2, 'down'], [6, 'cross'], [110, 'square'], [200, 'square']] }),
  entries: (m) => { const a = adjustIndex(m); const downs = Array.from({ length: a }, (_, i) => [150 + 8 * i, 'down']); const t = 150 + 8 * a;
    return { frames: t + 120, list: [[2, 'down'], [6, 'cross'], [110, 'down'], [118, 'cross'], [126, 'cross'], [134, 'up'], ...downs, [t + 8, 'cross'], [t + 20, 'up'], [t + 30, 'circle'], [t + 50, 'cross'], [t + 70, 'cross']] }; },
  back: () => ({ frames: 220, list: [[2, 'down'], [6, 'cross'], [110, 'circle']] }),
  'back-mash': () => ({ frames: 260, list: [[2, 'down'], [6, 'cross'], [110, 'circle'], ...mash(114, 196)] }),
  'square-mash': () => ({ frames: 320, list: [[2, 'down'], [6, 'cross'], [110, 'square'], ...mash(111, 160), [200, 'square'], ...mash(201, 250)] }),
  browser: () => ({ frames: 140, list: [[2, 'up'], [8, 'cross']] }),
  long: () => ({ frames: 420, spin: 0xff00, list: [[2, 'down'], [6, 'cross'], ...Array.from({ length: 70 }, (_, i) => [110 + 4 * i, 'down'])] }),
};

const out = process.argv[2] ?? `${process.env.CRYSTALOSD_DATA ?? 'D:/CodingProjects/CrystalOSD-Data'}/fixtures/synthetic-menus`;
for (const [name, make] of Object.entries(SCENARIOS)) {
  const m = snapshot();
  const s = make(m);
  if (s.spin !== undefined) m.at('spin').writeInt32LE(s.spin, 0);
  const pressed = presses(s.list), held = heldOf(s.list);
  const index0 = m.int('index');
  recording.frames.length = 0;
  for (let k = 0; k < s.frames; k++) {
    const pad = m.at('pad');
    pad.writeUInt32LE(held(k), 0); pad.writeUInt32LE(pressed(k), 4); pad.writeUInt32LE(0, 8); pad.writeUInt32LE(pressed(k), 12);
    m.at('scene').writeInt32LE(k & 1, 8);
    m.setInt('index', (index0 + k) & 1);
    if (k > 0) between(m, []);
    frame({ memory: m }, mesh);
  }
  if (recording.frames.length !== s.frames) throw new Error(`${name}: ${recording.frames.length} frames recorded, ${s.frames} run`);
  fs.mkdirSync(`${out}/${name}`, { recursive: true });
  fs.writeFileSync(`${out}/${name}/scene.json`, `${JSON.stringify({ capture: `synthetic-menus-${name}`, build: 'hdd', stagesOnly: true, frames: recording.frames })}\n`);
  console.log(`${name}: ${recording.frames.length} frames`);
}
