// The opening module's stage machine on ROM 2.30 (update function 0x0021A510), on a raw ROM trace:
// verify_opening_stages.mjs with the ROM's own handlers, read in its code. The ROM numbers the
// stages one higher (stage 0 only starts a scene: 1 for the intro, 5 for the illegal-disc scene,
// with no threshold test that frame), keeps one more disc state in each switch (0x75), and differs
// in three places:
//   - the hard-disk hold of stage 2 (0x0021A60C) has no time-out clearing the ready flag; it leaves
//     when the exec word is 1 and the word at 0x0027C5D4 has reached 0x7C (0x67 in PAL), when the
//     exec word is negative, or after 20 s;
//   - stage 3 (0x0021A780) has a countdown: for disc states 0x6C..0x6E it sets 7 at 0x002C8694 and
//     (int)(k x 58) at 0x002C8698 (k = 1, or 1.2 in PAL), and on every later frame counts the
//     second down to 0, then queues sound 0x5015 with the first and sets the first to -1;
//     with the disc hold and exec 1 it asks 0x00208398 (the word 0x00300440 is 6) for the sound;
//   - stage 8 restarts (0x0021A458) and ends the scene.
// The variables are the HDD OSD ones but for 0x002C8694/0x002C8698 inserted after +0x90.
//
//   0x0021A510  entry      0x0021AA78  after the handlers      0x0021ACC4  end: v0 = result
//   0x00218E58  the fade rectangle: a1 = alpha (HDD OSD's 0x0021D848, the same code)
//
// [CLOCK_VIDEO=pal] node verify_opening_stages_rom.mjs <raw ROM trace.jsonl> [t]
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { f, asBits, toInt } from '../model/opening-lib.mjs';
import { PAL, FPS } from './builds.mjs';
import { integrate, fadeAlphas } from './verify_opening_stages.mjs';

const STATE = ['0x00347590:0x54', '0x00288e30:0x1c8', '0x002c8600:0x104', '0x001f000c:0xcf0', '0x002c7f30:0x58', '0x002c4640:0xe8', '0x0027b394:0x1244', '0x00300440:0x4'];
export const PROBES = [
  { pc: '0x0021a510', ranges: STATE },
  { pc: '0x0021aa78', ranges: STATE },
  { pc: '0x0021acc4', ranges: STATE },
];
const [ENTRY, INTEGRATOR, END] = PROBES.map((probe) => parseInt(probe.pc, 16));
const FADE = 0x00218e58;
const OFFSETS = [0x00, 0x04, 0x08, 0x10, 0x14, 0x18, 0x20, 0x24, 0x28, 0x30, 0x34, 0x38, 0x40, 0x44, 0x48];

function read(probe) {
  const [block, cameraArea, vars, low, constants, tables, boot, sound] = probe.mem.map((range) => range.bytes);
  if ([block, cameraArea, vars, low, constants, tables, boot, sound].some((x) => !x)) return null;
  const B = {};
  for (const at of OFFSETS) B[at] = block.readFloatLE(at);
  const table = (base, count) => [...Array(count).keys()].map((i) => tables.readUInt32LE(base - 0x002c4640 + i * 4));
  return {
    B, stage: block.readInt32LE(0x50),
    C: [cameraArea.readFloatLE(0), cameraArea.readFloatLE(4), cameraArea.readFloatLE(8)],
    thresholds: [...Array(8).keys()].map((i) => cameraArea.readInt32LE(0x1a8 + i * 4)),
    frame: vars.readUInt32LE(0), scene: vars.readInt32LE(4),
    pending: vars.readInt32LE(0x90), countA: vars.readInt32LE(0x94), countB: vars.readInt32LE(0x98),
    go: vars.readInt32LE(0x9c), phi: vars.readFloatLE(0xa0), snapshot: vars.readInt32LE(0xa8),
    ended: vars.readInt32LE(0xf4), stamp: vars.readUInt32LE(0x100), fadeCount: vars.readInt32LE(0xe8), drawing: vars.readInt32LE(0xe4),
    mechacon: low.readInt32LE(0), disc: low.readInt32LE(4), cdda: low.readInt32LE(0xcec),
    // The ROM's constants 0x002C7F30.. are laid out as HDD OSD's 0x0036F9B0.., so the shared integrator reads them.
    k: constants,
    stages: table(0x002c4640, 8), discWait: table(0x002c4660, 18), discSound: table(0x002c46b0, 12), discEnd: table(0x002c46e0, 18),
    shouldEnter: boot.readInt32LE(0), ready: boot.readInt32LE(4), exec: boot.readInt32LE(8), hddCount: boot.readUInt32LE(0x1240),
    soundWord: sound.readInt32LE(0),
  };
}
const constant = (s, hdd) => s.k.readFloatLE(hdd - 0x0036f9b0);

/** The ROM's stage handlers (0x0021A550..0x0021AA70). */
export function stages(s) {
  const out = { ...s, B: { ...s.B }, result: s.scene, sounds: [] };
  const fps = FPS;
  const ready = s.ready !== 0;
  if (s.stage === 0) {
    if (s.scene === 0) { out.stage = 1; out.countA = -1; out.pending = 1; out.countB = 0; }
    else if (s.scene === 1) out.stage = 5;
    return out;
  }
  if (f(s.thresholds[s.stage - 1]) < s.C[2]) out.stage = s.stage + 1;
  const index = (out.stage - 1) >>> 0;
  const handler = index < 8 ? s.stages[index] : 0x0021aa74;
  const advance = () => { out.B[0x18] = constant(s, 0x0036f9e0); out.go = 1; out.stage += 1; };
  if (handler === 0x0021a60c) {                                   // stage 2: the wait
    if (ready) {
      out.B[0x48] = constant(s, 0x0036f9d4);
      out.B[0x18] = s.frame < Math.trunc((fps * 20) / 6) ? constant(s, 0x0036f9d8) : constant(s, 0x0036f9dc);
      if (s.exec === 1 && !(s.hddCount < (PAL ? 0x67 : 0x7c))) advance();
      else if (s.exec < 0) advance();
      else if (fps * 20 < s.frame) advance();
    } else {
      out.B[0x08] = constant(s, 0x0036f9e4);
      const i = (s.disc - 0x64) >>> 0;
      if (i < 18 && s.discWait[i] === 0x0021a740 && 2 * fps < s.frame) { out.go = 1; out.stage += 1; }
    }
  } else if (handler === 0x0021a780) {                            // stage 3: the decision and the countdown
    if (fps * 10 < s.frame) out.go = 1;
    if (out.go !== 0) {
      if (s.pending === 1) {
        if (s.shouldEnter === 0) out.sounds.push('0x5014,1');
        else if (ready && s.exec === 1) out.sounds.push(s.soundWord === 6 ? '0x5015,11' : '0x5015,f');
        else {
          out.snapshot = s.disc;
          const i = (s.disc - 0x6a) >>> 0;
          const target = i < 12 ? s.discSound[i] : 0x0021a8c0;
          if (target === 0x0021a860) { out.countA = 7; out.countB = toInt(f((PAL ? constant(s, 0x0036f9d0) : 1) * 58)); out.sounds.push('0x5014,7 0x5015,10'); }
          else if (target === 0x0021a8a4) out.sounds.push('0x5015,f');
          else out.sounds.push('0x5014,1');
        }
        out.pending = -1;
      } else if (s.countA >= 0) {
        if (s.countB !== 0) out.countB = s.countB - 1;
        else { out.sounds.push(`0x5015,${s.countA},11`); out.countA = -1; }
      }
      if (ready || s.exec !== 0) { out.B[0x08] = constant(s, 0x0036f9e8); out.B[0x38] = constant(s, 0x0036f9ec); }
      else { out.B[0x18] = constant(s, 0x0036f9f0); out.B[0x38] = constant(s, 0x0036f9f4); }
      for (const at of [0x10, 0x14, 0x30, 0x34]) out.B[at] = 0;
    }
  } else if (handler === 0x0021a960) out.result = s.scene + 1;   // stage 4
  else if (handler === 0x0021a968) {                              // stage 7: the end wait
    for (const at of [0x38, 0x20, 0x24, 0x28, 0x10, 0x14, 0x18, 0x00, 0x04, 0x08, 0x30, 0x34]) out.B[at] = 0;
    if (s.mechacon === 0) {
      out.snapshot = s.disc;
      const i = (s.disc - 0x64) >>> 0;
      const target = i < 18 ? s.discEnd[i] : 0x0021aa48;
      const wait = () => {
        if (s.stamp === 0) { out.sounds.push('0x5015,6'); out.stamp = s.frame; }
        else if (((s.stamp + 0x80) >>> 0) < s.frame) out.result = 2;
      };
      if (target === 0x0021a9dc) { out.ended = 1; wait(); }
      else if (target === 0x0021a9f4) { if (s.cdda > 0) { out.ended = 1; wait(); } }
      else if (s.ended !== 0 && ((s.stamp + 0x80) >>> 0) < s.frame) out.result = 2;
    }
  } else if (handler === 0x0021aa6c) {                            // stage 8: restart (0x0021A458), the scene ends
    out.stage = 0;
    out.B[0x28] = constant(s, 0x0036f9bc);
    out.B[0x48] = constant(s, 0x0036f9c0);
    for (const at of [0x08, 0x10, 0x14, 0x18, 0x20, 0x24, 0x30, 0x34, 0x38, 0x40, 0x44]) out.B[at] = 0;
    out.go = 0;
    out.result = 2;
  }
  return out;
}

const same = (a, b) => asBits(a) === asBits(b);
const FIELDS = ['stage', 'go', 'pending', 'snapshot', 'ended', 'stamp', 'countA', 'countB'];
function differences(expected, got, fields) {
  const out = [];
  for (const at of OFFSETS) if (!same(expected.B[at], got.B[at])) out.push(`B+0x${at.toString(16)}: computed ${expected.B[at]}, found ${got.B[at]}`);
  expected.C.forEach((x, i) => { if (!same(x, got.C[i])) out.push(`camera[${i}]: computed ${x}, found ${got.C[i]}`); });
  for (const name of fields) if (name === 'phi' ? !same(expected.phi, got.phi) : expected[name] !== got[name]) out.push(`${name}: computed ${expected[name]}, found ${got[name]}`);
  return out;
}
/** The set-up of the scene after its first frame: the intro's camera (0, 0, 16) and roll -0.12; the illegal scene's 0x0021A4A8. */
function setUp(previous, entry) {
  if (entry.scene === 0) return { ...previous, C: [0, 0, 16], phi: Math.fround(-0.12) };
  const B = { ...previous.B };
  B[0x18] = constant(previous, 0x0036f9c4); B[0x28] = constant(previous, 0x0036f9c8); B[0x48] = constant(previous, 0x0036f9cc);
  for (const at of [0x10, 0x14, 0x20, 0x24, 0x30, 0x34, 0x38, 0x40, 0x44]) B[at] = 0;
  return { ...previous, B, C: [0, 0, 672], phi: 0, stage: 5, go: 0 };
}

export function verify(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const result = { frames: 0, stages: 0, integrations: 0, carried: 0, results: 0, setups: 0, fades: 0, handlers: {}, sounds: {}, problems: [], timeline: [] };
  const problem = (text) => { if (result.problems.length < 16) result.problems.push(text); };
  const k = PAL ? 1.2000000476837158 : 1;
  let entry = null, middle = null, previousEnd = null, fade = null;
  for (const probe of trace.probes) {
    // Probes before the trace was armed hold no packets but a whole state: kept, except the fade's.
    if (probe.preroll && probe.pc === FADE) continue;
    if (probe.pc === ENTRY) {
      if (fade && fade.calls && fade.calls.length) problem(`frame ${fade.frame}: fade call(s) computed and not made: ${fade.calls}`);
      fade = null;
      entry = read(probe); middle = null;
      if (!entry) { problem(`frame ${probe.frame}: a probed range was not readable`); continue; }
      result.frames += 1;
      if (previousEnd) {
        const moved = differences(previousEnd, entry, ['phi', ...FIELDS]);
        const counted = entry.frame === previousEnd.frame + 1;
        if (moved.length === 0 && counted) result.carried += 1;
        else if (counted && differences(setUp(previousEnd, entry), entry, ['phi', ...FIELDS]).length === 0) result.setups += 1;
        else problem(`frame ${probe.frame}: between calls: ${moved.join('; ') || `counter ${previousEnd.frame} to ${entry.frame}`}`);
      }
    } else if (probe.pc === INTEGRATOR && entry) {
      middle = read(probe);
      const want = stages(entry);
      const name = `stage ${want.stage}`;
      result.handlers[name] = (result.handlers[name] ?? 0) + 1;
      for (const sound of want.sounds) result.sounds[sound] = (result.sounds[sound] ?? 0) + 1;
      const bad = differences(want, middle, FIELDS);
      if (bad.length === 0) result.stages += 1; else problem(`frame ${probe.frame} (counter ${entry.frame}, stage ${entry.stage}): stage handlers: ${bad.join('; ')}`);
    } else if (probe.pc === END && middle) {
      const end = read(probe);
      const bad = differences(integrate(middle, k), end, ['phi', ...FIELDS]);
      if (bad.length === 0) result.integrations += 1; else problem(`frame ${probe.frame} (counter ${middle.frame}): integrator: ${bad.join('; ')}`);
      const want = stages(entry).result;
      if (probe.gpr[2] === want) result.results += 1; else problem(`frame ${probe.frame}: result ${probe.gpr[2]}, computed ${want}`);
      result.timeline.push({ frame: probe.frame, counter: end.frame, scene: end.scene, stage: end.stage, z: end.C[2], go: end.go, disc: end.disc, ready: end.ready, exec: end.exec, ended: end.ended, countA: end.countA, countB: end.countB, result: probe.gpr[2] });
      // The illegal-disc scene draws nothing on its first call (OpeningDrawIllegalScene sets D_003700E4 and returns).
      fade = end.scene === 1 && end.drawing === 0 ? null : { frame: probe.frame, ...fadeAlphas(end.scene, end.C[2], end.frame, end.fadeCount, end.ended), scene: end.scene };
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

if (process.argv[1] && process.argv[1].endsWith('verify_opening_stages_rom.mjs')) {
  const result = verify(process.argv[2]);
  console.log(`frames probed: ${result.frames}   video: ${PAL ? 'PAL' : 'NTSC'}`);
  console.log(`  stage handlers equal: ${result.stages}   integrator equal: ${result.integrations}   result equal: ${result.results}   carried unchanged: ${result.carried}   scene set-ups: ${result.setups}   fade alphas equal: ${result.fades}`);
  console.log(`  handlers run: ${Object.entries(result.handlers).map(([k, v]) => `${k} x${v}`).join(', ')}`);
  console.log(`  sound commands computed: ${Object.entries(result.sounds).map(([k, v]) => `${k} x${v}`).join(', ') || 'none'}`);
  if (process.argv[3] === 't') {
    let last = '';
    for (const row of result.timeline) {
      const line = `scene ${row.scene} stage ${row.stage} go ${row.go} disc 0x${(row.disc >>> 0).toString(16)} ready ${row.ready} exec ${row.exec} countdown ${row.countA}/${row.countB} ended ${row.ended} result ${row.result}`;
      if (line !== last || row.counter % 25 === 0) console.log(`  frame ${row.frame} counter ${row.counter} ${line} z ${row.z.toFixed(3)} fade ${row.fade ?? '-'}`);
      last = line;
    }
  }
  for (const text of result.problems) console.log(`  ! ${text}`);
  const whole = result.frames > 0 && result.problems.length === 0;
  console.log(`verdict: ${whole ? `FOUND ${result.integrations} frames of the opening's stage machine on ROM 2.30, every value equal` : 'PARTIAL see the lines marked !'}`);
  process.exit(whole ? 0 : 3);
}
