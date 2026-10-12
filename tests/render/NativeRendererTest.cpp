#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <memory>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include "../Check.hpp"
#include "Scene/SceneInputs.hpp"
#include "Render/Device.hpp"
#include "App/NativeFrames.hpp"
#include "Render/NativeRenderer.hpp"
#include "Scene/Clock.hpp"

namespace {

using scene::BlendOp;
using scene::Pass;
using scene::TargetName;

constexpr uint32_t kWidth = 640, kHeight = 448;

Pass sprite(BlendOp blend, uint8_t r, uint8_t g, uint8_t b, uint8_t a, float x0 = 0, float y0 = 0, float x1 = 640, float y1 = 224) {
    Pass p;
    p.name = "sprite";
    p.target = TargetName::Display;
    p.topology = scene::PassTopology::Sprites;
    p.material.blend = blend;
    p.vertices = {{x0, y0, 0, 0, 0, 1, r, g, b, a}, {x1, y1, 0, 0, 0, 1, r, g, b, a}};
    return p;
}

scene::Frame frameOf(std::vector<Pass> passes) {
    scene::Frame f;
    f.passes = std::move(passes);
    f.textAt = f.passes.size();
    return f;
}

std::array<int, 4> pixel(const std::vector<uint8_t>& rgba, uint32_t x, uint32_t y) {
    const size_t at = (size_t(y) * kWidth + x) * 4;
    return {rgba[at], rgba[at + 1], rgba[at + 2], rgba[at + 3]};
}

bool near(const std::array<int, 4>& got, double r, double g, double b, const char* what) {
    const double want[3] = {r, g, b};
    for (int i = 0; i < 3; ++i) {
        if (std::fabs(got[i] - want[i]) > 1.0) {
            std::fprintf(stderr, "%s: got %d %d %d, want %.2f %.2f %.2f\n", what, got[0], got[1], got[2], r, g, b);
            return false;
        }
    }
    return true;
}

// Untextured colour is byte / 255, alpha byte / 128 (scene/Frame.hpp); expected values are written in bytes.
int blends(render::NativeRenderer& renderer) {
    renderer.configure({kWidth, kHeight, 1});
    const double half = 0x40 / 128.0, quarter = 0x20 / 128.0;

    renderer.draw(frameOf({sprite(BlendOp::Opaque, 200, 100, 50, 0x80), sprite(BlendOp::AlphaOver, 10, 220, 128, 0x40)}));
    CHECK(near(pixel(renderer.readTarget(TargetName::Display), 320, 224), 10 * half + 200 * (1 - half), 220 * half + 100 * (1 - half), 128 * half + 50 * (1 - half), "AlphaOver"));

    renderer.draw(frameOf({sprite(BlendOp::Opaque, 100, 100, 100, 0x80), sprite(BlendOp::Add, 60, 200, 10, 0x40)}));
    CHECK(near(pixel(renderer.readTarget(TargetName::Display), 17, 300), 100 + 60 * half, 100 + 200 * half, 100 + 10 * half, "Add"));

    renderer.draw(frameOf({sprite(BlendOp::Opaque, 100, 100, 100, 0x80), sprite(BlendOp::Subtract, 60, 200, 10, 0x40)}));
    CHECK(near(pixel(renderer.readTarget(TargetName::Display), 600, 10), 100 - 60 * half, 0, 100 - 10 * half, "Subtract"));

    Pass over = sprite(BlendOp::FixedOver, 10, 220, 128, 0x00);
    over.material.blendConstant = 0x20;
    renderer.draw(frameOf({sprite(BlendOp::Opaque, 200, 100, 50, 0x80), over}));
    CHECK(near(pixel(renderer.readTarget(TargetName::Display), 320, 224), 10 * quarter + 200 * (1 - quarter), 220 * quarter + 100 * (1 - quarter), 128 * quarter + 50 * (1 - quarter), "FixedOver"));

    Pass add = sprite(BlendOp::FixedAdd, 60, 200, 10, 0x10);
    add.material.blendConstant = 0x20;
    renderer.draw(frameOf({sprite(BlendOp::Opaque, 100, 100, 100, 0x80), add}));
    CHECK(near(pixel(renderer.readTarget(TargetName::Display), 320, 224), 100 + 60 * quarter, 100 + 200 * quarter, 100 + 10 * quarter, "FixedAdd"));

    renderer.draw(frameOf({sprite(BlendOp::Opaque, 1, 2, 3, 0x40)}));
    CHECK(pixel(renderer.readTarget(TargetName::Display), 5, 5)[3] == 0x40);
    return 0;
}

// Every pass's written alpha is bounded by 0x80, which a target stores as 1.0: a target read back holds the bound
// of what was written to it, and in Debug a frame that would write more is refused before anything is recorded.
int alphaBounds(render::NativeRenderer& renderer) {
    renderer.configure({kWidth, kHeight, 1});
    Pass low = sprite(BlendOp::Opaque, 1, 2, 3, 0x40);
    low.target = TargetName::RefractionSource;
    renderer.draw(frameOf({low}));
    Pass read = sprite(BlendOp::AlphaOver, 0x80, 0x80, 0x80, 0x80);
    read.material.source = scene::SourceKind::Target;
    read.material.sourceTarget = TargetName::RefractionSource;
    read.material.sampling = scene::Sampling::ClampToRegion;
    read.material.region = {0, 639, 0, 223};
    CHECK(renderer.writtenAlpha(read) == 0x40);
    CHECK(renderer.blendAlpha(read) == 0x40);

    std::vector<uint8_t> opaque(4 * 4 * 4, 0xff);
    renderer.setTexture(21, 4, 4, opaque);
    Pass textured = sprite(BlendOp::Opaque, 0x80, 0x80, 0x80, 0x80);
    textured.material.source = scene::SourceKind::Texture;
    textured.material.texture = 21;
    CHECK(renderer.writtenAlpha(textured) == 0xff);
    Pass edge = textured;
    edge.edgeSmoothing = true;
    CHECK(renderer.writtenAlpha(edge) == 0x80);

#ifndef NDEBUG
    for (const Pass& high : {sprite(BlendOp::Opaque, 1, 2, 3, 0x90), textured}) {
        bool refused = false;
        try {
            renderer.draw(frameOf({sprite(BlendOp::Opaque, 0, 0, 0, 0x80), high}));
        } catch (const std::logic_error& e) {
            std::printf("refused: %s\n", e.what());
            refused = true;
        }
        CHECK(refused);
    }
#endif
    renderer.draw(frameOf({sprite(BlendOp::Opaque, 9, 9, 9, 0x80)}));
    CHECK(pixel(renderer.readTarget(TargetName::Display), 1, 1)[0] == 9);
    return 0;
}

// A textured colour is texel * vertex / 128; ClampToRegion outside its region gives the region's edge texel.
int sampling(render::NativeRenderer& renderer) {
    renderer.configure({kWidth, kHeight, 1});
    std::vector<uint8_t> texture(4 * 4 * 4);
    for (uint32_t y = 0; y < 4; ++y)
        for (uint32_t x = 0; x < 4; ++x) {
            uint8_t* t = &texture[(y * 4 + x) * 4];
            t[0] = uint8_t(10 + x * 50);
            t[1] = uint8_t(10 + y * 50);
            t[2] = 200;
            t[3] = 0x80;
        }
    renderer.setTexture(20, 4, 4, texture);

    Pass p = sprite(BlendOp::Opaque, 0x80, 0x80, 0x40, 0x80);
    p.material.source = scene::SourceKind::Texture;
    p.material.texture = 20;
    p.material.sampling = scene::Sampling::ClampToRegion;
    p.material.region = {1, 2, 1, 2};
    p.material.bilinear = true;
    p.vertices[0].u = -10;
    p.vertices[0].v = 20;
    p.vertices[1].u = -5;
    p.vertices[1].v = 30;
    renderer.draw(frameOf({p}));
    const auto rgba = renderer.readTarget(TargetName::Display);
    CHECK(near(pixel(rgba, 3, 3), 60, 110, 100, "region clamp, top left"));
    CHECK(near(pixel(rgba, 636, 444), 60, 110, 100, "region clamp, bottom right"));
    return 0;
}

// Above the native size a copy sprite (u = x + 0.5, as the OSD's copies) still lands texel on pixel, and a
// sprite over the whole target covers every output pixel.
int copies(render::NativeRenderer& renderer) {
    renderer.configure({1280, 896, 1});
    Pass background = sprite(BlendOp::Opaque, 20, 40, 60, 0x80);
    background.target = TargetName::RefractionSource;
    Pass block = sprite(BlendOp::Opaque, 250, 200, 150, 0x80, 100, 50, 300.5f, 151);
    block.target = TargetName::RefractionSource;
    Pass copy = sprite(BlendOp::Opaque, 0x80, 0x80, 0x80, 0x80);
    copy.material.source = scene::SourceKind::Target;
    copy.material.sourceTarget = TargetName::RefractionSource;
    copy.material.sampling = scene::Sampling::ClampToRegion;
    copy.material.region = {0, 639, 0, 223};
    copy.material.bilinear = true;
    copy.vertices[0].u = 0.5f;
    copy.vertices[0].v = 0.5f;
    copy.vertices[1].u = 640.5f;
    copy.vertices[1].v = 224.5f;
    renderer.draw(frameOf({sprite(BlendOp::Opaque, 7, 7, 7, 0x80), background, block, copy}));
    const auto source = renderer.readTarget(TargetName::RefractionSource);
    const auto copied = renderer.readTarget(TargetName::Display);
    size_t differing = 0, blockPixels = 0;
    for (size_t i = 0; i < source.size(); i += 4) {
        for (size_t c = 0; c < 3; ++c) differing += std::abs(int(source[i + c]) - int(copied[i + c])) > 1;
        blockPixels += source[i] == 250;
    }
    std::printf("copy at 1280x896: %zu differing channels, %zu block pixels\n", differing, blockPixels);
    CHECK(source[0] == 20 && source[(size_t(896) * 1280 - 1) * 4] == 20);
    CHECK(blockPixels == size_t(401) * 404);
    CHECK(differing == 0);
    return 0;
}

// An additive line strip (the orb trail: AA1, so alpha 0x80) at 1280 x 896 (scale 2 across, 4 down) covers what
// the GS covers, one pixel across its minor axis: a row (4 output rows) for a gentle strip, a column (2 output
// columns) for a steep one, each pixel once. Returns the pixels lit once and more than once.
std::pair<size_t, size_t> stripCoverage(render::NativeRenderer& renderer, bool steep) {
    renderer.configure({1280, 896, 1});
    Pass strip;
    strip.name = "trail";
    strip.topology = scene::PassTopology::Lines;
    strip.edgeSmoothing = true;
    strip.material.blend = BlendOp::Add;
    strip.material.depthTest = scene::DepthTest::Always;
    std::vector<scene::Vertex> points;
    for (int i = 0; i <= 44; ++i) {
        const float along = 10.0f + 4.0f * float(i), across = 20.0f * std::sin(along / 30.0f);
        const float x = steep ? 300.0f + across * 0.4f : 100.0f + 2.5f * along, y = steep ? along : 112.0f + across;
        points.push_back({x, y, 0, 0, 0, 1, 0, 0, 200, 0x80});
    }
    for (size_t i = 0; i + 1 < points.size(); ++i) {
        strip.vertices.push_back(points[i]);
        strip.vertices.push_back(points[i + 1]);
    }
    renderer.draw(frameOf({sprite(BlendOp::Opaque, 0, 0, 0, 0x80), strip}));
    const auto rgba = renderer.readTarget(TargetName::Display);
    size_t once = 0, twice = 0;
    for (size_t i = 0; i < rgba.size(); i += 4) {
        once += rgba[i + 2] >= 199 && rgba[i + 2] <= 201;
        twice += rgba[i + 2] > 201;
    }
    return {once, twice};
}

int strips(render::NativeRenderer& renderer) {
    const auto [gentle, gentleTwice] = stripCoverage(renderer, false);
    const auto [steep, steepTwice] = stripCoverage(renderer, true);
    std::printf("additive strips at 1280x896: gentle %zu pixels lit once, %zu more; steep %zu once, %zu more\n", gentle, gentleTwice, steep, steepTwice);
    // Gentle: 440 scene columns (880 output) by 4 rows. Steep: 176 scene rows (704 output) by 2 columns.
    CHECK(gentle > 880 * 4 * 9 / 10 && gentle < 880 * 4 * 11 / 10 && gentleTwice == 0);
    CHECK(steep > 704 * 2 * 9 / 10 && steep < 704 * 2 * 11 / 10 && steepTwice == 0);
    return 0;
}

int edgeLevels(render::NativeRenderer& renderer, uint32_t samples, uint32_t& intermediate) {
    renderer.configure({kWidth, kHeight, samples});
    Pass triangle;
    triangle.name = "diagonal";
    triangle.vertices = {{0, 0, 0, 0, 0, 1, 255, 255, 255, 0x80}, {640, 0, 0, 0, 0, 1, 255, 255, 255, 0x80}, {0, 224, 0, 0, 0, 1, 255, 255, 255, 0x80}};
    renderer.draw(frameOf({sprite(BlendOp::Opaque, 0, 0, 0, 0x80), triangle}));
    const auto rgba = renderer.readTarget(TargetName::Display);
    intermediate = 0;
    for (uint32_t y = 0; y < kHeight; ++y)
        for (uint32_t x = 0; x < kWidth; ++x) {
            const int r = pixel(rgba, x, y)[0];
            if (r > 0 && r < 255) ++intermediate;
        }
    return 0;
}

int msaa(render::NativeRenderer& renderer) {
    uint32_t single = 0, four = 0;
    CHECK(edgeLevels(renderer, 1, single) == 0);
    CHECK(edgeLevels(renderer, 4, four) == 0);
    std::printf("diagonal edge: %u intermediate pixels without MSAA, %u with 4x\n", single, four);
    CHECK(single == 0);
    CHECK(four > 400);
    return 0;
}

// The date, the time and the button hint: drawn from the glyph cache through its colour table, they light the
// places facts/text.md section 5 gives them (date from x 22, time ending 22 from the right, both from line 14; the
// hint's picture at x 24 and its text at 52 on line 200), against the same frame without its text.
int text(render::NativeRenderer& renderer, const scene::Font& font, const scene::Frame& frame) {
    renderer.configure({kWidth, kHeight, 1});
    renderer.setGlyphCache(font, frame.glyphs);
    renderer.draw(frame);
    const auto with = renderer.readTarget(TargetName::Display);
    scene::Frame plain = frame;
    std::erase_if(plain.passes, [](const Pass& p) { return p.name == "text" || p.name == "hint picture"; });
    CHECK(frame.passes.size() - plain.passes.size() == 27);
    renderer.draw(plain);
    const auto without = renderer.readTarget(TargetName::Display);
    const auto changed = [&](uint32_t x0, uint32_t y0, uint32_t x1, uint32_t y1) {
        size_t n = 0;
        for (uint32_t y = 2 * y0; y < 2 * y1; ++y)
            for (uint32_t x = x0; x < x1; ++x)
                if (pixel(with, x, y) != pixel(without, x, y)) ++n;
        return n;
    };
    const size_t date = changed(20, 10, 180, 26), time = changed(500, 10, 620, 26), picture = changed(24, 199, 50, 212), hint = changed(50, 198, 120, 212),
                 elsewhere = changed(200, 60, 440, 160);
    std::printf("text: %zu pixels changed by the date, %zu by the time, %zu by the hint's picture, %zu by its text, %zu elsewhere\n", date, time, picture, hint, elsewhere);
    CHECK(date > 500 && time > 500 && picture > 100 && hint > 300 && elsewhere == 0);
    return 0;
}

// The clock's inputs with its text: the font file and the program's ELF.
scene::ClockInputs withText(scene::ClockInputs inputs, std::shared_ptr<const scene::Font> font, const std::string& programPath) {
    inputs.font = std::move(font);
    inputs.program = std::make_shared<const scene::ProgramImage>(scene::ProgramImage::load(programPath));
    return inputs;
}

// Real clock frames: every blended pass multiplies by at most 0x80, and they draw without validation errors.
int clockFrames(render::NativeRenderer& renderer, const std::string& scenePath, const std::string& meshPath, const std::string& textures, const std::string& fontPath,
                const std::string& programPath) {
    renderer.loadClockTextures(textures);
    const nlohmann::json input = scene::firstInput(scenePath);
    const auto font = std::make_shared<const scene::Font>(scene::Font::load(fontPath));
    scene::Clock<scene::NativeArithmetic> clock(withText(scene::clockInputs(input, scene::loadRodMesh(meshPath)), font, programPath));
    scene::FrameInputs in = scene::frameInputs(input);
    renderer.configure({kWidth, kHeight, 4});
    uint32_t largest = 0, passes = 0, written = 0;
    for (int n = 0; n < 8; ++n) {
        const scene::Frame frame = clock.frame(in);
        for (const Pass& p : frame.passes) {
            const uint32_t a = renderer.blendAlpha(p);
            if (a > largest) largest = a;
            if (a > 0x80) std::fprintf(stderr, "frame %d pass %s: blend alpha 0x%x\n", n, p.name.c_str(), a);
            CHECK(!(p.material.source == scene::SourceKind::Target && p.material.coordinates == scene::CoordinateKind::Projective));
            written = std::max(written, renderer.writtenAlpha(p));
            ++passes;
        }
        renderer.setGlyphCache(*font, frame.glyphs);
        renderer.draw(frame);
        in.field ^= 1;
        in.displayIndex ^= 1;
    }
    const auto rgba = renderer.readTarget(TargetName::Display);
    size_t lit = 0;
    for (size_t i = 0; i < rgba.size(); i += 4) lit += rgba[i] + rgba[i + 1] + rgba[i + 2] > 0;
    std::printf("clock: %u passes over 8 frames, largest blend alpha 0x%x, largest written alpha 0x%x, %zu lit pixels\n", passes, largest, written, lit);
    CHECK(largest <= 0x80 && written <= 0x80);
    CHECK(lit > kWidth * kHeight / 4);
    return text(renderer, *font, clock.frame(in));
}

// The committed start file (tools/scene/make_start.mjs) starts the same clock as the capture's frame 0.
int startFile(const std::string& scenePath, const std::string& meshPath, const std::string& startPath, const std::string& fontPath, const std::string& programPath) {
    const scene::RodMesh mesh = scene::loadRodMesh(meshPath);
    const auto font = std::make_shared<const scene::Font>(scene::Font::load(fontPath));
    const nlohmann::json captured = scene::firstInput(scenePath), committed = scene::firstInput(startPath);
    CHECK(committed.contains("font") && committed.contains("textRamps") && committed.contains("configItems"));
    scene::Clock<scene::NativeArithmetic> a(withText(scene::clockInputs(captured, mesh), font, programPath)), b(withText(scene::clockInputs(committed, mesh), font, programPath));
    scene::FrameInputs in = scene::frameInputs(captured);
    CHECK(scene::frameInputs(committed).time.milliseconds == in.time.milliseconds);
    for (int n = 0; n < 4; ++n) {
        const scene::Frame x = a.frame(in), y = b.frame(in);
        CHECK(x.passes.size() == y.passes.size());
        for (size_t i = 0; i < x.passes.size(); ++i) {
            CHECK(x.passes[i].name == y.passes[i].name);
            CHECK(x.passes[i].material == y.passes[i].material);
            CHECK(x.passes[i].vertices == y.passes[i].vertices);
        }
        CHECK(x.glyphs == y.glyphs);
        in.field ^= 1;
        in.displayIndex ^= 1;
    }
    std::printf("start file: 4 frames equal to the capture's, text included\n");
    return 0;
}

struct StepDifference {
    std::array<size_t, 2> pixels{};
    std::array<uint32_t, 2> largest{};
};

// Pixels of Display and RefractionSource that change between two drawn frames.
StepDifference drawnDifference(render::NativeRenderer& renderer, const scene::Frame& a, const scene::Frame& b) {
    StepDifference d;
    std::array<std::vector<uint8_t>, 2> first, second;
    const TargetName targets[2] = {TargetName::Display, TargetName::RefractionSource};
    renderer.draw(a);
    for (size_t t = 0; t < 2; ++t) first[t] = renderer.readTarget(targets[t]);
    renderer.draw(b);
    for (size_t t = 0; t < 2; ++t) second[t] = renderer.readTarget(targets[t]);
    for (size_t t = 0; t < 2; ++t)
        for (size_t i = 0; i < first[t].size(); i += 4) {
            uint32_t delta = 0;
            for (size_t c = 0; c < 3; ++c) delta = std::max<uint32_t>(delta, uint32_t(std::abs(int(first[t][i + c]) - int(second[t][i + c]))));
            d.pixels[t] += delta > 0;
            d.largest[t] = std::max(d.largest[t], delta);
        }
    return d;
}

// Time frozen, the clock settled for 900 frames, then two consecutive frames. The background tube scrolls with the
// frame counter whatever the time (scene/FrameHead.cpp strip), so the second frame is also drawn with the first
// frame's clear and background: everything else must then be identical, Display and RefractionSource, when the
// frames are made as the window makes them (app/NativeFrames.hpp, field held at 0).
struct FrozenStep {
    StepDifference whole, rest;
};

FrozenStep frozenStep(render::NativeRenderer& renderer, const scene::ClockInputs& start, scene::FrameInputs in, bool alternateField) {
    scene::Clock<scene::NativeArithmetic> clock(start);
    if (!alternateField) app::firstFrame(in);
    const auto next = [&] {
        if (alternateField) {
            in.field ^= 1;
            in.displayIndex ^= 1;
        } else {
            app::nextFrame(in);
        }
    };
    for (int n = 0; n < 900; ++n) {
        (void)clock.frame(in);
        next();
    }
    const scene::Frame a = clock.frame(in);
    next();
    const scene::Frame b = clock.frame(in);
    scene::Frame same = b;
    for (size_t i = 0; i < same.passes.size() && i < a.passes.size(); ++i)
        if (same.passes[i].name == "clear" || same.passes[i].name == "background") same.passes[i] = a.passes[i];
    return {drawnDifference(renderer, a, b), drawnDifference(renderer, a, same)};
}

int frozen(render::NativeRenderer& renderer, const std::string& startPath, const std::string& meshPath) {
    renderer.configure({kWidth, kHeight, 1});
    const nlohmann::json input = scene::firstInput(startPath);
    const scene::ClockInputs start = scene::clockInputs(input, scene::loadRodMesh(meshPath));
    const scene::FrameInputs in = scene::frameInputs(input);
    const FrozenStep alternating = frozenStep(renderer, start, in, true), held = frozenStep(renderer, start, in, false);
    for (const auto& [name, step] : {std::pair{"field alternating", alternating}, std::pair{"field held at 0", held}})
        std::printf("frozen time, two frames, %s: display %zu pixels (largest %u), refraction %zu (largest %u); "
                    "background kept: display %zu (largest %u), refraction %zu (largest %u)\n",
                    name, step.whole.pixels[0], step.whole.largest[0], step.whole.pixels[1], step.whole.largest[1], step.rest.pixels[0], step.rest.largest[0],
                    step.rest.pixels[1], step.rest.largest[1]);
    CHECK(alternating.rest.pixels[1] > 0);
    CHECK(held.rest.pixels[0] == 0 && held.rest.pixels[1] == 0);
    return 0;
}

}  // namespace

int main(int argc, char** argv) {
    if (argc != 2 && argc != 7 && argc != 8) {
        std::fprintf(stderr, "usage: NativeRendererTest <shader dir> [scene.json rod-mesh.json textures-dir FNTOSD hddosd.elf [start.json]]\n");
        return 1;
    }
    try {
        render::Device device(nullptr, {true});
        render::NativeRenderer renderer(device, argv[1]);
        CHECK(blends(renderer) == 0);
        CHECK(sampling(renderer) == 0);
        CHECK(alphaBounds(renderer) == 0);
        CHECK(copies(renderer) == 0);
        CHECK(strips(renderer) == 0);
        CHECK(msaa(renderer) == 0);
        if (argc >= 7) CHECK(clockFrames(renderer, argv[2], argv[3], argv[4], argv[5], argv[6]) == 0);
        if (argc == 8) CHECK(startFile(argv[2], argv[3], argv[7], argv[5], argv[6]) == 0);
        if (argc == 8) CHECK(frozen(renderer, argv[7], argv[3]) == 0);
        std::printf("validation errors: %u\n", device.validationErrors());
        CHECK(device.validationErrors() == 0);
    } catch (const std::exception& e) {
        std::fprintf(stderr, "exception: %s\n", e.what());
        return 1;
    }
    return 0;
}
