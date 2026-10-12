// What the opening's verifiers so far took as probed inputs (HDD OSD 1.10U), recomputed:
//
//   sinf, cosf (libm)         the lights' angles (OpeningDrawLights), the camera's roll
//   sceVu0RotMatrix,          the cubes' turn matrix, their world matrix and the two products
//     TransMatrix, MulMatrix    func_00224EB8 leaves in the scratch block
//   sceVu0CameraMatrix,       the view matrix, the view-to-screen matrix and their product
//     ViewScreenMatrix          (OpeningProcessInner, 0x0021F528..0x0021F5C0)
//   sceVu0NormalLightMatrix   the light direction matrix of the towers and cubes
//   func_0021DEA8             the fog mesh and its brightness, built at set-up
//   func_002245C0             the cube's corners and colours, built at set-up
//
// Which checks run depends on the probes a trace holds: the lights' and the cubes' probes are
// those of verify_opening_lights.mjs and verify_opening_cubes.mjs, the roll's is the last probe of
// verify_opening_camera.mjs; the rest are this script's own PROBES.
//
// node verify_opening_inputs.mjs <trace.jsonl> ...
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { f, add, toInt, root, quotient, asBits, asFloat, vector, matrix, mulMatrix, rotMatrix, transMatrix, cameraMatrix, viewScreenMatrix } from '../model/opening-lib.mjs';
import { sinf, cosf } from '../model/opening-libm.mjs';
import { expected as lights, PROBES as LIGHT_PROBES } from './verify_opening_lights.mjs';

export const PROBES = [
  { pc: '0x0021dea8', ranges: ['0x00370000:0x4', '0x0036f988:0x8', '0x00364f90:0x8'] },
  { pc: '0x00222150', ranges: ['0x003d80a0:0x2440'] },
  { pc: '0x0021f5c4', ranges: ['0x70000060:0x280', '0x002b0c60:0x60', '0x00370030:0x8', '0x0036fa08:0x4', '0x00370098:0x4', '0x002b20a0:0xd0', '0x0036fa4c:0x4'] },
];
const [FOG_SETUP, FOG_BUILT, MATRICES] = PROBES.map((probe) => parseInt(probe.pc, 16));
// ROM 2.30 builds the same matrices at the end of its own update function (0x0021A510).
export const ROM = { '0x0021f5c4': { pc: '0x0021acc0', ranges: ['0x70000060:0x280', '0x00288e30:0x60', '0x002c8630:0x8', '0x002c7f88:0x4', '0x002c86a0:0x4', '0x0028a270:0xd0', '0x002c7fcc:0x4'] } };
const [LIGHTS, AFTER_COS, AFTER_SIN] = LIGHT_PROBES.map((probe) => parseInt(probe.pc, 16));
const CUBE_READY = 0x002207c0, CAMERA_END = 0x0021f5c8;

/** func_0021B090: the sine of a 16-bit angle, through a double product and sinf. */
function tableSine(angle, halfPi) {
  const negative = angle < 0;
  let a = negative ? -angle : angle;
  if (a >= 0x4000) a = 0x8000 - a;
  const s = sinf(Math.fround(a * halfPi * 2 ** -14));
  return negative ? -s : s;
}

/** func_0021DEA8: 17 x 17 points and their brightness. */
export function fog(counter, radius2, centre, halfPi) {
  const R = root(radius2);
  const angle = (Math.imul(counter, 0x33) >>> 0) & 0x3fff;
  const cosine = tableSine(angle + 0x4000, halfPi), sine = tableSine(angle, halfPi);
  const points = [], bright = [];
  for (let i = 0; i < 17; i++) {
    for (let j = 0; j < 17; j++) {
      const x = f(f(f(j * 6) + -48) + f(cosine + cosine));
      const y = f(f(f(i * 6) + -48) + f(sine + sine));
      const dx = f(centre - f(f(f((2 * j - 16) * 6) * 0.5) + 3));
      const dy = f(0 - f(f(f((2 * i - 16) * 6) * 0.5) + 3));
      const d = root(f(f(dx * dx) + f(dy * dy)));
      let level = f(quotient(f(f(R - f(d * 4)) * 96), R) + 0);
      level = level < 0 ? 0 : 127 < level ? 127 : level;
      const dark = toInt(f(f(level * 0) * 0.0078125));
      points.push({ at: j * 0x110 + i * 0x10, values: [x, y, 134, 1] });
      bright.push({ at: j * 0x110 + i * 0x10, values: [dark, dark, toInt(f(f(level * 128) * 0.0078125)), 0x80] });
    }
  }
  return { points, bright };
}

/** sceVu0Normalize and sceVu0NormalLightMatrix. */
const normalize = (v) => {
  const length = root(add(add(f(v[0] * v[0]), f(v[1] * v[1])), f(v[2] * v[2])));
  const q = quotient(1, length);
  return [f(v[0] * q), f(v[1] * q), f(v[2] * q), 0];
};
function normalLight(l0, l1, l2) {
  const rows = [l0, l1, l2].map((l) => normalize(l.map((x) => f(x * -1))));
  rows.push([0, 0, 0, 1]);
  return [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => rows[c][r]));
}

export function verify(files) {
  const result = { checks: {}, problems: [] };
  const problem = (text) => { if (result.problems.length < 16) result.problems.push(text); };
  const check = (name, got, want, where) => {
    const t = (result.checks[name] ??= [0, 0]);
    let bad = 0;
    want.forEach((x, i) => { t[1] += 1; if (asBits(x) === asBits(got[i])) t[0] += 1; else bad += 1; });
    if (bad) problem(`${where}: ${name}: ${bad} of ${want.length} values differ (first: in memory ${got.find((x, i) => asBits(x) !== asBits(want[i]))}, computed ${want.find((x, i) => asBits(x) !== asBits(got[i]))})`);
  };
  const floats = (bytes, at, count) => [...Array(count).keys()].map((i) => bytes.readFloatLE(at + i * 4));

  for (const file of files) {
    const trace = readTrace(file);
    if (!trace.complete) throw new Error(`${file}: ${trace.reason}`);
    const probes = trace.probes.filter((probe) => !probe.preroll || probe.pc === FOG_SETUP || probe.pc === FOG_BUILT);
    let fogInput = null, lastCube = null;
    probes.forEach((probe, n) => {
      if (probe.mem.some((range) => !range.bytes)) return;
      const m = probe.mem.map((range) => range.bytes);
      if (probe.pc === FOG_SETUP) fogInput = { counter: m[0].readUInt32LE(0), radius2: m[1].readFloatLE(0), centre: m[1].readFloatLE(4), halfPi: m[2].readDoubleLE(0) };
      else if (probe.pc === FOG_BUILT && fogInput) {
        const made = fog(fogInput.counter, fogInput.radius2, fogInput.centre, fogInput.halfPi);
        const mesh = m[0].subarray(0x20), light = m[0].subarray(0x20 + 0x1210);
        check('fog mesh', made.points.flatMap((p) => floats(mesh, p.at, 4)), made.points.flatMap((p) => p.values), `set-up, counter ${fogInput.counter}`);
        const t = (result.checks['fog brightness'] ??= [0, 0]);
        for (const b of made.bright) b.values.forEach((x, i) => { t[1] += 1; if (light.readInt32LE(b.at + i * 4) === x) t[0] += 1; else problem(`fog brightness at 0x${b.at.toString(16)}+${i * 4}: in memory ${light.readInt32LE(b.at + i * 4)}, computed ${x}`); });
        fogInput = null;
      } else if (probe.pc === MATRICES) {
        const [block, camera, shape, zmax, phi, cube, half] = m;
        const where = `frame ${probe.frame}`;
        const roll = phi.readFloatLE(0);
        check('roll: sinf, cosf', floats(camera, 0x20, 2), [sinf(roll), cosf(roll)], where);
        const view = cameraMatrix(vector(camera, 0), vector(camera, 0x10), vector(camera, 0x20));
        check('view matrix (sceVu0CameraMatrix)', matrix(block, 0x100).flat(), view.flat(), where);
        const screen = viewScreenMatrix(1024, shape.readFloatLE(0), shape.readFloatLE(4), 2048, 2048, 1, zmax.readFloatLE(0), 1, 65536);
        check('view to screen (sceVu0ViewScreenMatrix)', matrix(block, 0x140).flat(), screen.flat(), where);
        check('world to screen (their product)', matrix(block, 0xc0).flat(), mulMatrix(screen, view).flat(), where);
        check('light directions (sceVu0NormalLightMatrix)', matrix(block, 0x200).flat(), normalLight(vector(camera, 0x30), vector(camera, 0x40), vector(camera, 0x50)).flat(), where);
        lastCube = { cube, half };
      } else if (probe.pc === CUBE_READY) {
        const record = m[0], block = m[m.length - 1];
        const where = `frame ${probe.frame} cube`;
        const turned = rotMatrix(matrix(block, 0), vector(record, 0x450));
        check('cube turn (sceVu0RotMatrix)', matrix(block, 0x240).flat(), turned.flat(), where);
        const world = transMatrix(turned, vector(record, 0x460));
        check('cube world matrix (sceVu0TransMatrix)', matrix(block, 0x80).flat(), world.flat(), where);
        check('cube normals matrix (sceVu0MulMatrix)', matrix(block, 0x180).flat(), mulMatrix(matrix(block, 0x200), turned).flat(), where);
        check('cube to screen (sceVu0MulMatrix)', matrix(block, 0x40).flat(), mulMatrix(matrix(block, 0xc0), world).flat(), where);
      } else if (probe.pc === CAMERA_END && probe.mem.length === 8) {
        const [, camera, vars] = m;
        const roll = vars.readFloatLE(0x98);
        check('roll: sinf, cosf', floats(camera, 0x20, 2), [sinf(roll), cosf(roll)], `frame ${probe.frame}`);
      } else if (probe.pc === LIGHTS && probe.mem.length === 8) {
        const cosines = [], sines = [];
        for (let k = n + 1; k < probes.length && probes[k].pc !== LIGHTS; k++) {
          if (probes[k].pc === AFTER_COS) cosines.push(asFloat(probes[k].fpr[0]));
          if (probes[k].pc === AFTER_SIN) sines.push(asFloat(probes[k].fpr[0]));
        }
        if (cosines.length !== 4 || sines.length !== 4) return;
        const [vars, phase, constants, history, rings, tables, clip, block] = m;
        const model = lights({ vars, phase: phase.readInt32LE(0), constants, history, rings, tables, clip, block, cosines, sines });
        const got = model.angles.map((angle, k) => (k % 2 === 0 ? cosines[k >> 1] : sines[k >> 1]));
        const want = model.angles.map((angle, k) => (k % 2 === 0 ? cosf(angle) : sinf(angle)));
        check('lights: cosf, sinf', got, want, `frame ${probe.frame}`);
      }
    });
    // The cube's corners and colours as the trace's last frame has them (func_002245C0 with the
    // half size at 0x0036FA4C and the colour offsets -16, -16, 24 that InitLightsCubes passes).
    if (lastCube) {
      const { cube, half } = lastCube;
      const s = half.readFloatLE(0), n = -s;
      const corners = [[n, n, n], [s, n, n], [n, s, n], [s, s, n], [n, n, s], [s, n, s], [n, s, s], [s, s, s]].flatMap((c) => [...c, 1]);
      check('cube corners', floats(cube, 0, 32), corners, 'last frame');
      const colour = [f(-16 + 128), f(-16 + 128), f(24 + 128), 128];
      check('cube colours', floats(cube, 0x80, 20), [0, 1, 2, 3, 4].flatMap(() => colour), 'last frame');
    }
  }
  return result;
}

if (process.argv[1] && process.argv[1].endsWith('verify_opening_inputs.mjs')) {
  const result = verify(process.argv.slice(2));
  let total = 0;
  for (const [name, [equal, count]] of Object.entries(result.checks)) { total += count; console.log(`  ${name.padEnd(46)} ${equal} of ${count} equal`); }
  for (const text of result.problems) console.log(`  ! ${text}`);
  const whole = total > 0 && result.problems.length === 0;
  console.log(`verdict: ${whole ? `FOUND ${total} values of the opening's library results and set-up tables, every one equal` : 'PARTIAL see the lines marked !'}`);
  process.exit(whole ? 0 : 3);
}
