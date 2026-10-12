#include <cstdio>
#include <cstring>

#include "../../Check.hpp"
#include "../SceneFixture.hpp"
#include "OpeningFixture.hpp"
#include "Parity/FromScene.hpp"
#include "Scene/Frame.hpp"
#include "Scene/opening/Types.hpp"

namespace {

using namespace scene;

Pass sprite(TargetName target, BlendOp blend) {
    Pass p;
    p.name = "probe";
    p.target = target;
    p.topology = PassTopology::Sprites;
    p.material.blend = blend;
    p.material.blendConstant = 0x40;
    p.vertices = {{0, 0, 0, 0, 0, 1, 0, 0, 0, 0}, {16, 16, 0, 0, 0, 1, 0, 0, 0, 0}};
    return p;
}

int convertsNewFields() {
    Frame frame;
    frame.depthBits = 24;
    frame.textureSet = TextureSet::Opening;
    Pass destinationAlpha = sprite(TargetName::Extra, BlendOp::AddDestinationAlpha);
    Pass subtract = sprite(TargetName::Store, BlendOp::SubtractFixed);
    Pass flagged = sprite(TargetName::Display, BlendOp::Opaque);
    flagged.material.perPixelAlpha = true;
    flagged.material.alphaCorrection = true;
    frame.passes = {destinationAlpha, subtract, flagged, sprite(TargetName::Display, BlendOp::Opaque)};

    const parity::GsFrame gs = parity::fromScene(frame, parity::openingLayout(0));
    CHECK(gs.depthFormat == 1);
    CHECK(gs.targets.size() == 4);
    CHECK(gs.passes.size() == 4);

    const parity::GsPass& a = gs.passes[0];
    CHECK(a.target == "fb1a40");
    CHECK(a.blend.has_value());
    CHECK(a.blend->a == parity::GsBlendTerm::Source && a.blend->b == parity::GsBlendTerm::Zero);
    CHECK(a.blend->c == parity::GsBlendFactor::DestinationAlpha && a.blend->d == parity::GsBlendTerm::Destination);

    const parity::GsPass& s = gs.passes[1];
    CHECK(s.target == "fb2300");
    CHECK(s.blend.has_value());
    CHECK(s.blend->a == parity::GsBlendTerm::Zero && s.blend->b == parity::GsBlendTerm::Source);
    CHECK(s.blend->c == parity::GsBlendFactor::Fixed && s.blend->d == parity::GsBlendTerm::Destination);
    CHECK(s.blend->fixed == 0x40);

    CHECK(gs.passes[2].perPixelAlpha && gs.passes[2].alphaCorrection);
    CHECK(!gs.passes[2].blend.has_value());
    CHECK(!gs.passes[3].perPixelAlpha && !gs.passes[3].alphaCorrection);

    Frame clock;
    clock.passes = {sprite(TargetName::Display, BlendOp::Add)};
    CHECK(parity::fromScene(clock, parity::clockLayout(640, 224, 0)).depthFormat == 0);
    return 0;
}

int layoutSwapsThePage() {
    const parity::GsFrameLayout zero = parity::openingLayout(0), one = parity::openingLayout(1);
    CHECK(zero.targets.size() == 5 && one.targets.size() == 5);
    CHECK(zero.targets[0] == "fb08c0" && zero.targets[1] == "fb0000");
    CHECK(one.targets[0] == "fb0000" && one.targets[1] == "fb08c0");
    CHECK(zero.targets[3] == "fb2300" && zero.targets[4] == "fb1a40" && zero.targets[2].empty());
    CHECK(zero.targetSizes[3][0] == 320 && zero.targetSizes[3][1] == 224);
    CHECK(zero.textures.at(0).id == "t2bc0-4-0-8x6" && zero.textures.at(0).width == 256 && zero.textures.at(0).height == 64);
    CHECK(zero.textures.at(6).id == "t2d40-4-2-8x8" && zero.textures.at(6).width == 256);
    CHECK(zero.textures.at(10).id == "t3060-2-2-7x7" && zero.textures.at(10).width == 128);

    Frame frame;
    Pass textured = sprite(TargetName::Display, BlendOp::Opaque);
    textured.material.source = SourceKind::Texture;
    textured.material.texture = 2;
    Pass fromStore = sprite(TargetName::Display, BlendOp::Opaque);
    fromStore.material.source = SourceKind::Target;
    fromStore.material.sourceTarget = TargetName::Store;
    frame.passes = {textured, fromStore};
    const parity::GsFrame gs = parity::fromScene(frame, zero);
    CHECK(gs.passes[0].texture && gs.passes[0].texture->source == "t2cc0-1-2-6x6");
    CHECK(gs.passes[1].texture && gs.passes[1].texture->source == "fb2300" && gs.passes[1].texture->sourceIsTarget);
    CHECK(gs.passes[1].texture->width == 1024 && gs.passes[1].texture->height == 256);
    return 0;
}

int readsAFixture(const char* path) {
    const openingtest::OpeningFixture fixture = openingtest::OpeningFixture::load(path);
    CHECK(fixture.frameCount() == 247);
    CHECK(fixture.externals().firstCounter == 1);
    CHECK(fixture.externals().phase.has_value());
    CHECK(*fixture.externals().phase >= 0xD80 && *fixture.externals().phase <= 0x16A8);
    CHECK(fixture.externals().discAtCounter.size() == 2);
    CHECK(fixture.externals().discAtCounter[0][1] == 0x65 && fixture.externals().discAtCounter[1][0] == 2 && fixture.externals().discAtCounter[1][1] == 0x64);
    CHECK(fixture.counter(0) == 1 && fixture.counter(1) == 2);

    const auto t = fixture.timeline(1);
    CHECK(t.has_value());
    CHECK(t->before.camera[2] == scenetest::hexBits("0x41800000"));
    CHECK(t->before.roll == scenetest::hexBits("0xbdf5c28f"));
    CHECK(t->thresholds[0] == 16 && t->thresholds[6] == 1160);
    CHECK(t->discState == 0x64);

    size_t cubes = 0, fogs = 0, lights = 0;
    for (size_t k = 0; k < fixture.frameCount(); ++k) {
        for (const auto& r : fixture.records(k, "cubes")) cubes += r.k == 1;
        if (fixture.fog(k)) {
            ++fogs;
            CHECK(fixture.fog(k)->record.mem.at(0).size() == 0x2440);
        }
        if (const auto l = fixture.lights(k)) lights += !l->records.empty();
    }
    CHECK(cubes == 994 && fogs == 246 && lights == 218);
    CHECK(!fixture.table("cubes").empty() && fixture.table("towers").empty());
    return 0;
}

}

int main(int argc, char** argv) {
    return scenetest::run(argc, argv, [](int count, char** args) {
        CHECK(convertsNewFields() == 0);
        CHECK(layoutSwapsThePage() == 0);
        if (count > 1) CHECK(readsAFixture(args[1]) == 0);
        std::puts("FromSceneOpeningTest: ok");
        return 0;
    });
}
