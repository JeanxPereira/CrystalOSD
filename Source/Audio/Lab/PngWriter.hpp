#pragma once
#include <cstdint>
#include <filesystem>
#include <span>

namespace audio::lab {

void writePng(const std::filesystem::path& path, uint32_t width, uint32_t height, std::span<const uint8_t> rgb);

}
