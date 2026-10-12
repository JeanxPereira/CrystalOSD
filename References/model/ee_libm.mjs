// cosf as the program's C library computes it (HDD OSD 1.10U: cosf 0x00294B28, __kernel_cosf
// 0x00296CF8, __kernel_sinf 0x002977A0, __ieee754_rem_pio2f 0x00295850), with the EE's
// arithmetic: every single-precision operation cut toward zero. Read instruction by instruction;
// the argument reduction is carried as far as |x| <= 2^7 * pi/2, which the clock never leaves.
import { f, add, sub, floatBits, asFloat, toInt } from './clock_math.mjs';

const K = (bits) => asFloat(bits);
const ONE = 1, HALF = 0.5;
const C1 = K(0x3d2aaaab), C2 = K(0xbab60b61), C3 = K(0x37d00d01), C4 = K(0xb493f27c), C5 = K(0x310f74f6), C6 = K(0xad47d74e);
const S1 = K(0xbe2aaaab), S2 = K(0x3c088889), S3 = K(0xb9500d01), S4 = K(0x3638ef1b), S5 = K(0xb2d72f34), S6 = K(0x2f2ec9d3);
const INVPIO2 = K(0x3f22f984), PIO2_1 = K(0x3fc90f80), PIO2_1T = K(0x37354443), PIO2_2 = K(0x37354400), PIO2_2T = K(0x2e85a308),
  PIO2_3 = K(0x2e85a300), PIO2_3T = K(0x248d3132);
// npio2_hw (HDD 0x0036EB00): the high bits of n * pi/2, n = 1 .. 32.
const NPIO2_HW = [0x3fc90f00, 0x40490f00, 0x4096cb00, 0x40c90f00, 0x40fb5300, 0x4116cb00, 0x412fed00, 0x41490f00, 0x41623100, 0x417b5300, 0x418a3a00, 0x4196cb00,
  0x41a35c00, 0x41afed00, 0x41bc7e00, 0x41c90f00, 0x41d5a000, 0x41e23100, 0x41eec200, 0x41fb5300, 0x4203f200, 0x420a3a00, 0x42108300, 0x4216cb00, 0x421d1400,
  0x42235c00, 0x4229a500, 0x422fed00, 0x42363600, 0x423c7e00, 0x4242c700, 0x42490f00];

/** __kernel_cosf(x, y): cosine of x + y for |x| <= pi/4, y the tail of x. */
function cosKernel(x, y) {
  const ix = floatBits(x) & 0x7fffffff;
  if (ix <= 0x31ffffff && toInt(x) === 0) return ONE;
  const z = f(x * x);
  let p = f(z * C6);
  p = add(p, C5); p = f(z * p);
  p = add(p, C4); p = f(z * p);
  p = add(p, C3); p = f(z * p);
  p = add(p, C2); p = f(z * p);
  p = add(p, C1);
  const r = f(z * p);
  if (ix <= 0x3e999999) return sub(ONE, sub(f(z * HALF), sub(f(z * r), f(x * y))));
  const qx = ix > 0x3f480000 ? K(0x3e900000) : K((ix + 0xff000000) >>> 0);
  const zr = sub(f(z * r), f(x * y));
  const hz = sub(f(z * HALF), qx);
  return sub(sub(ONE, qx), sub(hz, zr));
}

/** __kernel_sinf(x, y, iy): sine of x + y for |x| <= pi/4; iy says whether y is given. */
function sinKernel(x, y, iy) {
  const ix = floatBits(x) & 0x7fffffff;
  if (ix <= 0x31ffffff && toInt(x) === 0) return x;
  const z = f(x * x);
  const v = f(z * x);
  let p = f(z * S6);
  p = add(p, S5); p = f(z * p);
  p = add(p, S4); p = f(z * p);
  p = add(p, S3); p = f(z * p);
  const r = add(p, S2);
  if (!iy) return add(x, f(v * add(f(z * r), S1)));
  return sub(x, sub(sub(f(z * sub(f(y * HALF), f(v * r))), y), f(v * S1)));
}

/** __ieee754_rem_pio2f(x): [n, y0, y1] with x = n * pi/2 + y0 + y1. */
function remPio2(x) {
  const hx = floatBits(x) | 0;
  const ix = hx & 0x7fffffff;
  if (ix <= 0x3f490fd8) return [0, x, 0];
  if (ix <= 0x4016cbe3) {
    // Within 3 pi/4: one step of pi/2, with a second term when x is close to pi/2.
    const sign = hx > 0 ? 1 : -1;
    const step = (a, b) => (sign > 0 ? sub(a, b) : add(a, b));
    let z = step(x, PIO2_1);
    let t = PIO2_1T;
    if ((ix & 0xfffffff0) === 0x3fc90fd0) { z = step(z, PIO2_2); t = PIO2_2T; }
    const y0 = step(z, t);
    return [sign, y0, step(sub(z, y0), t)];
  }
  if (ix > 0x43490f80) throw new Error('remPio2: argument beyond what the model carries');
  const t = Math.abs(x);
  const n = toInt(add(f(t * INVPIO2), HALF));
  const fn = n;
  let r = sub(t, f(fn * PIO2_1));
  let w = f(fn * PIO2_1T);
  let y0;
  if (n < 32 && (ix & 0xffffff00) !== NPIO2_HW[n - 1]) y0 = sub(r, w);
  else {
    const j = ix >> 23;
    y0 = sub(r, w);
    if (j - ((floatBits(y0) >>> 23) & 0xff) > 8) {
      let before = r;
      w = f(fn * PIO2_2);
      r = sub(before, w);
      w = sub(f(fn * PIO2_2T), sub(sub(before, r), w));
      y0 = sub(r, w);
      if (j - ((floatBits(y0) >>> 23) & 0xff) > 25) {
        before = r;
        w = f(fn * PIO2_3);
        r = sub(before, w);
        w = sub(f(fn * PIO2_3T), sub(sub(before, r), w));
        y0 = sub(r, w);
      }
    }
  }
  const y1 = sub(sub(r, y0), w);
  return hx < 0 ? [-n, -y0, -y1] : [n, y0, y1];
}

export function cosf(x) {
  const ix = floatBits(x) & 0x7fffffff;
  if (ix <= 0x3f490fd8) return cosKernel(x, 0);
  if (ix > 0x7f7fffff) return sub(x, x);
  const [n, y0, y1] = remPio2(x);
  switch (n & 3) {
    case 0: return cosKernel(y0, y1);
    case 1: return -sinKernel(y0, y1, 1);
    case 2: return -cosKernel(y0, y1);
    default: return sinKernel(y0, y1, 1);
  }
}
