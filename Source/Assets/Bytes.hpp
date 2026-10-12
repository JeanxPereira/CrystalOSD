#pragma once
#include <cstdint>
#include <filesystem>
#include <span>
#include <stdexcept>
#include <vector>

namespace assets {

using Bytes = std::vector<uint8_t>;
using View = std::span<const uint8_t>;

inline uint32_t le32(View d, size_t at) {
    if (at + 4 > d.size()) throw std::runtime_error("read past the end");
    return uint32_t(d[at]) | uint32_t(d[at + 1]) << 8 | uint32_t(d[at + 2]) << 16 | uint32_t(d[at + 3]) << 24;
}
inline uint16_t le16(View d, size_t at) {
    if (at + 2 > d.size()) throw std::runtime_error("read past the end");
    return uint16_t(d[at] | d[at + 1] << 8);
}
inline uint64_t le64(View d, size_t at) { return uint64_t(le32(d, at)) | uint64_t(le32(d, at + 4)) << 32; }
inline uint32_t be32(View d, size_t at) {
    if (at + 4 > d.size()) throw std::runtime_error("read past the end");
    return uint32_t(d[at]) << 24 | uint32_t(d[at + 1]) << 16 | uint32_t(d[at + 2]) << 8 | uint32_t(d[at + 3]);
}

Bytes readFile(const std::filesystem::path& path);
void writeFile(const std::filesystem::path& path, View data);
// FNV-1a, 64 bits: the cache key of a source file (not a security hash).
uint64_t hashOf(View data);

}
