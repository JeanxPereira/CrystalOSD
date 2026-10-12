// Arithmetic shared by the opening intro's verifiers (HDD OSD 1.10U): the EE's single-precision
// operations (every result cut toward zero), and the libvu0 routines the opening calls, written
// from their instructions:
//
//   sceVu0RotMatrix   0x0027B3D8   Z, then Y, then X (sceVu0RotMatrixZ/Y/X, _sceVu0ecossin)
//   sceVu0MulMatrix   0x0027AE48   each row of the second matrix through the first
//   sceVu0TransMatrix 0x0027B098   rows 0..2 copied, row 3 xyz + t xyz, w kept
//   sceVu0SubVector   0x0027B050   xyzw
//   sceVu0UnitMatrix, sceVu0ViewScreenMatrix 0x0027B628, sceVu0CameraMatrix 0x0027B450

const bits = new DataView(new ArrayBuffer(4));
const down = (x) => { bits.setFloat32(0, x); bits.setUint32(0, bits.getUint32(0) - 1); return bits.getFloat32(0); };
/** A double result cut toward zero to single precision. */
export const f = (x) => {
  const near = Math.fround(x);
  return Math.abs(near) <= Math.abs(x) || !Number.isFinite(near) ? near : down(near);
};
export const asFloat = (u32) => { bits.setUint32(0, u32 >>> 0); return bits.getFloat32(0); };
export const asBits = (x) => { bits.setFloat32(0, x); return bits.getUint32(0); };
export const toInt = (x) => (x >= 2147483647 ? 2147483647 : x <= -2147483648 ? -2147483648 : Math.trunc(x));
/** Square root cut toward zero. */
export const root = (x) => { let r = f(Math.sqrt(Math.abs(x))); while (r * r > Math.abs(x)) r = down(r); return r; };
/** Quotient cut toward zero (div.s, vdiv): the double quotient may round up onto a single. */
export const quotient = (a, b) => {
  // Neither the FPU nor VU0 has an infinity: a division by zero gives the largest single.
  if (b === 0) return (Object.is(a, -0) || a < 0) !== Object.is(b, -0) ? -3.4028234663852886e38 : 3.4028234663852886e38;
  let q = f(a / b);
  if (Math.abs(q * b) > Math.abs(a)) q = down(q);
  return q;
};
/**
 * A sum of two singles cut toward zero. The double sum can lose an addend far smaller than the
 * other (x + 1e-22 is x in double), and the cut must still see it: a sum that lands on a single
 * with a remainder of the opposite sign is one step nearer zero.
 */
export const add = (a, b) => {
  const x = a + b;
  const part = x - a, rest = (a - (x - part)) + (b - part);
  const near = Math.fround(x);
  if (near !== x) return Math.abs(near) <= Math.abs(x) || !Number.isFinite(near) ? near : down(near);
  if (rest === 0 || x === 0) return near;
  return (rest > 0) === (x > 0) ? near : down(near);
};
export const sub = (a, b) => add(a, -b);

// _sceVu0ecossin (0x0027B168): S5432 at 0x0032C9C0, as x, y, z, w.
const S = [0x362e9c14, 0xb94fb21f, 0x3c08873e, 0xbe2aaaa4].map((u) => { bits.setUint32(0, u); return bits.getFloat32(0); });
const HALF_PI = (() => { bits.setUint32(0, 0x3fc90fdb); return bits.getFloat32(0); })();
/** [sine, cosine] as sceVu0RotMatrixX/Y/Z take them: a polynomial in pi/2 -+ angle, and a square root. */
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

export const vector = (bytes, at = 0) => [0, 4, 8, 12].map((k) => bytes.readFloatLE(at + k));
export const matrix = (bytes, at = 0) => [0, 1, 2, 3].map((r) => vector(bytes, at + r * 16));
export const unit = () => [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];

/** rows[0] * v.x + rows[1] * v.y + rows[2] * v.z + rows[3] * v.w (vmulax, vmadday, vmaddaz, vmaddw). */
export const combine = (rows, v) => [0, 1, 2, 3].map((i) => add(add(add(f(rows[0][i] * v[0]), f(rows[1][i] * v[1])), f(rows[2][i] * v[2])), f(rows[3][i] * v[3])));
/** sceVu0MulMatrix(out, a, b). */
export const mulMatrix = (a, b) => b.map((row) => combine(a, row));
const rotX = (m, a) => { const [s, c] = sineCosine(a); return mulMatrix([[1, 0, 0, 0], [0, c, s, 0], [0, f(0 - s), c, 0], [0, 0, 0, 1]], m); };
const rotY = (m, a) => { const [s, c] = sineCosine(a); return mulMatrix([[c, 0, f(0 - s), 0], [0, 1, 0, 0], [s, 0, c, 0], [0, 0, 0, 1]], m); };
const rotZ = (m, a) => { const [s, c] = sineCosine(a); return mulMatrix([[c, s, 0, 0], [f(0 - s), c, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]], m); };
/** sceVu0RotMatrix(out, m, rot). */
export const rotMatrix = (m, rot) => rotX(rotY(rotZ(m, rot[2]), rot[1]), rot[0]);
/** sceVu0TransMatrix(out, m, t). */
export const transMatrix = (m, t) => [m[0], m[1], m[2], [add(m[3][0], t[0]), add(m[3][1], t[1]), add(m[3][2], t[2]), m[3][3]]];
export const subVector = (a, b) => a.map((x, i) => sub(x, b[i]));

/** sceVu0OuterProduct and sceVu0Normalize, as verify_view_matrix.mjs has them. */
const outer = (a, b) => [sub(f(a[1] * b[2]), f(b[1] * a[2])), sub(f(a[2] * b[0]), f(b[2] * a[0])), sub(f(a[0] * b[1]), f(b[0] * a[1])), 0];
const normalize = (v) => {
  const length = root(add(add(f(v[0] * v[0]), f(v[1] * v[1])), f(v[2] * v[2])));
  const q = quotient(1, length);
  return [f(v[0] * q), f(v[1] * q), f(v[2] * q), 0];
};
/** sceVu0CameraMatrix(out, p, zd, yd). */
export function cameraMatrix(p, zd, yd) {
  const x = normalize(outer(yd, zd));
  const z = normalize(zd);
  const y = outer(z, x);
  const t = [p[0], p[1], p[2], 1];
  const rows = [0, 1, 2].map((i) => [x[i], y[i], z[i], 0]);
  const back = [0, 1, 2].map((i) => sub(0, add(add(f(rows[0][i] * t[0]), f(rows[1][i] * t[1])), f(rows[2][i] * t[2]))));
  return [...rows, [...back, t[3]]];
}
/** sceVu0ViewScreenMatrix(out, scrz, ax, ay, cx, cy, zmin, zmax, nearz, farz). */
export function viewScreenMatrix(scrz, ax, ay, cx, cy, zmin, zmax, nearz, farz) {
  const cz = quotient(add(f(-zmax * nearz), f(zmin * farz)), add(-nearz, farz));
  const az = quotient(f(f(farz * nearz) * add(-zmin, zmax)), add(-nearz, farz));
  const first = unit();
  first[0][0] = scrz; first[1][1] = scrz; first[2][2] = 0; first[3][3] = 0; first[2][3] = 1; first[3][2] = 1;
  const second = unit();
  second[0][0] = ax; second[1][1] = ay; second[2][2] = az; second[3][0] = cx; second[3][1] = cy; second[3][2] = cz;
  return mulMatrix(second, first);
}
