#include "Audio/spu2/Adpcm.hpp"

#include <algorithm>

namespace audio::spu2 {

namespace {

constexpr int kForward[8] = {0, 60, 115, 98, 122, 0, 0, 0};
constexpr int kBackward[8] = {0, 0, -52, -55, -60, 0, 0, 0};

int16_t clamp16(int32_t x) { return int16_t(std::clamp(x, -32768, 32767)); }

}

AdpcmBlock decodeBlock(const uint8_t* block, AdpcmState& state) {
    AdpcmBlock out{};
    const int shift = block[0] & 15;
    const int filter = block[0] >> 4 & 7;
    out.loopEnd = block[1] & 1;
    out.loopRepeat = block[1] & 2;
    out.loopStart = block[1] & 4;
    int32_t older = state.prev2, newer = state.prev1;
    for (int i = 0; i < 28; ++i) {
        const int nibble = block[2 + i / 2] >> (i & 1 ? 4 : 0) & 15;
        const int32_t raw = int16_t(nibble << 12) >> shift;
        const int32_t predicted = (newer * kForward[filter] + older * kBackward[filter] + 32) >> 6;
        const int16_t sample = clamp16(raw + predicted);
        out.pcm[i] = sample;
        older = newer;
        newer = sample;
    }
    state.prev1 = newer;
    state.prev2 = older;
    return out;
}

}
