#include "Assets/Expand.hpp"

#include <string>

namespace assets {

// References/model/sound_data.mjs expand: a match copies (w >> (14 - m)) + 3 bytes from (w & (0x3FFF >> m)) + 1 back;
// the loop stops once the output holds `size` bytes or more.
Expanded expand(View src, size_t at, size_t maxSize) {
    Expanded r;
    r.size = le32(src, at);
    // A match of two bytes gives at most 34 (mode 3: 31 + 3), so a stream cannot give more than 17 bytes per byte.
    if (r.size > maxSize) throw std::runtime_error("Expand: the stream announces " + std::to_string(r.size) + " bytes, more than " + std::to_string(maxSize));
    if (r.size > (src.size() - at - 4) * 17 + 64) throw std::runtime_error("Expand: the stream announces more bytes than it can hold");
    Bytes out(size_t(r.size) + 64);
    size_t pos = at + 4, produced = 0;
    uint32_t counter = 0, flags = 0, shift = 0, mask = 0;
    const auto byte = [&]() -> uint8_t {
        if (pos >= src.size()) throw std::runtime_error("Expand: the stream ends early");
        return src[pos++];
    };
    const auto put = [&](uint8_t value) {
        if (produced >= out.size()) out.resize(out.size() * 2);
        out[produced++] = value;
    };
    for (;;) {
        if (counter == 0) {
            flags = be32(src, pos);
            pos += 4;
            const uint32_t mode = flags & 3;
            mask = 0x3fffu >> mode;
            shift = 14 - mode;
            counter = 30;
        }
        const uint8_t first = byte();
        if (flags & 0x80000000u) {
            const uint32_t word = uint32_t(first) << 8 | byte();
            const size_t back = (word & mask) + 1;
            if (back > produced) throw std::runtime_error("Expand: a match reaches before the output (at " + std::to_string(produced) + ")");
            size_t from = produced - back;
            const uint32_t count = (word >> shift) + 3;
            for (uint32_t k = 0; k < count; ++k) put(out[from++]);
        } else {
            put(first);
        }
        if (produced >= r.size) break;
        counter -= 1;
        flags <<= 1;
    }
    out.resize(r.size);
    r.out = std::move(out);
    r.produced = produced;
    r.consumed = pos - at;
    return r;
}

}
