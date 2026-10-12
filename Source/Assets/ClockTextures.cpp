#include "Assets/ClockTextures.hpp"

#include <utility>

namespace assets {

// facts/clock-textures.md, func_002344F8 (HDD OSD 1.10U): grey to (g, g, g, 127); alpha to (255, 255, 255, a); grey and
// alpha to (g, g, g, a); RGBA as stored; the 3-byte quarter of TEXCKABE tiled 2 x 2 with alpha 127.
size_t rawTextureSize(PixelForm form, uint32_t width, uint32_t height) {
    const size_t pixels = size_t(width) * height;
    return form == PixelForm::RgbQuarter ? pixels / 4 * 3 : form == PixelForm::Rgb555 ? pixels * 2 + 24 : form == PixelForm::GreyAlpha ? pixels * 2 : form == PixelForm::Rgba ? pixels * 4 : pixels;
}

Bytes convertTexture(View raw, uint32_t width, uint32_t height, PixelForm form) {
    const size_t pixels = size_t(width) * height;
    const size_t need = rawTextureSize(form, width, height);
    if (raw.size() < need) throw std::runtime_error("texture: fewer bytes than its form needs");
    Bytes out(pixels * 4);
    const auto put = [&](size_t x, size_t y, uint8_t r, uint8_t g, uint8_t b, uint8_t a) {
        uint8_t* p = &out[(y * width + x) * 4];
        p[0] = r, p[1] = g, p[2] = b, p[3] = a;
    };
    if (form == PixelForm::RgbQuarter) {
        const size_t w = width / 2, h = height / 2;
        for (size_t y = 0; y < h; ++y)
            for (size_t x = 0; x < w; ++x) {
                const uint8_t* s = &raw[(y * w + x) * 3];
                for (const auto [dx, dy] : {std::pair<size_t, size_t>{0, 0}, {w, 0}, {0, h}, {w, h}}) put(x + dx, y + dy, s[0], s[1], s[2], 0x7f);
            }
        return out;
    }
    for (size_t i = 0; i < pixels; ++i) {
        if (form == PixelForm::Rgb555) {
            const uint32_t v = raw[16 + i * 2] | raw[17 + i * 2] << 8;
            put(i % width, i / width, uint8_t((v & 31) << 3), uint8_t(((v >> 5) & 31) << 3), uint8_t(((v >> 10) & 31) << 3), (v & 0x7fff) == 0 ? 0 : v & 0x8000 ? 129 : 127);
            continue;
        }
        const size_t x = i % width, y = i / width;
        switch (form) {
        case PixelForm::Grey: put(x, y, raw[i], raw[i], raw[i], 0x7f); break;
        case PixelForm::BlackAlpha: put(x, y, 0, 0, 0, raw[i]); break;
        case PixelForm::Alpha: put(x, y, 0xff, 0xff, 0xff, raw[i]); break;
        case PixelForm::GreyAlpha: put(x, y, raw[i * 2], raw[i * 2], raw[i * 2], raw[i * 2 + 1]); break;
        default: put(x, y, raw[i * 4], raw[i * 4 + 1], raw[i * 4 + 2], raw[i * 4 + 3]); break;
        }
    }
    return out;
}

}
