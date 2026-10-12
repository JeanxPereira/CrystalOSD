// sinf and cosf of HDD OSD 1.10U's libm, written from their instructions; every single-precision
// operation is cut toward zero, as the EE's FPU does.
//
//   sinf                 0x00294D98      cosf            0x00294B28
//   __kernel_sinf        0x002977A0      __kernel_cosf   0x00296CF8
//   __ieee754_rem_pio2f  0x00295850      npio2_hw        0x0036EB00 (32 words, in the file)
//
// The reduction is modelled for |x| up to 2^7 x pi/2 (bits 0x43490F80); beyond that the library
// calls __kernel_rem_pio2f, which is not modelled here.
import { readElf } from '../scripts/extract_opening_vu1.mjs';
import { f, asFloat, asBits, toInt } from './opening-lib.mjs';

const c = asFloat;
const S1 = c(0xbe2aaaab), S2 = c(0x3c088889), S3 = c(0xb9500d01), S4 = c(0x3638ef1b), S5 = c(0xb2d72f34), S6 = c(0x2f2ec9d3);
const C1 = c(0x3d2aaaab), C2 = c(0xbab60b61), C3 = c(0x37d00d01), C4 = c(0xb493f27c), C5 = c(0x310f74f6), C6 = c(0xad47d74e);
const PIO2_1 = c(0x3fc90f80), PIO2_1T = c(0x37354443), PIO2_2 = c(0x37354400), PIO2_2T = c(0x2e85a308), PIO2_3 = c(0x2e85a300), PIO2_3T = c(0x248d3132);
const INVPIO2 = c(0x3f22f984);
let table = null;
const npio2 = (n) => { table ??= readElf()(0x0036eb00, 32 * 4); return table.readUInt32LE(n * 4); };

export function kernelSin(x, y, iy) {
  const ix = asBits(x) & 0x7fffffff;
  if (ix <= 0x31ffffff && toInt(x) === 0) return x;
  const z = f(x * x), v = f(z * x);
  const r = f(f(z * f(f(z * f(f(z * f(f(z * S6) + S5)) + S4)) + S3)) + S2);
  if (iy === 0) return f(x + f(v * f(f(z * r) + S1)));
  return f(x - f(f(f(z * f(f(y * 0.5) - f(v * r))) - y) - f(v * S1)));
}

export function kernelCos(x, y) {
  const ix = asBits(x) & 0x7fffffff;
  if (ix <= 0x31ffffff && toInt(x) === 0) return 1;
  const z = f(x * x);
  const r = f(z * f(f(z * f(f(z * f(f(z * f(f(z * f(f(z * C6) + C5)) + C4)) + C3)) + C2)) + C1));
  if (ix <= 0x3e999999) return f(1 - f(f(z * 0.5) - f(f(z * r) - f(x * y))));
  const qx = ix > 0x3f480000 ? c(0x3e900000) : c(ix - 0x01000000);
  const hz = f(f(z * 0.5) - qx), a = f(1 - qx);
  return f(a - f(hz - f(f(z * r) - f(x * y))));
}

/** __ieee754_rem_pio2f: [n, y0, y1]. */
export function remPio2(x) {
  const hx = asBits(x) | 0, ix = hx & 0x7fffffff;
  if (ix <= 0x3f490fd8) return [0, x, 0];
  if (ix <= 0x4016cbe3) {
    const near = (ix & 0xfffffff0) === 0x3fc90fd0;
    if (hx > 0) {
      let z = f(x - PIO2_1), t = PIO2_1T;
      if (near) { z = f(z - PIO2_2); t = PIO2_2T; }
      const y0 = f(z - t);
      return [1, y0, f(f(z - y0) - t)];
    }
    let z = f(x + PIO2_1), t = PIO2_1T;
    if (near) { z = f(z + PIO2_2); t = PIO2_2T; }
    const y0 = f(z + t);
    return [-1, y0, f(f(z - y0) + t)];
  }
  if (ix > 0x43490f80) throw new Error(`rem_pio2f: |x| = ${Math.abs(x)} is beyond the modelled range`);
  const t = Math.abs(x);
  const n = toInt(f(f(t * INVPIO2) + 0.5)), fn = n;
  let r = f(t - f(fn * PIO2_1)), w = f(fn * PIO2_1T);
  let y0 = f(r - w);
  if (!(n < 32 && (ix & 0xffffff00) !== npio2(n - 1))) {
    const j = ix >> 23;
    if (j - ((asBits(y0) >>> 23) & 0xff) >= 9) {
      let before = r;
      w = f(fn * PIO2_2);
      r = f(before - w);
      w = f(f(fn * PIO2_2T) - f(f(before - r) - w));
      y0 = f(r - w);
      if (j - ((asBits(y0) >>> 23) & 0xff) >= 0x1a) {
        before = r;
        w = f(fn * PIO2_3);
        r = f(before - w);
        w = f(f(fn * PIO2_3T) - f(f(before - r) - w));
        y0 = f(r - w);
      }
    }
  }
  const y1 = f(f(r - y0) - w);
  return hx < 0 ? [-n, -y0, -y1] : [n, y0, y1];
}

export function sinf(x) {
  const ix = asBits(x) & 0x7fffffff;
  if (ix <= 0x3f490fd8) return kernelSin(x, 0, 0);
  if (ix > 0x7f7fffff) return NaN;
  const [n, y0, y1] = remPio2(x);
  switch (n & 3) {
    case 0: return kernelSin(y0, y1, 1);
    case 1: return kernelCos(y0, y1);
    case 2: return -kernelSin(y0, y1, 1);
    default: return -kernelCos(y0, y1);
  }
}

export function cosf(x) {
  const ix = asBits(x) & 0x7fffffff;
  if (ix <= 0x3f490fd8) return kernelCos(x, 0);
  if (ix > 0x7f7fffff) return NaN;
  const [n, y0, y1] = remPio2(x);
  switch (n & 3) {
    case 0: return kernelCos(y0, y1);
    case 1: return -kernelSin(y0, y1, 1);
    case 2: return -kernelCos(y0, y1);
    default: return kernelSin(y0, y1, 1);
  }
}
