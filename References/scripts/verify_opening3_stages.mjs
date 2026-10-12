// Copy of verify_opening_stages.mjs that also checks the sound commands each stage handler sends
// (sound_handler_queue_cmd 0x00200C00 and sceSdRemote 0x00294738, told apart by their return
// address) against the ones it computes, and counts the branch each frame took. It serves the
// captures that stimulate the branches (a disc state held by a patched writer, the hard-disk words
// written): the command, its arguments and its call site are compared, not only the state.
//
// The opening module's stage machine as a whole (HDD OSD 1.10U, OpeningProcessInner 0x0021EF00):
// every stage handler of jtbl_00365400, with the hard-disk boot branches of stages 1 and 2, the
// disc-state switches of stages 1, 2 and 6 (jtbl_00365420, jtbl_00365470, jtbl_003654A0), the
// end wait of stage 6 and the restart of stage 7; then the integrator (exact single-precision
// arithmetic) and the function's result. It serves both scenes the module runs, the intro
// (scene 0) and the illegal-disc scene (scene 1), in NTSC and PAL (CLOCK_VIDEO=pal). Also the
// alpha handed to the fade rectangle by each scene's fade function (func_00221B00 for the intro,
// func_002242C8 for the illegal-disc scene), and the first frame's set-up of each scene.
//
//   0x0021EF00  entry: the state before the stage handlers
//   0x0021F37C  after the stage handlers, before the integrator
//   0x0021F5C8  the end: v0 = the function's result
//   0x0021D848  the fade rectangle: a1 = alpha (the probe of verify_opening_flat.mjs, so both run on one capture)
//
// node verify_opening3_stages.mjs <trace.jsonl> [t: print the timeline]
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { f, add, sub, asBits, toInt } from '../model/opening-lib.mjs';
import { PAL, FPS } from './builds.mjs';
import { PROBES as FLAT } from './verify_opening_flat.mjs';

// Eight ranges: the animation block, the camera, the module's variables, 0x1F0008..0x1F0D5B (the
// MECHACON flag, the disc state and the CDDA count at 0x1F0D58), the constants, the thresholds, the
// four jump tables, and the three hard-disk boot words (should-enter-clock, ready, exec).
const STATE = ['0x003db800:0x54', '0x002b0c60:0x30', '0x00370000:0x104', '0x001f0008:0xd54', '0x0036f9b0:0x58', '0x002b0e08:0x20', '0x00365400:0xe4', '0x002ad22c:0xc'];
export const PROBES = [
  { pc: '0x0021ef00', ranges: STATE },
  { pc: '0x0021f37c', ranges: STATE },
  { pc: '0x0021f5c8', ranges: STATE },
  FLAT.find((probe) => probe.pc === '0x0021d848'),
  { pc: '0x00200c00', ranges: [] },
  { pc: '0x00294738', ranges: [] },
];
const [ENTRY, INTEGRATOR, END, FADE, QUEUE, REMOTE] = PROBES.map((probe) => parseInt(probe.pc, 16));
const SITES = { queueForced: 0x0021f158, queueBefore: 0x0021f1bc, queueAfter: 0x0021f1d0, queueReady: 0x0021f1ec, queueDefault: 0x0021f200, remote: 0x0021f328 };
const R = { a0: 4, a1: 5, a2: 6, a3: 7, t0: 8 };
const queue = (name, ra, regs) => ({ name, fn: QUEUE, ra, regs });
const remote = (name, ra, regs) => ({ name, fn: REMOTE, ra, regs });
const OFFSETS = [0x00, 0x04, 0x08, 0x10, 0x14, 0x18, 0x20, 0x24, 0x28, 0x30, 0x34, 0x38, 0x40, 0x44, 0x48];

function read(probe) {
  const [block, camera, vars, low, constants, thresholds, tables, boot] = probe.mem.map((range) => range.bytes);
  if ([block, camera, vars, low, constants, thresholds, tables, boot].some((x) => !x)) return null;
  const B = {};
  for (const at of OFFSETS) B[at] = block.readFloatLE(at);
  const table = (base, count) => [...Array(count).keys()].map((i) => tables.readUInt32LE(base - 0x00365400 + i * 4));
  return {
    B, stage: block.readInt32LE(0x50),
    C: [camera.readFloatLE(0), camera.readFloatLE(4), camera.readFloatLE(8)],
    frame: vars.readUInt32LE(0), scene: vars.readInt32LE(4),
    pending: vars.readInt32LE(0x90), go: vars.readInt32LE(0x94), phi: vars.readFloatLE(0x98), snapshot: vars.readInt32LE(0xa0),
    ended: vars.readInt32LE(0xf4), stamp: vars.readUInt32LE(0x100), fadeCount: vars.readInt32LE(0xe8), drawing: vars.readInt32LE(0xe4),
    mechacon: low.readInt32LE(0), disc: low.readInt32LE(4), cdda: low.readInt32LE(0xd50),
    k: constants, thresholds: [...Array(8).keys()].map((i) => thresholds.readInt32LE(i * 4)),
    stages: table(0x00365400, 8), discWait: table(0x00365420, 17), discSound: table(0x00365470, 10), discEnd: table(0x003654a0, 17),
    shouldEnter: boot.readInt32LE(0), ready: boot.readInt32LE(4), exec: boot.readInt32LE(8),
  };
}
const constant = (s, address) => s.k.readFloatLE(address - 0x0036f9b0);

/** The stage handlers: the state at entry to the state the integrator starts from. */
export function stages(s) {
  const out = { ...s, B: { ...s.B }, result: s.scene, sounds: [], branches: [] };
  if (f(s.thresholds[s.stage]) < s.C[2]) out.stage = s.stage + 1;
  const fps = FPS;
  const handler = out.stage < 8 ? s.stages[out.stage] : 0x0021f378;
  const ready = s.ready !== 0;
  if (handler === 0x0021efac) {                                   // stage 1
    if (ready) {
      out.branches.push(s.exec !== 0 ? 'stage 1, hard-disk ready, exec set: go' : fps * 20 < s.frame ? 'stage 1, hard-disk ready, ready flag cleared' : 'stage 1, hard-disk ready, waiting');
      out.B[0x48] = constant(s, 0x0036f9d4);
      out.B[0x18] = s.frame < Math.trunc((fps * 20) / 6) ? constant(s, 0x0036f9d8) : constant(s, 0x0036f9dc);
      if (s.exec !== 0) { out.B[0x18] = constant(s, 0x0036f9e0); out.go = 1; out.stage += 1; }
      else if (fps * 20 < s.frame) out.ready = 0;
    } else {
      out.B[0x08] = constant(s, 0x0036f9e4);
      const index = (s.disc - 0x64) >>> 0;
      const holds = !(index < 17 && s.discWait[index] === 0x0021f0b8);
      if (!holds && 2 * fps < s.frame) { out.go = 1; out.stage += 1; }
      out.branches.push(holds ? `stage 1, disc 0x${(s.disc >>> 0).toString(16)} holds the stage` : `stage 1, disc 0x${(s.disc >>> 0).toString(16)} ${out.go !== s.go ? 'releases it' : 'waits for 2 x fps'}`);
    }
  } else if (handler === 0x0021f0f8) {                            // stage 2
    if (fps * 10 < s.frame) out.go = 1;
    if (out.go !== 0) {
      if (s.pending === 1) {
        out.branches.push(s.shouldEnter === 0 ? 'stage 2 first time, clock forced' : ready && s.exec === 1 ? 'stage 2 first time, hard-disk ready with exec 1' : `stage 2 first time, disc 0x${(s.disc >>> 0).toString(16)} by the table`);
        if (s.shouldEnter === 0) out.sounds.push(queue('0x6140,1', SITES.queueForced, { a0: 0x6140, a1: 1 }));
        else if (ready && s.exec === 1) out.sounds.push(queue('0x6150,f', SITES.queueReady, { a0: 0x6150, a1: 0, a2: 0, a3: 0xf }));
        else {
          out.snapshot = s.disc;
          const index = (s.disc - 0x6a) >>> 0;
          const target = index < 10 ? s.discSound[index] : 0x0021f1f4;
          if (target === 0x0021f1b0) out.sounds.push(queue('0x6140,7', SITES.queueBefore, { a0: 0x6140, a1: 7 }), queue('0x6150,11', SITES.queueAfter, { a0: 0x6150, a1: 0, a2: 0, a3: 0x11 }));
          else if (target === 0x0021f1d8) out.sounds.push(queue('0x6150,f', SITES.queueReady, { a0: 0x6150, a1: 0, a2: 0, a3: 0xf }));
          else out.sounds.push(queue('0x6140,1', SITES.queueDefault, { a0: 0x6140, a1: 1 }));
        }
        out.pending = -1;
      }
      out.branches.push(ready || s.exec !== 0 ? 'stage 2 every frame, hard-disk velocities' : 'stage 2 every frame, plain velocities');
      if (ready || s.exec !== 0) { out.B[0x08] = constant(s, 0x0036f9e8); out.B[0x38] = constant(s, 0x0036f9ec); }
      else { out.B[0x18] = constant(s, 0x0036f9f0); out.B[0x38] = constant(s, 0x0036f9f4); }
      for (const at of [0x10, 0x14, 0x30, 0x34]) out.B[at] = 0;
    }
  } else if (handler === 0x0021f260) out.result = s.scene + 1;   // stage 3
  else if (handler === 0x0021f268) {                              // stage 6
    for (const at of [0x38, 0x20, 0x24, 0x28, 0x10, 0x14, 0x18, 0x00, 0x04, 0x08, 0x30, 0x34]) out.B[at] = 0;
    if (s.mechacon !== 0) out.branches.push('stage 6, MECHACON flag set: leaves');
    if (s.mechacon === 0) {
      out.snapshot = s.disc;
      const index = (s.disc - 0x64) >>> 0;
      const target = index < 17 ? s.discEnd[index] : 0x0021f34c;
      const wait = () => {
        if (s.stamp === 0) { out.sounds.push(remote('remote 0x6150,6', SITES.remote, { a0: 1, a1: 0x6150, a2: 6, a3: 0, t0: 0xf })); out.stamp = s.frame; }
        else if (((s.stamp + 0x80) >>> 0) < s.frame) out.result = 2;
      };
      const disc = `disc 0x${(s.disc >>> 0).toString(16)}`;
      if (target === 0x0021f2dc) { out.branches.push(`stage 6, ${disc}: ends`); out.ended = 1; wait(); }
      else if (target === 0x0021f2f4) { out.branches.push(`stage 6, ${disc}: ends when the CDDA count is positive (${s.cdda > 0 ? 'it is' : 'it is not'})`); if (s.cdda > 0) { out.ended = 1; wait(); } }
      else {
        out.branches.push(`stage 6, ${disc}: ends only once the flag is set (flag ${s.ended})`);
        if (s.ended !== 0 && ((s.stamp + 0x80) >>> 0) < s.frame) out.result = 2;
      }
    }
  } else if (handler === 0x0021f370) {                            // stage 7: OpeningInitAnimation, and the scene ends
    out.stage = 0;
    out.B[0x28] = constant(s, 0x0036f9bc);
    out.B[0x48] = constant(s, 0x0036f9c0);
    for (const at of [0x08, 0x10, 0x14, 0x18, 0x20, 0x24, 0x30, 0x34, 0x38, 0x40, 0x44]) out.B[at] = 0;
    out.go = 0;
    out.result = 2;
  }
  return out;
}

/** The integrator at 0x0021F37C..0x0021F508, in the order of its instructions; k is 1.2 in PAL. */
export function integrate(s, k = 1) {
  const B = { ...s.B };
  const step = (twice, more) => f(f(add(add(twice, twice), more) * 0.5) * k);
  B[0x48] = add(s.B[0x48], step(s.B[0x38], 0));
  B[0x20] = add(s.B[0x20], step(s.B[0x10], s.B[0x00]));
  B[0x24] = add(s.B[0x24], step(s.B[0x14], s.B[0x04]));
  B[0x28] = add(s.B[0x28], step(s.B[0x18], s.B[0x08]));
  B[0x18] = add(s.B[0x18], f(s.B[0x08] * k));
  let phi = add(s.phi, step(B[0x48], s.B[0x38]));
  B[0x40] = add(s.B[0x40], step(s.B[0x30], 0));
  B[0x44] = add(s.B[0x44], step(s.B[0x34], 0));
  const C = [add(s.C[0], step(B[0x20], s.B[0x10])), add(s.C[1], step(B[0x24], s.B[0x14])), add(s.C[2], step(B[0x28], B[0x18]))];
  if (constant(s, 0x0036f9f8) < phi) phi = sub(phi, constant(s, 0x0036f9fc));
  if (phi < constant(s, 0x0036fa00)) phi = add(phi, constant(s, 0x0036fa04));
  return { ...s, B, phi, C };
}

const same = (a, b) => asBits(a) === asBits(b);
const FIELDS = ['stage', 'go', 'pending', 'snapshot', 'ended', 'stamp', 'ready'];
function differences(expected, got, fields) {
  const out = [];
  for (const at of OFFSETS) if (!same(expected.B[at], got.B[at])) out.push(`B+0x${at.toString(16)}: computed ${expected.B[at]}, found ${got.B[at]}`);
  expected.C.forEach((x, i) => { if (!same(x, got.C[i])) out.push(`camera[${i}]: computed ${x}, found ${got.C[i]}`); });
  for (const name of fields) if (name === 'phi' ? !same(expected.phi, got.phi) : expected[name] !== got[name]) out.push(`${name}: computed ${expected[name]}, found ${got[name]}`);
  return out;
}

/** The first frame's set-up between the first two calls: OpeningInitOpeningScene, or OpeningInitIllegalScene with func_0021EE98. */
export function setUp(previous, entry) {
  if (entry.scene === 0) {
    return { ...previous, C: [0, 0, 16], phi: Math.fround(-0.12) };
  }
  const B = { ...previous.B };
  B[0x18] = constant(previous, 0x0036f9c4); B[0x28] = constant(previous, 0x0036f9c8); B[0x48] = constant(previous, 0x0036f9cc);
  for (const at of [0x10, 0x14, 0x20, 0x24, 0x30, 0x34, 0x38, 0x40, 0x44]) B[at] = 0;
  return { ...previous, B, C: [0, 0, 672], phi: 0, stage: 4, go: 0 };
}

/** The fade alphas a frame's fade function hands to the rectangle, given the camera's z after the integrator. */
export function fadeAlphas(scene, z, frame, fadeCountBefore, ended) {
  if (scene === 0) {
    const out = [];
    if (frame < 2) out.push(0x80);
    if (72 < z) out.push(toInt(f(f(sub(z, 72) * 128) * 0.03125)) >>> 0);
    if (320 <= z) out.push(0x80);
    return { any: out };
  }
  // func_002242C8.
  const calls = [];
  let count = fadeCountBefore;
  if (z < 800) {
    const v = f(f(sub(sub(128, sub(672, z)), 128) * 128) * 0.0078125);
    calls.push((0x80 - toInt(v)) >>> 0);
    count = 0;
  } else if (1128 < z) {
    let v = f(sub(32, sub(1160, z)) * 4);
    if (v < 0) v = 0; else if (128 < v) v = 128;
    calls.push(toInt(v) >>> 0);
    count = 0;
  }
  if (ended !== 0) { count = Math.min(count + 1, 0x80); calls.push(count); }
  return { calls, count };
}

export function verify(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const result = { frames: 0, stages: 0, integrations: 0, carried: 0, results: 0, setups: 0, fades: 0, handlers: {}, sounds: {}, branches: {}, soundCalls: 0, soundsProbed: false, restarts: 0, ends: 0, problems: [], timeline: [] };
  const problem = (text) => { if (result.problems.length < 16) result.problems.push(text); };
  const k = PAL ? 1.2000000476837158 : 1;

  // A capture taken before the sound probes existed has no records of them: nothing to compare.
  result.soundsProbed = /(^|;)0x00200c00(;|$)/.test(trace.probeSpec ?? '') && /(^|;)0x00294738(;|$)/.test(trace.probeSpec ?? '');
  const isSite = (ra) => Object.values(SITES).includes(ra);
  let entry = null, middle = null, previousEnd = null, fade = null, fadeCount = null, heard = [];
  for (const probe of trace.probes) {
    // Probes before the trace was armed hold no packets but a whole state: kept, except the fade's.
    if (probe.preroll && probe.pc === FADE) continue;
    if (probe.pc === ENTRY) {
      if (fade && fade.calls && fade.calls.length) problem(`frame ${fade.frame}: ${fade.calls.length} fade call(s) computed and not made: ${fade.calls}`);
      fade = null;
      entry = read(probe);
      middle = null;
      heard = [];
      if (!entry) { problem(`frame ${probe.frame}: a probed range was not readable`); continue; }
      result.frames += 1;
      if (previousEnd && previousEnd.sceneEnded) {
        // The scene returned its end: the module is started again (the hand-off chose module 4), its state is new.
        result.restarts += 1;
        if (entry.frame !== 1 && entry.frame !== 0) problem(`frame ${probe.frame}: restarted with the counter at ${entry.frame}`);
      } else if (previousEnd) {
        const moved = differences(previousEnd, entry, ['phi', ...FIELDS]);
        const counted = entry.frame === previousEnd.frame + 1;
        if (moved.length === 0 && counted) result.carried += 1;
        else if (counted && entry.scene === previousEnd.scene && differences(setUp(previousEnd, entry), entry, ['phi', ...FIELDS]).length === 0) result.setups += 1;
        else problem(`frame ${probe.frame}: between calls: ${moved.join('; ') || `counter ${previousEnd.frame} to ${entry.frame}`}`);
      }
    } else if ((probe.pc === QUEUE || probe.pc === REMOTE) && entry && !middle) {
      if (isSite(probe.gpr[31])) heard.push({ fn: probe.pc, ra: probe.gpr[31], regs: Object.fromEntries(Object.entries(R).map(([name, i]) => [name, probe.gpr[i]])) });
    } else if (probe.pc === INTEGRATOR && entry) {
      middle = read(probe);
      const want = stages(entry);
      const bad = differences(want, middle, FIELDS);
      const name = `stage ${want.stage}`;
      result.handlers[name] = (result.handlers[name] ?? 0) + 1;
      for (const sound of want.sounds) result.sounds[sound.name] = (result.sounds[sound.name] ?? 0) + 1;
      for (const branch of want.branches) result.branches[branch] = (result.branches[branch] ?? 0) + 1;
      if (result.soundsProbed) {
        const sameCall = (a, b) => a.fn === b.fn && a.ra === b.ra && Object.entries(b.regs).every(([name, value]) => a.regs[name] === value);
        const matched = want.sounds.length === heard.length && want.sounds.every((sound, i) => sameCall(heard[i], sound));
        if (matched) result.soundCalls += heard.length;
        else problem(`frame ${probe.frame} (counter ${entry.frame}): sound commands computed [${want.sounds.map((x) => `${x.name} from 0x${x.ra.toString(16)}`)}], sent [${heard.map((x) => `${JSON.stringify(x.regs)} from 0x${x.ra.toString(16)}`)}]`);
      }
      if (bad.length === 0) result.stages += 1; else problem(`frame ${probe.frame} (counter ${entry.frame}, stage ${entry.stage}): stage handlers: ${bad.join('; ')}`);
    } else if (probe.pc === END && middle) {
      const end = read(probe);
      const bad = differences(integrate(middle, k), end, ['phi', ...FIELDS]);
      if (bad.length === 0) result.integrations += 1; else problem(`frame ${probe.frame} (counter ${middle.frame}): integrator: ${bad.join('; ')}`);
      const want = stages(entry).result;
      if (probe.gpr[2] === want) result.results += 1; else problem(`frame ${probe.frame}: result ${probe.gpr[2]}, computed ${want}`);
      result.timeline.push({ frame: probe.frame, counter: end.frame, scene: end.scene, stage: end.stage, z: end.C[2], go: end.go, disc: end.disc, ready: end.ready, exec: end.exec, ended: end.ended, result: probe.gpr[2] });
      if (fadeCount === null) fadeCount = end.fadeCount;
      // The illegal-disc scene draws nothing on its first call (OpeningDrawIllegalScene sets D_003700E4 and returns).
      const sceneEnded = probe.gpr[2] !== end.scene;
      if (sceneEnded) result.ends += 1;
      end.sceneEnded = sceneEnded;
      // A frame before the trace was armed has its fade probe skipped; a frame that ends the scene is not drawn.
      fade = (end.scene === 1 && end.drawing === 0) || probe.preroll || sceneEnded ? null : { frame: probe.frame, ...fadeAlphas(end.scene, end.C[2], end.frame, end.fadeCount, end.ended), scene: end.scene };
      previousEnd = end;
      entry = null; middle = null;
    } else if (probe.pc === FADE && fade) {
      const alpha = probe.gpr[5];
      const at = result.timeline[result.timeline.length - 1];
      if (at) at.fade = [...(at.fade ?? []), alpha];
      if (fade.scene === 0) { if (fade.any.includes(alpha)) result.fades += 1; else problem(`frame ${probe.frame}: fade alpha ${alpha}, computed ${fade.any.join(' or ')}`); continue; }
      const want = fade.calls.shift();
      if (alpha === want) result.fades += 1; else problem(`frame ${probe.frame}: fade alpha ${alpha}, computed ${want ?? 'no call'}`);
    }
  }
  return result;
}

if (process.argv[1] && process.argv[1].endsWith('verify_opening3_stages.mjs')) {
  const result = verify(process.argv[2]);
  console.log(`frames probed: ${result.frames}   video: ${PAL ? 'PAL' : 'NTSC'}`);
  console.log(`  stage handlers equal: ${result.stages}   integrator equal: ${result.integrations}   result equal: ${result.results}   carried unchanged: ${result.carried}   scene set-ups: ${result.setups}   fade alphas equal: ${result.fades}`);
  console.log(`  handlers run: ${Object.entries(result.handlers).map(([k, v]) => `${k} x${v}`).join(', ')}`);
  console.log(`  sound commands computed: ${Object.entries(result.sounds).map(([k, v]) => `${k} x${v}`).join(', ') || 'none'}   sent and equal (command, arguments, call site): ${result.soundsProbed ? result.soundCalls : 'not probed in this capture'}`);
  console.log(`  scene ends (result other than the scene number): ${result.ends}   module restarts after one: ${result.restarts}`);
  console.log(`  branches taken: ${Object.entries(result.branches).map(([k, v]) => `${k} x${v}`).join('; ')}`);
  if (process.argv[3] === 't') {
    let last = '';
    for (const row of result.timeline) {
      const line = `scene ${row.scene} stage ${row.stage} go ${row.go} disc 0x${(row.disc >>> 0).toString(16)} ready ${row.ready} exec ${row.exec} ended ${row.ended} result ${row.result}`;
      if (line !== last || row.counter % 25 === 0) console.log(`  frame ${row.frame} counter ${row.counter} ${line} z ${row.z.toFixed(3)} fade ${row.fade ?? '-'}`);
      last = line;
    }
  }
  for (const text of result.problems) console.log(`  ! ${text}`);
  const whole = result.frames > 0 && result.problems.length === 0;
  console.log(`verdict: ${whole ? `FOUND ${result.integrations} frames of the opening's stage machine, every value equal` : 'PARTIAL see the lines marked !'}`);
  process.exit(whole ? 0 : 3);
}
