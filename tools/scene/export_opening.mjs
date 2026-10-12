// The opening intro's probed values for the native tests: for every frame of a capture, the console's own
// memory at the verifiers' probe points (References/scripts/verify_opening*.mjs), named by the verifier's
// probe table. Probed memory only: no model value is written (plan R2).
//
//   CRYSTALOSD_DATA=<data home> node tools/scene/export_opening.mjs <trace.jsonl> [out.json]
//   default out: <References>/fixtures/<capture>/opening.json
//
// Schema. Floats are "0x" and 8 hex digits; integers are numbers; byte ranges are hex strings.
// { capture, build: "hdd", video: "ntsc",
//   probes: { <group>: [ { pc, ranges: ["address:length" | "reg+offset:length"] } ] },    the verifiers' own tables
//   externals: { firstCounter, phase, discAtCounter: [[counter, state]...], history: [ {name, count, mask, mainCell} x21 ] | null,
//                emptyName, clockForced, hddReady, hddExec },
//   frames: [ { index (the trace's frame), counter (the module counter, or null),
//     timeline?: { stage, block: { "0x00": float, ... }, camera [x, y, z], up [2], roll, pending, go, scene, discState, snapshot,
//                  thresholds [8], forcedClock,
//                  after: { block, camera, up, roll, stage, go, pending }, matrices: hex, result,
//                  fade?: alpha, blur?: level, logo?: { alpha, step?: { state, value, step } } },
//     fog?:    { offsets: [6 floats], records: [ probe ] },
//     lights?: { phase, head, tail, records: [ probe ], cosines: [float], sines: [float] },
//     cubes?:  [ probe ],              every probe record of the cubes group, in file order
//     <group>?: [ probe ]              overlays, flat, inputs, towers, handoff, stages3: every probe record, in file order
//   } ] }
// A probe record is { k (index in the group's table), pc, gpr: { v0, a0, a1, a2, a3, s0 }, fpr0, mem: [hex | null] }.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataPath } from '../../References/lib/data.mjs';

const REFERENCES = new URL('../../References', import.meta.url).href;
const load = (relative) => import(`${REFERENCES}/${relative}`);
const { readTrace, probesOf } = await load('lib/trace.mjs');

const GROUPS = {
  camera: 'scripts/verify_opening_camera.mjs',
  fog: 'scripts/verify_opening_fog.mjs',
  lights: 'scripts/verify_opening_lights.mjs',
  cubes: 'scripts/verify_opening_cubes.mjs',
  overlays: 'scripts/verify_opening_overlays.mjs',
  flat: 'scripts/verify_opening_flat.mjs',
  inputs: 'scripts/verify_opening_inputs.mjs',
  towers: 'scripts/verify_opening_towers_ee.mjs',
  handoff: 'scripts/verify_opening3_handoff.mjs',
  stages3: 'scripts/verify_opening3_stages.mjs',
};

const hexFloat = (buffer, at) => `0x${buffer.readUInt32LE(at).toString(16).padStart(8, '0')}`;
const hexBits = (u32) => `0x${(u32 >>> 0).toString(16).padStart(8, '0')}`;
const floats = (buffer, at, count) => Array.from({ length: count }, (_, i) => hexFloat(buffer, at + i * 4));
const hexBytes = (range) => (range?.bytes ? range.bytes.toString('hex') : null);
const BLOCK_OFFSETS = [0x00, 0x04, 0x08, 0x10, 0x14, 0x18, 0x20, 0x24, 0x28, 0x30, 0x34, 0x38, 0x40, 0x44, 0x48];

function record(probe, k) {
  return {
    k, pc: `0x${probe.pc.toString(16).padStart(8, '0')}`,
    gpr: { v0: probe.gpr[2], a0: probe.gpr[4], a1: probe.gpr[5], a2: probe.gpr[6], a3: probe.gpr[7], s0: probe.gpr[16] },
    fpr0: probe.fpr ? hexBits(probe.fpr[0]) : null,
    mem: probe.mem.map(hexBytes),
  };
}

/** The module's animation block, camera, variables and disc state of one probe of the camera or stages3 group. */
function state(probe, discAt) {
  const [block, camera, vars, disc, , thresholds, , clock] = probe.mem.map((range) => range.bytes);
  if (!block || !camera || !vars || !disc || !thresholds) return null;
  return {
    stage: block.readInt32LE(0x50),
    block: Object.fromEntries(BLOCK_OFFSETS.map((at) => [`0x${at.toString(16).padStart(2, '0')}`, hexFloat(block, at)])),
    camera: floats(camera, 0, 3), up: floats(camera, 0x20, 2),
    roll: hexFloat(vars, 0x98), pending: vars.readInt32LE(0x90), go: vars.readInt32LE(0x94),
    counter: vars.readUInt32LE(0), scene: vars.readInt32LE(4), snapshot: vars.readInt32LE(0xa0),
    discState: disc.readInt32LE(discAt),
    thresholds: [...Array(8).keys()].map((i) => thresholds.readInt32LE(i * 4)),
    forcedClock: clock ? clock.readInt32LE(0) === 0 : null,
  };
}

function timeline(records, discAt) {
  const [entry, middle, matrices, end, fade, blur, logo, logoStep] = records;
  if (!entry || !end) return undefined;
  const before = state(entry, discAt), after = state(end, discAt);
  if (!before || !after) return undefined;
  const out = { ...before };
  delete out.counter;
  out.after = { block: after.block, camera: after.camera, up: after.up, roll: after.roll, stage: after.stage, go: after.go, pending: after.pending };
  if (middle) out.afterStages = { stage: state(middle, discAt)?.stage, go: state(middle, discAt)?.go, pending: state(middle, discAt)?.pending };
  if (matrices?.mem[0]?.bytes) out.matrices = matrices.mem[0].bytes.toString('hex');
  out.result = end.gpr[2];
  if (fade) out.fade = fade.gpr[5];
  if (blur) out.blur = blur.gpr[4];
  if (logo) out.logo = { alpha: logo.gpr[6] };
  if (logoStep && logoStep.mem[1]?.bytes && logoStep.mem[2]?.bytes) {
    out.logoStep = { state: logoStep.mem[1].bytes.readInt32LE(0), value: logoStep.mem[1].bytes.readInt32LE(4), step: logoStep.mem[2].bytes.readInt32LE(0) };
  }
  return out;
}

export async function exportOpening(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const probesOfGroup = {};
  const byGroup = {};
  for (const [group, relative] of Object.entries(GROUPS)) {
    const { PROBES } = await load(relative);
    const fits = (probe, k) => (PROBES[k].ranges ?? []).every((range, i) => probe.mem[i]?.bytes?.length === Number(range.split(':')[1]));
    const found = probesOf(trace, PROBES).map((list, k) => list.filter((probe) => fits(probe, k)));
    if (found.every((list) => list.length === 0)) continue;
    probesOfGroup[group] = PROBES.map((probe) => ({ pc: probe.pc, ranges: probe.ranges ?? [] }));
    byGroup[group] = found.map((list, k) => list.map((probe) => ({ probe, k })));
  }

  const items = [];
  for (const [group, lists] of Object.entries(byGroup)) for (const entries of lists) for (const { probe, k } of entries) items.push({ group, k, probe });
  items.sort((a, b) => a.probe.at - b.probe.at || a.k - b.k);

  const counterOf = ({ group, probe, k }) => {
    const place = (probesOfGroup[group][k].ranges ?? []).findIndex((range) => /^0x0*370000:/i.test(range));
    const range = place >= 0 ? probe.mem[place] : null;
    return range?.bytes ? range.bytes.readUInt32LE(0) : null;
  };

  const stateGroup = ['camera', 'stages3'].find((group) => byGroup[group]?.[0]?.length > 0) ?? null;
  const discAt = stateGroup === 'stages3' ? 4 : 0;
  const frames = new Map();
  const slotsOf = new Map();
  const frameOf = (key, probe, entry) => {
    if (!frames.has(key)) { frames.set(key, { index: probe.frame, counter: null }); slotsOf.set(key, {}); }
    const frame = frames.get(key);
    if (entry && frame.counter === null) frame.counter = counterOf(entry);
    return frame;
  };
  const starts = stateGroup ? items.filter((it) => it.group === stateGroup && it.k === 0) : [];
  let cursor = 0;
  const keyOf = (item) => {
    if (!stateGroup) return item.probe.frame;
    while (cursor + 1 < starts.length && starts[cursor + 1].probe.at <= item.probe.at) cursor++;
    return starts[cursor].probe.at;
  };
  for (const item of items) {
    const key = keyOf(item);
    frameOf(key, stateGroup ? starts[cursor].probe : item.probe, stateGroup ? starts[cursor] : item);
    const slots = slotsOf.get(key);
    ((slots[item.group] ??= [])[item.k] ??= []).push(item);
  }

  let phase = null;
  for (const [key, frame] of frames) {
    const slots = slotsOf.get(key);
    for (const [group, perProbe] of Object.entries(slots)) {
      const all = perProbe.flat().filter(Boolean);
      if (group === stateGroup) {
        const first = Array.from({ length: stateGroup === 'camera' ? 8 : 4 }, (_, k) => perProbe[k]?.[0]?.probe);
        const one = stateGroup === 'camera' ? first : [first[0], first[1], undefined, first[2], first[3]];
        const line = timeline(one, discAt);
        if (line) frame.timeline = line;
        if (stateGroup === 'stages3') frame.stages3 = all.filter((it) => it.k >= 4).map((it) => record(it.probe, it.k));
      } else if (group === 'fog') {
        const { probe, k } = all[0];
        frame.fog = { offsets: probe.mem[0].bytes ? floats(probe.mem[0].bytes, 0, 6) : null, records: [record(probe, k)] };
      } else if (group === 'lights') {
        const place = probesOfGroup.lights[0].ranges.findIndex((range) => /^0x0*370a74:/i.test(range));
        const light = { phase: null, head: null, tail: null, records: [], cosines: [], sines: [] };
        for (const { probe, k } of all) {
          if (k === 0) {
            const vars = probe.mem[0].bytes;
            light.phase = probe.mem[place].bytes.readInt32LE(0);
            light.head = vars.readInt32LE(0xb0);
            light.tail = vars.readInt32LE(0xac);
            phase ??= light.phase;
            light.records.push(record(probe, k));
          } else if (k === 1) light.cosines.push(hexBits(probe.fpr[0]));
          else light.sines.push(hexBits(probe.fpr[0]));
        }
        frame.lights = light;
      } else {
        frame[group] = all.map(({ probe, k }) => record(probe, k));
      }
    }
  }

  const list = [...frames.entries()].sort((a, b) => a[0] - b[0]).map(([, frame]) => frame);
  const counters = list.map((f) => f.counter).filter((c) => c !== null);

  const discAtCounter = [];
  let lastDisc = null;
  for (const f of list) if (f.timeline && f.counter !== null && f.timeline.discState !== lastDisc) { lastDisc = f.timeline.discState; discAtCounter.push([f.counter, lastDisc]); }

  let history = null, emptyName = null;
  if (byGroup.towers) {
    const second = byGroup.towers[1]?.[0]?.probe;
    const place = probesOfGroup.towers[1].ranges.findIndex((range) => /^0x0*1f0198:/i.test(range));
    const bytes = second?.mem[place]?.bytes;
    if (bytes) {
      history = Array.from({ length: 21 }, (_, e) => {
        const entry = bytes.subarray(e * 22, e * 22 + 22);
        const zero = entry.subarray(0, 16).indexOf(0);
        return { name: entry.subarray(0, zero < 0 ? 16 : zero).toString('latin1'), count: entry[0x10], mask: entry[0x11], mainCell: entry[0x12] };
      });
    }
    const third = byGroup.towers[2]?.[0]?.probe;
    const emptyPlace = probesOfGroup.towers[2].ranges.findIndex((range) => /^0x0*3700d0:/i.test(range));
    const empty = third?.mem[emptyPlace]?.bytes;
    if (empty) { const zero = empty.indexOf(0); emptyName = empty.subarray(0, zero < 0 ? 16 : zero).toString('latin1'); }
  }

  let clockForced = null, hddReady = null, hddExec = null;
  const firstState = list.find((f) => f.timeline)?.timeline;
  if (firstState) clockForced = firstState.forcedClock;
  if (byGroup.stages3) {
    const entry = byGroup.stages3[0]?.[0]?.probe;
    const words = entry?.mem[7]?.bytes;
    if (words && words.length >= 12) { clockForced = words.readInt32LE(0) === 0; hddReady = words.readInt32LE(4); hddExec = words.readInt32LE(8); }
  }

  const out = {
    capture: path.basename(traceFile).replace(/\.trace\.jsonl(\.gz)?$/, ''), build: 'hdd', video: 'ntsc',
    probes: probesOfGroup,
    externals: { firstCounter: counters.length ? Math.min(...counters) : null, phase, discAtCounter, history, emptyName, clockForced, hddReady, hddExec },
    frames: list,
  };
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\//, ''))) {
  const [traceFile, outFile] = process.argv.slice(2);
  if (!traceFile) { console.error('usage: node tools/scene/export_opening.mjs <trace.jsonl> [out.json]'); process.exit(2); }
  const result = await exportOpening(traceFile);
  const target = outFile ?? dataPath(`fixtures/${result.capture}/opening.json`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(result));
  console.log(`${result.capture}: ${result.frames.length} frames, groups ${Object.keys(result.probes).join(' ')}, in ${target}`);
}
