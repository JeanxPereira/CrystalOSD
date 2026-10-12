// Per 128-byte chunk: 3 bytes (column parity, line parity 0, line parity 1), the Hamming code of
// the public memory card format description (Ridge, ps2mcfs). Initial value 0x77, 0x7F, 0x7F.
const parity = (v) => { v ^= v >> 4; v ^= v >> 2; v ^= v >> 1; return v & 1; };
const columnMask = (b) => {
  const bit = (n) => (b >> n) & 1;
  const c0 = bit(1) ^ bit(3) ^ bit(5) ^ bit(7);
  const c1 = bit(0) ^ bit(2) ^ bit(4) ^ bit(6);
  const c2 = bit(2) ^ bit(3) ^ bit(6) ^ bit(7);
  const c3 = bit(0) ^ bit(1) ^ bit(4) ^ bit(5);
  const c4 = bit(4) ^ bit(5) ^ bit(6) ^ bit(7);
  const c5 = bit(0) ^ bit(1) ^ bit(2) ^ bit(3);
  return c1 | (c3 << 1) | (c5 << 2) | (c0 << 4) | (c2 << 5) | (c4 << 6);
};
const CHUNK = 128;
export const eccChunk = (chunk) => {
  let column = 0x77, line0 = 0x7f, line1 = 0x7f;
  for (let i = 0; i < chunk.length; i++) {
    const b = chunk[i];
    column ^= columnMask(b);
    if (parity(b)) { line0 ^= ~i & 0x7f; line1 ^= i; }
  }
  return [column, line0 & 0x7f, line1];
};
export const eccPage = (data) => {
  const out = [];
  for (let c = 0; c < data.length / CHUNK; c++) out.push(...eccChunk(data.subarray(c * CHUNK, (c + 1) * CHUNK)));
  return out;
};
