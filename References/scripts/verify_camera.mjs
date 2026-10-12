// The two matrices every rod of the crystal clock is transformed with: are they constant, and
// does the library's view-to-screen formula reproduce the screen matrix? Build: ROM 2.30.
// Uses any capture taken with verify_rod.mjs's probes (transform at 0x002335e8).
//
// node verify_camera.mjs <trace.jsonl> ...
import { readTrace } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/trace.js';
import { pick, range, pc, BUILD, BUILD_NAME, PAL } from './builds.mjs';

const TRANSFORM = pick({ rom: 0x002335e8, hdd: 0x00237010 });
const bits = new DataView(new ArrayBuffer(4));
const f = (x) => {
  const near = Math.fround(x);
  if (Math.abs(near) <= Math.abs(x) || !Number.isFinite(near)) return near;
  bits.setFloat32(0, near);
  bits.setUint32(0, bits.getUint32(0) - 1);
  return bits.getFloat32(0);
};
const floats = (bytes) => Array.from({ length: 16 }, (_, i) => bytes.readFloatLE(i * 4));
const apply = (m, v) => [0, 1, 2, 3].map((i) => f(f(f(f(m[i] * v[0]) + f(m[4 + i] * v[1])) + f(m[8 + i] * v[2])) + f(m[12 + i] * v[3])));

/** sceVu0ViewScreenMatrix, as read from the library: every operation in single precision. */
export function viewScreen(scrz, ax, ay, cx, cy, zmin, zmax, nearz, farz) {
  const range = f(-zmin + zmax);
  const depth = f(-nearz + farz);
  const az = f(f(f(farz * nearz) * range) / depth);
  const cz = f(f(f(-zmax * nearz) + f(zmin * farz)) / depth);
  const m = [scrz, 0, 0, 0, 0, scrz, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  const mt = [ax, 0, 0, 0, 0, ay, 0, 0, 0, 0, az, 0, cx, cy, cz, 1];
  return [0, 1, 2, 3].flatMap((row) => apply(mt, m.slice(row * 4, row * 4 + 4)));
}

/** The view matrix in double precision: rotate the camera's frame, then invert it. */
export function view(position, rotation) {
  const [rx, ry, rz] = rotation;
  const rotX = (v, a) => [v[0], v[1] * Math.cos(a) - v[2] * Math.sin(a), v[1] * Math.sin(a) + v[2] * Math.cos(a)];
  const rotY = (v, a) => [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)];
  const rotZ = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a), v[2]];
  const turn = (v) => rotZ(rotY(rotX(v, rx), ry), rz);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = (v) => { const n = Math.hypot(...v); return v.map((c) => c / n); };
  const z = unit(turn([0, 0, 1])), p = turn(position);
  const x = unit(cross(turn([0, 1, 0]), z)), y = cross(z, x);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(p, x), -dot(p, y), -dot(p, z), 1];
}

if (process.argv[1] && process.argv[1].endsWith('verify_camera.mjs')) {
  const seen = new Map();
  let calls = 0;
  for (const file of process.argv.slice(2)) {
    for (const probe of readTrace(file).probes) {
      if (probe.pc !== TRANSFORM || !probe.mem[1].bytes || !probe.mem[2].bytes) continue;
      calls += 1;
      const key = probe.mem[1].bytes.toString('hex') + probe.mem[2].bytes.toString('hex');
      if (!seen.has(key)) seen.set(key, { view: floats(probe.mem[1].bytes), screen: floats(probe.mem[2].bytes), frame: probe.frame });
    }
  }
  console.log(`build: ${BUILD_NAME}   transform calls: ${calls}   distinct (view, screen) pairs: ${seen.size}`);
  const row = (m, r) => m.slice(r * 4, r * 4 + 4).map((x) => String(x).padStart(22)).join('');
  let whole = seen.size === 1;
  for (const pair of seen.values()) {
    console.log(`first seen in frame ${pair.frame}\nview`);
    for (let r = 0; r < 4; r++) console.log(row(pair.view, r));
    console.log('screen');
    for (let r = 0; r < 4; r++) console.log(row(pair.screen, r));
    const ay = PAL ? 0.5405 : 0.47;
    const want = viewScreen(512, 1, f(ay), 2048, 2048, 1, 16777215, 1, 65536);
    const equal = want.filter((x, i) => Object.is(x, pair.screen[i])).length;
    console.log(`screen matrix from sceVu0ViewScreenMatrix(512, 1, ${ay}, 2048, 2048, 1, 16777215, 1, 65536): ${equal} of 16 equal`);
    if (equal !== 16) { whole = false; for (let r = 0; r < 4; r++) console.log(row(want, r)); }
    const near = view([f(10.436), 0, -103], [f(0.031), f(0.145), 0]);
    const worst = Math.max(...near.map((x, i) => Math.abs(x - pair.view[i])));
    console.log(`view matrix from position (10.436, 0, -103), rotation (0.031, 0.145, 0) in double precision: largest difference ${worst.toExponential(2)}`);
    if (worst > 1e-4) { whole = false; for (let r = 0; r < 4; r++) console.log(row(near.map((x) => x.toFixed(7)), r)); }
  }
  console.log(`verdict: ${whole ? 'FOUND one camera, screen matrix equal bit for bit, view matrix within float error' : 'PARTIAL'}`);
  process.exit(whole ? 0 : 3);
}
