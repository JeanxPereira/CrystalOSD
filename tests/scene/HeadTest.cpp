#include <cmath>
#include <cstdio>
#include <optional>
#include <string>
#include <vector>

#include "SceneFixture.hpp"
#include "Scene/FrameHead.hpp"

namespace {

using nlohmann::json;
using scene::EeArithmetic;
using scene::HeadDraw;
using scene::NativeArithmetic;
using scenetest::sameBits;

#define CHECK(condition)                                                         \
    do {                                                                         \
        if (!(condition)) {                                                      \
            std::fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #condition); \
            return 1;                                                            \
        }                                                                        \
    } while (0)

scene::Rect rectOf(const json& j) {
    scene::Rect r;
    for (int i = 0; i < 4; ++i) r.colour[i] = j.at("colour").at(i).get<int32_t>();
    r.x0 = j.at("x0");
    r.y0 = j.at("y0");
    r.u0 = j.at("u0");
    r.v0 = j.at("v0");
    r.x1 = j.at("x1");
    r.y1 = j.at("y1");
    r.u1 = j.at("u1");
    r.v1 = j.at("v1");
    r.z = j.at("z");
    r.blend = j.at("blend");
    r.textured = j.at("textured");
    return r;
}

scene::Ramp rampOf(const json& j) { return {j.at("length"), j.at("counter"), j.at("changed"), j.at("state")}; }

scene::HeadState stateOf(const json& in) {
    scene::HeadState s;
    s.greyRamp = rampOf(in.at("greyRamp"));
    for (int i = 0; i < 3; ++i) s.greys[i] = in.at("greys").at(i);
    s.vignetteRamp = rampOf(in.at("vignetteRamp"));
    const auto& ring = in.at("ringRecord");
    s.ring = {ring.at("alpha"), ring.at("cx"), ring.at("cy"), ring.at("rx"), ring.at("ry"), ring.at("z")};
    s.tint = rectOf(in.at("tint"));
    s.blur = rectOf(in.at("blurRecord"));
    s.copy = rectOf(in.at("copyRecord"));
    s.fade = rectOf(in.at("fadeRecord"));
    s.bars = rectOf(in.at("bars"));
    s.column = rectOf(in.at("column"));
    return s;
}

scene::HeadInputs inputsOf(const json& in) {
    scene::HeadInputs h;
    h.width = in.at("screen").at("width");
    h.height = in.at("screen").at("height");
    h.mode = in.at("mode");
    h.overlayLevel = in.at("overlayLevel");
    h.level = static_cast<uint32_t>(in.at("level").get<int32_t>());
    h.counter = in.at("counter");
    h.item0 = in.at("item0");
    h.proportionX = scenetest::hexFloat(in.at("proportions").at("ax"));
    h.proportionY = scenetest::hexFloat(in.at("proportions").at("ay"));
    for (int i = 0; i < 4; ++i) h.clearColour[i] = in.at("clearColour").at(i);
    const auto& t = in.at("tubeConstants");
    h.tube = {scenetest::hexFloat(t.at("near")),      scenetest::hexFloat(t.at("turn")), scenetest::hexFloat(t.at("scroll")), scenetest::hexFloat(t.at("ripple")),
              scenetest::hexFloat(t.at("scrollEnd")), scenetest::hexFloat(t.at("turnEnd")), scenetest::hexFloat(t.at("far")), scenetest::hexFloat(t.at("radius"))};
    return h;
}

bool rectEqual(const scene::Rect& r, const json& j, const std::string& what) {
    const scene::Rect e = rectOf(j);
    const bool same = r.colour == e.colour && r.x0 == e.x0 && r.y0 == e.y0 && r.u0 == e.u0 && r.v0 == e.v0 && r.x1 == e.x1 && r.y1 == e.y1 && r.u1 == e.u1 &&
                      r.v1 == e.v1 && r.z == e.z && r.blend == e.blend && r.textured == e.textured;
    if (!same) std::fprintf(stderr, "%s: record differs from the fixture\n", what.c_str());
    return same;
}

bool rampEqual(const scene::Ramp& r, const json& j, const std::string& what) {
    const scene::Ramp e = rampOf(j);
    const bool same = r.length == e.length && r.counter == e.counter && r.changed == e.changed && r.state == e.state;
    if (!same) std::fprintf(stderr, "%s: ramp differs: %d %d %d %d\n", what.c_str(), r.length, r.counter, r.changed, r.state);
    return same;
}

// The cubes pass and the menus also write the head's records and ramps: the cubes set the copy record's blend, setMode (clock_menus.mjs)
// rewrites the fade record's colour and extent, and the menus start, lower or hide the vignette and grey ramps after the head's tick.
// A frame's after-state is taken from those writes before it is compared, and carried on.
// A ramp the menus start (idle to rising), send down (full to falling) or hide (idle at 0).
void takeStart(scene::Ramp& mine, const scene::Ramp& expected) {
    if (mine.length != expected.length) return;
    const bool start = mine.state == 0 && expected.state == 1 && expected.counter == 0;
    const bool down = mine.state == 2 && expected.state == 3 && expected.counter == mine.counter;
    const bool hide = expected.state == 0 && expected.counter == 0;
    if (start || down || hide) mine = expected;
}

void takeForeign(scene::HeadState& s, const json& from) {
    const scene::Rect copyRecord = rectOf(from.at("copyRecord")), fade = rectOf(from.at("fadeRecord"));
    s.copy.blend = copyRecord.blend;
    for (int i = 0; i < 3; ++i) s.fade.colour[i] = fade.colour[i];
    s.fade.x1 = fade.x1;
    s.fade.y1 = fade.y1;
    takeStart(s.vignetteRamp, rampOf(from.at("vignetteRamp")));
    takeStart(s.greyRamp, rampOf(from.at("greyRamp")));
}

// The menus' thread step (clock_menus.mjs between) runs before the frame and may write the head's ramps and records
// (whole2-leave frame 3: mode 3 sends the vignette ramp down). A frame's input is taken after it; the carried state
// takes what between changed.
void takeBetween(scene::HeadState& s, const json& frame) {
    if (!frame.contains("between") || frame.at("between").is_null()) return;
    const json& before = frame.at("between").at("before");
    const json& after = frame.at("between").at("after");
    const auto changed = [&](const char* key) { return after.contains(key) && before.at(key) != after.at(key); };
    if (changed("vignetteRamp")) s.vignetteRamp = rampOf(after.at("vignetteRamp"));
    if (changed("greyRamp")) s.greyRamp = rampOf(after.at("greyRamp"));
    if (changed("fadeRecord")) s.fade = rectOf(after.at("fadeRecord"));
    if (changed("copyRecord")) s.copy = rectOf(after.at("copyRecord"));
}

bool stateEqual(scene::HeadState s, const json& after, const std::string& at) {
    takeForeign(s, after);
    bool ok = rampEqual(s.greyRamp, after.at("greyRamp"), at + " greyRamp") && rampEqual(s.vignetteRamp, after.at("vignetteRamp"), at + " vignetteRamp");
    for (int i = 0; i < 3; ++i) ok = ok && s.greys[i] == after.at("greys").at(i).get<int32_t>();
    const auto& ring = after.at("ringRecord");
    ok = ok && s.ring.alpha == ring.at("alpha") && s.ring.cx == ring.at("cx") && s.ring.cy == ring.at("cy") && s.ring.rx == ring.at("rx") && s.ring.ry == ring.at("ry") &&
         s.ring.z == ring.at("z");
    ok = ok && rectEqual(s.tint, after.at("tint"), at + " tint") && rectEqual(s.blur, after.at("blurRecord"), at + " blurRecord") &&
         rectEqual(s.copy, after.at("copyRecord"), at + " copyRecord") && rectEqual(s.fade, after.at("fadeRecord"), at + " fadeRecord") &&
         rectEqual(s.bars, after.at("bars"), at + " bars") && rectEqual(s.column, after.at("column"), at + " column");
    if (!ok) std::fprintf(stderr, "%s: state after the frame differs\n", at.c_str());
    return ok;
}

struct Expected {
    scene::Target target;
    scene::Source source;
    scene::AlphaMode alpha;
    int32_t depthTest;
};

// The GS state each draw is sent with, from the gs.* calls of References/model/clock_rest.mjs. `index` is the draw's place in its part.
Expected expectedState(scene::Part part, size_t index) {
    using namespace scene;
    switch (part) {
        case Part::Background: return {Target::Display, Source::Background, AlphaMode::Add, 2};  // :82 bind(1, 1, 2) after the display of :121
        case Part::Blur:
        case Part::BlurAfter:
            if (index % 2 == 0) return {Target::Work1, Source::Frame, AlphaMode::AlphaOver, 1};  // :97 frameTexture, work(1), blend(1, 1)
            return {Target::Display, Source::Work1, AlphaMode::AlphaOver, 1};                     // :100 buffer(1), display, blend(1, 1)
        case Part::Copy:
            if (index == 0) return {Target::Work0, Source::Frame, AlphaMode::AlphaOver, 1};  // :125 work(0), frameTexture; :112 blend(1, 1)
            return {Target::Work1, Source::Frame, AlphaMode::AlphaOver, 1};                  // :127 work(1); :112 blend(1, 1)
        case Part::Tint: return {Target::Display, Source::Work0, AlphaMode::Add, 1};         // :129 display, buffer(0), blend(0, 1)
        case Part::Vignette: return {Target::Display, Source::None, AlphaMode::AlphaOver, 2};  // :173 blend(1, 2), on the display the rods left
        case Part::Fade: return {Target::Display, Source::None, AlphaMode::AlphaOver, 1};      // :178 display, blend(1, 1)
        case Part::Bars: return {Target::Display, Source::None, AlphaMode::AlphaOver, 1};      // :193 display, blend(1, 1)
        case Part::Column: return {Target::Display, Source::None, AlphaMode::AlphaOver, 1};    // :222 display, blend(1, 1)
    }
    return {};
}

bool stateEqual(const HeadDraw& d, size_t index, const std::string& at) {
    const Expected e = expectedState(d.part, index);
    const bool same = d.target == e.target && d.source == e.source && d.alpha == e.alpha && d.depthTest == e.depthTest;
    if (!same) std::fprintf(stderr, "%s: GS state (target, source, alpha, depth test) differs from the model's\n", at.c_str());
    return same;
}

// The native draw converted back to GS registers, compared with what the fixture decoded from the packets.
bool drawEqual(const HeadDraw& d, const json& e, int32_t width, int32_t height, const std::string& at, size_t index) {
    using scene::Coordinates;
    if (!stateEqual(d, index, at)) return false;
    const uint32_t prim = (d.topology == scene::Topology::Sprite ? 6u : 4u) | (d.gouraud ? 8u : 0u) | (d.textured ? 0x10u : 0u) | (d.blended ? 0x40u : 0u) |
                          (d.coordinates == Coordinates::Uv ? 0x100u : 0u);
    if (prim != e.at("prim").get<uint32_t>()) {
        std::fprintf(stderr, "%s: prim %u, expected %u\n", at.c_str(), prim, e.at("prim").get<uint32_t>());
        return false;
    }
    const auto& vs = e.at("vertices");
    if (vs.size() != d.vertices.size()) {
        std::fprintf(stderr, "%s: %zu vertices, expected %zu\n", at.c_str(), d.vertices.size(), vs.size());
        return false;
    }
    const float ox = static_cast<float>(2048 - (width >> 1)), oy = static_cast<float>(2048 - (height >> 1));
    for (size_t i = 0; i < vs.size(); ++i) {
        const auto& v = d.vertices[i];
        const auto& x = vs[i];
        const std::string where = at + " vertex " + std::to_string(i);
        const bool hasSt = x.contains("s"), hasUv = x.contains("u");
        const float px = (v.x + ox) * 16, py = (v.y + oy) * 16;
        const bool ok = static_cast<float>(x.at("x").get<int32_t>()) == px && static_cast<float>(x.at("y").get<int32_t>()) == py && v.z == x.at("z").get<uint32_t>() &&
                        v.fog == x.at("f").get<uint32_t>() && v.r * 128 == x.at("r").get<float>() && v.g * 128 == x.at("g").get<float>() &&
                        v.b * 128 == x.at("b").get<float>() && v.a * 128 == x.at("a").get<float>() && hasSt == (d.coordinates == Coordinates::St) &&
                        hasUv == (d.coordinates == Coordinates::Uv);
        if (!ok) {
            std::fprintf(stderr, "%s: position, depth, colour or coordinate kind differs\n", where.c_str());
            return false;
        }
        if (!sameBits(v.q, x.at("q"), where + " q")) return false;
        if (hasSt && (!sameBits(v.s, x.at("s"), where + " s") || !sameBits(v.t, x.at("t"), where + " t"))) return false;
        if (hasUv && (v.u * 16 != x.at("u").get<float>() || v.v * 16 != x.at("v").get<float>())) {
            std::fprintf(stderr, "%s: texel differs\n", where.c_str());
            return false;
        }
    }
    return true;
}

template <class A>
std::vector<HeadDraw> frameDraws(scene::FrameHead<A>& head, const scene::HeadInputs& in, const scene::Mat4& view, const scene::Mat4& screen) {
    std::vector<HeadDraw> all = head.head(in, view, screen);
    for (auto part : {head.overlay(in), head.tripsAfter(in), head.bars(in), head.column(in)}) all.insert(all.end(), part.begin(), part.end());
    return all;
}

struct Coverage {
    size_t frames = 0, background = 0, blur = 0, blurAfter = 0, vignette = 0, bars = 0;
};

bool drawsEqual(const std::vector<HeadDraw>& draws, const json& head, int32_t width, int32_t height, const std::string& at, Coverage& cover) {
    using scene::Part;
    auto group = [&](Part part) {
        std::vector<const HeadDraw*> out;
        for (const auto& d : draws)
            if (d.part == part) out.push_back(&d);
        return out;
    };
    auto many = [&](Part part, const char* key, size_t& counter) {
        const auto got = group(part);
        const auto& want = head.at(key);
        if (got.size() != want.size()) {
            std::fprintf(stderr, "%s %s: %zu draws, expected %zu\n", at.c_str(), key, got.size(), want.size());
            return false;
        }
        counter += got.size();
        for (size_t i = 0; i < got.size(); ++i)
            if (!drawEqual(*got[i], want[i], width, height, at + " " + key + "[" + std::to_string(i) + "]", i)) return false;
        return true;
    };
    auto one = [&](Part part, const char* key) {
        const auto got = group(part);
        const auto& want = head.at(key);
        if (want.is_null()) {
            if (!got.empty()) std::fprintf(stderr, "%s %s: drawn, the fixture has none\n", at.c_str(), key);
            return got.empty();
        }
        if (got.size() != 1) {
            std::fprintf(stderr, "%s %s: %zu draws, expected 1\n", at.c_str(), key, got.size());
            return false;
        }
        return drawEqual(*got[0], want, width, height, at + " " + key, 0);
    };
    size_t unused = 0;
    ++cover.frames;
    return many(Part::Background, "background", cover.background) && many(Part::Blur, "blur", cover.blur) && many(Part::Copy, "copies", unused) && one(Part::Tint, "tint") &&
           many(Part::Vignette, "vignette", cover.vignette) && one(Part::Fade, "fade") && many(Part::BlurAfter, "blurAfter", cover.blurAfter) &&
           many(Part::Bars, "bars", cover.bars) && one(Part::Column, "column");
}

int sceneFixture(const std::string& path) {
    const json scene = scenetest::loadScene(path);
    const auto& frames = scene.at("frames");
    CHECK(!frames.empty());
    if (!frames.at(0).at("expect").contains("head")) {
        std::printf("%s: no expect.head, skipped\n", path.c_str());
        return 0;
    }
    Coverage isolated, carriedCover;
    std::optional<scene::FrameHead<EeArithmetic>> carried;
    for (const auto& frame : frames) {
        const auto& in = frame.at("input");
        const auto& expect = frame.at("expect");
        const std::string at = "frame " + std::to_string(frame.at("index").get<int>());
        const scene::Mat4 view = scenetest::hexMat4(expect.at("camera").at("view")), screen = scenetest::hexMat4(expect.at("camera").at("screen"));
        const scene::HeadInputs inputs = inputsOf(in);
        const auto& head = expect.at("head");

        scene::FrameHead<EeArithmetic> alone(stateOf(in));
        CHECK(drawsEqual(frameDraws(alone, inputs, view, screen), head, inputs.width, inputs.height, at + " isolated", isolated));
        CHECK(stateEqual(alone.state(), expect.at("after"), at + " isolated"));

        if (!carried) carried.emplace(stateOf(in));
        else takeBetween(carried->state(), frame);
        CHECK(drawsEqual(frameDraws(*carried, inputs, view, screen), head, inputs.width, inputs.height, at + " carried", carriedCover));
        CHECK(stateEqual(carried->state(), expect.at("after"), at + " carried"));
        takeForeign(carried->state(), expect.at("after"));

        scene::FrameHead<NativeArithmetic> native(stateOf(in));
        const auto nativeDraws = frameDraws(native, inputs, view, screen);
        scene::FrameHead<EeArithmetic> again(stateOf(in));
        const auto exact = frameDraws(again, inputs, view, screen);
        CHECK(nativeDraws.size() == exact.size());
        for (size_t i = 0; i < exact.size(); ++i) {
            CHECK(nativeDraws[i].part == exact[i].part);
            if (exact[i].part != scene::Part::Background && exact[i].part != scene::Part::Vignette) CHECK(nativeDraws[i].vertices.size() == exact[i].vertices.size());
        }
    }
    std::printf("%s: %zu frames, isolated and carried equal; draws: background %zu, blur %zu, blurAfter %zu, vignette %zu, bars %zu\n", path.c_str(), frames.size(),
                isolated.background, isolated.blur, isolated.blurAfter, isolated.vignette, isolated.bars);
    return 0;
}

}

int main(int argc, char** argv) {
    return scenetest::run(argc, argv, [](int count, char** arguments) {
        if (count < 2) {
            std::fprintf(stderr, "usage: HeadTest <scene.json>...\n");
            return 1;
        }
        for (int i = 1; i < count; ++i)
            if (int failed = sceneFixture(arguments[i])) return failed;
        std::printf("head: all equal\n");
        return 0;
    });
}

