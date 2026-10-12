#include "Assets/ImageCipher.hpp"

namespace assets {

namespace {

// The program's addresses (HDD OSD 1.10U, References/model/sound_data.mjs CIPHER_TABLES): the expansion, P permutation,
// S-box, PC-1 and PC-2 tables, and the two key words do_load_resources reads (D_002AD970, D_002AD978).
constexpr uint32_t kExpansion = 0x0036d940, kPermutation = 0x0036da40, kSboxes = 0x0036dac0, kPc1 = 0x0036dcc0, kPc2 = 0x0036dd00, kKeyWords = 0x002ad970;
// do_load_resources builds the key from its two words with this constant (sound_data.mjs imageKey).
constexpr uint64_t kKeyMix = 0x2cbadb31cccb12f6ull;
constexpr uint64_t kHigh32 = 0xffffffff00000000ull, kLow32 = 0xffffffffull;

Bytes copyOf(View v) { return Bytes(v.begin(), v.end()); }

uint64_t initialPermutation(uint64_t block) {
    uint64_t high = 0, low = 0;
    for (int byte = 8; byte >= 1; --byte) {
        const uint64_t unit = 1ull << (byte - 1);
        if (block & 0x01) high |= unit << 32;
        if (block & 0x02) low |= unit;
        if (block & 0x04) high |= unit << 40;
        if (block & 0x08) low |= unit << 8;
        if (block & 0x10) high |= unit << 48;
        if (block & 0x20) low |= unit << 16;
        if (block & 0x40) high |= unit << 56;
        if (block & 0x80) low |= unit << 24;
        block >>= 8;
    }
    return high | low;
}

uint64_t finalPermutation(uint64_t block) {
    uint64_t high = 0, low = 0;
    for (int byte = 0; byte < 8; ++byte) {
        const uint64_t unit = 1ull << (((byte >> 2) ^ 1) | ((byte & 3) << 1));
        if (block & 0x01) high |= unit << 56;
        if (block & 0x02) low |= unit << 48;
        if (block & 0x04) high |= unit << 40;
        if (block & 0x08) low |= unit << 32;
        if (block & 0x10) high |= unit << 24;
        if (block & 0x20) low |= unit << 16;
        if (block & 0x40) high |= unit << 8;
        if (block & 0x80) low |= unit;
        block >>= 8;
    }
    return high | low;
}

uint64_t expansionOf(const CipherTables& t, uint64_t half) {
    uint64_t out = 0;
    for (int i = 0; i < 32; ++i)
        if ((half >> (32 + i)) & 1) out |= le64(t.expansion, size_t(8) * i);
    return out;
}

uint64_t substitution(const CipherTables& t, uint64_t value) {
    uint64_t out = 0;
    for (int box = 0, shift = 32; box < 8; ++box, shift += 4) {
        const size_t index = size_t((value & 0x20) | ((value >> 1) & 0xf) | ((value << 4) & 0x10));
        out |= uint64_t(t.sboxes.at(size_t(64) * box + index)) << shift;
        value >>= 6;
    }
    return out;
}

uint64_t permutationOf(const CipherTables& t, uint64_t value) {
    uint64_t out = 0;
    for (int i = 0; i < 32; ++i)
        if ((value >> (32 + i)) & 1) out |= le32(t.permutation, size_t(4) * i);
    return out << 32;
}

uint64_t rotate28(uint64_t half, int by) { return ((half << by) | (half >> (28 - by))) & 0x0fffffff; }

}  // namespace

CipherTables CipherTables::fromProgram(const ElfImage& program) {
    CipherTables t;
    t.expansion = copyOf(program.bytes(kExpansion, 0x100));
    t.permutation = copyOf(program.bytes(kPermutation, 0x80));
    t.sboxes = copyOf(program.bytes(kSboxes, 0x200));
    t.pc1 = copyOf(program.bytes(kPc1, 0x38));
    t.pc2 = copyOf(program.bytes(kPc2, 0x30));
    const View words = program.bytes(kKeyWords, 16);
    t.key = ((le64(words, 8) ^ kKeyMix) - 5) - le64(words, 0);
    return t;
}

std::array<uint64_t, 16> keySchedule(const CipherTables& t) {
    uint64_t permuted = 0, place = 1ull << 63;
    for (int i = 0; i < 56; ++i, place >>= 1)
        if ((t.key >> (t.pc1[i] & 63)) & 1) permuted |= place;
    uint64_t left = permuted >> 36, right = (permuted >> 8) & 0x0fffffff;
    std::array<uint64_t, 16> keys{};
    for (int round = 16, n = 0; round >= 1; --round, ++n) {
        const int by = (round >= 15 || round == 8 || round == 1) ? 1 : 2;
        left = rotate28(left, by);
        right = rotate28(right, by);
        const uint64_t joined = (left << 36) | (right << 8);
        uint64_t subkey = 0;
        place = 1ull << 63;
        for (int i = 0; i < 48; ++i, place >>= 1)
            if ((joined >> (t.pc2[i] & 63)) & 1) subkey |= place;
        keys[size_t(n)] = subkey;
    }
    return keys;
}

uint64_t decryptBlock(const CipherTables& t, const std::array<uint64_t, 16>& keys, uint64_t block) {
    const uint64_t start = initialPermutation(block);
    uint64_t left = (start & kLow32) << 32, right = start & kHigh32, next = 0;
    for (int round = 15; round >= 0; --round) {
        const uint64_t mixed = expansionOf(t, left) ^ keys[size_t(round)];
        next = permutationOf(t, substitution(t, mixed >> 16)) ^ right;
        right = left;
        left = next;
    }
    return finalPermutation(next | (right >> 32));
}

// The loop at 0x0020B030: the first 64 of every 512 blocks of 8 bytes, when the file has more than 63.
Bytes decryptImage(View file, const CipherTables& t) {
    const auto keys = keySchedule(t);
    Bytes out(file.begin(), file.end());
    const size_t blocks = file.size() >> 3;
    if (blocks > 0x3f) {
        for (size_t base = 0; blocks > base + 0x3f; base += 0x200)
            for (size_t k = 0; k < 0x40; ++k) {
                const uint64_t plain = decryptBlock(t, keys, le64(file, 8 * (base + k)));
                for (int b = 0; b < 8; ++b) out[8 * (base + k) + size_t(b)] = uint8_t(plain >> (8 * b));
            }
    }
    return out;
}

}
