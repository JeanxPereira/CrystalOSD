#include "Check.hpp"
#include "Core/HeadlessContext.hpp"
#include "Parity/GsParityRenderer.hpp"
#include <bit>
#include <stdexcept>
#include <tuple>

namespace {
constexpr uint32_t W = 64, H = 32;

parity::GsPass pass(parity::GsPrimitive primitive, std::vector<parity::GsVertex> vertices) {
    parity::GsPass p{};
    p.index = 1; p.name = "test"; p.target = "t"; p.primitive = primitive;
    p.scissor = {0, 0, int32_t(W) - 1, int32_t(H) - 1};
    p.depth = {parity::GsDepthTest::Always, true};
    p.vertices = std::move(vertices);
    return p;
}
parity::GsVertex at(float x, float y, uint32_t depth, float r, float g, float b, float a) { return {x, y, depth, r, g, b, a, 0, 0, 1}; }
const uint8_t* px(const std::vector<uint8_t>& image, uint32_t x, uint32_t y) { return &image[(y * W + x) * 4]; }
const parity::GsBlend Add{parity::GsBlendTerm::Source, parity::GsBlendTerm::Zero, parity::GsBlendFactor::SourceAlpha, parity::GsBlendTerm::Destination, 0};
}  // namespace

int main(int argc, char** argv) {
    CHECK(argc == 2);
    HeadlessContext context(true);
    GsParityRenderer renderer(context.gpu(), argv[1]);
    const std::vector<uint8_t> black(W * H * 4, 0);
    const std::vector<uint32_t> depth100(W * H, 100);

    // A sprite covers [x0, x1) x [y0, y1) at integer sample points; fractional corners round up.
    renderer.setTarget("t", W, H, black);
    renderer.setDepth(W, H, depth100);
    renderer.draw(pass(parity::GsPrimitive::Sprites, {at(10, 20, 7, 0, 0, 0, 0), at(13, 22, 7, 10, 20, 30, 128), at(20.5f, 4, 7, 0, 0, 0, 0), at(22.5f, 5, 7, 1, 2, 3, 4)}));
    std::vector<uint8_t> image = renderer.readTarget("t");
    uint32_t lit = 0;
    for (uint32_t y = 0; y < H; y++) for (uint32_t x = 0; x < W; x++) {
        const bool first = x >= 10 && x < 13 && y >= 20 && y < 22, second = x >= 21 && x < 23 && y == 4;
        const uint8_t* p = px(image, x, y);
        if (first) CHECK(p[0] == 10 && p[1] == 20 && p[2] == 30 && p[3] == 128);
        else if (second) CHECK(p[0] == 1 && p[1] == 2 && p[2] == 3 && p[3] == 4);
        else CHECK(p[0] == 0 && p[3] == 0);
        lit += first || second;
    }
    CHECK(lit == 8);
    std::vector<uint32_t> depth = renderer.readDepth();
    CHECK(depth[20 * W + 10] == 7 && depth[0] == 100);

    // Each fragment must see the depth and colour every earlier primitive stored there: two hundred screen-sized sprites, each one
    // step nearer the back (Z 10000, 9999, ...) under Z >=, in one pass. Only the first passes; every pixel keeps its red 1.
    // Probabilistic: without coherent images it failed every run here (15 to 25 stale pixels), but a driver could pass it by luck.
    {
        constexpr uint32_t BW = 640, BH = 224;
        renderer.setTarget("big", BW, BH, std::vector<uint8_t>(BW * BH * 4, 0));
        renderer.setDepth(BW, BH, std::vector<uint32_t>(BW * BH, 100));
        parity::GsPass layers = pass(parity::GsPrimitive::Sprites, {});
        layers.target = "big";
        layers.scissor = {0, 0, int32_t(BW) - 1, int32_t(BH) - 1};
        layers.depth = {parity::GsDepthTest::GreaterEqual, true};
        for (uint32_t i = 0; i < 200; i++) {
            layers.vertices.push_back(at(0, 0, 10000 - i, 0, 0, 0, 0));
            layers.vertices.push_back(at(float(BW), float(BH), 10000 - i, float(1 + i), 0, 0, 128));
        }
        renderer.draw(layers);
        const std::vector<uint8_t> layered = renderer.readTarget("big");
        uint32_t stale = 0;
        for (uint32_t i = 0; i < BW * BH; i++) stale += layered[i * 4] != 1;
        if (stale) std::fprintf(stderr, "layers: %u pixels saw a stale depth\n", stale);
        CHECK(stale == 0);
        renderer.setDepth(W, H, depth100);
    }

    // Sixty-four overlapping additive sprites in one pass: each must see the one before it.
    renderer.setTarget("t", W, H, black);
    parity::GsPass stack = pass(parity::GsPrimitive::Sprites, {});
    for (int i = 0; i < 64; i++) { stack.vertices.push_back(at(0, 0, 0, 0, 0, 0, 0)); stack.vertices.push_back(at(8, 8, 0, 1, 2, 3, 128)); }
    stack.blend = Add;
    renderer.draw(stack);
    image = renderer.readTarget("t");
    for (uint32_t y = 0; y < 8; y++) for (uint32_t x = 0; x < 8; x++) CHECK(px(image, x, y)[0] == 64 && px(image, x, y)[1] == 128 && px(image, x, y)[2] == 192);
    CHECK(px(image, 8, 0)[0] == 0);

    // Two triangles sharing an edge cover every pixel of their square exactly once.
    renderer.setTarget("t", W, H, black);
    parity::GsPass quad = pass(parity::GsPrimitive::Triangles, {at(3.25f, 2.5f, 0, 1, 1, 1, 128), at(40.75f, 5.125f, 0, 1, 1, 1, 128), at(9.5f, 29.0625f, 0, 1, 1, 1, 128),
                                                           at(40.75f, 5.125f, 0, 1, 1, 1, 128), at(9.5f, 29.0625f, 0, 1, 1, 1, 128), at(50.0f, 27.5f, 0, 1, 1, 1, 128)});
    quad.blend = Add;
    renderer.draw(quad);
    image = renderer.readTarget("t");
    uint32_t covered = 0;
    for (uint32_t i = 0; i < W * H; i++) { CHECK(image[i * 4] <= 1); covered += image[i * 4]; }
    CHECK(covered > 500);

    // Depth tests against a buffer holding 100.
    const std::tuple<parity::GsDepthTest, uint32_t, bool> depthCases[] = {
        {parity::GsDepthTest::Greater, 100u, false}, {parity::GsDepthTest::Greater, 101u, true},
        {parity::GsDepthTest::GreaterEqual, 100u, true}, {parity::GsDepthTest::GreaterEqual, 99u, false}, {parity::GsDepthTest::Never, 500u, false}};
    for (const auto& [test, z, drawn] : depthCases) {
        renderer.setTarget("t", W, H, black);
        renderer.setDepth(W, H, depth100);
        parity::GsPass p = pass(parity::GsPrimitive::Sprites, {at(0, 0, z, 0, 0, 0, 0), at(4, 4, z, 9, 9, 9, 9)});
        p.depth = {test, true};
        renderer.draw(p);
        CHECK((renderer.readTarget("t")[0] == 9) == drawn);
        CHECK(renderer.readDepth()[0] == (drawn ? z : 100u));
    }

    // Subtraction clamps at zero; a scissor cuts.
    renderer.setTarget("t", W, H, std::vector<uint8_t>(W * H * 4, 5));
    parity::GsPass sub = pass(parity::GsPrimitive::Sprites, {at(0, 0, 0, 0, 0, 0, 0), at(8, 8, 0, 9, 3, 0, 128)});
    sub.blend = parity::GsBlend{parity::GsBlendTerm::Zero, parity::GsBlendTerm::Source, parity::GsBlendFactor::SourceAlpha, parity::GsBlendTerm::Destination, 0};
    sub.scissor = {2, 2, 5, 5};
    renderer.draw(sub);
    image = renderer.readTarget("t");
    CHECK(px(image, 2, 2)[0] == 0 && px(image, 2, 2)[1] == 2 && px(image, 2, 2)[2] == 5);
    CHECK(px(image, 1, 2)[0] == 5 && px(image, 6, 5)[0] == 5);

    // A texture that is the pass's own target is refused.
    parity::GsPass self = pass(parity::GsPrimitive::Sprites, {at(0, 0, 0, 0, 0, 0, 0), at(4, 4, 0, 128, 128, 128, 128)});
    self.texture = parity::GsTexture{"t", true, 64, 32, parity::GsCoordinates::Texel, {}, {}, parity::GsFilter::Nearest, {}};
    bool threw = false;
    try { renderer.draw(self); } catch (const std::exception&) { threw = true; }
    CHECK(threw);

    // A target larger than the depth image is refused.
    renderer.setTarget("t", W, H, black);
    renderer.setDepth(W / 2, H / 2, std::vector<uint32_t>(size_t(W / 2) * (H / 2), 0));
    threw = false;
    try { renderer.draw(pass(parity::GsPrimitive::Sprites, {at(0, 0, 0, 0, 0, 0, 0), at(4, 4, 0, 9, 9, 9, 9)})); } catch (const std::exception&) { threw = true; }
    CHECK(threw);
    renderer.setDepth(W, H, depth100);

    // Nearest and bilinear on a 2x2 texture, texel coordinates: the centre of the four texels is their mean.
    const std::vector<uint8_t> four{0, 0, 0, 128, 64, 0, 0, 128, 0, 64, 0, 128, 64, 64, 0, 128};
    renderer.setTexture("four", 2, 2, four);
    for (const auto filter : {parity::GsFilter::Nearest, parity::GsFilter::Bilinear}) {
        renderer.setTarget("t", W, H, black);
        parity::GsPass textured = pass(parity::GsPrimitive::Sprites, {{0, 0, 0, 128, 128, 128, 128, 1.0f, 1.0f, 1}, {1, 1, 0, 128, 128, 128, 128, 1.0f, 1.0f, 1}});
        textured.texture = parity::GsTexture{"four", false, 2, 2, parity::GsCoordinates::Texel, {parity::GsAddressMode::Clamp, 0, 0}, {parity::GsAddressMode::Clamp, 0, 0}, filter, {}};
        renderer.draw(textured);
        const uint8_t* p = px(image = renderer.readTarget("t"), 0, 0);
        if (filter == parity::GsFilter::Nearest) CHECK(p[0] == 64 && p[1] == 64);
        else CHECK(p[0] == 32 && p[1] == 32);
    }

    // A copy sprite: corners 0,0 and 640,224 with UV 0.5 and 640.5; bilinear shifts UV by half a texel, so pixel x reads
    // texel x with weight zero on its neighbours. A 24-bit texture's alpha is TA0, or zero on a black texel.
    {
        constexpr uint32_t CW = 640, CH = 224;
        std::vector<uint8_t> source(CW * CH * 4);
        for (uint32_t y = 0; y < CH; y++) for (uint32_t x = 0; x < CW; x++) {
            uint8_t* s = &source[(y * CW + x) * 4];
            s[0] = uint8_t(x * 37 + y); s[1] = uint8_t(y * 11 + x * 3); s[2] = uint8_t(x ^ y); s[3] = 0;
        }
        renderer.setTarget("copy", CW, CH, std::vector<uint8_t>(CW * CH * 4, 0));
        renderer.setDepth(CW, CH, std::vector<uint32_t>(CW * CH, 0));
        renderer.setTexture("source", CW, CH, source);
        parity::GsPass copy = pass(parity::GsPrimitive::Sprites, {{0, 0, 0, 128, 128, 128, 128, 0.5f, 0.5f, 1}, {640, 224, 0, 128, 128, 128, 128, 640.5f, 224.5f, 1}});
        copy.target = "copy";
        copy.scissor = {0, 0, 639, 223};
        copy.texture = parity::GsTexture{"source", false, 1024, 256, parity::GsCoordinates::Texel, {parity::GsAddressMode::RegionClamp, 0, 639}, {parity::GsAddressMode::RegionClamp, 0, 223},
                                      parity::GsFilter::Bilinear, {true, 127, true}};
        renderer.draw(copy);
        const std::vector<uint8_t> copied = renderer.readTarget("copy");
        uint32_t wrong = 0;
        for (uint32_t i = 0; i < CW * CH; i++) {
            const bool black = source[i * 4] == 0 && source[i * 4 + 1] == 0 && source[i * 4 + 2] == 0;
            const uint8_t alpha = black ? 0 : 127;
            const bool bad = copied[i * 4] != source[i * 4] || copied[i * 4 + 1] != source[i * 4 + 1] || copied[i * 4 + 2] != source[i * 4 + 2] || copied[i * 4 + 3] != alpha;
            wrong += bad;
        }
        if (wrong) std::fprintf(stderr, "copy: %u pixels differ from their texel\n", wrong);
        CHECK(wrong == 0);

        // The oracle's software renderer is built for SSE4.1: U steps in blocks of four pixels. Sprite x 278.625..339.4375,
        // U 0..63 bilinear: step 67893.40625, start -7307.97 at x 279 (skip 3). At x 296: -7307 + int(step * -3) + 5 * int(step * 4)
        // = -7307 - 203680 + 5 * 271573 = 1146878, texel 17, weight 7; red 4 * texel gives 68 + (4 * 7 >> 4) = 69 (blocks of eight give 70).
        std::vector<uint8_t> ramp(64 * 64 * 4, 0);
        for (uint32_t i = 0; i < 64 * 64; i++) ramp[i * 4] = uint8_t((i % 64) * 4);
        renderer.setTexture("ramp", 64, 64, ramp);
        parity::GsPass stepped = pass(parity::GsPrimitive::Sprites, {{278.625f, 0, 0, 128, 128, 128, 128, 0, 0, 1}, {339.4375f, 4, 0, 128, 128, 128, 128, 63, 63, 1}});
        stepped.target = "copy";
        stepped.scissor = {0, 0, 639, 223};
        stepped.texture = parity::GsTexture{"ramp", false, 64, 64, parity::GsCoordinates::Texel, {parity::GsAddressMode::Clamp, 0, 0}, {parity::GsAddressMode::Clamp, 0, 0}, parity::GsFilter::Bilinear, {}};
        renderer.draw(stepped);
        const std::vector<uint8_t> steps = renderer.readTarget("copy");
        if (steps[296 * 4] != 69) std::fprintf(stderr, "stepped: x 296 red %d\n", steps[296 * 4]);
        CHECK(steps[296 * 4] == 69);
    }

    // Gouraud colour keeps seven fraction bits (c << 7) and modulates as (texel << 2) * c7 >> 16. Red runs 100..132 over
    // x 0..64, half a unit per pixel: at x 1 c7 = 100.5 * 128 = 12864, 255 * 12864 >> 14 = 200; at x 3, 101.5 gives 202.
    {
        const std::vector<uint8_t> white{255, 255, 255, 128};
        renderer.setTexture("white", 1, 1, white);
        renderer.setTarget("t", W, H, black);
        parity::GsPass shaded = pass(parity::GsPrimitive::Triangles, {{0, 0, 0, 100, 0, 0, 128, 0, 0, 1}, {64, 0, 0, 132, 0, 0, 128, 0, 0, 1}, {0, 32, 0, 100, 0, 0, 128, 0, 0, 1}});
        shaded.texture = parity::GsTexture{"white", false, 1, 1, parity::GsCoordinates::Texel, {parity::GsAddressMode::Clamp, 0, 0}, {parity::GsAddressMode::Clamp, 0, 0}, parity::GsFilter::Nearest, {}};
        renderer.draw(shaded);
        image = renderer.readTarget("t");
        if (px(image, 1, 1)[0] != 200 || px(image, 3, 1)[0] != 202) std::fprintf(stderr, "gouraud: %d %d\n", px(image, 1, 1)[0], px(image, 3, 1)[0]);
        CHECK(px(image, 1, 1)[0] == 200 && px(image, 3, 1)[0] == 202);
    }

    // Triangles are walked as the GS rasterizer walks them: per row, the start value plus truncated steps in blocks of four.
    // A(0,0) red 0, B(60,0) red 58, C(0,60) red 0: cross -3600, step = -(58 * 128 * float(60 / -3600)) = 123.73333740234375.
    // At (57,1): lane 1, block 14: int(123.7333) + 14 * int(494.9333) = 123 + 6916 = 7039, red 7039 >> 7 = 54 (exact: 55.1).
    {
        renderer.setTarget("t", W, H, black);
        renderer.setDepth(W, H, depth100);
        renderer.draw(pass(parity::GsPrimitive::Triangles, {at(0, 0, 0, 0, 0, 0, 128), at(60, 0, 0, 58, 0, 0, 128), at(0, 60, 0, 0, 0, 0, 128)}));
        image = renderer.readTarget("t");
        if (px(image, 57, 1)[0] != 54) std::fprintf(stderr, "walked: red %d\n", px(image, 57, 1)[0]);
        CHECK(px(image, 57, 1)[0] == 54);

        // Depth steps in doubles from the float k3 = float(60 / -3600) = -0.01666666753590107: B's Z 2147479552 gives a step of
        // 35791327.73332977; at (40,1), block 10 lane 0, ten additions of 4 * step give 1431653109.33, truncated 1431653109 (exact: ...034.67).
        renderer.setDepth(W, H, depth100);
        renderer.draw(pass(parity::GsPrimitive::Triangles, {at(0, 0, 0, 0, 0, 0, 128), at(60, 0, 2147479552u, 0, 0, 0, 128), at(0, 60, 0, 0, 0, 0, 128)}));
        const uint32_t z = renderer.readDepth()[1 * W + 40];
        if (z != 1431653109u) std::fprintf(stderr, "walked: depth %u\n", z);
        CHECK(z == 1431653109u);

        // Columns alternate 0 and 240 red, so a bilinear weight w between an even and an odd texel reads 15 * w.
        std::vector<uint8_t> stripes(64 * 64 * 4, 0);
        for (uint32_t i = 0; i < 64 * 64; i++) { stripes[i * 4] = (i % 2) ? 240 : 0; stripes[i * 4 + 3] = 128; }
        renderer.setTexture("stripes", 64, 64, stripes);

        // Texel coordinates step as truncated integers: A(0,0) U 0, B(49.8125,0) U 25.3125, C(0,49.8125) U 0, less half a texel:
        // step float(-(405 * 4096 * float(49.8125 / -2481.28515625))) = 33302.484375; at (46,1): -32768 + int(33302.48 * 2) + 11 * 133209
        // = 1499135, texel 22, weight 13, red 195 (exact: 1499146.3, weight 14).
        renderer.setTarget("t", W, H, black);
        parity::GsPass texel = pass(parity::GsPrimitive::Triangles, {{0, 0, 0, 128, 128, 128, 128, 0, 0, 1}, {49.8125f, 0, 0, 128, 128, 128, 128, 25.3125f, 0, 1}, {0, 49.8125f, 0, 128, 128, 128, 128, 0, 0, 1}});
        texel.texture = parity::GsTexture{"stripes", false, 64, 64, parity::GsCoordinates::Texel, {parity::GsAddressMode::Clamp, 0, 0}, {parity::GsAddressMode::Clamp, 0, 0}, parity::GsFilter::Bilinear, {}};
        renderer.draw(texel);
        image = renderer.readTarget("t");
        if (px(image, 46, 1)[0] != 195) std::fprintf(stderr, "walked: texel red %d\n", px(image, 46, 1)[0]);
        CHECK(px(image, 46, 1)[0] == 195);

        // S T Q step as floats, added once per block, and S / Q is divided per pixel: A(0,0) S 0 Q 1, B(57.0625,0) S 36.5 Q 2,
        // C(0,57.0625) S 0 Q 1, texture 64 wide. At (48,1) the GS reads u = int(s / q) - 0x8000 = 69910520: texel 1066 (42 after
        // repeat), weight 11, red 165 (exact: 69910557, weight 12).
        renderer.setTarget("t", W, H, black);
        parity::GsPass projective = pass(parity::GsPrimitive::Triangles, {{0, 0, 0, 128, 128, 128, 128, 0, 0, 1}, {57.0625f, 0, 0, 128, 128, 128, 128, 36.5f, 0, 2}, {0, 57.0625f, 0, 128, 128, 128, 128, 0, 0, 1}});
        projective.texture = parity::GsTexture{"stripes", false, 64, 64, parity::GsCoordinates::Projective, {parity::GsAddressMode::Repeat, 0, 0}, {parity::GsAddressMode::Repeat, 0, 0}, parity::GsFilter::Bilinear, {}};
        renderer.draw(projective);
        image = renderer.readTarget("t");
        if (px(image, 48, 1)[0] != 165) std::fprintf(stderr, "walked: projective red %d\n", px(image, 48, 1)[0]);
        CHECK(px(image, 48, 1)[0] == 165);

        // Every Q equal (2, not 1): the GS divides on the vertices, t = S / Q * (64 << 16), and steps integers with the half texel
        // taken off the vertices. B's S 0.791015625 gives 0.3955078125 * 4194304 = 1658880 = 405 * 4096, the texel case above:
        // at (46,1) u = 1499135, weight 13, red 195 (S / Q per pixel would read 1499146, weight 14, red 210).
        renderer.setTarget("t", W, H, black);
        parity::GsPass equalQ = pass(parity::GsPrimitive::Triangles, {{0, 0, 0, 128, 128, 128, 128, 0, 0, 2}, {49.8125f, 0, 0, 128, 128, 128, 128, 0.791015625f, 0, 2}, {0, 49.8125f, 0, 128, 128, 128, 128, 0, 0, 2}});
        equalQ.texture = parity::GsTexture{"stripes", false, 64, 64, parity::GsCoordinates::Projective, {parity::GsAddressMode::Clamp, 0, 0}, {parity::GsAddressMode::Clamp, 0, 0}, parity::GsFilter::Bilinear, {}};
        renderer.draw(equalQ);
        image = renderer.readTarget("t");
        if (px(image, 46, 1)[0] != 195) std::fprintf(stderr, "walked: equal Q red %d\n", px(image, 46, 1)[0]);
        CHECK(px(image, 46, 1)[0] == 195);

        // Colour is floored at 0 after each block, per lane. A(0,0) red 64, B(64,0) red -64 (a plane through 0; GS vertices are
        // unsigned, so this isolates the floor), C(0,64) red 64: cross -4096, step -16384 * (1 / 64) = -256, block -1024, row 1 starts
        // at 8192. At (37,1), lane 1 starts at 7936; eight blocks take it to -256, floored to 0; the ninth stays 0: red 0. Without the
        // floor, 7936 - 9 * 1024 = -1280 wraps to 0xfb00, >> 7 = 502, saturated 255.
        renderer.setTarget("t", W, H, black);
        renderer.draw(pass(parity::GsPrimitive::Triangles, {at(0, 0, 0, 64, 0, 0, 128), at(64, 0, 0, -64, 0, 0, 128), at(0, 64, 0, 64, 0, 0, 128)}));
        image = renderer.readTarget("t");
        if (px(image, 37, 1)[0] != 0 || px(image, 4, 1)[0] != 56) std::fprintf(stderr, "walked: floor red %d %d\n", px(image, 37, 1)[0], px(image, 4, 1)[0]);
        CHECK(px(image, 37, 1)[0] == 0 && px(image, 4, 1)[0] == 56);

        // Three distinct rows: v0(0,0) red 0, v1(32,16) red 64, v2(0,32) red 0. Below v1 the second section starts from v1 itself:
        // cross -1024, dscan red = -(8192 * (32 / -1024)) = 256, dedge red 0; at row 20, dy 4, left ceil(0 + 0 * 4) = 0, prestep 0 - 32,
        // scan 8192 + 256 * -32 = 0; at x 10 (block 2, lane 2) 512 + 2 * 1024 = 2560, red 20.
        renderer.setTarget("t", W, H, black);
        renderer.draw(pass(parity::GsPrimitive::Triangles, {at(0, 0, 0, 0, 0, 0, 128), at(32, 16, 0, 64, 0, 0, 128), at(0, 32, 0, 0, 0, 0, 128)}));
        image = renderer.readTarget("t");
        if (px(image, 10, 20)[0] != 20) std::fprintf(stderr, "walked: lower section red %d\n", px(image, 10, 20)[0]);
        CHECK(px(image, 10, 20)[0] == 20);
    }

    // PRIM.AA1: a triangle's interior takes alpha 0x80, then each edge adds one pixel per major step on its outside, with the
    // coverage 1 - (distance from that pixel's centre to the edge) as alpha (cov16 >> 9), blended with ALPHA, depth tested, not written.
    const parity::GsBlend Coverage{parity::GsBlendTerm::Source, parity::GsBlendTerm::Destination, parity::GsBlendFactor::SourceAlpha, parity::GsBlendTerm::Destination, 0};
    {
        // Top edge y 2.25 (horizontal, top-left, outside is up): row 2 sits 0.25 above it, cov int(65535 * 0.75) = 49151, alpha 95;
        // red 128 * 95 >> 7 = 95 over black. Row 3 is interior: red 128, alpha 128, depth written.
        renderer.setTarget("t", W, H, black);
        renderer.setDepth(W, H, depth100);
        parity::GsPass top = pass(parity::GsPrimitive::Triangles, {at(4.5f, 2.25f, 7, 128, 0, 0, 64), at(40.5f, 2.25f, 7, 128, 0, 0, 64), at(4.5f, 28.25f, 7, 128, 0, 0, 64)});
        top.antialias = true;
        top.blend = Coverage;
        renderer.draw(top);
        image = renderer.readTarget("t");
        depth = renderer.readDepth();
        const uint8_t* edge = px(image, 20, 2);
        const uint8_t* inside = px(image, 20, 3);
        if (edge[0] != 95 || edge[3] != 95 || inside[0] != 128 || inside[3] != 128) std::fprintf(stderr, "aa top edge: %d/%d inside %d/%d\n", edge[0], edge[3], inside[0], inside[3]);
        CHECK(edge[0] == 95 && edge[3] == 95 && inside[0] == 128 && inside[3] == 128);
        CHECK(depth[2 * W + 20] == 100 && depth[3 * W + 20] == 7);

        // Two triangles sharing the vertical edge x 10.5, red on the left, green on the right, drawn as the GS orders them: the left
        // triangle's interior, its edges, then the right one. The left triangle's ring on x 11 (d = -0.5, cov 0.5, alpha 63) is covered
        // by the right interior: (11,10) is green 128, alpha 128. The right triangle's ring on x 10 blends green at 63 over red:
        // red ((0 - 128) * 63 >> 7) + 128 = 65, green 128 * 63 >> 7 = 63, alpha 63.
        renderer.setTarget("t", W, H, black);
        parity::GsPass pair = pass(parity::GsPrimitive::Triangles, {at(2.5f, 2, 0, 128, 0, 0, 64), at(10.5f, 2, 0, 128, 0, 0, 64), at(10.5f, 20, 0, 128, 0, 0, 64),
                                                              at(10.5f, 2, 0, 0, 128, 0, 64), at(10.5f, 20, 0, 0, 128, 0, 64), at(18.5f, 20, 0, 0, 128, 0, 64)});
        pair.antialias = true;
        pair.blend = Coverage;
        renderer.draw(pair);
        image = renderer.readTarget("t");
        const uint8_t* right = px(image, 11, 10);
        const uint8_t* left = px(image, 10, 10);
        if (right[0] != 0 || right[1] != 128 || right[3] != 128 || left[0] != 65 || left[1] != 63 || left[3] != 63)
            std::fprintf(stderr, "aa shared edge: right %d %d %d left %d %d %d\n", right[0], right[1], right[3], left[0], left[1], left[3]);
        CHECK(right[0] == 0 && right[1] == 128 && right[3] == 128 && left[0] == 65 && left[1] == 63 && left[3] == 63);

        // Edge pixels are depth tested with the edge's Z. The same pair with Z >= against 100, the left triangle at Z 1000 and the
        // right at 500: the right ring on x 10 (Z 500) fails against the left interior's 1000, so (10,10) stays red 128, alpha 128;
        // the left ring on x 11 wrote no Z, so the right interior (500 >= 100) still covers (11,10).
        renderer.setTarget("t", W, H, black);
        renderer.setDepth(W, H, depth100);
        parity::GsPass deep = pair;
        for (size_t i = 0; i < 6; i++) deep.vertices[i].depth = i < 3 ? 1000 : 500;
        deep.depth = {parity::GsDepthTest::GreaterEqual, true};
        renderer.draw(deep);
        image = renderer.readTarget("t");
        if (px(image, 10, 10)[0] != 128 || px(image, 10, 10)[3] != 128 || px(image, 11, 10)[1] != 128)
            std::fprintf(stderr, "aa edge depth: (10,10) %d/%d (11,10) green %d\n", px(image, 10, 10)[0], px(image, 10, 10)[3], px(image, 11, 10)[1]);
        CHECK(px(image, 10, 10)[0] == 128 && px(image, 10, 10)[3] == 128 && px(image, 11, 10)[1] == 128 && px(image, 11, 10)[3] == 128);

        // A line is all edge: x 2..20 at y 10.25. The start (distance 0.25 inside the diamond) is drawn, the end is not: x 2..19.
        // D = 9216 * 0.25 = 2304 of scaleD 9216, cov int(65535 * 0.25) = 16383: the main pixel (x, 10) takes 65535 - 16383 >> 9 = 96,
        // the neighbour (x, 11) 16383 >> 9 = 31. Additive red 200: 200 * 96 >> 7 = 150, 200 * 31 >> 7 = 48. No depth is written.
        renderer.setTarget("t", W, H, black);
        renderer.setDepth(W, H, depth100);
        parity::GsPass line = pass(parity::GsPrimitive::Lines, {at(2, 10.25f, 500, 200, 0, 0, 64), at(20, 10.25f, 500, 200, 0, 0, 64)});
        line.antialias = true;
        line.blend = Add;
        line.depth = {parity::GsDepthTest::Greater, true};
        renderer.draw(line);
        image = renderer.readTarget("t");
        depth = renderer.readDepth();
        const uint8_t* centre = px(image, 10, 10);
        const uint8_t* neighbour = px(image, 10, 11);
        if (centre[0] != 150 || centre[3] != 96 || neighbour[0] != 48 || neighbour[3] != 31 || px(image, 2, 10)[0] != 150 || px(image, 20, 10)[0] != 0)
            std::fprintf(stderr, "aa line: %d/%d %d/%d first %d after %d\n", centre[0], centre[3], neighbour[0], neighbour[3], px(image, 2, 10)[0], px(image, 20, 10)[0]);
        CHECK(centre[0] == 150 && centre[3] == 96 && neighbour[0] == 48 && neighbour[3] == 31);
        CHECK(px(image, 2, 10)[0] == 150 && px(image, 20, 10)[0] == 0 && px(image, 10, 9)[0] == 0);
        CHECK(depth[10 * W + 10] == 100);
    }

    // When every vertex of an STQ draw has the same Z, PCSX2 rounds the coordinates down before drawing (GSState::FlushPrim):
    // Q loses its low 8 bits, S and T their low 9 + (exp(max(S, Q)) - exp(S)) bits. S 0.75, Q 0x3f8000ff (1.0000304) on all
    // three vertices: Q becomes 1.0, u = 0.75 * (64 << 16) - 0x8000 = 3112960, texel 47, weight 8 between the stripes' 240 and 0:
    // red 240 - (240 * 8 >> 4) = 120. Unrounded, u = int(3145632.5 - 32768) = 3112864, weight 7, red 135; so with C's Z
    // different the draw keeps its bits and reads 135.
    {
        const float q = std::bit_cast<float>(0x3f8000ffu);
        for (const uint32_t cz : {7u, 8u}) {
            renderer.setTarget("t", W, H, black);
            renderer.setDepth(W, H, depth100);
            parity::GsPass rounded = pass(parity::GsPrimitive::Triangles, {{0, 0, 7, 128, 128, 128, 128, 0.75f, 0, q}, {40, 0, 7, 128, 128, 128, 128, 0.75f, 0, q}, {0, 30, cz, 128, 128, 128, 128, 0.75f, 0, q}});
            rounded.texture = parity::GsTexture{"stripes", false, 64, 64, parity::GsCoordinates::Projective, {parity::GsAddressMode::Repeat, 0, 0}, {parity::GsAddressMode::Repeat, 0, 0}, parity::GsFilter::Bilinear, {}};
            renderer.draw(rounded);
            image = renderer.readTarget("t");
            const uint8_t expected = cz == 7 ? 120 : 135;
            if (px(image, 10, 10)[0] != expected) std::fprintf(stderr, "stq rounding (C z %u): red %d\n", cz, px(image, 10, 10)[0]);
            CHECK(px(image, 10, 10)[0] == expected);
        }
    }

    // Z24 (ZBUF.PSM 1), as PCSX2's software renderer does it (GSRendererSW.cpp ConvertVertexBuffer, GSDrawScanline.cpp zclamp): a sprite's Z
    // is clamped to 0xFFFFFF, a triangle's too when the draw's largest vertex Z is above it; the buffer's depth is its low 24 bits and a
    // write keeps the upper byte. The buffer holds 0xAB00FFF0 (upper byte 0xAB): z 0x01FFFFFF clamps to 0xFFFFFF, passes and stores
    // 0xABFFFFFF; as Z32 it would fail against 0xAB00FFF0.
    {
        for (const bool z24 : {true, false}) {
            renderer.setTarget("t", W, H, black);
            renderer.setDepth(W, H, std::vector<uint32_t>(W * H, 0xAB00FFF0u));
            parity::GsPass p = pass(parity::GsPrimitive::Sprites, {at(0, 0, 0x01FFFFFFu, 0, 0, 0, 0), at(4, 4, 0x01FFFFFFu, 9, 9, 9, 9)});
            p.depth = {parity::GsDepthTest::GreaterEqual, true, z24};
            renderer.draw(p);
            const bool drawn = renderer.readTarget("t")[0] == 9;
            const uint32_t stored = renderer.readDepth()[0];
            if (z24) CHECK(drawn && stored == 0xABFFFFFFu);
            else CHECK(!drawn && stored == 0xAB00FFF0u);
        }
        // From a buffer of zeros under Z >=: 0x00FFFFF0 passes and stores 0xFFFFF0; 0x01000010 clamps to 0xFFFFFF (it does not wrap to 0x10)
        // and passes too.
        renderer.setTarget("t", W, H, black);
        renderer.setDepth(W, H, std::vector<uint32_t>(W * H, 0));
        for (const auto& [z, value, stored] : {std::tuple{0x00FFFFF0u, 1, 0x00FFFFF0u}, std::tuple{0x01000010u, 2, 0x00FFFFFFu}}) {
            parity::GsPass p = pass(parity::GsPrimitive::Sprites, {at(0, 0, z, 0, 0, 0, 0), at(4, 4, z, float(value), 0, 0, 128)});
            p.depth = {parity::GsDepthTest::GreaterEqual, true, true};
            renderer.draw(p);
            CHECK(renderer.readTarget("t")[0] == value);
            CHECK(renderer.readDepth()[0] == stored);
        }
        // A triangle whose largest vertex Z is above 24 bits clamps its pixels the same way: all three at 0x01000005 store 0xFFFFFF, where a
        // wrap would store 0x5; one wholly below 24 bits keeps its own Z.
        for (const auto& [z, stored] : {std::pair{0x01000005u, 0x00FFFFFFu}, std::pair{0x00ABCDEFu, 0x00ABCDEFu}}) {
            renderer.setTarget("t", W, H, black);
            renderer.setDepth(W, H, std::vector<uint32_t>(W * H, 0));
            parity::GsPass p = pass(parity::GsPrimitive::Triangles, {at(0, 0, z, 5, 0, 0, 128), at(30, 0, z, 5, 0, 0, 128), at(0, 30, z, 5, 0, 0, 128)});
            p.depth = {parity::GsDepthTest::GreaterEqual, true, true};
            renderer.draw(p);
            CHECK(renderer.readTarget("t")[(1 * W + 1) * 4] == 5);
            CHECK(renderer.readDepth()[1 * W + 1] == stored);
        }
        // A test only (ZMSK): the buffer is not written.
        renderer.setTarget("t", W, H, black);
        renderer.setDepth(W, H, std::vector<uint32_t>(W * H, 0x00FFFFF0u));
        parity::GsPass masked = pass(parity::GsPrimitive::Sprites, {at(0, 0, 0x00FFFFFFu, 0, 0, 0, 0), at(4, 4, 0x00FFFFFFu, 7, 0, 0, 128)});
        masked.depth = {parity::GsDepthTest::Greater, false, true};
        renderer.draw(masked);
        CHECK(renderer.readTarget("t")[0] == 7 && renderer.readDepth()[0] == 0x00FFFFF0u);

        // An antialiased triangle's edge pixels extrapolate past the vertices and take the edge's Z clamped to the buffer's range
        // (ClampVertex): the top vertex has the largest Z, 0xFFFFFF, so the edge pixels above it are beyond 24 bits. Under Z > against a
        // buffer of 0xFFFFFF, nothing passes when Z24 clamps them to 0xFFFFFF, while as Z32 the extrapolated ones do.
        for (const bool z24 : {true, false}) {
            renderer.setTarget("t", W, H, black);
            renderer.setDepth(W, H, std::vector<uint32_t>(W * H, 0x00FFFFFFu));
            parity::GsPass edge = pass(parity::GsPrimitive::Triangles, {at(20.5f, 4.25f, 0x00FFFFFFu, 200, 0, 0, 64), at(8.5f, 28.25f, 0x00FFFF00u, 200, 0, 0, 64), at(32.5f, 28.25f, 0x00FFFF00u, 200, 0, 0, 64)});
            edge.antialias = true;
            edge.blend = Add;
            edge.depth = {parity::GsDepthTest::Greater, false, z24};
            renderer.draw(edge);
            const std::vector<uint8_t> edgeImage = renderer.readTarget("t");
            uint32_t lit = 0;
            for (uint32_t i = 0; i < W * H; i++) lit += edgeImage[i * 4] != 0;
            if (z24 != (lit == 0)) std::fprintf(stderr, "z24 %d edge: %u pixels lit\n", z24, lit);
            CHECK(z24 == (lit == 0));
        }
        renderer.setDepth(W, H, depth100);
    }

    // PSMCT16 textures: the fixture holds each texel as (c5 << 3 per channel, alpha 0x80 when bit 15 is set); the pass carries TEXA.
    // 0xFFFF is (248,248,248,TA1), 0x7FFF (248,248,248,TA0), 0x8000 black with TA1, 0x0000 black with TA0; AEM zeroes black's alpha.
    {
        const std::vector<uint8_t> sixteen{248, 248, 248, 0x80, 248, 248, 248, 0, 0, 0, 0, 0x80, 0, 0, 0, 0};
        renderer.setTexture("sixteen", 4, 1, sixteen);
        for (const bool aem : {true, false}) {
            renderer.setTarget("t", W, H, black);
            parity::GsPass p = pass(parity::GsPrimitive::Sprites, {{0, 0, 0, 128, 128, 128, 128, 0, 0, 1}, {4, 1, 0, 128, 128, 128, 128, 4, 1, 1}});
            p.texture = parity::GsTexture{"sixteen", false, 4, 1, parity::GsCoordinates::Texel, {parity::GsAddressMode::Clamp, 0, 0}, {parity::GsAddressMode::Clamp, 0, 0},
                                          parity::GsFilter::Nearest, {false, 127, aem, true, 129}};
            renderer.draw(p);
            image = renderer.readTarget("t");
            const uint8_t expected[4][4] = {{248, 248, 248, 129}, {248, 248, 248, 127}, {0, 0, 0, uint8_t(aem ? 0 : 129)}, {0, 0, 0, uint8_t(aem ? 0 : 127)}};
            for (uint32_t x = 0; x < 4; x++) {
                const uint8_t* q = px(image, x, 0);
                if (q[0] != expected[x][0] || q[1] != expected[x][1] || q[2] != expected[x][2] || q[3] != expected[x][3])
                    std::fprintf(stderr, "ct16 aem %d texel %u: %d %d %d %d\n", aem, x, q[0], q[1], q[2], q[3]);
                CHECK(q[0] == expected[x][0] && q[1] == expected[x][1] && q[2] == expected[x][2] && q[3] == expected[x][3]);
            }
        }
    }

    // PABE (rule read from GSDrawScanline.cpp; no capture has PABE with blending, so the oracle has never confirmed it and fixtures refuse that state): with blending on, a pixel blends only when the source alpha's bit 7 is set. Red 200 over a destination of 100 with
    // (Cs - Cd) * As + Cd: alpha 0x7F gives 199 blended and 200 replacing; alpha 0xC0 blends either way: 250.
    {
        for (const bool pabe : {true, false}) for (const uint8_t alpha : {uint8_t(0x7F), uint8_t(0xC0)}) {
            renderer.setTarget("t", W, H, std::vector<uint8_t>(W * H * 4, 100));
            parity::GsPass p = pass(parity::GsPrimitive::Sprites, {at(0, 0, 0, 0, 0, 0, 0), at(4, 4, 0, 200, 0, 0, alpha)});
            p.blend = parity::GsBlend{parity::GsBlendTerm::Source, parity::GsBlendTerm::Destination, parity::GsBlendFactor::SourceAlpha, parity::GsBlendTerm::Destination, 0};
            p.perPixelAlpha = pabe;
            renderer.draw(p);
            const std::vector<uint8_t> written = renderer.readTarget("t");
            const uint8_t red = written[0], writtenAlpha = written[3];
            const uint8_t expected = alpha == 0xC0 ? 250 : pabe ? 200 : 199;
            // A blending pixel under PABE also writes the blended alpha, (As - Ad) * As >> 7 + Ad = (192 - 100) * 192 >> 7 + 100 = 238; every other pixel
            // writes its source alpha.
            const uint8_t expectedAlpha = pabe && alpha == 0xC0 ? 238 : alpha;
            if (red != expected || writtenAlpha != expectedAlpha) std::fprintf(stderr, "pabe %d alpha 0x%x: red %d (expected %d) alpha %d (expected %d)\n", pabe, alpha, red, expected, writtenAlpha, expectedAlpha);
            CHECK(red == expected && writtenAlpha == expectedAlpha);
        }
    }

    // FBA: the written alpha has bit 7 forced on.
    {
        for (const bool fba : {true, false}) {
            renderer.setTarget("t", W, H, black);
            parity::GsPass p = pass(parity::GsPrimitive::Sprites, {at(0, 0, 0, 0, 0, 0, 0), at(4, 4, 0, 10, 20, 30, 0x10)});
            p.alphaCorrection = fba;
            renderer.draw(p);
            const std::vector<uint8_t> written = renderer.readTarget("t");
            const uint8_t* q = written.data();
            CHECK(q[0] == 10 && q[1] == 20 && q[2] == 30 && q[3] == (fba ? 0x90 : 0x10));
        }
    }

    // A mip level (the towers sample level 2): the texture given is the level's image and the vertices keep the base level's coordinates,
    // which the rule scales by the base size (level width << level) and shifts back by the level, as the GS does when LOD is constant.
    // Base 4 x 4, level 1 is 2 x 2 with red 10 20 / 30 40. Across a triangle (0,0) (30,0) (0,30), pixel (5,5) reads texel (0,0), (20,5) texel
    // (1,0), (5,20) texel (0,1), as projective S T with Q 1 and as texel coordinates U V up to 4; level 0 over the same 2 x 2 image would
    // read the base coordinates 1.33 and 2.67 of its own two texels, wrapping.
    {
        const std::vector<uint8_t> level1{10, 0, 0, 128, 20, 0, 0, 128, 30, 0, 0, 128, 40, 0, 0, 128};
        renderer.setTexture("level1", 2, 2, level1);
        for (const bool texelCoordinates : {false, true}) {
            renderer.setTarget("t", W, H, black);
            renderer.setDepth(W, H, depth100);
            const float edge = texelCoordinates ? 4.0f : 1.0f;
            parity::GsPass p = pass(parity::GsPrimitive::Triangles, {{0, 0, 0, 128, 128, 128, 128, 0, 0, 1}, {30, 0, 0, 128, 128, 128, 128, edge, 0, 1}, {0, 30, 0, 128, 128, 128, 128, 0, edge, 1}});
            p.texture = parity::GsTexture{"level1", false, 2, 2, texelCoordinates ? parity::GsCoordinates::Texel : parity::GsCoordinates::Projective,
                                          {parity::GsAddressMode::Clamp, 0, 0}, {parity::GsAddressMode::Clamp, 0, 0}, parity::GsFilter::Nearest, {}, 1};
            renderer.draw(p);
            image = renderer.readTarget("t");
            if (px(image, 5, 5)[0] != 10 || px(image, 20, 5)[0] != 20 || px(image, 5, 20)[0] != 30)
                std::fprintf(stderr, "mip level 1 (%s): %d %d %d\n", texelCoordinates ? "texel" : "projective", px(image, 5, 5)[0], px(image, 20, 5)[0], px(image, 5, 20)[0]);
            CHECK(px(image, 5, 5)[0] == 10 && px(image, 20, 5)[0] == 20 && px(image, 5, 20)[0] == 30);
        }
        // Bilinear takes its half texel off after the shift, in the level's own texels: at (20,5), S 0.667 is 1.33 level texels, less
        // 0.5 is 0.83, texel 0 with weight 13 of 16 (0.83 * 16 = 13.3): red 10 + (20 - 10) * 13 / 16 = 18; the same pixel at level 0 of
        // a texture twice the size would not give this.
        renderer.setTarget("t", W, H, black);
        parity::GsPass bilinear = pass(parity::GsPrimitive::Triangles, {{0, 0, 0, 128, 128, 128, 128, 0, 0, 1}, {30, 0, 0, 128, 128, 128, 128, 1, 0, 1}, {0, 30, 0, 128, 128, 128, 128, 0, 1, 1}});
        bilinear.texture = parity::GsTexture{"level1", false, 2, 2, parity::GsCoordinates::Projective, {parity::GsAddressMode::Clamp, 0, 0}, {parity::GsAddressMode::Clamp, 0, 0}, parity::GsFilter::Bilinear, {}, 1};
        renderer.draw(bilinear);
        image = renderer.readTarget("t");
        if (px(image, 20, 1)[0] < 17 || px(image, 20, 1)[0] > 19) std::fprintf(stderr, "mip level 1 bilinear: %d\n", px(image, 20, 1)[0]);
        CHECK(px(image, 20, 1)[0] >= 17 && px(image, 20, 1)[0] <= 19);
        bool threw = false;
        parity::GsPass sprite = pass(parity::GsPrimitive::Sprites, {{0, 0, 0, 128, 128, 128, 128, 0, 0, 1}, {4, 4, 0, 128, 128, 128, 128, 4, 4, 1}});
        sprite.texture = bilinear.texture;
        try { renderer.draw(sprite); } catch (const std::logic_error&) { threw = true; }
        CHECK(threw);
    }

    CHECK(context.validationErrors() == 0);
    return 0;
}
