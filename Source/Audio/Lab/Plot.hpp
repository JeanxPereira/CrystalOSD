#pragma once
#include <cstdint>
#include <span>
#include <vector>

namespace audio::lab {

struct Image {
    uint32_t width = 0, height = 0;
    std::vector<uint8_t> rgb;
};

struct Distance {
    uint64_t differ = 0;
    int64_t maxAbs = 0;
    double rms = 0;
};

Image plotWaveform(std::span<const int16_t> interleavedStereo, uint32_t width, uint32_t height);
Image plotSpectrum(std::span<const int16_t> interleavedStereo, uint32_t sampleRate, uint32_t width, uint32_t height);
Distance distance(std::span<const int16_t> a, std::span<const int16_t> b);

}
