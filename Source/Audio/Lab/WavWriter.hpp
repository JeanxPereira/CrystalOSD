#pragma once
#include <cstdint>
#include <filesystem>
#include <span>
#include <vector>

namespace audio::lab {

void writeWav(const std::filesystem::path& path, std::span<const int16_t> interleavedStereo, uint32_t sampleRate = 48000);
std::vector<int16_t> readWav(const std::filesystem::path& path);

}
