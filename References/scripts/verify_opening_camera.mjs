// The opening intro of HDD OSD 1.10U: its stage machine and camera integrator
// (OpeningProcessInner, 0x0021EF00), recomputed frame by frame from the state a probe recorded at
// the function's entry, and compared bit for bit with the state at its end; then the fade to
// black (func_00221B00), the dive blur level (func_00221A50) and the logo's alpha (func_0021DB50).
//
//   0x0021EF00  entry: the state before the stage handlers
//   0x0021F37C  after the stage handlers, before the integrator
//   0x0021F5BC  the call that multiplies view-screen by camera: a1 = the matrix block
//   0x0021F5C8  the end: v0 = the function's result
//   0x0021D848  the flat rectangle of the fade: a1 = alpha
//   0x0021D3D0  the blur: a0 = level
//   0x0021DB50  the logo's step, and 0x0021D990 its draw: a2 = alpha
//
// node verify_opening_camera.mjs <trace.jsonl> [t: print the timeline]
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { f } from '../model/clock_frame.mjs';
import { PAL, FPS } from './builds.mjs';

// At most eight ranges to a probe: the module's gp-relative variables 0x00370000..0x003700A3 are one range.
const STATE = ['0x003db800:0x54', '0x002b0c60:0x30', '0x00370000:0xa4', '0x001f000c:0x4', '0x0036f9d0:0x38', '0x002b0e08:0x20', '0x00365420:0x44', '0x002ad22c:0x4'];
export const PROBES = [
  { pc: '0x0021ef00', ranges: STATE },
  { pc: '0x0021f37c', ranges: STATE },
  { pc: '0x0021f5bc', ranges: ['a1+0x100:0x80'] },
  { pc: '0x0021f5c8', ranges: STATE },
  { pc: '0x0021d848', ranges: ['0x002b0c60:0x10', '0x00370000:0x4'] },
  { pc: '0x0021d3d0', ranges: ['0x002b0c60:0x10'] },
  { pc: '0x0021d990', ranges: ['0x002b0c60:0x10', '0x00370a64:0x8', '0x00370088:0x4'] },
  { pc: '0x0021db50', ranges: ['0x002b0c60:0x10', '0x00370a64:0x8', '0x00370088:0x4'] },
];
const [ENTRY, INTEGRATOR, MATRICES, END, FADE, BLUR, LOGO, LOGO_STEP] = PROBES.map((probe) => parseInt(probe.pc, 16));

const bits = new DataView(new ArrayBuffer(4));
const asBits = (x) => { bits.setFloat32(0, x); return bits.getUint32(0); };
const toInt = (x) => (x >= 2147483647 ? 2147483647 : x <= -2147483648 ? -2147483648 : Math.trunc(x));

/** The probed state as plain values. B is the animation block at 0x003DB800. */
function read(probe) {
  const [block, camera, vars, disc, constants, thresholds, table, clock] = probe.mem.map((range) => range.bytes);
  if (!block || !camera || !vars || !disc || !constants || !thresholds || !table) return null;
  const B = {};
  for (const at of [0x00, 0x04, 0x08, 0x10, 0x14, 0x18, 0x20, 0x24, 0x28, 0x30, 0x34, 0x38, 0x40, 0x44, 0x48]) B[at] = block.readFloatLE(at);
  return {
    B, stage: block.readInt32LE(0x50),
    C: [camera.readFloatLE(0), camera.readFloatLE(4), camera.readFloatLE(8)],
    up: [camera.readFloatLE(0x20), camera.readFloatLE(0x24)],
    pending: vars.readInt32LE(0x90), go: vars.readInt32LE(0x94), phi: vars.readFloatLE(0x98),
    frame: vars.readUInt32LE(0), scene: vars.readInt32LE(4),
    disc: disc.readInt32LE(0), snapshot: vars.readInt32LE(0xa0),
    // gp-relative floats from 0x0036F9D0 on: PAL factor, then the stage constants, then pi and 2 pi
    k: constants, thresholds: [...Array(8).keys()].map((i) => thresholds.readInt32LE(i * 4)),
    waits: [...Array(17).keys()].map((i) => table.readUInt32LE(i * 4) === 0x0021f0b8),
    forcedClock: clock ? clock.readInt32LE(0) === 0 : false,
  };
}
const constant = (state, address) => state.k.readFloatLE(address - 0x0036f9d0);

/** The stage handlers (NTSC, not booting from the hard disk): entry state to integrator state. */
function stages(s) {
  const out = { ...s, B: { ...s.B }, result: s.scene };
  if (f(s.thresholds[s.stage]) < s.C[2]) out.stage = s.stage + 1;
  const fps = FPS;
  if (out.stage === 1) {
    out.B[0x08] = constant(s, 0x0036f9e4);
    const index = s.disc - 0x64;
    if (index >= 0 && index < 17 && s.waits[index] && s.frame > 2 * fps) { out.go = 1; out.stage += 1; }
  } else if (out.stage === 2) {
    if (s.frame > 10 * fps) out.go = 1;
    if (out.go !== 0) {
      if (s.pending === 1) {
        // The clock is forced on a first boot; otherwise the disc state is kept for the hand-off.
        if (!s.forcedClock) out.snapshot = s.disc;
        out.pending = -1;
      }
      out.B[0x18] = constant(s, 0x0036f9f0);
      out.B[0x38] = constant(s, 0x0036f9f4);
      out.B[0x10] = 0; out.B[0x14] = 0; out.B[0x30] = 0; out.B[0x34] = 0;
    }
  } else if (out.stage === 3) out.result = s.scene + 1;
  return out;
}

/** The integrator at 0x0021F37C..0x0021F508, in the order of its instructions; k is 1 in NTSC. */
function integrate(s, k = 1) {
  const B = { ...s.B };
  const half = 0.5;
  const step = (twice, add) => f(f(f(f(twice + twice) + add) * half) * k);
  B[0x48] = f(s.B[0x48] + step(s.B[0x38], 0));
  B[0x20] = f(s.B[0x20] + step(s.B[0x10], s.B[0x00]));
  B[0x24] = f(s.B[0x24] + step(s.B[0x14], s.B[0x04]));
  B[0x28] = f(s.B[0x28] + step(s.B[0x18], s.B[0x08]));
  B[0x18] = f(s.B[0x18] + f(s.B[0x08] * k));
  let phi = f(s.phi + step(B[0x48], s.B[0x38]));
  B[0x40] = f(s.B[0x40] + step(s.B[0x30], 0));
  B[0x44] = f(s.B[0x44] + step(s.B[0x34], 0));
  const C = [f(s.C[0] + step(B[0x20], s.B[0x10])), f(s.C[1] + step(B[0x24], s.B[0x14])), f(s.C[2] + step(B[0x28], B[0x18]))];
  if (constant(s, 0x0036f9f8) < phi) phi = f(phi - constant(s, 0x0036f9fc));
  if (phi < constant(s, 0x0036fa00)) phi = f(phi + constant(s, 0x0036fa04));
  return { ...s, B, phi, C };
}

const same = (a, b) => asBits(a) === asBits(b);
function differences(expected, got, fields) {
  const out = [];
  for (const at of Object.keys(expected.B)) if (!same(expected.B[at], got.B[at])) out.push(`B+0x${Number(at).toString(16)}: computed ${expected.B[at]}, found ${got.B[at]}`);
  expected.C.forEach((x, i) => { if (!same(x, got.C[i])) out.push(`camera[${i}]: computed ${x}, found ${got.C[i]}`); });
  for (const name of fields) if (name === 'phi' ? !same(expected.phi, got.phi) : expected[name] !== got[name]) out.push(`${name}: computed ${expected[name]}, found ${got[name]}`);
  return out;
}

export function verify(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const result = { frames: 0, stages: 0, integrations: 0, carried: 0, results: 0, up: { count: 0, worst: 0 }, fades: 0, blurs: 0, logos: 0, logoSteps: 0, problems: [], timeline: [] };
  const problem = (text) => { if (result.problems.length < 16) result.problems.push(text); };

  let entry = null, middle = null, previousEnd = null, lastState = null, logo = null;
  for (const probe of trace.probes) {
    if (probe.pc === ENTRY) {
      entry = read(probe);
      middle = null;
      if (!entry) { problem(`frame ${probe.frame}: a probed range was not readable`); continue; }
      result.frames += 1;
      if (previousEnd) {
        // Between two calls only the frame counter moves.
        const moved = differences(previousEnd, entry, ['phi', 'stage', 'go', 'pending']);
        // The scene is set up after the first call (OpeningInitOpeningScene, 0x00221BB8): camera (0, 0, 16), roll -0.12.
        const init = result.frames === 2 && same(entry.C[0], 0) && same(entry.C[1], 0) && same(entry.C[2], 16) && same(entry.phi, Math.fround(-0.12))
          && differences({ ...previousEnd, C: entry.C, phi: entry.phi }, entry, ['stage', 'go', 'pending']).length === 0;
        if (init) result.init = true;
        else if (moved.length === 0 && entry.frame === previousEnd.frame + 1) result.carried += 1;
        if (!init && !(moved.length === 0 && entry.frame === previousEnd.frame + 1)) problem(`frame ${probe.frame}: between calls: ${moved.join('; ') || `counter ${previousEnd.frame} to ${entry.frame}`}`);
      }
    } else if (probe.pc === INTEGRATOR && entry) {
      middle = read(probe);
      const bad = differences(stages(entry), middle, ['stage', 'go', 'pending', 'snapshot']);
      if (bad.length === 0) result.stages += 1; else problem(`frame ${probe.frame} (counter ${entry.frame}, stage ${entry.stage}): stage handlers: ${bad.join('; ')}`);
    } else if (probe.pc === END && middle) {
      const end = read(probe);
      const bad = differences(PAL ? integrate(middle, constant(middle, 0x0036f9d0)) : integrate(middle), end, ['phi', 'stage']);
      if (bad.length === 0) result.integrations += 1; else problem(`frame ${probe.frame} (counter ${middle.frame}): integrator: ${bad.join('; ')}`);
      if (probe.gpr[2] === stages(entry).result) result.results += 1; else problem(`frame ${probe.frame}: result ${probe.gpr[2]}, computed ${stages(entry).result}`);
      // The roll: sinf and cosf are the C library's; compared with the nearest singles of the true values.
      const expected = [Math.fround(Math.sin(end.phi)), Math.fround(Math.cos(end.phi))];
      end.up.forEach((x, i) => { result.up.count += 1; result.up.worst = Math.max(result.up.worst, Math.abs(asBits(x) - asBits(expected[i]))); });
      result.timeline.push({ frame: probe.frame, counter: end.frame, stage: end.stage, z: end.C[2], phi: end.phi, go: end.go, vz: end.B[0x18], pz: end.B[0x28], disc: end.disc });
      previousEnd = end;
      lastState = end;
      entry = null; middle = null;
    } else if (probe.pc === FADE) {
      const [camera, counter] = probe.mem.map((range) => range.bytes);
      const z = camera.readFloatLE(8), frame = counter.readUInt32LE(0);
      // 0x80 in the first two frames; (z - 72) x 128 x 0.03125 past z 72; 0x80 from z 320.
      const expected = [];
      if (frame < 2) expected.push(0x80);
      if (72 < z) expected.push(toInt(f(f(f(z - 72) * 128) * 0.03125)) >>> 0);
      if (320 <= z) expected.push(0x80);
      if (expected.includes(probe.gpr[5])) result.fades += 1; else problem(`frame ${probe.frame}: fade alpha ${probe.gpr[5]}, computed ${expected.join(' or ')} (z ${z})`);
      const at = result.timeline[result.timeline.length - 1];
      if (at) at.fade = probe.gpr[5];
    } else if (probe.pc === BLUR) {
      const z = probe.mem[0].bytes.readFloatLE(8);
      let level = 0;
      if (56 < z) { level = toInt(f(f(z - 56) / 12)); if (level >= 4) level = 3; if (level < 0) level = 0; }
      if (level === probe.gpr[4] && level !== 0) result.blurs += 1; else problem(`frame ${probe.frame}: blur level ${probe.gpr[4]}, computed ${level} (z ${z})`);
      const at = result.timeline[result.timeline.length - 1];
      if (at) at.blur = probe.gpr[4];
    } else if (probe.pc === LOGO_STEP) {
      // func_0021DB50: starts once z passes 18; the value walks by its step, which turns at 0xF0
      // and ends the logo at 0; the alpha drawn is the value, at most 0x70.
      if (logo) problem(`frame ${logo.frame}: a logo draw was computed and none came`);
      logo = null;
      const [camera, values, stepBytes] = probe.mem.map((range) => range.bytes);
      const state = values.readInt32LE(0), value = values.readInt32LE(4), step = stepBytes.readInt32LE(0);
      const running = state === 1 || (state === 0 && 18 < camera.readFloatLE(8));
      result.logoSteps += 1;
      if (running) logo = { frame: probe.frame, value: value + step, alpha: Math.min(0x70, value + step) };
    } else if (probe.pc === LOGO) {
      const value = probe.mem[1].bytes.readInt32LE(4);
      if (logo && probe.gpr[6] === logo.alpha && value === logo.value) result.logos += 1;
      else problem(`frame ${probe.frame}: logo alpha ${probe.gpr[6]} from ${value}, computed ${logo ? `${logo.alpha} from ${logo.value}` : 'no draw'}`);
      const at = result.timeline[result.timeline.length - 1];
      if (at) at.logo = probe.gpr[6];
      logo = null;
    }
  }
  result.last = lastState;
  return result;
}

if (process.argv[1] && process.argv[1].endsWith('verify_opening_camera.mjs')) {
  const result = verify(process.argv[2]);
  console.log(`frames probed: ${result.frames}`);
  console.log(`  stage handlers equal: ${result.stages}   integrator equal: ${result.integrations}   result equal: ${result.results}   state carried unchanged between calls: ${result.carried}`);
  console.log(`  scene set up between the first two calls (camera z 16, roll -0.12): ${result.init ? 'seen' : 'not in this capture'}`);
  console.log(`  up vector against the nearest singles of sin and cos: ${result.up.count} values, farthest ${result.up.worst} steps`);
  console.log(`  fade rectangles: ${result.fades}   blur calls: ${result.blurs}   logo draws: ${result.logos}`);
  if (process.argv[3] === 't') {
    let last = '';
    for (const row of result.timeline) {
      const line = `stage ${row.stage} go ${row.go} disc 0x${row.disc.toString(16)} blur ${row.blur ?? 0} `;
      const show = line !== last || row.counter % 20 === 0 || row.fade !== undefined;
      if (show) console.log(`  frame ${row.frame} counter ${String(row.counter).padStart(3)} ${line} z ${row.z.toFixed(4)} phi ${row.phi.toFixed(5)} vz ${row.vz.toFixed(6)} pz ${row.pz.toFixed(5)} fade ${row.fade ?? '-'} logo ${row.logo ?? '-'}`);
      last = line;
    }
  }
  for (const text of result.problems) console.log(`  ! ${text}`);
  const whole = result.frames > 1 && result.problems.length === 0;
  console.log(`verdict: ${whole ? `FOUND ${result.integrations} frames of the opening's camera, every value equal` : 'PARTIAL see the lines marked !'}`);
  process.exit(whole ? 0 : 3);
}
