#pragma once
#include <array>
#include <cstdint>

#include "Assets/Bytes.hpp"
#include "Audio/spu2/Core.hpp"

namespace audio::spu2 {

struct Stereo {
    int32_t left = 0, right = 0;
};

enum class ReverbPath { Avx, Sse };

int16_t reverbFilter(const std::array<int16_t, 128>& history, uint32_t position, bool up, ReverbPath path);
Stereo runReverb(Core& core, assets::Bytes& ram, uint32_t cycles, Stereo input, ReverbPath path);

}
