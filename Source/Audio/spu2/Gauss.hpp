#pragma once
#include <array>
#include <cstdint>

namespace audio::spu2 {

int16_t gaussTap(uint32_t index);
int32_t interpolate(const std::array<int16_t, 4>& samples, uint32_t counter);

}
