// Arithmetic shared by the parts of the clock model: single-precision operations cut toward
// zero (the EE's FPU and VU0 both round that way), the clock's sine table, the matrix routines.

const bits = new DataView(new ArrayBuffer(4));
/** One single-precision operation: the double result cut toward zero. */
export const f = (x) => {
  let near = Math.fround(x);
  if (!(Math.abs(near) <= Math.abs(x) || !Number.isFinite(near))) {
    bits.setFloat32(0, near);
    bits.setUint32(0, bits.getUint32(0) - 1);
    near = bits.getFloat32(0);
  }
  // The EE's FPU has no denormals: a result below the smallest normal number is a signed zero.
  if (near !== 0 && Math.abs(near) < 1.1754943508222875e-38) return near < 0 ? -0 : 0;
  return near;
};
/**
 * A sum of two singles cut toward zero. The double sum can lose an addend far smaller than the
 * other (x + 1e-22 is x in double); the cut must still see it: a sum that lands on a single with
 * a remainder of the opposite sign is one step nearer zero. Denormal results flush as in `f`.
 */
export const add = (a, b) => {
  const x = a + b;
  const near = Math.fround(x);
  if (near !== x || !Number.isFinite(x)) return f(x);
  const part = x - a, rest = (a - (x - part)) + (b - part);
  if (rest === 0 || x === 0) return f(x);
  return f((rest > 0) === (x > 0) ? near : down(near));
};
export const sub = (a, b) => add(a, -b);
export const down = (x) => { bits.setFloat32(0, x); bits.setUint32(0, bits.getUint32(0) - 1); return bits.getFloat32(0); };
export const floatBits = (x) => { bits.setFloat32(0, x); return bits.getUint32(0); };
export const asFloat = (u32) => { bits.setUint32(0, u32 >>> 0); return bits.getFloat32(0); };
/** cvt.w.s and VU ftoi: toward zero, saturating. */
export const toInt = (x) => (x >= 2147483647 ? 2147483647 : x <= -2147483648 ? -2147483648 : Math.trunc(x));
export const toUnsigned = (x) => (x > 0 ? Math.trunc(x) >>> 0 : 0);
export const s16 = (x) => (x << 16) >> 16;
export const u16 = (x) => x & 0xffff;
export const big = (x) => BigInt.asUintN(64, BigInt(x));
export const vector = (buffer, at = 0) => [0, 4, 8, 12].map((k) => buffer.readFloatLE(at + k));
export const matrix = (buffer, at = 0) => [0, 16, 32, 48].map((k) => vector(buffer, at + k));
export const ints = (buffer, at = 0, count = 4) => Array.from({ length: count }, (_, i) => buffer.readInt32LE(at + i * 4));

export const REG = { PRIM: 0x00, RGBAQ: 0x01, ST: 0x02, UV: 0x03, XYZF2: 0x04, XYZ2: 0x05, TEX0: 0x06, CLAMP: 0x08, TEX1: 0x14, XYOFFSET: 0x18,
  PRMODECONT: 0x1a, TEXA: 0x3b, TEXFLUSH: 0x3f, SCISSOR: 0x40, ALPHA: 0x42, DTHE: 0x45, COLCLAMP: 0x46, TEST: 0x47, PABE: 0x49, FBA: 0x4a,
  FRAME: 0x4c, ZBUF: 0x4e, UNKNOWN_7F: 0x7f };

// sceVu0ApplyMatrix: VMULAx, VMADDAy, VMADDAz, VMADDw. sceVu0MulMatrix(out, a, b): each row of b through a.
export const apply = (m, v) => [0, 1, 2, 3].map((i) => add(add(add(f(m[0][i] * v[0]), f(m[1][i] * v[1])), f(m[2][i] * v[2])), f(m[3][i] * v[3])));
export const mul = (a, b) => b.map((row) => apply(a, row));
export const unit = () => [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];

// The clock's sine: a quarter wave of 0x4001 entries; the divisor is 16385.
const SINE = Float32Array.from({ length: 0x4001 }, (_, i) => Math.sin((i * 1.5707963267948966) / 16385));
export const sin = (angle) => {
  const a = s16(angle);
  let v = a < 0 ? -a : a;
  if (v >= 0x4000) v = 0x8000 - v;
  return a < 0 ? -SINE[v] : SINE[v];
};
export const cos = (angle) => sin(s16(angle) + 0x4000);

/** The ramp object { length, counter, changed, state }: one frame's tick, in place. */
export function tickRamp(ramp) {
  ramp.writeInt32LE(0, 8);
  const state = ramp.readInt32LE(12);
  if (state === 1) {
    const counter = ramp.readInt32LE(4) + 1;
    ramp.writeInt32LE(counter, 4);
    if (counter === ramp.readInt32LE(0)) { ramp.writeInt32LE(1, 8); ramp.writeInt32LE(2, 12); }
  } else if (state === 3) {
    const counter = ramp.readInt32LE(4) - 1;
    ramp.writeInt32LE(counter, 4);
    if (counter === 0) { ramp.writeInt32LE(1, 8); ramp.writeInt32LE(0, 12); }
  }
}
