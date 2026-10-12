// HDD OSD's first-run path (the clock module's OOBE), frame by frame. Read in func_0022D760 (set-up),
// func_0022D828 (the stage machine, once a frame from the pages function) and oobe_handler (draw).
//
// Ramps are {length, value, changed, state} (0 hidden, 1 rising, 2 shown, 3 falling):
//   gate D_002B46D0 (length 1), text E D_002B46E0 (length fps/2), logo F D_002B46F0 (length fps).
// Stage D_00370264; overlay alpha D_00370238 (a black full-screen rectangle drawn by oobe_handler
// while it is not 0); scale target D_00370294 (0.8 at set-up, D_0036FBC8).
//   stages 0, 1 (logos): F hidden -> show F, overlay 0x80, set-mode(4). Else step F; once shown F's
//     value counts down one a frame (hold), and at 0 is set back to the length and F hides; once F
//     is hidden again the stage advances.
//   stages 2, 4 (text pages): overlay = E.value * 0x80 / E.length (before the step); E hidden ->
//     show E. Else step E; shown and cross (pad bit 0x20) -> hide E; hidden after the step ->
//     stage + 1, and from stage 2 set-mode(2).
//   stage 3 (the settings page D_002B4A18): overlay 0; the page's own code moves the stage.
//   stage 5: overlay 0x80; E hidden -> scale and its target 1.0, gate hides, set-mode(2) unless an
//     exit is pending, the first run is switched off.
// ROM 2.30: the image function is 0x0022A600 (same arguments), called from the draw function at
// 0x00229C14 (stage 0) and 0x00229C94 (stage 1) with resources 0x30 / 0x2E (NTSC) or 0x31 / 0x2F (PAL,
// chosen by 0x002058B8 = video mode 2); the same geometry except stage 1 NTSC height 0x69. Stage
// variable gp-0x7674 = 0x002C887C, overlay gp-0x76B0 = 0x002C8840, pad gp-0x75A8 = 0x002C8948 (gp 0x2CFEF0).
// oobe_load_image(resource, x, y, w, h, alpha) in stages 0 and 1, NTSC / PAL:
//   stage 0: 0x29, 0xFB, 0x5A, 0x87, 0x61 / 0x2A, 0xFB, 0x66, 0x89, 0x75
//   stage 1: 0x27, 0x9A, 0x5E, 0x170, 0x7D / 0x28, 0x9A, 0x69, 0x170, 0x7D
//   alpha = 0x80 while F is shown, else F.value * 0x80 / F.length.
// The machine runs only while the gate is shown and, on HDD OSD, no configuration write is pending
// (is_config_dirty: 0x00370304..0x0037030C); ROM 2.30 has the same machine at 0x00229778 (stage
// table 0x002C49E0, the same six entries) with ramps at 0x002953F0, and runs it only while the
// word at 0x001F00B0 is 8 or 5 (and then writes 5 there).
// CLOCK_BUILD=hdd|rom node verify_first_run.mjs <trace.jsonl>   (PAL with CLOCK_VIDEO=pal)
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { PAL, BUILD, pick, range, pc } from './builds.mjs';

const A = pick({
  hdd: { machine: 0x0022d828, image: 0x0022e5d8, stage: 0x00370264, overlay: 0x00370238, ramps: 0x002b46d0, scene: 0x002b2170, target: 0x00370294, mode: 0x00370ab4, pad: 0x00370334, gate: [0x00370304, 0xc] },
  rom: { machine: 0x00229778, image: 0x0022a600, stage: 0x002c887c, overlay: 0x002c8840, ramps: 0x002953f0, scene: 0x0028a340, target: 0x002c88ac, mode: 0x002c8f6c, pad: 0x002c8948, gate: [0x001f00b0, 4] },
});
const MACHINE = A.machine, IMAGE = A.image;
export const PROBES = [
  { pc: pc(A.machine), ranges: [range(A.stage, 4), range(A.overlay, 4), range(A.ramps, 0x30), range(A.scene, 8), range(A.target, 4), range(A.mode, 8), range(A.pad, 4), range(...A.gate)] },
  ...(A.image ? [{ pc: pc(A.image), ranges: [range(A.ramps + 0x20, 0x10)] }] : []),
];
const ramp = (b, at) => ({ length: b.readInt32LE(at), value: b.readInt32LE(at + 4), changed: b.readInt32LE(at + 8), state: b.readInt32LE(at + 12) });
const step = (r) => { const n = { ...r, changed: 0 }; if (r.state === 1) { n.value += 1; if (n.value === n.length) { n.changed = 1; n.state = 2; } } else if (r.state === 3) { n.value -= 1; if (n.value === 0) { n.changed = 1; n.state = 0; } } return n; };
const show = (r) => (r.state === 0 ? { ...r, value: 0, state: 1, changed: 1 } : r);
const hide = (r) => (r.state === 2 ? { ...r, value: r.length, state: 3, changed: 1 } : r.state === 1 ? { ...r, state: 3 } : r);
const lengthOf = (r) => r.length;
const scaled = (r, x) => Math.trunc((r.value * x) / lengthOf(r));
const FULL = Math.trunc(0x80), CROSS = Math.trunc(0x20), STAGE_TEXT_A = Math.trunc(2), STAGE_TEXT_B = Math.trunc(4);
const IMAGE_ROWS = pick({
  hdd: PAL ? [[0x2a, 0xfb, 0x66, 0x89, 0x75], [0x28, 0x9a, 0x69, 0x170, 0x7d]] : [[0x29, 0xfb, 0x5a, 0x87, 0x61], [0x27, 0x9a, 0x5e, 0x170, 0x7d]],
  rom: PAL ? [[0x31, 0xfb, 0x66, 0x89, 0x75], [0x2f, 0x9a, 0x69, 0x170, 0x7d]] : [[0x30, 0xfb, 0x5a, 0x87, 0x61], [0x2e, 0x9a, 0x5e, 0x170, 0x69]],
});
const IMAGES = IMAGE_ROWS;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function read(p) {
  const [stage, overlay, ramps, scene, target, mode, pad, gate] = p.mem.map((m) => m.bytes);
  const blocked = BUILD === 'hdd' ? [0, 4, 8].some((o) => gate.readInt32LE(o) !== 0) : ![5, 8].includes(gate.readInt32LE(0));
  return { blocked, stage: stage.readInt32LE(0), overlay: overlay.readInt32LE(0), gate: ramp(ramps, 0), E: ramp(ramps, 0x10), F: ramp(ramps, 0x20),
    pending: scene.readInt32LE(4), target: target.readFloatLE(0), mode: mode.readInt32LE(0), pad: pad.readInt32LE(0) };
}
/** The machine's effect on one frame, from the state at its entry: what the next entry should hold. */
function next(s) {
  const n = { ...s, gate: step(s.gate) };                // func_0022D828 steps the gate first
  if (n.gate.state !== 2 || s.blocked) return { n, known: true };
  if (s.stage <= 1) {
    if (s.F.state === 0) { n.F = show(s.F); n.overlay = FULL; n.mode = 4; return { n, known: true }; }
    n.F = step(s.F);
    if (n.F.state === 2) { n.F.value -= 1; if (n.F.value === 0) { n.F = hide({ ...n.F, value: n.F.length }); } return { n, known: true }; }
    if (n.F.state === 0) n.stage += 1;
    return { n, known: true };
  }
  if (s.stage === STAGE_TEXT_A || s.stage === STAGE_TEXT_B) {
    n.overlay = scaled(s.E, FULL);
    if (s.E.state === 0) { n.E = show(s.E); return { n, known: true }; }
    n.E = step(s.E);
    if (n.E.state === 2) { if ((s.pad & CROSS) === CROSS) n.E = hide(n.E); return { n, known: true }; }
    if (n.E.state === 0) { if (s.stage === 2) n.mode = 2; n.stage += 1; }
    return { n, known: true };
  }
  if (s.stage === 5) { n.overlay = FULL; return { n, known: s.E.state !== 0 }; }
  n.overlay = 0;
  return { n, known: false };                             // stage 3: the settings page decides
}

export function verify(file) {
  const trace = readTrace(file);
  if (!trace.complete) throw new Error(`${file}: ${trace.reason}`);
  const machine = trace.probes.filter((p) => p.pc === MACHINE && !p.preroll);
  const out = { frames: machine.length, compared: 0, equal: 0, stages: new Set(), images: 0, imagesEqual: 0, problems: [] };
  for (let i = 0; i + 1 < machine.length; i++) {
    const s = read(machine[i]), t = read(machine[i + 1]);
    out.stages.add(s.stage);
    const { n, known } = next(s);
    if (!known) continue;
    out.compared += 1;
    // The mode setter also changes the weight; the overlay drawn uses the value at entry.
    const keys = ['stage', 'overlay', 'E', 'F'];
    const want = Object.fromEntries(keys.map((k) => [k, n[k]])), got = Object.fromEntries(keys.map((k) => [k, t[k]]));
    if (s.stage <= 1 || s.stage === 5) delete want.E, delete got.E;
    if (s.stage >= 2) delete want.F, delete got.F;
    if (n.mode !== s.mode && t.mode !== n.mode) out.problems.push(`frame ${machine[i].frame}: mode ${t.mode}, computed ${n.mode}`);
    if (same(want, got)) out.equal += 1;
    else if (out.problems.length < 12) out.problems.push(`frame ${machine[i].frame} stage ${s.stage}: ${JSON.stringify(got)}, computed ${JSON.stringify(want)}`);
  }
  for (const p of IMAGE ? trace.probes.filter((q) => q.pc === IMAGE && !q.preroll) : []) {
    out.images += 1;
    const g = p.gpr;
    const regs = [4, 5, 6, 7, 8, 9].map((r) => g[r] | 0);
    const F = ramp(p.mem[0].bytes, 0);
    const row = IMAGES.find((x) => x[0] === regs[0]);
    const alpha = F.state === 2 ? FULL : scaled(F, FULL);
    if (row && same([...row, alpha], regs)) out.imagesEqual += 1;
    else if (out.problems.length < 12) out.problems.push(`image at frame ${p.frame}: ${regs.map((r) => r.toString(16))}, computed ${row ? [...row, alpha].map((r) => r.toString(16)) : 'no row'}`);
  }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('verify_first_run.mjs')) {
  const r = verify(process.argv[2]);
  console.log(`frames ${r.frames}, stages seen ${[...r.stages].join(',')}; machine steps compared ${r.compared}, equal ${r.equal}; logo images ${r.images}, equal ${r.imagesEqual}`);
  for (const t of r.problems) console.log(`  ! ${t}`);
  console.log(`verdict: ${r.problems.length === 0 && r.compared > 0 ? 'FOUND every first-run step and logo image as computed' : 'PARTIAL see the lines marked !'}`);
}
