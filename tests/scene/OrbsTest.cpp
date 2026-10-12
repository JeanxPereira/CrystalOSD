#include <cmath>
#include <cstdio>
#include <string>

#include "../Check.hpp"
#include "SceneFixture.hpp"
#include "Scene/Orbs.hpp"

using nlohmann::json;
using scene::EeArithmetic;
using scene::NativeArithmetic;
using scene::OrbFrame;
using scene::OrbInputs;
using scene::OrbState;
using scene::OrbVertex;
using scenetest::hexFloat;
using scenetest::hexMat4;
using scenetest::sameBits;

namespace {

std::array<int32_t, 4> colourOf(const json& c) { return {c.at(0).get<int32_t>(), c.at(1).get<int32_t>(), c.at(2).get<int32_t>(), c.at(3).get<int32_t>()}; }

scene::Ramp rampOf(const json& r) {
    return {r.at("length").get<int32_t>(), r.at("counter").get<int32_t>(), r.at("changed").get<int32_t>(), r.at("state").get<int32_t>()};
}

scene::OrbRing ringOf(const json& r) {
    scene::OrbRing ring;
    ring.head = r.at("head").get<int32_t>();
    ring.count = r.at("count").get<int32_t>();
    ring.full = r.at("full").get<int32_t>();
    for (int n = 0; n < scene::kRingLength; ++n) {
        const json& e = r.at("entries").at(n);
        ring.entries[n] = {hexFloat(e.at("x")), hexFloat(e.at("y")), hexFloat(e.at("z")), colourOf(e.at("colour"))};
    }
    return ring;
}

OrbState stateOf(const json& input) {
    OrbState state;
    for (int k = 0; k < scene::kOrbCount; ++k) state.rings[k] = ringOf(input.at("rings").at(k));
    state.spriteFade = rampOf(input.at("spriteFade"));
    state.fraction = hexFloat(input.at("eased").at("fraction"));
    return state;
}

OrbInputs inputsOf(const json& input) {
    OrbInputs in;
    in.milliseconds = hexFloat(input.at("time").at("ms"));
    in.seconds = input.at("time").at("seconds").get<int32_t>();
    in.minutes = input.at("time").at("minutes").get<int32_t>();
    in.secondHand = input.at("eased").at("secondHand").get<int32_t>();
    in.hourHand = input.at("eased").at("hourHand").get<int32_t>();
    in.progress = hexFloat(input.at("eased").at("progress"));
    in.minuteFactor = hexFloat(input.at("orbConstants").at("minuteFactor"));
    in.fractionEasing = hexFloat(input.at("orbConstants").at("fractionEasing"));
    in.sceneScale = hexFloat(input.at("scene").at("scale"));
    in.colour = colourOf(input.at("orbColour"));
    in.width = input.at("screen").at("width").get<int32_t>();
    in.height = input.at("screen").at("height").get<int32_t>();
    return in;
}

// Native units back to the values the GS registers hold (what parity/FromScene must do):
// x, y: pixels * 16 plus the screen corner's offset (0x800 - size / 2) << 4; z: depth * 16;
// u, v: normalized * 64 texels * 16; trail colour * 255, sprite colour * 128, alpha * 128.
struct GsUnits {
    int32_t width, height;
    int32_t ox() const { return (0x800 - (width >> 1)) << 4; }
    int32_t oy() const { return (0x800 - (height >> 1)) << 4; }
    int32_t x(float v) const { return (static_cast<int32_t>(v * 16.0f) + ox()) & 0xffff; }
    int32_t y(float v) const { return (static_cast<int32_t>(v * 16.0f) + oy()) & 0xffff; }
    static int32_t z(float v) { return static_cast<int32_t>(v * 16.0f) & 0xffffff; }
    static int32_t texel(float v) { return static_cast<int32_t>(std::lround(v * 64.0f * 16.0f)); }
    static int32_t colour(float v) { return static_cast<int32_t>(std::lround(v * 255.0f)); }
    static int32_t modulate(float v) { return static_cast<int32_t>(std::lround(v * 128.0f)); }
    static int32_t alpha(float v) { return static_cast<int32_t>(std::lround(v * 128.0f)); }
};

bool sameInt(int32_t value, int32_t expected, const std::string& what) {
    if (value == expected) return true;
    std::fprintf(stderr, "%s: %d, expected %d\n", what.c_str(), value, expected);
    return false;
}

bool sameRing(const scene::OrbRing& ring, const json& expected, const std::string& what) {
    if (!sameInt(ring.head, expected.at("head").get<int32_t>(), what + " head")) return false;
    if (!sameInt(ring.count, expected.at("count").get<int32_t>(), what + " count")) return false;
    if (!sameInt(ring.full, expected.at("full").get<int32_t>(), what + " full")) return false;
    for (int n = 0; n < scene::kRingLength; ++n) {
        const json& e = expected.at("entries").at(n);
        const std::string at = what + " entry " + std::to_string(n);
        if (!sameBits(ring.entries[n].x, e.at("x"), at + " x") || !sameBits(ring.entries[n].y, e.at("y"), at + " y") ||
            !sameBits(ring.entries[n].z, e.at("z"), at + " z"))
            return false;
        for (int c = 0; c < 4; ++c)
            if (!sameInt(ring.entries[n].colour[c], e.at("colour").at(c).get<int32_t>(), at + " colour " + std::to_string(c))) return false;
    }
    return true;
}

bool sameTrailPoint(const OrbVertex& p, const json& e, const GsUnits& gs, const std::string& what) {
    return sameInt(gs.x(p.x), e.at("x").get<int32_t>(), what + " x") && sameInt(gs.y(p.y), e.at("y").get<int32_t>(), what + " y") &&
           sameInt(GsUnits::z(p.z), e.at("z").get<int32_t>(), what + " z") &&
           sameInt(GsUnits::colour(p.r), e.at("r").get<int32_t>(), what + " r") &&
           sameInt(GsUnits::colour(p.g), e.at("g").get<int32_t>(), what + " g") &&
           sameInt(GsUnits::colour(p.b), e.at("b").get<int32_t>(), what + " b") &&
           sameInt(GsUnits::alpha(p.a), e.at("a").get<int32_t>(), what + " a");
}

bool sameCorner(const OrbVertex& p, const json& e, const GsUnits& gs, const std::string& what) {
    return sameInt(gs.x(p.x), e.at("x").get<int32_t>(), what + " x") && sameInt(gs.y(p.y), e.at("y").get<int32_t>(), what + " y") &&
           sameInt(GsUnits::z(p.z), e.at("z").get<int32_t>(), what + " z") &&
           sameInt(GsUnits::texel(p.u), e.at("u").get<int32_t>(), what + " u") &&
           sameInt(GsUnits::texel(p.v), e.at("v").get<int32_t>(), what + " v") &&
           sameInt(GsUnits::modulate(p.r), e.at("r").get<int32_t>(), what + " r") &&
           sameInt(GsUnits::modulate(p.g), e.at("g").get<int32_t>(), what + " g") &&
           sameInt(GsUnits::modulate(p.b), e.at("b").get<int32_t>(), what + " b") &&
           sameInt(GsUnits::alpha(p.a), e.at("a").get<int32_t>(), what + " a");
}

bool sameSprite(const scene::OrbSprite& s, const json& e, const GsUnits& gs, const std::string& what) {
    if (!sameInt(static_cast<int32_t>(e.at("vertices").size()), 2, what + " corners")) return false;
    return sameCorner(s.first, e.at("vertices").at(0), gs, what + " corner 0") && sameCorner(s.second, e.at("vertices").at(1), gs, what + " corner 1");
}

int compareFrame(const OrbFrame& out, const OrbState& state, const json& frame, const OrbInputs& in, const std::string& run) {
    const GsUnits gs{in.width, in.height};
    const json& expect = frame.at("expect");
    const std::string at = run + " frame " + std::to_string(frame.at("index").get<int>());
    for (int k = 0; k < scene::kOrbCount; ++k) {
        const json& e = expect.at("orbs").at(k);
        const scene::OrbDraw& orb = out.orbs[k];
        const std::string what = at + " orb " + std::to_string(k);
        CHECK(sameInt(orb.k, e.at("k").get<int32_t>(), what + " k"));
        CHECK(sameInt(orb.drawn, e.at("drawn").get<int32_t>(), what + " drawn"));
        CHECK(sameInt(out.order[orb.drawn], k, what + " order"));
        CHECK(sameBits(orb.cx, e.at("centre").at("cx"), what + " cx"));
        CHECK(sameBits(orb.cy, e.at("centre").at("cy"), what + " cy"));
        CHECK(sameBits(orb.cz, e.at("centre").at("cz"), what + " cz"));
        const scene::OrbRing& ring = state.rings[k];
        const scene::OrbEntry& head = ring.entries[ring.head];
        CHECK(sameBits(head.x, e.at("position").at(0), what + " position x"));
        CHECK(sameBits(head.y, e.at("position").at(1), what + " position y"));
        CHECK(sameBits(head.z, e.at("position").at(2), what + " position z"));
        for (int c = 0; c < 4; ++c) CHECK(sameInt(head.colour[c], e.at("colour").at(c).get<int32_t>(), what + " colour"));
        CHECK(sameRing(ring, e.at("ring"), what + " ring"));
        CHECK(sameRing(ring, expect.at("after").at("rings").at(k), what + " ring after"));
        for (int s = 0; s < 2; ++s) {
            const std::string send = what + " send " + std::to_string(s);
            const scene::OrbSend& mine = orb.sends[s];
            const json& trail = e.at("trail").at(s);
            CHECK(sameInt(GsUnits::alpha(mine.trail.headerAlpha), trail.at("header").at("a").get<int32_t>(), send + " trail header alpha"));
            CHECK(sameInt(static_cast<int32_t>(mine.trail.points.size()), static_cast<int32_t>(trail.at("vertices").size()), send + " trail points"));
            for (size_t i = 0; i < mine.trail.points.size(); ++i)
                CHECK(sameTrailPoint(mine.trail.points[i], trail.at("vertices").at(i), gs, send + " trail point " + std::to_string(i)));
            CHECK(sameSprite(mine.glow, e.at("sprites").at(s).at("glow"), gs, send + " glow"));
            CHECK(sameSprite(mine.disc, e.at("sprites").at(s).at("disc"), gs, send + " disc"));
        }
    }
    const json& after = expect.at("after");
    const scene::Ramp expected = rampOf(after.at("spriteFade"));
    CHECK(sameInt(state.spriteFade.length, expected.length, at + " spriteFade length"));
    CHECK(sameInt(state.spriteFade.counter, expected.counter, at + " spriteFade counter"));
    CHECK(sameInt(state.spriteFade.changed, expected.changed, at + " spriteFade changed"));
    CHECK(sameInt(state.spriteFade.state, expected.state, at + " spriteFade state"));
    CHECK(sameBits(state.fraction, after.at("eased").at("fraction"), at + " fraction"));
    return 0;
}

int isolated(const json& fixture) {
    for (const json& frame : fixture.at("frames")) {
        OrbState state = stateOf(frame.at("input"));
        const OrbInputs in = inputsOf(frame.at("input"));
        const json& camera = frame.at("expect").at("camera");
        const OrbFrame out = scene::Orbs<EeArithmetic>::frame(state, in, hexMat4(camera.at("view")), hexMat4(camera.at("screen")));
        if (int failed = compareFrame(out, state, frame, in, "isolated")) return failed;
    }
    return 0;
}

// The orbs' own state (rings, sprite ramp, eased fraction) is carried from frame 0; the time is
// external; the hands, progress, scale and camera belong to the other parts and come from each frame.
int carried(const json& fixture) {
    const json& frames = fixture.at("frames");
    OrbState state = stateOf(frames.at(0).at("input"));
    for (const json& frame : frames) {
        const OrbInputs in = inputsOf(frame.at("input"));
        const json& camera = frame.at("expect").at("camera");
        const OrbFrame out = scene::Orbs<EeArithmetic>::frame(state, in, hexMat4(camera.at("view")), hexMat4(camera.at("screen")));
        if (int failed = compareFrame(out, state, frame, in, "carried")) return failed;
    }
    return 0;
}

int native(const json& fixture) {
    const json& frame = fixture.at("frames").at(0);
    OrbState ee = stateOf(frame.at("input"));
    OrbState plain = ee;
    const OrbInputs in = inputsOf(frame.at("input"));
    const json& camera = frame.at("expect").at("camera");
    const scene::Mat4 view = hexMat4(camera.at("view")), screen = hexMat4(camera.at("screen"));
    const OrbFrame a = scene::Orbs<EeArithmetic>::frame(ee, in, view, screen);
    const OrbFrame b = scene::Orbs<NativeArithmetic>::frame(plain, in, view, screen);
    for (int k = 0; k < scene::kOrbCount; ++k) {
        CHECK(a.orbs[k].sends[0].trail.points.size() == b.orbs[k].sends[0].trail.points.size());
        CHECK(std::fabs(a.orbs[k].cx - b.orbs[k].cx) < 0.01f && std::fabs(a.orbs[k].cy - b.orbs[k].cy) < 0.01f);
        CHECK(std::fabs(a.orbs[k].sends[0].glow.first.x - b.orbs[k].sends[0].glow.first.x) <= 0.0625f);
        CHECK(ee.rings[k].head == plain.rings[k].head);
    }
    CHECK(std::fabs(ee.fraction - plain.fraction) < 1e-6f);
    return 0;
}

}

int main(int argc, char** argv) {
    return scenetest::run(argc, argv, [](int count, char** arguments) {
        if (count < 2) {
            std::fprintf(stderr, "usage: OrbsTest <scene.json>\n");
            return 1;
        }
        const json fixture = scenetest::loadScene(arguments[1]);
        if (int failed = isolated(fixture)) return failed;
        std::printf("orbs isolated: %zu frames equal\n", fixture.at("frames").size());
        if (int failed = carried(fixture)) return failed;
        std::printf("orbs carried: %zu frames equal\n", fixture.at("frames").size());
        if (int failed = native(fixture)) return failed;
        std::printf("orbs native: close to the EE\n");
        return 0;
    });
}
