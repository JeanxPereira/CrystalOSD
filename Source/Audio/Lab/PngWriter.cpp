#include "Audio/Lab/PngWriter.hpp"

#include <algorithm>
#include <array>
#include <fstream>
#include <stdexcept>
#include <vector>

namespace audio::lab {

namespace {
uint32_t crc32(const uint8_t* data, size_t size, uint32_t crc = 0) {
    static const auto table = [] {
        std::array<uint32_t, 256> t{};
        for (uint32_t i = 0; i < 256; ++i) {
            uint32_t c = i;
            for (int k = 0; k < 8; ++k) c = (c & 1) ? 0xEDB88320u ^ (c >> 1) : c >> 1;
            t[i] = c;
        }
        return t;
    }();
    crc = ~crc;
    for (size_t i = 0; i < size; ++i) crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >> 8);
    return ~crc;
}
uint32_t adler32(const std::vector<uint8_t>& d) {
    uint32_t a = 1, b = 0;
    for (uint8_t x : d) {
        a = (a + x) % 65521;
        b = (b + a) % 65521;
    }
    return b << 16 | a;
}
void be32(std::vector<uint8_t>& o, uint32_t v) {
    for (int s = 24; s >= 0; s -= 8) o.push_back(uint8_t(v >> s));
}
void chunk(std::vector<uint8_t>& out, const char type[4], const std::vector<uint8_t>& body) {
    be32(out, uint32_t(body.size()));
    const size_t from = out.size();
    out.insert(out.end(), type, type + 4);
    out.insert(out.end(), body.begin(), body.end());
    be32(out, crc32(out.data() + from, out.size() - from));
}
}

void writePng(const std::filesystem::path& path, uint32_t width, uint32_t height, std::span<const uint8_t> rgb) {
    if (width == 0 || height == 0 || rgb.size() != size_t(width) * height * 3) throw std::runtime_error(path.string() + ": bad image size");
    std::vector<uint8_t> raw;
    raw.reserve(size_t(height) * (width * 3 + 1));
    for (uint32_t y = 0; y < height; ++y) {
        raw.push_back(0);
        raw.insert(raw.end(), rgb.begin() + size_t(y) * width * 3, rgb.begin() + size_t(y + 1) * width * 3);
    }
    std::vector<uint8_t> z{0x78, 0x01};
    for (size_t at = 0;;) {
        const size_t n = std::min<size_t>(65535, raw.size() - at);
        const bool last = at + n >= raw.size();
        z.push_back(last ? 1 : 0);
        z.push_back(uint8_t(n));
        z.push_back(uint8_t(n >> 8));
        z.push_back(uint8_t(~n));
        z.push_back(uint8_t(~n >> 8));
        z.insert(z.end(), raw.begin() + at, raw.begin() + at + n);
        at += n;
        if (last) break;
    }
    be32(z, adler32(raw));
    std::vector<uint8_t> out{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};
    std::vector<uint8_t> ihdr;
    be32(ihdr, width);
    be32(ihdr, height);
    ihdr.insert(ihdr.end(), {8, 2, 0, 0, 0});
    chunk(out, "IHDR", ihdr);
    chunk(out, "IDAT", z);
    chunk(out, "IEND", {});
    if (path.has_parent_path()) std::filesystem::create_directories(path.parent_path());
    std::ofstream f(path, std::ios::binary);
    if (!f) throw std::runtime_error(path.string() + ": cannot write");
    f.write(reinterpret_cast<const char*>(out.data()), std::streamsize(out.size()));
    if (!f) throw std::runtime_error(path.string() + ": write failed");
}

}
