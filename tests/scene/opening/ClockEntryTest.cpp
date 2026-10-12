#include <cstdio>
#include <string>

#include "../../Check.hpp"
#include "../SceneFixture.hpp"
#include "Scene/Camera.hpp"
#include "Scene/SceneInputs.hpp"

namespace {

using nlohmann::json;
using scenetest::sameBits;
using EeClock = scene::Clock<scene::EeArithmetic>;

bool ramp(const scene::Ramp& r, const json& j, const std::string& at, const char* what) {
    if (r.length == j.at("length") && r.counter == j.at("counter") && r.changed == j.at("changed") && r.state == j.at("state")) return true;
    std::fprintf(stderr, "%s: %s differs: native %d %d %d %d\n", at.c_str(), what, r.length, r.counter, r.changed, r.state);
    return false;
}

bool integer(int32_t v, const json& j, const std::string& at, const char* what) {
    if (v == j.get<int32_t>()) return true;
    std::fprintf(stderr, "%s: %s native %d, capture %d\n", at.c_str(), what, v, j.get<int32_t>());
    return false;
}

int camera(const EeClock& clock, const json& expect, const std::string& at) {
    scene::ClockState state = clock.state();
    const scene::CameraMatrices cam = scene::Camera<scene::EeArithmetic>::matrices(state);
    CHECK(sameBits(cam.screen, expect.at("camera").at("screen"), at + " camera screen"));
    CHECK(sameBits(cam.view, expect.at("camera").at("view"), at + " camera view"));
    CHECK(sameBits(state.cameraOffset, expect.at("camera").at("cameraOffset"), at + " camera offset"));
    return 0;
}

int orbs(const EeClock& clock, const json& expect, const std::string& at) {
    const json& list = expect.at("orbs");
    CHECK(list.size() == scene::kOrbCount);
    for (const json& orb : list) {
        const int k = orb.at("k");
        const json& ring = orb.at("ring");
        const scene::OrbRing& mine = clock.orbs().rings[k];
        const std::string where = at + " orb " + std::to_string(k);
        CHECK(integer(mine.head, ring.at("head"), where, "ring head") && integer(mine.count, ring.at("count"), where, "ring count") &&
              integer(mine.full, ring.at("full"), where, "ring full"));
        const json& entries = ring.at("entries");
        for (size_t e = 0; e < entries.size(); ++e) {
            const json& t = entries.at(e);
            const scene::OrbEntry& m = mine.entries[e];
            const std::string at2 = where + " entry " + std::to_string(e);
            CHECK(sameBits(m.x, t.at("x"), at2 + " x") && sameBits(m.y, t.at("y"), at2 + " y") && sameBits(m.z, t.at("z"), at2 + " z"));
            for (int c = 0; c < 4; ++c) CHECK(integer(m.colour[c], t.at("colour").at(c), at2, "colour"));
        }
    }
    return 0;
}

int head(const EeClock& clock, const json& expect, const std::string& at) {
    const json& h = expect.at("head");
    for (const char* part : {"tint", "fade"}) {
        const scene::Rect& r = std::string(part) == "tint" ? clock.head().tint : clock.head().fade;
        const json& v = h.at(part).at("vertices").at(0);
        CHECK(integer(r.colour[0], v.at("r"), at + " " + part, "red") && integer(r.colour[1], v.at("g"), at + " " + part, "green") &&
              integer(r.colour[2], v.at("b"), at + " " + part, "blue") && integer(r.colour[3], v.at("a"), at + " " + part, "alpha"));
    }
    return 0;
}

int after(const EeClock& clock, const json& a, const std::string& at) {
    const scene::ClockState& s = clock.state();
    CHECK(integer(s.counter, a.at("counter"), at, "counter") && integer(s.level, a.at("level"), at, "level") && integer(s.mode, a.at("mode"), at, "mode") &&
          integer(s.overlayLevel, a.at("overlayLevel"), at, "overlayLevel"));
    CHECK(ramp(s.vignetteRamp, a.at("vignetteRamp"), at, "vignetteRamp") && ramp(s.menuRamp, a.at("menuRamp"), at, "menuRamp") &&
          ramp(s.appearance, a.at("appearance"), at, "appearance") && ramp(clock.head().greyRamp, a.at("greyRamp"), at, "greyRamp") &&
          ramp(clock.orbs().spriteFade, a.at("spriteFade"), at, "spriteFade"));
    CHECK(integer(s.eased.secondHand, a.at("eased").at("secondHand"), at, "secondHand") && integer(s.eased.hourHand, a.at("eased").at("hourHand"), at, "hourHand"));
    CHECK(sameBits(s.eased.progress, a.at("eased").at("progress"), at + " progress") && sameBits(s.eased.fraction, a.at("eased").at("fraction"), at + " fraction"));
    CHECK(sameBits(s.cameraOffset, a.at("cameraOffset"), at + " cameraOffset") && sameBits(s.scene.scale, a.at("scene").at("scale"), at + " scale"));
    CHECK(integer(s.state.currentRod, a.at("state").at("currentRod"), at, "currentRod"));
    for (int i = 0; i < 3; ++i) CHECK(integer(clock.head().greys[i], a.at("greys").at(i), at, "greys"));
    return 0;
}

}

int main(int argc, char** argv) {
    return scenetest::run(argc, argv, [](int count, char** arguments) {
        if (count < 3) {
            std::fprintf(stderr, "usage: ClockEntryTest <scene.json of whole-boot-opening> <rod-mesh.json>\n");
            return 1;
        }
        const json scene = scenetest::loadScene(arguments[1]);
        const scene::RodMesh mesh = scene::loadRodMesh(arguments[2]);
        const json& frames = scene.at("frames");
        CHECK(frames.size() == 49);
        const json& first = frames.at(0).at("input");
        CHECK(first.at("mode") == 2 && first.at("overlayLevel") == 0 && scenetest::hexFloat(first.at("cameraOffset")) == -100.0f);
        for (const json& ring : first.at("rings")) CHECK(ring.at("count") == 0);

        EeClock clock(scene::clockInputs(first, mesh));
        for (const json& frame : frames) {
            const std::string at = "frame " + std::to_string(frame.at("index").get<int>());
            const json& expect = frame.at("expect");
            if (int failed = camera(clock, expect, at)) return failed;
            const scene::Frame out = clock.frame(scene::frameInputs(frame.at("input")));
            CHECK(!out.passes.empty());
            if (int failed = orbs(clock, expect, at)) return failed;
            if (int failed = head(clock, expect, at)) return failed;
            if (int failed = after(clock, expect.at("after"), at)) return failed;
        }
        std::printf("carried: %zu frames from the clock's entry equal to the capture\n", frames.size());

        const scene::FrameInputs last = scene::frameInputs(frames.at(frames.size() - 1).at("input"));
        int reached = -1;
        for (int n = static_cast<int>(frames.size()); n < 400 && reached < 0; ++n) {
            clock.frame(last);
            if (clock.state().mode == 0 && clock.state().overlayLevel == 128) reached = n;
        }
        CHECK(reached == 128);
        std::printf("report only: mode 0 and weight 128 reached at frame %d of the run (T0 + %d), the plan expects T0 + 129\n", reached, reached);
        return 0;
    });
}
