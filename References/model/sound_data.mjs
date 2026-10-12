// The OSD's sound data path, as the program computes it: the image decrypt, the ROMDIR search, and Expand.
// HDD OSD 1.10U addresses first; ROM 2.30 has the same Expand code (diff_rom.mjs: only the state's address differs).
//
// Expand: ExpandInit 0x00200D10 (ROM 0x00200CF8), ExpandSetBlock 0x00200D30, ExpandMain 0x00200DB8
//   (ROM 0x00200D9C), Expand 0x00200EE8 (ROM 0x00200ED0), ExpandGetSize 0x00200F20 (ROM 0x00200F08).
// Decrypt (HDD OSD only): do_load_resources 0x0020AB98 (the loop at 0x0020B030), key schedule
//   decryption_xommon1 0x00293D08, initial permutation decryption_common2 0x00293A60, expansion common3
//   0x00293C08, S-boxes common4 0x00293CA8, P permutation common5 0x00293C5C, final permutation common6 0x00293B28.
// ROMDIR: romdir_get_offset 0x0020E418 (ROM 0x0020E930), romdir_search_entry 0x0020E4B0 (ROM 0x0020E9C8).

const M64 = (1n << 64n) - 1n;
const M32 = 0xffffffffn;

/**
 * Expand: the stream is {u32 size, then blocks}. A block starts with a 4-byte big-endian flag word
 * (ExpandSetBlock: its low 2 bits are the mode m, the match offset mask is 0x3FFF >> m and the length
 * shift 14 - m) and holds 30 items; item k is a match when flag bit 31 - k is set. A literal is one
 * byte. A match is two bytes b0 b1, w = b0 << 8 | b1: it copies (w >> (14 - m)) + 3 bytes, one at a
 * time, from (w & (0x3FFF >> m)) + 1 bytes back. The loop stops when the output holds `size` bytes,
 * or more (a match may run past it: `produced` counts every byte written).
 * Returns { size, out (the first `size` bytes), produced, consumed (the stream's bytes read) }.
 */
export function expand(src, at) {
  const size = src.readUInt32LE(at);
  const out = Buffer.alloc(size + 64);
  let pos = at + 4;
  let produced = 0;
  let counter = 0;
  let flags = 0;
  let shift = 0;
  let mask = 0;
  for (;;) {
    if (counter === 0) {
      flags = src.readUInt32BE(pos) >>> 0;
      pos += 4;
      const mode = flags & 3;
      mask = 0x3fff >> mode;
      shift = 14 - mode;
      counter = 30;
    }
    const first = src[pos++];
    if ((flags & 0x80000000) !== 0) {
      const word = (first << 8) | src[pos++];
      let from = produced - ((word & mask) + 1);
      if (from < 0) throw new Error(`Expand: a match reaches before the output (at ${produced})`);
      const count = (word >>> shift) + 2;
      out[produced++] = out[from++];
      for (let k = 0; k < count; k++) out[produced++] = out[from++];
    } else {
      out[produced++] = first;
    }
    if (produced === size || size < produced) break;
    counter -= 1;
    flags = (flags << 1) >>> 0;
  }
  return { size, out: out.subarray(0, size), produced, consumed: pos - at };
}

/** ExpandGetSize: the first word of the stream. */
export const expandSize = (src, at) => src.readUInt32LE(at);

/**
 * The tables the cipher reads, from memory (HDD OSD 1.10U): expansion D_0036D940 (32 qwords),
 * P permutation D_0036DA40 (32 words), S-boxes D_0036DAC0 (8 x 64 bytes), PC-1 D_0036DCC0 (56 bytes),
 * PC-2 D_0036DD00 (48 bytes).
 */
export const CIPHER_TABLES = { expansion: 0x0036d940, permutation: 0x0036da40, sboxes: 0x0036dac0, pc1: 0x0036dcc0, pc2: 0x0036dd00 };
export const CIPHER_TABLE_SIZES = { expansion: 0x100, permutation: 0x80, sboxes: 0x200, pc1: 0x38, pc2: 0x30 };

/** The 64-bit key as do_load_resources builds it from D_002AD970 (low) and D_002AD978 (high). */
export const imageKey = (low, high) => BigInt.asUintN(64, ((high ^ 0x2cbadb31cccb12f6n) - 5n) - low);

/** decryption_xommon1: the 16 round keys, in the order it stores them. */
export function keySchedule(tables, key) {
  let permuted = 0n;
  let place = 1n << 63n;
  for (let i = 0; i < 56; i++) {
    if ((key & (1n << BigInt(tables.pc1[i] & 63))) !== 0n) permuted |= place;
    place >>= 1n;
  }
  let left = permuted >> 36n;
  let right = (permuted >> 8n) & 0x0fffffffn;
  const keys = [];
  for (let round = 16; round >= 1; round--) {
    const one = round >= 15 || round === 8 || round === 1;
    if (one) {
      left = ((left << 1n) | ((left >> 27n) & 1n)) & 0x0fffffffn;
      right = ((right << 1n) | ((right >> 27n) & 1n)) & 0x0fffffffn;
    } else {
      left = ((left << 2n) | ((left >> 26n) & 3n)) & 0x0fffffffn;
      right = ((right << 2n) | ((right >> 26n) & 3n)) & 0x0fffffffn;
    }
    const joined = (left << 36n) | (right << 8n);
    let subkey = 0n;
    place = 1n << 63n;
    for (let i = 0; i < 48; i++) {
      if ((joined & (1n << BigInt(tables.pc2[i] & 63))) !== 0n) subkey |= place;
      place >>= 1n;
    }
    keys.push(subkey);
  }
  return keys;
}

const initialPermutation = (block) => {
  let high = 0n;
  let low = 0n;
  for (let byte = 8; byte >= 1; byte--) {
    const unit = 1n << BigInt(byte - 1);
    if (block & 0x01n) high |= unit << 32n;
    if (block & 0x02n) low |= unit;
    if (block & 0x04n) high |= unit << 40n;
    if (block & 0x08n) low |= unit << 8n;
    if (block & 0x10n) high |= unit << 48n;
    if (block & 0x20n) low |= unit << 16n;
    if (block & 0x40n) high |= unit << 56n;
    if (block & 0x80n) low |= unit << 24n;
    block >>= 8n;
  }
  return (high | low) & M64;
};

const finalPermutation = (block) => {
  let high = 0n;
  let low = 0n;
  for (let byte = 0; byte < 8; byte++) {
    const unit = 1n << BigInt(((byte >> 2) ^ 1) | ((byte & 3) << 1));
    if (block & 0x01n) high |= unit << 56n;
    if (block & 0x02n) low |= unit << 48n;
    if (block & 0x04n) high |= unit << 40n;
    if (block & 0x08n) low |= unit << 32n;
    if (block & 0x10n) high |= unit << 24n;
    if (block & 0x20n) low |= unit << 16n;
    if (block & 0x40n) high |= unit << 8n;
    if (block & 0x80n) low |= unit;
    block >>= 8n;
  }
  return (high | low) & M64;
};

const expansionOf = (tables, half) => {
  let out = 0n;
  for (let i = 0; i < 32; i++) if (((half >> BigInt(32 + i)) & 1n) !== 0n) out |= tables.expansion.readBigUInt64LE(8 * i);
  return out;
};

const substitution = (tables, value) => {
  let out = 0n;
  let shift = 32n;
  for (let box = 0; box < 8; box++) {
    const index = Number((value & 0x20n) | ((value >> 1n) & 0xfn) | ((value << 4n) & 0x10n));
    out |= BigInt(tables.sboxes[64 * box + index]) << shift;
    shift += 4n;
    value >>= 6n;
  }
  return out;
};

const permutationOf = (tables, value) => {
  let out = 0n;
  for (let i = 0; i < 32; i++) if (((value >> BigInt(32 + i)) & 1n) !== 0n) out |= BigInt(tables.permutation.readUInt32LE(4 * i));
  return (out << 32n) & M64;
};

/** One 8-byte block of the image, decrypted with the round keys of keySchedule (last key first). */
export function decryptBlock(tables, keys, block) {
  const start = initialPermutation(block);
  let left = (start & M32) << 32n;
  let right = start & (M32 << 32n);
  let next = 0n;
  for (let round = 15; round >= 0; round--) {
    const mixed = expansionOf(tables, left) ^ keys[round];
    next = permutationOf(tables, substitution(tables, mixed >> 16n)) ^ right;
    right = left;
    left = next;
  }
  return finalPermutation((next | (right >> 32n)) & M64);
}

/**
 * The loop at 0x0020B030: of the file's 8-byte blocks only the first 64 of every 512 are decrypted
 * (and only when the file has more than 63 blocks); the rest, and the tail of fewer than 8 bytes, stay as read.
 */
export function decryptImage(file, tables, key) {
  const keys = keySchedule(tables, key);
  const out = Buffer.from(file);
  const blocks = file.length >> 3;
  if (blocks > 0x3f) {
    for (let base = 0; blocks > base + 0x3f; base += 0x200) {
      for (let k = 0; k < 0x40; k++) out.writeBigUInt64LE(decryptBlock(tables, keys, file.readBigUInt64LE(8 * (base + k))), 8 * (base + k));
    }
  }
  return out;
}

const nameOf = (buffer, at) => {
  let end = at;
  while (end < at + 10 && buffer[end] !== 0) end++;
  return buffer.toString('latin1', at, end);
};

/**
 * romdir_get_offset: the first 16-byte entry named RESET whose size, rounded up to 16, equals the entry's
 * own byte offset (0 for a plain archive). Returns the entry's offset in the buffer, or -1.
 */
export function romdirStart(buffer, limit = 0x2000) {
  for (let at = 0; at < limit; at += 16) {
    if (buffer.readUInt32LE(at) !== 0x45534552 || buffer.readUInt32LE(at + 4) !== 0x54 || buffer.readInt16LE(at + 8) !== 0) continue;
    if (((buffer.readUInt32LE(at + 12) + 15) & ~15) === at) return at;
  }
  return -1;
}

/**
 * romdir_search_entry over the whole directory: every entry {name, size, offset}, the data
 * offset of an entry being the sum of the previous entries' sizes rounded up to 16 (from the directory's
 * first entry), as the search accumulates it in t2.
 */
export function romdirEntries(buffer, start) {
  const entries = [];
  let offset = 0;
  for (let at = start; buffer.readUInt32LE(at) !== 0; at += 16) {
    const size = buffer.readUInt32LE(at + 12);
    entries.push({ name: nameOf(buffer, at), size, offset });
    offset += (size + 15) & ~15;
  }
  return entries;
}
