#include "App/Png.hpp"

#include <algorithm>
#include <array>
#include <fstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace app {

namespace {

uint32_t crc(const uint8_t* data, size_t size, uint32_t value = 0) {
    static const std::array<uint32_t, 256> table = [] {
        std::array<uint32_t, 256> t{};
        for (uint32_t n = 0; n < 256; ++n) {
            uint32_t c = n;
            for (int k = 0; k < 8; ++k) c = c & 1 ? 0xedb88320u ^ (c >> 1) : c >> 1;
            t[n] = c;
        }
        return t;
    }();
    value = ~value;
    for (size_t i = 0; i < size; ++i) value = table[(value ^ data[i]) & 0xff] ^ (value >> 8);
    return ~value;
}

void big(std::vector<uint8_t>& out, uint32_t v) {
    for (int s = 24; s >= 0; s -= 8) out.push_back(uint8_t(v >> s));
}

void chunk(std::vector<uint8_t>& out, const char* type, const std::vector<uint8_t>& data) {
    big(out, static_cast<uint32_t>(data.size()));
    const size_t start = out.size();
    out.insert(out.end(), type, type + 4);
    out.insert(out.end(), data.begin(), data.end());
    big(out, crc(&out[start], out.size() - start));
}

}  // namespace

void writePng(const std::filesystem::path& path, uint32_t width, uint32_t height, std::span<const uint8_t> rgba) {
    if (rgba.size() != size_t(width) * height * 4) throw std::runtime_error("png: wrong pixel count");
    std::vector<uint8_t> raw;
    raw.reserve((size_t(width) * 4 + 1) * height);
    for (uint32_t y = 0; y < height; ++y) {
        raw.push_back(0);
        raw.insert(raw.end(), rgba.begin() + std::ptrdiff_t(size_t(y) * width * 4), rgba.begin() + std::ptrdiff_t(size_t(y + 1) * width * 4));
    }
    std::vector<uint8_t> z{0x78, 0x01};
    uint32_t a = 1, b = 0;
    for (uint8_t v : raw) {
        a = (a + v) % 65521;
        b = (b + a) % 65521;
    }
    for (size_t at = 0; at < raw.size();) {
        const size_t n = std::min<size_t>(65535, raw.size() - at);
        z.push_back(at + n == raw.size() ? 1 : 0);
        z.push_back(uint8_t(n));
        z.push_back(uint8_t(n >> 8));
        z.push_back(uint8_t(~n));
        z.push_back(uint8_t(~n >> 8));
        z.insert(z.end(), raw.begin() + std::ptrdiff_t(at), raw.begin() + std::ptrdiff_t(at + n));
        at += n;
    }
    big(z, (b << 16) | a);

    std::vector<uint8_t> header;
    big(header, width);
    big(header, height);
    header.insert(header.end(), {8, 6, 0, 0, 0});
    std::vector<uint8_t> file{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'};
    chunk(file, "IHDR", header);
    chunk(file, "IDAT", z);
    chunk(file, "IEND", {});
    std::filesystem::create_directories(path.parent_path());
    std::ofstream out(path, std::ios::binary);
    if (!out) throw std::runtime_error("png: cannot write " + path.string());
    out.write(reinterpret_cast<const char*>(file.data()), std::streamsize(file.size()));
}

}  // namespace app
