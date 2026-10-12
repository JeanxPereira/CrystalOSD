// The two matrices of a clock frame (HDD module_clock_225F38, ROM 0x00221610): the screen matrix
// from sceVu0ViewScreenMatrix and the view matrix from the builder (HDD module_clock_238DC0),
// with libvu0's own arithmetic. Rules: facts/clock-camera.md.
import { f, add, sub, down, asFloat, vector } from './clock_math.mjs';

/** sceVu0ViewScreenMatrix: every operation in single precision. Rows as [[x, y, z, w], ...]. */
export function viewScreen(scrz, ax, ay, cx, cy, zmin, zmax, nearz, farz) {
  const range = add(-zmin, zmax);
  const depth = add(-nearz, farz);
  const az = f(f(f(farz * nearz) * range) / depth);
  const cz = f(add(f(-zmax * nearz), f(zmin * farz)) / depth);
  const m = [[scrz, 0, 0, 0], [0, scrz, 0, 0], [0, 0, 0, 1], [0, 0, 1, 0]];
  const mt = [[ax, 0, 0, 0], [0, ay, 0, 0], [0, 0, az, 0], [cx, cy, cz, 1]];
  return m.map((row) => [0, 1, 2, 3].map((i) => add(add(add(f(mt[0][i] * row[0]), f(mt[1][i] * row[1])), f(mt[2][i] * row[2])), f(mt[3][i] * row[3]))));
}

/** Square root cut toward zero (vsqrt takes the absolute value). */
const root = (x) => { let r = f(Math.sqrt(Math.abs(x))); while (r * r > Math.abs(x)) r = down(r); return r; };
/** Quotient of two positive floats cut toward zero. */
const quotient = (a, b) => { let q = f(a / b); while (q * b > a) q = down(q); return q; };

// S5432: the four coefficients of _sceVu0ecossin, as x, y, z, w. The same words in both builds.
const S = [0x362e9c14, 0xb94fb21f, 0x3c08873e, 0xbe2aaaa4].map(asFloat);
const HALF_PI = asFloat(0x3fc90fdb);

/** _sceVu0ecossin behind sceVu0RotMatrix*: [sine, cosine] of an angle in radians. */
export function sineCosine(angle) {
  const negative = angle < 0;
  const t = negative ? add(HALF_PI, angle) : sub(HALF_PI, angle);
  const t2 = f(t * t);
  const v = S.map((c) => f(f(c * t) * t2));
  for (const i of [0, 1, 2]) v[i] = f(v[i] * t2);
  let sum = add(t, v[3]);
  for (const i of [0, 1]) v[i] = f(v[i] * t2);
  sum = add(sum, v[2]);
  v[0] = f(v[0] * t2);
  sum = add(sum, v[1]);
  sum = add(sum, v[0]);
  const cosine = add(0, sum);
  const q = add(0, root(sub(1, f(cosine * cosine))));
  return [negative ? sub(0, q) : add(0, q), cosine];
}

const combine = (rows, v) => [0, 1, 2, 3].map((i) => add(add(add(f(rows[0][i] * v[0]), f(rows[1][i] * v[1])), f(rows[2][i] * v[2])), f(rows[3][i] * v[3])));
const rotate = (rows, m) => m.map((row) => combine(rows, row));
const rotX = (m, a) => { const [s, c] = sineCosine(a); return rotate([[1, 0, 0, 0], [0, c, s, 0], [0, sub(0, s), c, 0], [0, 0, 0, 1]], m); };
const rotY = (m, a) => { const [s, c] = sineCosine(a); return rotate([[c, 0, sub(0, s), 0], [0, 1, 0, 0], [s, 0, c, 0], [0, 0, 0, 1]], m); };
const rotZ = (m, a) => { const [s, c] = sineCosine(a); return rotate([[c, s, 0, 0], [sub(0, s), c, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]], m); };
const outer = (a, b) => [sub(f(a[1] * b[2]), f(b[1] * a[2])), sub(f(a[2] * b[0]), f(b[2] * a[0])), sub(f(a[0] * b[1]), f(b[0] * a[1])), 0];
const normalize = (v) => {
  const length = add(0, root(add(add(f(v[0] * v[0]), f(v[1] * v[1])), f(v[2] * v[2]))));
  const q = quotient(1, length);
  return [f(v[0] * q), f(v[1] * q), f(v[2] * q), 0];
};

/** The view matrix builder: rotation X, Y, Z; the three vectors through it; sceVu0CameraMatrix. */
export function viewMatrix(position, direction, up, rotation) {
  let m = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  m = rotZ(rotY(rotX(m, rotation[0]), rotation[1]), rotation[2]);
  const zd = combine(m, direction), yd = combine(m, up), p = combine(m, position);
  const x = normalize(outer(yd, zd));
  const z = normalize(zd);
  const y = outer(z, x);
  const t = [add(0, p[0]), add(0, p[1]), add(0, p[2]), 1];
  const rows = [0, 1, 2].map((i) => [x[i], y[i], z[i], 0]);
  const back = [0, 1, 2].map((i) => sub(0, add(add(f(rows[0][i] * t[0]), f(rows[1][i] * t[1])), f(rows[2][i] * t[2]))));
  return [...rows, [...back, t[3]]];
}

/**
 * One frame's camera: the screen matrix, the view matrix with the approach offset added to the
 * position's z, and the offset's decay.
 */
export function camera(m) {
  const screen = viewScreen(512, m.float('proportions', 0), m.float('proportions', 4), 2048, 2048, 1, m.float('zmax'), 1, 65536);
  const position = vector(m.at('position'));
  const offset = m.float('cameraOffset');
  position[2] = add(position[2], offset);
  const view = viewMatrix(position, vector(m.at('direction')), vector(m.at('up')), vector(m.at('rotation')));
  m.setFloat('cameraOffset', f(offset * m.float('cameraFactor')));
  return { view, screen };
}
