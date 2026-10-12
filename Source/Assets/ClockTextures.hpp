#pragma once
#include <array>
#include <string_view>

#include "Assets/Bytes.hpp"

namespace assets {

// facts/clock-textures.md: resources 0x2B..0x34, the TEXC* members of TEXIMAGE, and the form func_002344F8
// (HDD OSD 1.10U) turns each into 32-bit pixels.
enum class PixelForm { Grey, RgbQuarter, Alpha, GreyAlpha, Rgba, BlackAlpha, Rgb555 };

struct ClockTextureInfo {
    std::string_view name;
    uint32_t width, height;
    PixelForm form;
    uint32_t tbp;
};

inline constexpr std::array<ClockTextureInfo, 10> kClockTextures{{
    {"TEXCFLOW", 64, 64, PixelForm::Grey, 0x2bc0},       {"TEXCKABE", 128, 128, PixelForm::RgbQuarter, 0x2c00},
    {"TEXCBUMP", 64, 64, PixelForm::Grey, 0x2d00},       {"TEXCBINV", 64, 64, PixelForm::Grey, 0x2d40},
    {"TEXCSMOK", 64, 64, PixelForm::Alpha, 0x2d80},      {"TEXCREFA", 64, 64, PixelForm::Grey, 0x2dc0},
    {"TEXCNAVI", 64, 64, PixelForm::Alpha, 0x2e00},      {"TEXCBLUR", 64, 64, PixelForm::Alpha, 0x2e40},
    {"TEXCSTSL", 64, 64, PixelForm::GreyAlpha, 0x2e80},  {"TEXCMARU", 64, 64, PixelForm::Rgba, 0x2ec0},
}};

// The GS word address the clock's texture allocator reaches once the ten textures are placed: the end of the last one (a block is 64 words).
constexpr uint32_t clockTexturesEnd() {
    constexpr uint32_t kWordsPerBlock = 64, kBytesPerBlock = 256;
    const ClockTextureInfo& last = kClockTextures.back();
    return (last.tbp + last.width * last.height * 4 / kBytesPerBlock) * kWordsPerBlock;
}

// The opening's textures (facts/opening.md section 2): the OSD's resources 35, 29, 34, 30, 26, 36, 31, 27, 32 are the
// TEXO* members of TEXIMAGE; index is the opening's own texture index. BlackAlpha: (0, 0, 0, a). Rgb555: a 16-byte header,
// then 16-bit texels expanded as the GS reads PSMCT16 with TEXA 127 / 129 and AEM (c << 3; alpha 129 when bit 15, else 127,
// 0 for black), and 8 trailing bytes.
struct OpeningTextureInfo {
    std::string_view name;
    int32_t index;
    uint32_t width, height;
    PixelForm form;
    uint32_t tbp;
};

inline constexpr std::array<OpeningTextureInfo, 9> kOpeningTextures{{
    {"TEXOSCE", 0, 256, 64, PixelForm::GreyAlpha, 0x2bc0},  {"TEXOFOG1", 2, 64, 64, PixelForm::Rgb555, 0x2cc0},
    {"TEXOFOG2", 3, 64, 64, PixelForm::Rgb555, 0x2ce0},     {"TEXOFOG4", 5, 64, 64, PixelForm::Rgb555, 0x2d20},
    {"TEXOWAL0", 6, 256, 256, PixelForm::Rgb555, 0x2d40},   {"TEXOCRBL", 8, 64, 64, PixelForm::Rgba, 0x3020},
    {"TEXOREF", 10, 128, 128, PixelForm::Rgb555, 0x3060},   {"TEXOBLP", 11, 64, 64, PixelForm::BlackAlpha, 0x30e0},
    {"TEXOBLPR", 12, 64, 64, PixelForm::BlackAlpha, 0x3120},
}};

// The bytes the form reads: width x height x (1, 2 or 4), or a quarter at 3 bytes for RgbQuarter.
size_t rawTextureSize(PixelForm form, uint32_t width, uint32_t height);
// R, G, B, A bytes in memory order, width x height.
Bytes convertTexture(View raw, uint32_t width, uint32_t height, PixelForm form);

}
