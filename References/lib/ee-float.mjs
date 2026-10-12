// The EE's single-precision arithmetic, as its FPU and VU0 do it: every result cut toward zero,
// no denormals (a result below the smallest normal number is a signed zero), no infinities (a
// result past the largest single is the largest single, and so is a division by zero).
//
// Each operation takes singles (JS numbers holding single values) and returns a single. The
// result is exact: a double holds the product of two singles exactly, and the sum, quotient and
// square root are corrected where the double result alone cannot tell the cut.

const bits = new DataView(new ArrayBuffer(4));
export const MAX = 3.4028234663852886e38;
export const MIN_NORMAL = 1.1754943508222875e-38;

export const floatBits = (x) => { bits.setFloat32(0, x); return bits.getUint32(0); };
export const asFloat = (u32) => { bits.setUint32(0, u32 >>> 0); return bits.getFloat32(0); };
/** The single one step nearer zero. */
export const down = (x) => { bits.setFloat32(0, x); bits.setUint32(0, bits.getUint32(0) - 1); return bits.getFloat32(0); };

const flush = (x) => (x !== 0 && Math.abs(x) < MIN_NORMAL ? (x < 0 ? -0 : 0) : x);
/** A denormal input read as the EE reads it: as zero. */
export const flushIn = flush;

/** A double cut toward zero to a single, saturated and flushed. */
export const f = (x) => {
  if (Number.isNaN(x)) return x;
  if (x >= MAX) return MAX;
  if (x <= -MAX) return -MAX;
  let near = Math.fround(x);
  if (Math.abs(near) > Math.abs(x)) near = down(near);
  return flush(near);
};

/** add.s, vadd: exact sum cut toward zero. */
export const add = (a, b) => {
  const x = a + b;
  const near = Math.fround(x);
  if (near !== x || !Number.isFinite(x)) return f(x);
  // x is a single: the cut moves it only when the lost remainder points toward zero.
  const part = x - a;
  const rest = (a - (x - part)) + (b - part);
  if (rest === 0 || x === 0) return f(x);
  return f((rest > 0) === (x > 0) ? x : down(x));
};
export const sub = (a, b) => add(a, -b);
/** mul.s, vmul: the product of two singles is exact in a double. */
export const mul = (a, b) => f(a * b);
/** div.s, vdiv. */
export const div = (a, b) => {
  if (b === 0) return (Object.is(a, -0) || a < 0) !== Object.is(b, -0) ? -MAX : MAX;
  let q = f(a / b);
  if (q !== 0 && Math.abs(q) !== MAX && Math.abs(q * b) > Math.abs(a)) q = flush(down(q));
  return q;
};
/** sqrt.s, vsqrt: of the absolute value. */
export const sqrt = (a) => {
  const x = Math.abs(a);
  let r = f(Math.sqrt(x));
  while (r !== 0 && r * r > x) r = down(r);
  return flush(r);
};
/** madd.s style: a product cut, then the sum cut (two operations, as the EE does them). */
export const madd = (acc, a, b) => add(acc, mul(a, b));

/** cvt.w.s and VU ftoi0: toward zero, saturating. */
export const toInt = (x) => (x >= 2147483647 ? 2147483647 : x <= -2147483648 ? -2147483648 : Math.trunc(x));
export const toUnsigned = (x) => (x > 0 ? Math.trunc(x) >>> 0 : 0);
export const s16 = (x) => (x << 16) >> 16;
export const u16 = (x) => x & 0xffff;
