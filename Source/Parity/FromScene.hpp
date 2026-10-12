#pragma once
#include <array>
#include <map>
#include <string>
#include <vector>

#include "Parity/GsFrame.hpp"
#include "Scene/Frame.hpp"

namespace parity {

struct GsTextureImage {
    std::string id;
    uint32_t width = 0, height = 0;
};

// Where the clock's buffers and textures sit in GS memory for one frame (clock_frame.mjs stateWriters).
struct GsFrameLayout {
    std::vector<std::string> targets;
    std::vector<std::array<uint32_t, 2>> targetSizes;
    uint32_t width = 0, height = 0;
    uint32_t targetTextureWidth = 0, targetTextureHeight = 0;
    std::map<int32_t, GsTextureImage> textures;
};

GsFrameLayout clockLayout(int32_t width, int32_t height, int32_t displayIndex);
// The opening's buffers and textures (facts/opening.md sections 2 and 4.5): display pages 0x0000 and 0x08C0 (the page
// drawn this frame is Display, the other RefractionSource), Store 0x2300 at half width, Extra 0x1A40, Work unused (empty).
GsFrameLayout openingLayout(int32_t displayIndex);

// The scene frame in the GS units of the parity rule: the field's half line added where the OSD draws
// with it, the targets and textures named by their GS addresses, the state as GS registers express it.
GsFrame fromScene(const scene::Frame& frame, const GsFrameLayout& layout);
// The GS name of the glyph cache texture (scene::kGlyphTexture) of a frame.
std::string glyphTextureId(const scene::GlyphCache& glyphs);

}
