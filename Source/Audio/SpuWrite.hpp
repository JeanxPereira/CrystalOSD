#pragma once
#include <array>
#include <cstddef>
#include <cstdint>
#include <optional>
#include <vector>

namespace audio {

struct SpuWrite {
    uint32_t frame = 0;
    uint32_t sample = 0;
    uint32_t address = 0;
    uint16_t value = 0;
    uint32_t cycle = 0;
    uint32_t resume = 0;
};

struct DriverCommand {
    uint32_t frame = 0;
    uint64_t sample = 0;
    uint32_t id = 0;
    std::array<uint32_t, 5> words{};
};

using WriteStream = std::vector<SpuWrite>;

bool sameWrite(const SpuWrite& a, const SpuWrite& b);
std::optional<size_t> firstDifference(const WriteStream& expected, const WriteStream& actual);

}
