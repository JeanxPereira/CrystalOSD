#pragma once
#include <array>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace scene {

// facts/clock-frame.md: one clock frame as passes, in the OSD's order; facts/clock-gs-state.md: the state of each.
// RefractionSource is the OSD's work buffer 0, Work its work buffer 1. The opening adds Store (the half-width copy the
// ghost reads, GS 0x2300) and Extra (the buffer the cubes refract through, GS 0x1A40); there Work is unused.
enum class TargetName { Display, RefractionSource, Work, Store, Extra };
enum class PassTopology { Triangles, Lines, Sprites };

// The ALPHA values the clock sends: Add Cs*As + Cd; AlphaOver (Cs - Cd)*As + Cd; Subtract Cd - Cs*As;
// FixedOver (Cs - Cd)*constant + Cd; FixedAdd Cs*constant + Cd. As and the constant are over 128. The opening adds
// AddDestinationAlpha Cs*Ad + Cd and SubtractFixed Cd - Cs*constant (facts/opening.md section 4; the list the audit closed).
enum class BlendOp { Opaque, Add, AlphaOver, Subtract, FixedOver, FixedAdd, AddDestinationAlpha, SubtractFixed };
enum class TextureSet { Clock, Opening };
enum class DepthTest { Always, GreaterEqual, Greater };
enum class SourceKind { None, Texture, Target };
enum class CoordinateKind { Texel, Projective };
enum class Sampling { Repeat, Clamp, ClampToRegion };

// x, y: pixels from the target's top-left corner, without the field's half line.
// z: the 24-bit depth the GS tests (greater is nearer).
// Texel coordinates: u, v in texels of the source, q = 1. Projective: u, v, q are S, T, Q (texel = u / q * size).
// r, g, b, a: the colour bytes. Textured, r / 128 multiplies the texel; untextured, r / 255 is the colour; a / 128 is the alpha.
struct Vertex {
    float x = 0, y = 0;
    uint32_t z = 0;
    float u = 0, v = 0, q = 1;
    uint8_t r = 0, g = 0, b = 0, a = 0;
    bool operator==(const Vertex&) const = default;
};

// `texture` is the clock's texture number (SourceKind::Texture); `sourceTarget` the target read (SourceKind::Target),
// as 24-bit colour when `colourOnly` (alpha 0x7f, 0 where the texel is black). `region`: min u, max u, min v,
// max v in texels (Sampling::ClampToRegion). `gouraud`: the colour is interpolated; otherwise each primitive's
// vertices already hold its last vertex's colour.
struct Material {
    SourceKind source = SourceKind::None;
    int32_t texture = 0;
    TargetName sourceTarget = TargetName::Display;
    bool colourOnly = false;
    CoordinateKind coordinates = CoordinateKind::Texel;
    Sampling sampling = Sampling::Repeat;
    std::array<int32_t, 4> region{};
    bool bilinear = false;
    int32_t sourceHeight = 0;
    BlendOp blend = BlendOp::Opaque;
    uint8_t blendConstant = 0;
    DepthTest depthTest = DepthTest::Always;
    bool depthWrite = true;
    bool gouraud = false;
    bool perPixelAlpha = false;
    bool alphaCorrection = false;
    bool operator==(const Material&) const = default;
};

// Vertices as lists: 3 per triangle, 2 per line, 2 per sprite (opposite corners). `edgeSmoothing` is the
// OSD's AA1 (the edges' coverage becomes the alpha); `halfLine`: the OSD draws it with the field's half-line offset;
// `primBlend`: the primitive's own blend enable (PRIM ABE) on top of AA1 (the parity oracle cannot reproduce the pair on triangles).
// `scissor`: x0, y0, x1, y1 inclusive when the pass is drawn under a scissor other than the whole picture.
struct Pass {
    std::string name;
    TargetName target = TargetName::Display;
    PassTopology topology = PassTopology::Triangles;
    Material material;
    bool edgeSmoothing = false;
    bool halfLine = false;
    bool primBlend = false;
    std::vector<Vertex> vertices;
    std::optional<std::array<int32_t, 4>> scissor;
};

// facts/text.md section 2: the font library's glyph cache, sampled as texture kGlyphTexture. Cells of cellWidth x
// cellHeight, row by row across `width` texels, in a texture of 2^logWidth x 2^logHeight at GS word `address`;
// cells[n] is the code whose picture cell n holds (0 for none).
constexpr int32_t kGlyphTexture = 10;
struct GlyphCache {
    uint32_t address = 0;
    int32_t cellWidth = 0, cellHeight = 0, width = 0, logWidth = 0, logHeight = 0;
    std::vector<int32_t> cells;
    bool operator==(const GlyphCache&) const = default;
};

// `displayIndex`: which of the two display buffers is drawn; `textAt`: the first pass of the date, time and button
// hint (the passes before it are the bars); `glyphs`: the glyph cache the text's passes sample.
struct Frame {
    int32_t width = 640, height = 224;
    int32_t field = 0;
    int32_t displayIndex = 0;
    std::vector<Pass> passes;
    size_t textAt = 0;
    GlyphCache glyphs;
    TextureSet textureSet = TextureSet::Clock;
    int32_t depthBits = 32;
};

}
