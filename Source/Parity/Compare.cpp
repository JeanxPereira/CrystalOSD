#include "Parity/Compare.hpp"
#include <algorithm>
#include <cstdlib>
#include <stdexcept>

namespace parity {
namespace {
void count(Difference& d, uint32_t delta) {
    d.pixels++;
    if (delta) d.differing++;
    d.largest = std::max(d.largest, delta);
    d.buckets[delta == 0 ? 0 : delta == 1 ? 1 : delta < 4 ? 2 : delta < 16 ? 3 : 4]++;
}
}  // namespace

Difference& Difference::operator+=(const Difference& other) {
    pixels += other.pixels;
    differing += other.differing;
    largest = std::max(largest, other.largest);
    for (size_t i = 0; i < buckets.size(); i++) buckets[i] += other.buckets[i];
    return *this;
}

Difference compare(const Image& ours, const Image& oracle) {
    if (ours.width != oracle.width || ours.height != oracle.height || ours.rgba.size() != oracle.rgba.size()) throw std::runtime_error("images of different sizes cannot be compared");
    Difference d;
    for (size_t i = 0; i < ours.rgba.size(); i += 4) {
        uint32_t delta = 0;
        for (size_t c = 0; c < 4; c++) delta = std::max(delta, uint32_t(std::abs(int(ours.rgba[i + c]) - int(oracle.rgba[i + c]))));
        count(d, delta);
    }
    return d;
}

Difference compare(const DepthImage& ours, const DepthImage& oracle) {
    if (ours.depth.size() != oracle.depth.size()) throw std::runtime_error("depth images of different sizes cannot be compared");
    Difference d;
    for (size_t i = 0; i < ours.depth.size(); i++) count(d, ours.depth[i] > oracle.depth[i] ? ours.depth[i] - oracle.depth[i] : oracle.depth[i] - ours.depth[i]);
    return d;
}

std::vector<PixelDifference> differingPixels(const Image& ours, const Image& oracle) {
    if (ours.width != oracle.width || ours.height != oracle.height || ours.rgba.size() != oracle.rgba.size()) throw std::runtime_error("images of different sizes cannot be compared");
    std::vector<PixelDifference> out;
    for (size_t i = 0; i < ours.rgba.size(); i += 4) {
        uint32_t delta = 0;
        for (size_t c = 0; c < 4; c++) delta = std::max(delta, uint32_t(std::abs(int(ours.rgba[i + c]) - int(oracle.rgba[i + c]))));
        if (delta) out.push_back({uint32_t((i / 4) % ours.width), uint32_t((i / 4) / ours.width), delta});
    }
    return out;
}

std::vector<PixelDifference> differingPixels(const DepthImage& ours, const DepthImage& oracle) {
    if (ours.width != oracle.width || ours.height != oracle.height || ours.depth.size() != oracle.depth.size()) throw std::runtime_error("depth images of different sizes cannot be compared");
    std::vector<PixelDifference> out;
    for (size_t i = 0; i < ours.depth.size(); i++) {
        const uint32_t delta = ours.depth[i] > oracle.depth[i] ? ours.depth[i] - oracle.depth[i] : oracle.depth[i] - ours.depth[i];
        if (delta) out.push_back({uint32_t(i % ours.width), uint32_t(i / ours.width), delta});
    }
    return out;
}

Image differenceImage(const Image& ours, const Image& oracle, uint32_t gain) {
    if (ours.rgba.size() != oracle.rgba.size()) throw std::runtime_error("images of different sizes cannot be compared");
    Image out{ours.width, ours.height, std::vector<uint8_t>(ours.rgba.size())};
    for (size_t i = 0; i < ours.rgba.size(); i += 4) {
        for (size_t c = 0; c < 3; c++) out.rgba[i + c] = uint8_t(std::min(255u, uint32_t(std::abs(int(ours.rgba[i + c]) - int(oracle.rgba[i + c]))) * gain));
        out.rgba[i + 3] = 255;
    }
    return out;
}

}  // namespace parity
