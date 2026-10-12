// Reading probed memory.
export const vector = (buffer, at = 0) => [0, 4, 8, 12].map((k) => buffer.readFloatLE(at + k));
export const matrix = (buffer, at = 0) => [0, 16, 32, 48].map((k) => vector(buffer, at + k));
export const ints = (buffer, at = 0, count = 4) => Array.from({ length: count }, (_, i) => buffer.readInt32LE(at + i * 4));
/** The bytes of a probe's i-th range; throws when it was not readable. */
export const bytesOf = (record, i) => {
  const range = record.mem[i];
  if (!range || !range.bytes) throw new Error(`probe 0x${record.pc.toString(16)} range ${i} was not readable`);
  return range.bytes;
};
