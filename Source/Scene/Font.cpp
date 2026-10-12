#include "Scene/Font.hpp"

#include <cstring>
#include <fstream>
#include <iterator>
#include <stdexcept>
#include <string>

namespace scene {

namespace {

uint32_t u32(const std::vector<uint8_t>& d, size_t at) {
    if (at + 4 > d.size()) throw std::runtime_error("font: read past the end");
    return uint32_t(d[at]) | uint32_t(d[at + 1]) << 8 | uint32_t(d[at + 2]) << 16 | uint32_t(d[at + 3]) << 24;
}
int32_t s32(const std::vector<uint8_t>& d, size_t at) { return static_cast<int32_t>(u32(d, at)); }
int32_t s16(const std::vector<uint8_t>& d, size_t at) {
    if (at + 2 > d.size()) throw std::runtime_error("font: read past the end");
    return static_cast<int16_t>(uint16_t(d[at]) | uint16_t(d[at + 1]) << 8);
}
uint32_t u16(const std::vector<uint8_t>& d, size_t at) { return static_cast<uint16_t>(s16(d, at)); }
float f32(const std::vector<uint8_t>& d, size_t at) {
    const uint32_t bits = u32(d, at);
    float value;
    std::memcpy(&value, &bits, 4);
    return value;
}

}

std::vector<uint8_t> expandOsd(const std::vector<uint8_t>& src) {
    const auto big32 = [&](size_t at) { return uint32_t(src.at(at)) << 24 | uint32_t(src.at(at + 1)) << 16 | uint32_t(src.at(at + 2)) << 8 | uint32_t(src.at(at + 3)); };
    const auto big16 = [&](size_t at) { return uint32_t(src.at(at)) << 8 | uint32_t(src.at(at + 1)); };
    const uint32_t length = u32(src, 0);
    std::vector<uint8_t> dst(length);
    size_t s = 4, d = 0;
    int32_t run = 0, shift = 0;
    uint32_t desc = 0, mask = 0;
    while (d < length) {
        if (run == 0) {
            run = 30;
            desc = big32(s);
            s += 4;
            const uint32_t n = desc & 3;
            shift = 14 - static_cast<int32_t>(n);
            mask = 0x3fffu >> n;
        }
        if ((desc & (1u << (run + 1))) == 0) {
            dst[d++] = src.at(s++);
        } else {
            const uint32_t h = big16(s);
            s += 2;
            const size_t back = (h & mask) + 1;
            if (back > d) throw std::runtime_error("font: a reference before the start");
            size_t from = d - back;
            for (uint32_t i = 0; i < 3 + (h >> shift) && d < length; ++i) dst[d++] = dst[from++];
        }
        run -= 1;
    }
    return dst;
}

int32_t Font::header16(uint32_t offset) const {
    return s16(m_data, offset);
}

Font::Font(std::vector<uint8_t> file) : m_data(expandOsd(file)) {
    const std::vector<uint8_t>& d = m_data;
    if (u32(d, 0) != 0 || u32(d, 4) != 0) throw std::runtime_error("not font data: the first two words are not zero");
    const uint32_t count = u32(d, 0x58);
    for (uint32_t i = 0; i < count; ++i) {
        FontBlock b;
        b.at = u32(d, 0x5c + 4 * i);
        b.flags = u32(d, b.at + 0x10);
        b.depth = (b.flags & 7) == 0 ? 4 : static_cast<int32_t>((b.flags & 7) << 3);
        b.scaleX = f32(d, b.at + 0x14);
        b.scaleY = f32(d, b.at + 0x18);
        b.width = s16(d, b.at + 0x1c);
        b.height = s16(d, b.at + 0x1e);
        b.ascent = s16(d, b.at + 0x20);
        b.descent = s16(d, b.at + 0x22);
        b.glyphs = u32(d, b.at + 0x28);
        b.pictures = b.at + u32(d, b.at + 0x2c);
        const int32_t bits = b.width * b.height * b.depth;
        b.pictureSize = static_cast<uint32_t>((((bits < 0 ? bits + 7 : bits) >> 3) + 15) & ~15);
        b.index = b.at + u32(d, b.at + 0x3c);
        b.metrics = b.at + u32(d, b.at + 0x44);
        b.perGlyph = ((b.flags >> 3) & 1) != 0;
        b.table = b.at + u32(d, b.at + 0x54);
        const uint32_t ranges = u32(d, b.at + 0x30);
        for (uint32_t r = 0; r < ranges; ++r) {
            const size_t o = b.at + u32(d, b.at + 0x34) + 16 * r;
            b.ranges.push_back({s32(d, o), s32(d, o + 4), s32(d, o + 8), s32(d, o + 12)});
        }
        m_blocks.push_back(std::move(b));
    }
}

Font Font::load(const std::filesystem::path& path) {
    std::ifstream file(path, std::ios::binary);
    if (!file) throw std::runtime_error("cannot open the font " + path.string());
    return Font(std::vector<uint8_t>((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>()));
}

// scePFontGetGlyph: the first block whose ranges, searched by bisection, give the code an index entry.
std::optional<Glyph> Font::glyph(int32_t code) const {
    for (const FontBlock& block : m_blocks) {
        const std::vector<FontRange>& ranges = block.ranges;
        if (ranges.empty() || code < ranges.front().start || ranges.back().end < code) continue;
        int32_t low = -1, high = static_cast<int32_t>(ranges.size());
        const FontRange* found = nullptr;
        while (low + 1 != high) {
            const int32_t middle = (low + high) >> 1;
            if (code < ranges[middle].start) high = middle;
            else if (ranges[middle].end < code) low = middle;
            else { found = &ranges[middle]; break; }
        }
        if (!found) continue;
        const uint32_t entry = u16(m_data, block.index + 2 * static_cast<uint32_t>(found->first + code - found->start));
        if (entry == 0xffff) continue;
        Glyph g;
        g.block = &block;
        g.index = found->add + static_cast<int32_t>(entry);
        g.picture = block.pictures + block.pictureSize * static_cast<uint32_t>(g.index);
        const uint32_t m = block.metrics + (block.perGlyph ? 16u * static_cast<uint32_t>(g.index) : 0u);
        for (int i = 0; i < 7; ++i) g.metrics[i] = s16(m_data, m + 2 * i);
        return g;
    }
    return std::nullopt;
}

int32_t Font::pixel(const Glyph& glyph, int32_t x, int32_t y) const {
    const int32_t n = y * glyph.block->width + x;
    if (glyph.block->depth == 4) return (m_data.at(glyph.picture + (n >> 1)) >> ((n & 1) * 4)) & 0xf;
    if (glyph.block->depth == 8) return m_data.at(glyph.picture + n);
    throw std::runtime_error("font: a pixel format of " + std::to_string(glyph.block->depth) + " bits is not read");
}

std::array<Rgba, 16> Font::table(const FontBlock& block) const {
    std::array<Rgba, 16> out{};
    for (size_t i = 0; i < 16; ++i)
        for (size_t c = 0; c < 4; ++c) out[i][c] = m_data.at(block.table + 4 * i + c);
    return out;
}

const FontBlock* Font::blockAt(uint32_t at) const {
    for (const FontBlock& block : m_blocks)
        if (block.at == at) return &block;
    return nullptr;
}

}
