#pragma once
#include <array>
#include <cstdint>
#include <filesystem>
#include <optional>
#include <vector>

namespace scene {

// facts/text.md section 1: HDD OSD 1.10U's font file FNTOSD, expanded with the OSDSYS scheme and walked as
// scePFontGetGlyph (0x002905A0) walks it (References/scripts/extract_font.mjs readFont, glyphOf, pixel).
struct FontRange {
    int32_t start = 0, end = 0, first = 0, add = 0;
};

struct FontBlock {
    uint32_t at = 0;
    uint32_t flags = 0;
    int32_t depth = 4;
    float scaleX = 1, scaleY = 1;
    int32_t width = 0, height = 0, ascent = 0, descent = 0;
    uint32_t glyphs = 0, pictures = 0, pictureSize = 0, index = 0, metrics = 0, table = 0;
    bool perGlyph = false;
    std::vector<FontRange> ranges;
};

// Metrics: originX, baseline, left, right, top, bottom, advance.
struct Glyph {
    const FontBlock* block = nullptr;
    int32_t index = 0;
    uint32_t picture = 0;
    std::array<int32_t, 7> metrics{};
};

using Rgba = std::array<uint8_t, 4>;

class Font {
public:
    explicit Font(std::vector<uint8_t> file);
    static Font load(const std::filesystem::path& path);

    std::optional<Glyph> glyph(int32_t code) const;
    int32_t pixel(const Glyph& glyph, int32_t x, int32_t y) const;
    // The block's sixteen colours as R, G, B, A.
    std::array<Rgba, 16> table(const FontBlock& block) const;
    const FontBlock* blockAt(uint32_t at) const;
    const std::vector<FontBlock>& blocks() const { return m_blocks; }
    // The s16 at `offset` of the expanded file's header (+0x50 ascent, +0x52 descent, +0x54 the blank's width).
    int32_t header16(uint32_t offset) const;

private:
    std::vector<uint8_t> m_data;
    std::vector<FontBlock> m_blocks;
};

// extract_font.mjs expand: the OSDSYS scheme (a length, then runs of 30 literal or back-reference items).
std::vector<uint8_t> expandOsd(const std::vector<uint8_t>& source);

}
