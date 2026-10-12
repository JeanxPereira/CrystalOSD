#include "Scene/ColdFont.hpp"

#include <optional>
#include <type_traits>

#include "Scene/Arithmetic.hpp"

namespace scene {

namespace {

constexpr uint32_t kLanguageTables = 0x2AD200;
constexpr uint32_t kZoneTable = 0x2AD988;
constexpr uint32_t kZoneCount = 0x2AE5A0;
constexpr uint32_t kPalTvRatio = 0x36FB9C;
constexpr int32_t kLanguages = 8;
constexpr int32_t kCacheBytes = 0x1000;
constexpr int32_t kCacheHead = 0x3A0;
constexpr int32_t kCacheEntry = 0x20;
constexpr int32_t kTextureBlocks = 4;
constexpr int32_t kCacheBlocks = 0x120;
constexpr int32_t kBlockShift = 6;
constexpr float kHalf = 0.5f;

}

// HDD OSD 1.10U 0x226B10, 0x214228, 0x22CB50 verify_cold_font.mjs
template <class A>
ColdFontOut coldFont(std::shared_ptr<const ProgramImage> program, std::shared_ptr<const Font> font, bool pal, uint32_t gsAllocator) {
    std::optional<EeRounding> truncating;
    if constexpr (std::is_same_v<A, NativeArithmetic>) truncating.emplace();
    TextInputs inputs;
    FontState& s = inputs.font;
    s.ratio = 1.0f;
    s.tv = A::mul(pal ? program->single(kPalTvRatio) : 1.0f, kHalf);
    s.colour = {1.0f, 1.0f, 1.0f, 1.0f};
    s.blank = font->header16(0x54);
    s.ascent = font->header16(0x50);
    s.dirty = 1;
    s.matrix = {{{0, 0, 0, 0}, {0, 0, 0, 0}, {0, 0, 1, 0}, {0, 0, 0, 1}}};

    FontCache& cache = inputs.cache;
    cache.list.assign(static_cast<size_t>((kCacheBytes - kCacheHead) / kCacheEntry), FontCacheEntry{});
    cache.memory = static_cast<uint32_t>(kCacheBlocks << kBlockShift);
    cache.table = gsAllocator;
    cache.texture = gsAllocator + static_cast<uint32_t>(kTextureBlocks << kBlockShift);

    const FontCache cold = cache;
    FontCache laidOut = cold;
    laidOut.cells = 1;
    laidOut.cellW = 8;
    laidOut.cellH = 4;
    inputs.cache = laidOut;

    Text<A> text(font, program, inputs);
    ColdFontOut out;
    const int32_t zones = program->integer(kZoneCount);
    for (int32_t language = 0; language < kLanguages; ++language) {
        const uint32_t table = program->word(kLanguageTables + 4u * static_cast<uint32_t>(language));
        int32_t widest = 0;
        for (int32_t i = 0; i < zones; ++i) {
            for (const uint32_t field : {0xCu, 0x4u}) {
                const uint32_t id = program->word(kZoneTable + static_cast<uint32_t>(i) * 0x18 + field);
                const int32_t width = text.stringWidth(program->string(program->word(table + 4 * id)));
                if (width > widest) widest = width;
            }
        }
        out.widths[static_cast<size_t>(language)] = widest;
    }
    out.state = text.font();
    out.cache = text.cache();
    out.cache.cells = cold.cells;
    out.cache.cellW = cold.cellW;
    out.cache.cellH = cold.cellH;
    return out;
}

#ifndef SCENE_NATIVE_ONLY
template ColdFontOut coldFont<EeArithmetic>(std::shared_ptr<const ProgramImage>, std::shared_ptr<const Font>, bool, uint32_t);
#endif
template ColdFontOut coldFont<NativeArithmetic>(std::shared_ptr<const ProgramImage>, std::shared_ptr<const Font>, bool, uint32_t);

}
