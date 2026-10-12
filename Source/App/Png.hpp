#pragma once
#include <cstdint>
#include <filesystem>
#include <span>

namespace app {

// An 8-bit RGBA PNG, stored without compression.
void writePng(const std::filesystem::path& path, uint32_t width, uint32_t height, std::span<const uint8_t> rgba);

}
