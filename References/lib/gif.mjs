// GS register numbers as the verifiers name them.
export const REG = { PRIM: 0x00, RGBAQ: 0x01, ST: 0x02, UV: 0x03, XYZF2: 0x04, XYZ2: 0x05, TEX0: 0x06, CLAMP: 0x08, TEX1: 0x14, XYOFFSET: 0x18,
  PRMODECONT: 0x1a, TEXA: 0x3b, TEXFLUSH: 0x3f, SCISSOR: 0x40, ALPHA: 0x42, DTHE: 0x45, COLCLAMP: 0x46, TEST: 0x47, PABE: 0x49, FBA: 0x4a,
  FRAME: 0x4c, ZBUF: 0x4e, UNKNOWN_7F: 0x7f };
export const REG_NAME = Object.fromEntries(Object.entries(REG).map(([name, value]) => [value, name]));
export const big = (x) => BigInt.asUintN(64, BigInt(x));
export const rgba = (c) => ((c[0] | (c[1] << 8) | (c[2] << 16) | (c[3] << 24)) >>> 0);
