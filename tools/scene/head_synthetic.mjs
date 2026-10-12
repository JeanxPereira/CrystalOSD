// Synthetic head scenes: whole3-clock frame 3's input with the blur level, overlay mode, vignette ramp, ring record,
// item 0, screen and counter altered, and expect.head from the JS model run on it (blur trips, trips after the rods,
// vignette, no bars). One frame per file, so only the isolated path is covered. Needs the model's dumps (main checkout).
//   node tools/scene/head_synthetic.mjs [outDir]    default: D:/CodingProjects/CrystalOSD-Data/fixtures/synthetic-head

import fs from 'node:fs';
process.env.CLOCK_BUILD ??= 'hdd';
const MAIN = new URL('../../', import.meta.url).href;
const DATA = (process.env.CRYSTALOSD_DATA ?? 'D:/CodingProjects/CrystalOSD-Data').replaceAll('\\', '/').replace(/\/$/, '') + '/';
const { PIECES, decode, gsDecoder } = await import(`./instrument.mjs`);
const { Memory, LAYOUT } = await import(`${MAIN}References/model/clock_memory.mjs`);
const { stateWriters } = await import(`${MAIN}References/model/clock_frame.mjs`);
const rest = await import(`${MAIN}References/model/clock_rest.mjs`);
const { REG } = await import(`${MAIN}References/model/clock_math.mjs`);

const base = JSON.parse(fs.readFileSync(DATA + 'fixtures/hddosd-110U-whole3-clock/scene.json'));
const src = base.frames[3];
const bitsOf = (h) => parseInt(h.slice(2), 16);
const names = ['greyRamp', 'greys', 'vignetteRamp', 'ringRecord', 'tint', 'blurRecord', 'copyRecord', 'fadeRecord', 'bars', 'column', 'screen', 'mode', 'overlayLevel',
  'level', 'counter', 'item0', 'proportions', 'clearColour', 'tubeConstants', 'scene', 'index', 'display'];

function memoryOf(input) {
  const blocks = names.map((name) => ({ address: LAYOUT[name][0], bytes: Buffer.alloc(LAYOUT[name][2]) }));
  const m = new Memory('hdd', blocks);
  const i32 = (name, values, at = 0) => values.forEach((v, k) => m.at(name).writeInt32LE(v | 0, at + 4 * k));
  const f32 = (name, hexes, at = 0) => hexes.forEach((h, k) => m.at(name).writeUInt32LE(bitsOf(h), at + 4 * k));
  const ramp = (name) => { const r = input[name]; i32(name, [r.length, r.counter, r.changed, r.state]); };
  const rect = (name) => { const r = input[name]; i32(name, r.colour); i32(name, [r.x0, r.y0, r.u0, r.v0], 0x10); i32(name, [r.x1, r.y1, r.u1, r.v1], 0x20); i32(name, [r.z, r.blend, r.textured], 0x30); };
  ramp('greyRamp'); ramp('vignetteRamp');
  i32('greys', input.greys);
  const g = input.ringRecord; i32('ringRecord', [g.alpha, g.cx, g.cy, g.rx, g.ry, g.z]);
  for (const n of ['tint', 'blurRecord', 'copyRecord', 'fadeRecord', 'bars', 'column']) rect(n);
  i32('screen', [input.screen.width, input.screen.height]);
  for (const n of ['mode', 'overlayLevel', 'level', 'counter', 'item0', 'index']) i32(n, [input[n]]);
  f32('proportions', [input.proportions.ax, input.proportions.ay]);
  i32('clearColour', input.clearColour);
  const t = input.tubeConstants; f32('tubeConstants', ['near', 'turn', 'scroll', 'ripple', 'scrollEnd', 'turnEnd', 'far', 'radius'].map((k) => t[k]));
  m.at('scene').writeUInt32LE(bitsOf(input.scene.scale), 0); i32('scene', [input.scene.leaving, input.scene.field], 4);
  return m;
}

const scenarios = [
  { level: 3, mode: 0, vignetteRamp: { length: 80, counter: 30, changed: 0, state: 1 }, overlayLevel: 100, ringRecord: { alpha: 0, cx: 0, cy: 0, rx: 1184, ry: 592, z: 0 } },
  { level: 8, mode: 0, vignetteRamp: { length: 80, counter: 80, changed: 0, state: 2 }, overlayLevel: 128, ringRecord: { alpha: 0, cx: 0, cy: 0, rx: 1184, ry: 592, z: 4660 } },
  { level: 10, mode: 2, vignetteRamp: { length: 80, counter: 79, changed: 0, state: 1 }, overlayLevel: 77 },
  { level: 5, mode: 0, item0: 1, vignetteRamp: { length: 80, counter: 1, changed: 0, state: 3 }, counter: 4999 },
  { level: 0, mode: 0, item0: 2, vignetteRamp: { length: 80, counter: 40, changed: 0, state: 3 }, screen: { width: 640, height: 256 }, greyRamp: { length: 40, counter: 17, changed: 0, state: 1 } },
  { level: 9, mode: 0, vignetteRamp: { length: 80, counter: 55, changed: 0, state: 2 }, ringRecord: { alpha: 0, cx: 0, cy: 0, rx: 3000, ry: 2000, z: 100 }, counter: 123456 },
  { level: 7, mode: 3, overlayLevel: 3, item0: 0, proportions: { ax: '0x3f800000', ay: '0x3f1a0000' } },
];

function group(packets) {
  const decodeWrites = gsDecoder();
  const head = { background: [], blur: [], copies: [], tint: null, vignette: [], fade: null, blurAfter: [], bars: [], column: null };
  let part = null;
  for (const packet of packets) {
    if (packet.mark) { part = packet.mark; continue; }
    if (!packet.writes) continue;
    const draw = decodeWrites(packet.writes);
    if (packet.kind !== 'vertex' || draw.vertices.length === 0) continue;
    const shown = { label: packet.label, prim: draw.prim, vertices: draw.vertices };
    const label = packet.label;
    if (label === 'background: strip') head.background.push(shown);
    else if (label.startsWith('blur:')) (part === 'head' ? head.blur : head.blurAfter).push(shown);
    else if (label === 'copy') head.copies.push(shown);
    else if (label === 'tint') head.tint = shown;
    else if (label === 'vignette') head.vignette.push(shown);
    else if (label === 'fade') head.fade = shown;
    else if (label === 'bars') head.bars.push(shown);
    else if (label === 'column') head.column = shown;
  }
  return head;
}

const frames = scenarios.map((change, index) => {
  const input = { ...JSON.parse(JSON.stringify(src.input)), ...change };
  const m = memoryOf(input);
  const env = { hdd: true, width: input.screen.width, height: input.screen.height, field: 0, display: m.at('display'), displayIndex: 0 };
  const packets = [];
  const ctx = { m, hdd: true, w: env.width, h: env.height, env, gs: stateWriters(env), packets, send: (...list) => packets.push(...list.flat(Infinity)) };
  const view = src.expect.camera.view.map((r) => r.map((h) => new DataView(new ArrayBuffer(4)) && Buffer.from(bitsOf(h).toString(16).padStart(8, '0'), 'hex').readFloatBE(0)));
  const screen = src.expect.camera.screen.map((r) => r.map((h) => Buffer.from(bitsOf(h).toString(16).padStart(8, '0'), 'hex').readFloatBE(0)));
  const before = decode(m);
  packets.push({ mark: 'head' }); rest.head(ctx, view, screen);
  packets.push({ mark: 'overlay' }); rest.overlay(ctx);
  packets.push({ mark: 'pages' }); rest.tripsAfter(ctx);
  packets.push({ mark: 'bars' }); rest.bars(ctx);
  packets.push({ mark: 'column' }); rest.column(ctx);
  const head = group(packets);
  return { index, input: { ...before }, expect: { camera: src.expect.camera, head, after: decode(m) } };
});
for (const f of frames) console.log(f.index, 'bg', f.expect.head.background.length, 'blur', f.expect.head.blur.length, 'vign', f.expect.head.vignette.length, 'after', f.expect.head.blurAfter.length, 'bars', f.expect.head.bars.length);
const out = process.argv[2] ?? DATA + 'fixtures/synthetic-head';
fs.mkdirSync(out, { recursive: true });
frames.forEach((f, i) => fs.writeFileSync(`${out}/scene-${i}.json`, JSON.stringify({ capture: 'synthetic-head', build: 'hdd', frames: [f] })));
