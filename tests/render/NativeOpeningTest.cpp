#include <stb_image.h>

#include <array>
#include <cmath>
#include <cstdio>
#include <filesystem>
#include <stdexcept>
#include <string>
#include <vector>

#include "../Check.hpp"
#include "Render/Device.hpp"
#include "Render/NativeRenderer.hpp"

namespace {

using scene::BlendOp;
using scene::Pass;
using scene::TargetName;

constexpr uint32_t kWidth = 640, kHeight = 448;
uint32_t g_samples = 1;

Pass sprite(TargetName target, BlendOp blend, uint8_t r, uint8_t g, uint8_t b, uint8_t a, float x0 = 0, float y0 = 0, float x1 = 640, float y1 = 224) {
    Pass p;
    p.name = "sprite";
    p.target = target;
    p.topology = scene::PassTopology::Sprites;
    p.material.blend = blend;
    p.vertices = {{x0, y0, 0, 0, 0, 1, r, g, b, a}, {x1, y1, 0, 0, 0, 1, r, g, b, a}};
    return p;
}

scene::Frame frameOf(std::vector<Pass> passes, scene::TextureSet set = scene::TextureSet::Clock) {
    scene::Frame f;
    f.passes = std::move(passes);
    f.textAt = f.passes.size();
    f.textureSet = set;
    return f;
}

std::array<int, 4> pixel(const std::vector<uint8_t>& rgba, uint32_t x, uint32_t y) {
    const size_t at = (size_t(y) * kWidth + x) * 4;
    return {rgba[at], rgba[at + 1], rgba[at + 2], rgba[at + 3]};
}

bool near(const std::array<int, 4>& got, double r, double g, double b, const char* what) {
    const double want[3] = {r, g, b};
    for (int i = 0; i < 3; ++i)
        if (std::fabs(got[i] - want[i]) > 1.0) {
            std::fprintf(stderr, "%s: got %d %d %d, want %.2f %.2f %.2f\n", what, got[0], got[1], got[2], r, g, b);
            return false;
        }
    return true;
}

// Cs x Ad + Cd: the destination's alpha is the target's stored alpha over 128.
int addDestinationAlpha(render::NativeRenderer& renderer) {
    renderer.configure({kWidth, kHeight, g_samples});
    renderer.draw(frameOf({sprite(TargetName::Display, BlendOp::Opaque, 100, 100, 100, 0x40), sprite(TargetName::Display, BlendOp::AddDestinationAlpha, 60, 200, 10, 0x80)}));
    CHECK(near(pixel(renderer.readTarget(TargetName::Display), 320, 224), 100 + 60 * 0.5, 100 + 200 * 0.5, 100 + 10 * 0.5, "Ad 0.5"));
    renderer.draw(frameOf({sprite(TargetName::Display, BlendOp::Opaque, 100, 100, 100, 0x80), sprite(TargetName::Display, BlendOp::AddDestinationAlpha, 60, 100, 10, 0x20)}));
    CHECK(near(pixel(renderer.readTarget(TargetName::Display), 17, 300), 160, 200, 110, "Ad 1.0"));
    renderer.draw(frameOf({sprite(TargetName::Display, BlendOp::Opaque, 100, 100, 100, 0x00), sprite(TargetName::Display, BlendOp::AddDestinationAlpha, 60, 100, 10, 0x80)}));
    CHECK(near(pixel(renderer.readTarget(TargetName::Display), 600, 10), 100, 100, 100, "Ad 0"));
    return 0;
}

// Cd - Cs x constant / 128.
int subtractFixed(render::NativeRenderer& renderer) {
    renderer.configure({kWidth, kHeight, g_samples});
    Pass full = sprite(TargetName::Display, BlendOp::SubtractFixed, 60, 20, 90, 0x00);
    full.material.blendConstant = 0x80;
    renderer.draw(frameOf({sprite(TargetName::Display, BlendOp::Opaque, 128, 128, 128, 0x80), full}));
    CHECK(near(pixel(renderer.readTarget(TargetName::Display), 320, 224), 128 - 60, 128 - 20, 128 - 90, "SubtractFixed 0x80"));
    Pass quarter = full;
    quarter.material.blendConstant = 0x20;
    renderer.draw(frameOf({sprite(TargetName::Display, BlendOp::Opaque, 128, 128, 128, 0x80), quarter}));
    CHECK(near(pixel(renderer.readTarget(TargetName::Display), 320, 224), 128 - 60 * 0.25, 128 - 20 * 0.25, 128 - 90 * 0.25, "SubtractFixed 0x20"));
    return 0;
}

// Per-pixel alpha only appears with blending off in the opening: it draws as a plain pass, and with blending on the
// frame is refused.
int perPixelAlpha(render::NativeRenderer& renderer) {
    renderer.configure({kWidth, kHeight, g_samples});
    Pass copy = sprite(TargetName::Display, BlendOp::Opaque, 60, 200, 10, 127);
    copy.material.perPixelAlpha = true;
    renderer.draw(frameOf({sprite(TargetName::Display, BlendOp::Opaque, 100, 100, 100, 0x80), copy}));
    auto rgba = renderer.readTarget(TargetName::Display);
    CHECK(near(pixel(rgba, 100, 224), 60, 200, 10, "PABE without blending"));
    CHECK(pixel(rgba, 100, 224)[3] == 127);
    Pass plain = copy;
    plain.material.perPixelAlpha = false;
    renderer.draw(frameOf({sprite(TargetName::Display, BlendOp::Opaque, 100, 100, 100, 0x80), plain}));
    CHECK(pixel(renderer.readTarget(TargetName::Display), 100, 224) == pixel(rgba, 100, 224));
    for (BlendOp op : {BlendOp::Add, BlendOp::AlphaOver, BlendOp::AddDestinationAlpha}) {
        Pass blended = copy;
        blended.material.blend = op;
        bool refused = false;
        try {
            renderer.draw(frameOf({blended}));
        } catch (const std::logic_error&) {
            refused = true;
        }
        CHECK(refused);
    }
    return 0;
}

// The Store holds 320 x 224 of content: a sprite reading it across 640 texels finds the right half black.
int store(render::NativeRenderer& renderer) {
    renderer.configure({kWidth, kHeight, g_samples});
    Pass copy = sprite(TargetName::Display, BlendOp::Opaque, 0x80, 0x80, 0x80, 0x80);
    copy.material.source = scene::SourceKind::Target;
    copy.material.sourceTarget = TargetName::Store;
    copy.material.sampling = scene::Sampling::ClampToRegion;
    copy.material.region = {0, 639, 0, 223};
    copy.vertices[0].u = 0.0f;
    copy.vertices[0].v = 0.0f;
    copy.vertices[1].u = 640.0f;
    copy.vertices[1].v = 224.0f;
    renderer.draw(frameOf({sprite(TargetName::Display, BlendOp::Opaque, 9, 9, 9, 0x80),
                           sprite(TargetName::Store, BlendOp::Opaque, 200, 150, 100, 0x80, 0, 0, 320, 224), copy}));
    const auto rgba = renderer.readTarget(TargetName::Display);
    CHECK(near(pixel(rgba, 100, 224), 200, 150, 100, "store left half"));
    CHECK(near(pixel(rgba, 500, 224), 0, 0, 0, "store right half"));
    CHECK(near(pixel(renderer.readTarget(TargetName::Store), 500, 224), 0, 0, 0, "store target"));
    return 0;
}

// The Extra target is 1024 x 256 as a texture with its 640 x 224 picture at the corner: S reaches 0.625 and T 0.875
// at the picture's far edge.
int extra(render::NativeRenderer& renderer) {
    renderer.configure({kWidth, kHeight, g_samples});
    Pass read = sprite(TargetName::Display, BlendOp::Opaque, 0x80, 0x80, 0x80, 0x80);
    read.material.source = scene::SourceKind::Target;
    read.material.sourceTarget = TargetName::Extra;
    read.material.coordinates = scene::CoordinateKind::Projective;
    read.material.sampling = scene::Sampling::ClampToRegion;
    read.material.region = {0, 639, 0, 223};
    read.vertices[0].u = 0.0f;
    read.vertices[0].v = 0.0f;
    read.vertices[1].u = 0.625f;
    read.vertices[1].v = 0.875f;
    renderer.draw(frameOf({sprite(TargetName::Extra, BlendOp::Opaque, 10, 200, 10, 0x80, 0, 0, 320, 112), sprite(TargetName::Extra, BlendOp::Opaque, 10, 10, 200, 0x80, 320, 0, 640, 112),
                           sprite(TargetName::Extra, BlendOp::Opaque, 200, 10, 10, 0x80, 0, 112, 640, 224), read}, scene::TextureSet::Opening));
    const auto rgba = renderer.readTarget(TargetName::Display);
    CHECK(near(pixel(rgba, 280, 100), 10, 200, 10, "extra top left"));
    CHECK(near(pixel(rgba, 360, 100), 10, 10, 200, "extra top right"));
    CHECK(near(pixel(rgba, 100, 350), 200, 10, 10, "extra bottom"));
    CHECK(near(pixel(rgba, 600, 440), 200, 10, 10, "extra bottom right"));
    return 0;
}

// The opening's textures: CT16 ones keep TEXA's alpha (127 or 129); a frame of the opening set draws them.
int textures(render::NativeRenderer& renderer, const std::filesystem::path& directory) {
    renderer.loadOpeningTextures(directory);
    renderer.configure({kWidth, 224, g_samples});
    const std::filesystem::path file = directory / "tex6-256x256.png";
    int w = 0, h = 0, channels = 0;
    stbi_uc* png = stbi_load(file.string().c_str(), &w, &h, &channels, 4);
    CHECK(png && w == 256 && h == 256);
    Pass p = sprite(TargetName::Display, BlendOp::Opaque, 0x80, 0x80, 0x80, 0x40, 0, 0, 256, 224);
    p.material.source = scene::SourceKind::Texture;
    p.material.texture = 6;
    p.vertices[0].u = 0.5f;
    p.vertices[0].v = 0.5f;
    p.vertices[1].u = 256.5f;
    p.vertices[1].v = 224.5f;
    renderer.draw(frameOf({sprite(TargetName::Display, BlendOp::Opaque, 0, 0, 0, 0x80), p}, scene::TextureSet::Opening));
    const auto rgba = renderer.readTarget(TargetName::Display);
    size_t checked = 0, wrong = 0;
    for (uint32_t y = 4; y < 220; y += 17)
        for (uint32_t x = 4; x < 252; x += 13) {
            const stbi_uc* t = png + (size_t(y) * 256 + x) * 4;
            const size_t at = (size_t(y) * kWidth + x) * 4;
            for (int c = 0; c < 3; ++c) {
                wrong += std::abs(int(rgba[at + c]) - int(t[c])) > 1;
                if (wrong == 1 && std::abs(int(rgba[at + c]) - int(t[c])) > 1) std::fprintf(stderr, "x %u y %u c %d got %d texel %d alpha %d\n", x, y, c, rgba[at + c], t[c], t[3]);
            }
            ++checked;
        }
    stbi_image_free(png);
    std::printf("opening texture 6: %zu texels checked, %zu channels differ\n", checked, wrong);
    CHECK(wrong == 0);

    renderer.draw(frameOf({sprite(TargetName::Display, BlendOp::Opaque, 1, 2, 3, 0x80)}));
    Pass clockTexture = sprite(TargetName::Display, BlendOp::Opaque, 0x80, 0x80, 0x80, 0x40);
    clockTexture.material.source = scene::SourceKind::Texture;
    clockTexture.material.texture = 6;
    bool refused = false;
    try {
        renderer.draw(frameOf({clockTexture}));
    } catch (const std::runtime_error&) {
        refused = true;
    }
    CHECK(refused);
    return 0;
}

#ifndef NDEBUG
// A texture alpha of 254 (the light sprites) times a vertex alpha of 0x80 is above the 0x80 a target stores: refused.
int alphaAbove(render::NativeRenderer& renderer) {
    renderer.configure({kWidth, kHeight, g_samples});
    Pass p = sprite(TargetName::Display, BlendOp::Opaque, 0x80, 0x80, 0x80, 0x80);
    p.material.source = scene::SourceKind::Texture;
    p.material.texture = 8;
    CHECK(renderer.writtenAlpha(p, scene::TextureSet::Opening) == 254);
    bool refused = false;
    try {
        renderer.draw(frameOf({p}, scene::TextureSet::Opening));
    } catch (const std::logic_error& e) {
        std::printf("refused: %s\n", e.what());
        refused = true;
    }
    CHECK(refused);
    p.vertices[0].a = p.vertices[1].a = 0x40;
    renderer.draw(frameOf({p}, scene::TextureSet::Opening));
    return 0;
}
#endif

}  // namespace

int main(int argc, char** argv) {
    if (argc != 2 && argc != 3) {
        std::fprintf(stderr, "usage: NativeOpeningTest <shader dir> [opening textures dir]\n");
        return 1;
    }
    try {
        render::Device device(nullptr, {true});
        render::NativeRenderer renderer(device, argv[1]);
        for (uint32_t samples : {1u, 4u}) {
            g_samples = samples;
            CHECK(addDestinationAlpha(renderer) == 0);
            CHECK(subtractFixed(renderer) == 0);
            CHECK(perPixelAlpha(renderer) == 0);
            CHECK(store(renderer) == 0);
            CHECK(extra(renderer) == 0);
            if (argc == 3) {
                CHECK(textures(renderer, argv[2]) == 0);
#ifndef NDEBUG
                CHECK(alphaAbove(renderer) == 0);
#endif
            }
            std::printf("samples %u: opening paths equal\n", samples);
        }
        std::printf("validation errors: %u\n", device.validationErrors());
        CHECK(device.validationErrors() == 0);
    } catch (const std::exception& e) {
        std::fprintf(stderr, "exception: %s\n", e.what());
        return 1;
    }
    return 0;
}
