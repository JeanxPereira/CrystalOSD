#pragma once
#include "Parity/Fixture.hpp"
#include <array>

namespace parity {
struct Difference {
    uint64_t pixels{0}, differing{0};
    uint32_t largest{0};
    std::array<uint64_t, 5> buckets{};
    Difference& operator+=(const Difference& other);
};
struct PixelDifference {
    uint32_t x{0}, y{0}, delta{0};
};
Difference compare(const Image& ours, const Image& oracle);
Difference compare(const DepthImage& ours, const DepthImage& oracle);
std::vector<PixelDifference> differingPixels(const Image& ours, const Image& oracle);
std::vector<PixelDifference> differingPixels(const DepthImage& ours, const DepthImage& oracle);
Image differenceImage(const Image& ours, const Image& oracle, uint32_t gain);
}
