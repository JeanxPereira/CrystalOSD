#include "Scene/opening/Flat.hpp"


namespace scene::opening {

namespace {

constexpr int32_t kWidth = 640, kHeight = 224;
constexpr uint32_t kFarthest = 0xffffff;
constexpr float kPixel = 0.0625f;
// The copy reads the page through a 1024 x 512 texture (TEX0 of the dump's draws; the helper that sets it was not read), every other target read is 1024 x 256.
constexpr int32_t kCopySourceHeight = 512;

// verify_opening_flat.mjs: the texture colour at 0x00365118 and the bars' colour at 0x00365128
constexpr uint8_t kTextureColour = 0x80;
constexpr uint8_t kBarColour[4] = {255, 255, 255, 128};
// 0x00370030: the view-screen shape (ax, ay) the bars' height comes from
constexpr uint32_t kShapeX = 0x3f800000, kShapeY = 0x3eea4e16;
// facts/opening.md 4.4: D_00365158's NTSC rectangles (x, y, w, h) and D_003653A8's source rectangle
constexpr int32_t kLogoPlace[2][4] = {{120, 105, 256, 16}, {326, 105, 256, 16}};
constexpr int32_t kLogoSource[4] = {0, 1, 256, 30};

Vertex corner(float x, float y, uint32_t z, float u, float v, uint8_t r, uint8_t g, uint8_t b, uint8_t a) {
    Vertex vertex;
    vertex.x = x;
    vertex.y = y;
    vertex.z = z;
    vertex.u = u;
    vertex.v = v;
    vertex.q = 1.0f;
    vertex.r = r;
    vertex.g = g;
    vertex.b = b;
    vertex.a = a;
    return vertex;
}

// pktSetTexRect (0x0021B7A0): half a texel in at the first corner, half a pixel in at the second.
void texturedSprite(Pass& pass, const int32_t (&place)[4], const int32_t (&source)[4], uint32_t z, uint8_t grey, uint8_t alpha) {
    pass.vertices.push_back(corner(static_cast<float>(place[0]), static_cast<float>(place[1]), z, static_cast<float>(source[0]) + 0.5f, static_cast<float>(source[1]) + 0.5f, grey, grey, grey, alpha));
    pass.vertices.push_back(corner(static_cast<float>(place[0] + place[2]) - 0.5f, static_cast<float>(place[1] + place[3]) - 0.5f, z, static_cast<float>(source[0] + source[2]),
                                   static_cast<float>(source[1] + source[3]), grey, grey, grey, alpha));
}

// pktSetFlatRect: the second corner one sixteenth in.
void flatSprite(Pass& pass, const int32_t (&rect)[4], const uint8_t (&colour)[4], uint32_t z) {
    pass.vertices.push_back(corner(static_cast<float>(rect[0]), static_cast<float>(rect[1]), z, 0, 0, colour[0], colour[1], colour[2], colour[3]));
    pass.vertices.push_back(corner(static_cast<float>(rect[0] + rect[2]) - kPixel, static_cast<float>(rect[1] + rect[3]) - kPixel, z, 0, 0, colour[0], colour[1], colour[2], colour[3]));
}

Material fromTarget(TargetName target, bool colourOnly) {
    Material m;
    m.source = SourceKind::Target;
    m.sourceTarget = target;
    m.colourOnly = colourOnly;
    m.coordinates = CoordinateKind::Texel;
    m.sampling = Sampling::Repeat;
    m.bilinear = true;
    m.depthTest = DepthTest::GreaterEqual;
    m.depthWrite = false;
    return m;
}

Pass sprites(const char* name, TargetName target, const Material& material, bool halfLine) {
    Pass pass;
    pass.name = name;
    pass.target = target;
    pass.topology = PassTopology::Sprites;
    pass.material = material;
    pass.halfLine = halfLine;
    return pass;
}

}

// The black fill that opens every frame in the dump (measured, writer not read; two sprites; one in the first frame after a cold boot (opening-full counter 1; a saved-state run has no dump frame for its first call)); OpeningProcess's own SCISSOR_1 write (vif1SetSCISSOR_1 with 1, 1, W - 2, H - 2) is the ghost's Pass::scissor
template <class A>
void Flat<A>::scissor(const FlatInputs& in, std::vector<Pass>& out) {
    Material m;
    m.depthTest = DepthTest::Always;
    m.depthWrite = true;
    Pass pass = sprites("scissor", TargetName::Display, m, true);
    for (int i = 0; i < in.fillSprites; ++i) {
        pass.vertices.push_back(corner(0, 0, 0, 0, 0, 0, 0, 0, 0));
        pass.vertices.push_back(corner(static_cast<float>(kWidth), static_cast<float>(kHeight), 0, 0, 0, 0, 0, 0, 0));
    }
    out.push_back(std::move(pass));
}

template <class A>
void Flat<A>::scissor(std::vector<Pass>& out) {
    scissor(FlatInputs{}, out);
}

// verify_opening_ghost.mjs verify (ghost)
template <class A>
void Flat<A>::ghost(const FlatInputs&, std::vector<Pass>& out) {
    Material m = fromTarget(TargetName::Store, true);
    m.blend = BlendOp::FixedOver;
    m.blendConstant = 0x50;
    m.depthTest = DepthTest::Always;
    Pass pass = sprites("ghost", TargetName::Display, m, true);
    pass.scissor = kProcessScissor;
    const int32_t place[4] = {0, 0, kWidth, kHeight}, source[4] = {0, 0, kWidth >> 1, kHeight};
    texturedSprite(pass, place, source, kFarthest, 0x80, 0x80);
    out.push_back(std::move(pass));
}

// verify_opening_flat.mjs expect (frame copy)
template <class A>
void Flat<A>::copyToStore(const FlatInputs&, std::vector<Pass>& out) {
    Material material = fromTarget(TargetName::Display, false);
    material.sourceHeight = kCopySourceHeight;
    Pass pass = sprites("copy", TargetName::Store, material, false);
    const int32_t place[4] = {0, 0, kWidth >> 1, kHeight}, source[4] = {0, 0, kWidth, kHeight};
    texturedSprite(pass, place, source, kFarthest, kTextureColour, kTextureColour);
    out.push_back(std::move(pass));
}

// verify_opening_flat.mjs expect (blur)
template <class A>
void Flat<A>::blur(const FlatInputs& in, std::vector<Pass>& out) {
    const int32_t n = in.blurLevel;
    const int32_t full[4] = {0, 0, kWidth, kHeight};
    for (int32_t i = 0; i < n; ++i) {
        const int32_t shrink = i * (n - 1);
        const int32_t small[4] = {0, 0, ((kWidth * 7) >> 3) - 1 - shrink, ((kHeight * 7) >> 3) - 1 - shrink};
        Pass into = sprites("blur into extra", TargetName::Extra, fromTarget(TargetName::Display, false), false);
        texturedSprite(into, small, full, kFarthest, kTextureColour, kTextureColour);
        out.push_back(std::move(into));
        Pass back = sprites("blur back", TargetName::Display, fromTarget(TargetName::Extra, false), false);
        texturedSprite(back, full, small, kFarthest, kTextureColour, kTextureColour);
        out.push_back(std::move(back));
    }
}

// verify_opening_flat.mjs expect (fade rectangle, mode 'B')
template <class A>
void Flat<A>::fade(const FlatInputs& in, std::vector<Pass>& out) {
    Material m;
    m.blend = BlendOp::AlphaOver;
    m.depthTest = DepthTest::Always;
    m.depthWrite = false;
    Pass pass = sprites("fade", TargetName::Display, m, true);
    const uint8_t alpha = static_cast<uint8_t>(in.fadeAlpha >= 0 && in.fadeAlpha < 0x81 ? in.fadeAlpha : 0x80);
    const int32_t rect[4] = {0, 0, kWidth, kHeight};
    const uint8_t colour[4] = {0, 0, 0, alpha};
    flatSprite(pass, rect, colour, kFarthest);
    out.push_back(std::move(pass));
}

// verify_opening_overlays_v2.mjs verify (logo)
template <class A>
void Flat<A>::logo(const FlatInputs& in, std::vector<Pass>& out) {
    Material m;
    m.source = SourceKind::Texture;
    m.texture = 0;
    m.coordinates = CoordinateKind::Texel;
    m.sampling = Sampling::Repeat;
    m.bilinear = true;
    m.blend = BlendOp::AlphaOver;
    m.depthTest = DepthTest::GreaterEqual;
    m.depthWrite = false;
    m.blendConstant = static_cast<uint8_t>(in.logoAlpha);
    Pass pass = sprites("logo", TargetName::Display, m, true);
    const uint8_t alpha = static_cast<uint8_t>(in.logoAlpha);
    texturedSprite(pass, kLogoPlace[0], kLogoSource, 0xfffffe, 0x80, alpha);
    const int32_t lower[4] = {kLogoSource[0], kLogoSource[1] + 0x20, kLogoSource[2], kLogoSource[3]};
    texturedSprite(pass, kLogoPlace[1], lower, 0xfffffe, 0x80, alpha);
    out.push_back(std::move(pass));
}

// verify_opening_flat.mjs expect (letterbox bars)
template <class A>
void Flat<A>::bars(const FlatInputs&, std::vector<Pass>& out) {
    Material m;
    m.blend = BlendOp::SubtractFixed;
    m.blendConstant = 0x80;
    m.depthTest = DepthTest::Always;
    m.depthWrite = false;
    Pass pass = sprites("bars", TargetName::Display, m, true);
    const int32_t open = pictureHeight(), bar = barRows();
    const int32_t above[4] = {0, 0, kWidth, bar}, below[4] = {0, bar + open, kWidth, bar};
    flatSprite(pass, above, kBarColour, kFarthest);
    flatSprite(pass, below, kBarColour, kFarthest);
    out.push_back(std::move(pass));
}

template <class A>
int32_t Flat<A>::page(const FlatInputs& in) {
    return (in.counter & 1) ? 0 : (kWidth * kHeight) >> 6;
}

template <class A>
int32_t Flat<A>::blurWhich(const FlatInputs& in) {
    return in.counter & 1;
}

template <class A>
int32_t Flat<A>::pictureHeight() {
    const float width = static_cast<float>(kWidth * 9);
    return A::toInt(A::div(A::mul(width, asFloat(kShapeY)), A::mul(asFloat(kShapeX), 16.0f)));
}

template <class A>
int32_t Flat<A>::barRows() {
    const int32_t x = kHeight - pictureHeight() + 1;
    return (x + static_cast<int32_t>(static_cast<uint32_t>(x) >> 31)) >> 1;
}

#ifndef SCENE_NATIVE_ONLY
template struct Flat<EeArithmetic>;
#endif
template struct Flat<NativeArithmetic>;

}
