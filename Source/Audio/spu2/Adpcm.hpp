#pragma once
#include <array>
#include <cstdint>

namespace audio::spu2 {

struct AdpcmState {
    int32_t prev1 = 0, prev2 = 0;
};

struct AdpcmBlock {
    std::array<int16_t, 28> pcm;
    bool loopStart, loopEnd, loopRepeat;
};

AdpcmBlock decodeBlock(const uint8_t* block, AdpcmState& state);

}
