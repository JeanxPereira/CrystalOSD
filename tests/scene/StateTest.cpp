#include <cmath>
#include <cstdio>
#include <string>

#include "SceneFixture.hpp"
#include "Scene/Camera.hpp"
#include "Scene/ClockState.hpp"

namespace {

using nlohmann::json;
using namespace scene;
using Ee = EeArithmetic;

float f(const json& hex) { return scenetest::hexFloat(hex); }
Colour colour(const json& j) { return {j.at(0).get<int32_t>(), j.at(1).get<int32_t>(), j.at(2).get<int32_t>(), j.at(3).get<int32_t>()}; }
Ramp ramp(const json& j) { return {j.at("length"), j.at("counter"), j.at("changed"), j.at("state")}; }
Vec4 vec(const json& j) { return scenetest::hexVec4(j); }

ClockState fromInput(const json& in) {
    ClockState s;
    const json& t = in.at("time");
    s.time = {f(t.at("ms")), t.at("seconds"), t.at("minutes"), t.at("hours")};
    const json& e = in.at("eased");
    s.eased = {e.at("secondHand"), e.at("hourHand"), f(e.at("progress")), f(e.at("fraction"))};
    const json& st = in.at("state");
    s.state.currentRod = st.at("currentRod");
    s.state.secondsAngle = st.at("secondsAngle");
    s.state.rodAngle = st.at("rodAngle");
    for (int i = 0; i < 12; ++i) {
        const json& r = st.at("rods").at(i);
        s.state.rods[i] = {f(r.at("appearance")), f(r.at("progress")), colour(r.at("base")), colour(r.at("reflection"))};
    }
    s.state.accent = colour(st.at("accent"));
    s.state.fourth = colour(st.at("fourth"));
    s.state.progressTarget = f(st.at("progressTarget"));
    s.state.accentFrame = colour(st.at("accentFrame"));
    s.state.currentTarget = colour(st.at("currentTarget"));
    s.appearance = ramp(in.at("appearance"));
    const json& c = in.at("colours");
    s.colours = {colour(c.at("base")), colour(c.at("reflection")), colour(c.at("fourth")), colour(c.at("currentReflection"))};
    const json& cc = in.at("cycleCounters");
    s.cycleCounters = {{cc.at("base").at("index"), cc.at("base").at("wait")}, {cc.at("accent").at("index"), cc.at("accent").at("wait")}, cc.at("last")};
    const json& ct = in.at("cycleTables");
    for (int i = 0; i < 6; ++i) s.cycleTables.base[i] = colour(ct.at("base").at(i));
    for (int i = 0; i < 3; ++i) s.cycleTables.accent[i] = colour(ct.at("accent").at(i));
    const json& k = in.at("logicConstants");
    s.logicConstants = {f(k.at("rodEasing")), f(k.at("secondsEasing")), f(k.at("progressStep"))};
    const json& sc = in.at("scene");
    s.scene = {f(sc.at("scale")), sc.at("leaving"), sc.at("field")};
    s.scaleTarget = f(in.at("scaleTarget"));
    s.scaleFactor = f(in.at("scaleFactor"));
    s.timeFilled = in.at("timeFilled");
    s.mode = in.at("mode");
    s.level = in.at("level");
    s.overlayLevel = in.at("overlayLevel");
    s.vignetteRamp = ramp(in.at("vignetteRamp"));
    s.vignetteLength = in.at("vignetteLength");
    s.menuRamp = ramp(in.at("menuRamp"));
    s.tail = in.at("tail");
    s.counter = in.at("counter");
    s.proportions = {f(in.at("proportions").at("ax")), f(in.at("proportions").at("ay"))};
    s.position = vec(in.at("position"));
    s.direction = vec(in.at("direction"));
    s.up = vec(in.at("up"));
    s.rotation = vec(in.at("rotation"));
    s.cameraOffset = f(in.at("cameraOffset"));
    s.zmax = f(in.at("zmax"));
    s.cameraFactor = f(in.at("cameraFactor"));
    return s;
}

json hex(float x) { return scenetest::bitsText(floatBits(x)); }
json colourJson(const Colour& c) { return json::array({c[0], c[1], c[2], c[3]}); }
json rampJson(const Ramp& r) { return {{"length", r.length}, {"counter", r.counter}, {"changed", r.changed}, {"state", r.state}}; }
json vecJson(const Vec4& v) { return json::array({hex(v[0]), hex(v[1]), hex(v[2]), hex(v[3])}); }

json toJson(const ClockState& s) {
    json rods = json::array();
    for (const RodState& r : s.state.rods)
        rods.push_back({{"appearance", hex(r.appearance)}, {"progress", hex(r.progress)}, {"base", colourJson(r.base)}, {"reflection", colourJson(r.reflection)}});
    json base = json::array(), accent = json::array();
    for (const Colour& c : s.cycleTables.base) base.push_back(colourJson(c));
    for (const Colour& c : s.cycleTables.accent) accent.push_back(colourJson(c));
    return {
        {"time", {{"ms", hex(s.time.milliseconds)}, {"seconds", s.time.seconds}, {"minutes", s.time.minutes}, {"hours", s.time.hours}}},
        {"eased", {{"secondHand", s.eased.secondHand}, {"hourHand", s.eased.hourHand}, {"progress", hex(s.eased.progress)}}},
        {"state", {{"currentRod", s.state.currentRod}, {"secondsAngle", s.state.secondsAngle}, {"rodAngle", s.state.rodAngle}, {"rods", rods},
                   {"accent", colourJson(s.state.accent)}, {"fourth", colourJson(s.state.fourth)}, {"progressTarget", hex(s.state.progressTarget)},
                   {"accentFrame", colourJson(s.state.accentFrame)}, {"currentTarget", colourJson(s.state.currentTarget)}}},
        {"appearance", rampJson(s.appearance)},
        {"colours", {{"base", colourJson(s.colours.base)}, {"reflection", colourJson(s.colours.reflection)}, {"fourth", colourJson(s.colours.fourth)},
                     {"currentReflection", colourJson(s.colours.currentReflection)}}},
        {"cycleCounters", {{"base", {{"index", s.cycleCounters.base.index}, {"wait", s.cycleCounters.base.wait}}},
                           {"accent", {{"index", s.cycleCounters.accent.index}, {"wait", s.cycleCounters.accent.wait}}}, {"last", s.cycleCounters.last}}},
        {"cycleTables", {{"base", base}, {"accent", accent}}},
        {"logicConstants", {{"rodEasing", hex(s.logicConstants.rodEasing)}, {"secondsEasing", hex(s.logicConstants.secondsEasing)},
                            {"progressStep", hex(s.logicConstants.progressStep)}}},
        {"scene", {{"scale", hex(s.scene.scale)}, {"leaving", s.scene.leaving}, {"field", s.scene.field}}},
        {"scaleTarget", hex(s.scaleTarget)}, {"scaleFactor", hex(s.scaleFactor)}, {"timeFilled", s.timeFilled},
        {"mode", s.mode}, {"level", s.level}, {"overlayLevel", s.overlayLevel}, {"vignetteRamp", rampJson(s.vignetteRamp)},
        {"vignetteLength", s.vignetteLength}, {"menuRamp", rampJson(s.menuRamp)}, {"tail", s.tail}, {"counter", s.counter},
        {"proportions", {{"ax", hex(s.proportions.ax)}, {"ay", hex(s.proportions.ay)}}},
        {"position", vecJson(s.position)}, {"direction", vecJson(s.direction)}, {"up", vecJson(s.up)}, {"rotation", vecJson(s.rotation)},
        {"cameraOffset", hex(s.cameraOffset)}, {"zmax", hex(s.zmax)}, {"cameraFactor", hex(s.cameraFactor)},
    };
}

bool diff(const json& mine, const json& real, const std::string& path, std::string& first) {
    if (mine.is_object()) {
        for (auto it = mine.begin(); it != mine.end(); ++it)
            if (!diff(it.value(), real.at(it.key()), path + "." + it.key(), first)) return false;
        return true;
    }
    if (mine.is_array()) {
        for (size_t i = 0; i < mine.size(); ++i)
            if (!diff(mine[i], real.at(i), path + "[" + std::to_string(i) + "]", first)) return false;
        return true;
    }
    if (mine == real) return true;
    first = path + ": native " + mine.dump() + ", fixture " + real.dump();
    return false;
}

bool sameState(const ClockState& state, const json& real, const std::string& what) {
    std::string first;
    if (diff(toJson(state), real, "", first)) return true;
    std::printf("MISMATCH %s%s\n", what.c_str(), first.c_str());
    return false;
}

#define CHECK(x) do { if (!(x)) return 1; } while (0)

bool close(float a, float b) { return std::fabs(a - b) <= 1e-3f * (1.0f + std::fabs(b)); }

int checkCamera(ClockState& state, const json& expect, const std::string& at) {
    const CameraMatrices cam = Camera<Ee>::matrices(state);
    CHECK(scenetest::sameBits(cam.screen, expect.at("camera").at("screen"), at + " screen"));
    CHECK(scenetest::sameBits(cam.view, expect.at("camera").at("view"), at + " view"));
    CHECK(scenetest::sameBits(state.cameraOffset, expect.at("camera").at("cameraOffset"), at + " cameraOffset"));
    return 0;
}

int isolated(const json& frames) {
    for (const json& frame : frames) {
        const std::string at = "frame " + std::to_string(frame.at("index").get<int>());
        const json& expect = frame.at("expect");
        ClockState state = fromInput(frame.at("input"));
        if (checkCamera(state, expect, at)) return 1;
        state.spin = static_cast<uint16_t>(0xfff0 + frame.at("index").get<int>());
        const uint16_t spinBefore = *state.spin;
        ClockLogic<Ee>::step(state);
        CHECK(sameState(state, expect.at("after"), at + " after"));
        CHECK(*state.spin == static_cast<uint16_t>(spinBefore + 0x1e));
    }
    std::printf("isolated: %zu frames equal bit for bit\n", frames.size());
    return 0;
}

int carried(const json& frames) {
    ClockState state = fromInput(frames.at(0).at("input"));
    state.spin = 0xffe0;
    for (const json& frame : frames) {
        const std::string at = "carried frame " + std::to_string(frame.at("index").get<int>());
        const json& expect = frame.at("expect");
        const ClockState given = fromInput(frame.at("input"));
        state.time = given.time;
        state.scene.field = given.scene.field;
        if (checkCamera(state, expect, at)) return 1;
        ClockLogic<Ee>::step(state);
        CHECK(sameState(state, expect.at("after"), at + " after"));
        CHECK(*state.spin == static_cast<uint16_t>(0xffe0 + 0x1e * (frame.at("index").get<int>() + 1)));
    }
    std::printf("carried: %zu frames equal bit for bit\n", frames.size());
    return 0;
}

int native(const json& frames) {
    ClockState state = fromInput(frames.at(0).at("input"));
    for (const json& frame : frames) {
        const ClockState given = fromInput(frame.at("input"));
        state.time = given.time;
        state.scene.field = given.scene.field;
        const CameraMatrices cam = Camera<NativeArithmetic>::matrices(state);
        const Mat4 view = scenetest::hexMat4(frame.at("expect").at("camera").at("view"));
        for (int r = 0; r < 4; ++r)
            for (int c = 0; c < 4; ++c) CHECK(close(cam.view[r][c], view[r][c]));
        ClockLogic<NativeArithmetic>::step(state);
    }
    std::printf("native: camera close, steps run\n");
    return 0;
}

}

int main(int argc, char** argv) {
    return scenetest::run(argc, argv, [](int count, char** arguments) {
        if (count < 2) {
            std::printf("usage: StateTest <scene.json>\n");
            return 1;
        }
        const json scene = scenetest::loadScene(arguments[1]);
        const json& frames = scene.at("frames");
        if (int failed = isolated(frames)) return failed;
        if (int failed = carried(frames)) return failed;
        if (int failed = native(frames)) return failed;
        std::printf("StateTest passed\n");
        return 0;
    });
}
