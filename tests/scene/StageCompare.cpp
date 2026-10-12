#include "StageCompare.hpp"

#include <functional>
#include <map>
#include <stdexcept>
#include <type_traits>

#include "SceneFixture.hpp"
#include "Scene/SceneInputs.hpp"

namespace {

using nlohmann::json;
using scene::hexFloat;

json hex(float value) { return scenetest::bitsText(scene::floatBits(value)); }
json hex(const scene::Vec4& v) { return json::array({hex(v[0]), hex(v[1]), hex(v[2]), hex(v[3])}); }
json hex(const scene::Mat4& m) { return json::array({hex(m[0]), hex(m[1]), hex(m[2]), hex(m[3])}); }

template <class T, size_t N>
json array(const std::array<T, N>& values) {
    json out = json::array();
    for (const T& v : values) out.push_back(v);
    return out;
}

template <class T>
json optional(const std::optional<T>& value) {
    if (!value) return nullptr;
    if constexpr (std::is_arithmetic_v<T>) return *value;
    else return array(*value);
}

scene::Ramp rampOf(const json& j) { return {j.at("length"), j.at("counter"), j.at("changed"), j.at("state")}; }
json rampJson(const scene::Ramp& r) { return {{"length", r.length}, {"counter", r.counter}, {"changed", r.changed}, {"state", r.state}}; }

scene::Colour colourOf(const json& j) { return {j.at(0).get<int32_t>(), j.at(1).get<int32_t>(), j.at(2).get<int32_t>(), j.at(3).get<int32_t>()}; }

scene::Rect rectOf(const json& j) {
    scene::Rect r;
    r.colour = colourOf(j.at("colour"));
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

json rectJson(const scene::Rect& r) {
    return {{"colour", array(r.colour)}, {"x0", r.x0}, {"y0", r.y0}, {"u0", r.u0}, {"v0", r.v0}, {"x1", r.x1}, {"y1", r.y1}, {"u1", r.u1}, {"v1", r.v1},
            {"z", r.z}, {"blend", r.blend}, {"textured", r.textured}};
}

json rodRecordJson(const scene::RodRecord& r) {
    return {{"number", r.number},
            {"faces", r.faces},
            {"local", hex(r.local)},
            {"sx", hex(r.sx)},
            {"sy", hex(r.sy)},
            {"sz", hex(r.sz)},
            {"base", array(r.base)},
            {"strength", hex(r.strength)},
            {"textured", array(r.textured)},
            {"pair", json::array({hex(r.pair[0]), hex(r.pair[1])})},
            {"refraction", hex(r.refraction)},
            {"reflection", array(r.reflection)},
            {"extra", array(r.extra)}};
}

scene::RodsState rodsOf(const json& j) {
    scene::RodsState s;
    s.currentRod = j.at("currentRod");
    s.secondsAngle = j.at("secondsAngle");
    s.rodAngle = j.at("rodAngle");
    for (size_t i = 0; i < s.rods.size(); ++i) {
        const json& r = j.at("rods").at(i);
        s.rods[i] = {hexFloat(r.at("appearance")), hexFloat(r.at("progress")), colourOf(r.at("base")), colourOf(r.at("reflection"))};
    }
    s.accent = colourOf(j.at("accent"));
    s.fourth = colourOf(j.at("fourth"));
    s.progressTarget = hexFloat(j.at("progressTarget"));
    s.accentFrame = colourOf(j.at("accentFrame"));
    s.currentTarget = colourOf(j.at("currentTarget"));
    return s;
}

json rodsJson(const scene::RodsState& s) {
    json rods = json::array();
    for (const auto& r : s.rods) rods.push_back({{"appearance", hex(r.appearance)}, {"progress", hex(r.progress)}, {"base", array(r.base)}, {"reflection", array(r.reflection)}});
    return {{"currentRod", s.currentRod},
            {"secondsAngle", s.secondsAngle},
            {"rodAngle", s.rodAngle},
            {"rods", rods},
            {"accent", array(s.accent)},
            {"fourth", array(s.fourth)},
            {"progressTarget", hex(s.progressTarget)},
            {"accentFrame", array(s.accentFrame)},
            {"currentTarget", array(s.currentTarget)}};
}

json configPageJson(const scene::ConfigPage& p) {
    return {{"word0", p.word0},        {"entries", p.entries}, {"count", p.count},   {"titleWidth", p.titleWidth}, {"selected", p.selected}, {"word14", p.word14},
            {"level", p.level},        {"ramp", rampJson(p.ramp)}, {"word2c", p.word2c}, {"word30", p.word30},       {"glow", p.glow}};
}

json configEntriesJson(const std::array<scene::ConfigEntry, 9>& entries) {
    json out = json::array();
    for (const auto& e : entries)
        out.push_back({{"id", e.id},
                       {"valueCount", e.valueCount},
                       {"valueIndex", e.valueIndex},
                       {"item", e.item},
                       {"valueTable", e.valueTable},
                       {"enter", e.enter},
                       {"stringCallback", e.stringCallback},
                       {"frameCallback", e.frameCallback},
                       {"confirm", e.confirm},
                       {"cancel", e.cancel},
                       {"focus", e.focus},
                       {"rest", array(e.rest)}});
    return out;
}

json mainMenuJson(const scene::MainMenu& m) {
    return {{"word0", m.word0}, {"items", m.items}, {"count", m.count}, {"word0c", m.word0c}, {"selected", m.selected}, {"word14", m.word14}, {"ramp", rampJson(m.ramp)}};
}

json versionRowsJson(const std::array<scene::VersionRow, scene::kVersionRows>& rows) {
    json out = json::array();
    for (const scene::VersionRow& r : rows) out.push_back({{"label", r.label}, {"value", r.value}, {"subRows", r.subRows}, {"id", r.id}});
    return out;
}

json versionPageJson(const scene::VersionPage& v) {
    return {{"title", v.title}, {"count", v.count}, {"shown", v.shown}, {"selected", v.selected}, {"first", v.first}, {"rows", versionRowsJson(v.rows)},
            {"job", v.job}, {"panelOn", v.panelOn}, {"panelAlpha", v.panelAlpha}, {"hints", array(v.hints)}, {"arrows", v.arrows}, {"polls", v.polls}};
}

json versionDrawnJson(const scene::MenusState& m) {
    const scene::VersionPage& v = m.versionDrawn;
    return {{"title", v.title}, {"count", v.count}, {"shown", v.shown}, {"selected", v.selected}, {"first", v.first}, {"rows", versionRowsJson(v.rows)}, {"ramp", rampJson(m.versionRampDrawn)}};
}

json adjustFieldsJson(const std::array<scene::AdjustField, 6>& fields) {
    json out = json::array();
    for (const auto& a : fields) out.push_back({{"item", a.item}, {"lowest", a.lowest}, {"highest", a.highest}});
    return out;
}

using Read = std::function<void(StagePieces&, const json&)>;
using Write = std::function<json(const StagePieces&)>;

// Every key of STAGE_PIECES and how the pieces write it back. The clock's and the head's keys are read one by one
// (`read`); the menus', the cubes', the items' and the externals' keys go through SceneInputs' readers whole.
struct Owner {
    Read read;
    Write write;
};

const std::map<std::string, Owner>& owners() {
    static const std::map<std::string, Owner> table = {
        {"time",
         {[](StagePieces& p, const json& j) { p.clock.time = {hexFloat(j.at("ms")), j.at("seconds"), j.at("minutes"), j.at("hours")}; },
          [](const StagePieces& p) -> json {
              return {{"ms", hex(p.clock.time.milliseconds)}, {"seconds", p.clock.time.seconds}, {"minutes", p.clock.time.minutes}, {"hours", p.clock.time.hours}};
          }}},
        {"mode", {[](StagePieces& p, const json& j) { p.clock.mode = j; }, [](const StagePieces& p) -> json { return p.clock.mode; }}},
        {"overlayLevel", {[](StagePieces& p, const json& j) { p.clock.overlayLevel = j; }, [](const StagePieces& p) -> json { return p.clock.overlayLevel; }}},
        {"vignetteRamp", {[](StagePieces& p, const json& j) { p.clock.vignetteRamp = rampOf(j); }, [](const StagePieces& p) { return rampJson(p.clock.vignetteRamp); }}},
        {"menuRamp", {[](StagePieces& p, const json& j) { p.clock.menuRamp = rampOf(j); }, [](const StagePieces& p) { return rampJson(p.clock.menuRamp); }}},
        {"tail", {[](StagePieces& p, const json& j) { p.clock.tail = j; }, [](const StagePieces& p) -> json { return p.clock.tail; }}},
        {"appearance", {[](StagePieces& p, const json& j) { p.clock.appearance = rampOf(j); }, [](const StagePieces& p) { return rampJson(p.clock.appearance); }}},
        {"state", {[](StagePieces& p, const json& j) { p.clock.state = rodsOf(j); }, [](const StagePieces& p) { return rodsJson(p.clock.state); }}},
        {"scaleTarget", {[](StagePieces& p, const json& j) { p.clock.scaleTarget = hexFloat(j); }, [](const StagePieces& p) { return hex(p.clock.scaleTarget); }}},
        {"timeFilled", {[](StagePieces& p, const json& j) { p.clock.timeFilled = j; }, [](const StagePieces& p) -> json { return p.clock.timeFilled; }}},
        {"scene",
         {[](StagePieces& p, const json& j) { p.clock.scene = {hexFloat(j.at("scale")), j.at("leaving"), j.at("field")}; },
          [](const StagePieces& p) -> json { return {{"scale", hex(p.clock.scene.scale)}, {"leaving", p.clock.scene.leaving}, {"field", p.clock.scene.field}}; }}},
        {"level", {[](StagePieces& p, const json& j) { p.clock.level = j; }, [](const StagePieces& p) -> json { return p.clock.level; }}},
        {"spin",
         {[](StagePieces& p, const json& j) {
              if (j.is_null()) p.clock.spin.reset();
              else p.clock.spin = j.get<uint16_t>();
          },
          [](const StagePieces& p) { return optional(p.clock.spin); }}},
        {"greyRamp", {[](StagePieces& p, const json& j) { p.head.greyRamp = rampOf(j); }, [](const StagePieces& p) { return rampJson(p.head.greyRamp); }}},
        {"fadeRecord", {[](StagePieces& p, const json& j) { p.head.fade = rectOf(j); }, [](const StagePieces& p) { return rectJson(p.head.fade); }}},
        {"copyRecord", {[](StagePieces& p, const json& j) { p.head.copy = rectOf(j); }, [](const StagePieces& p) { return rectJson(p.head.copy); }}},
        {"spriteFade", {[](StagePieces& p, const json& j) { p.spriteFade = rampOf(j); }, [](const StagePieces& p) { return rampJson(p.spriteFade); }}},
        {"screen",
         {[](StagePieces& p, const json& j) {
              p.width = j.at("width");
              p.height = j.at("height");
          },
          [](const StagePieces& p) -> json { return {{"width", p.width}, {"height", p.height}}; }}},

        {"configPage", {nullptr, [](const StagePieces& p) { return configPageJson(p.menus.page); }}},
        {"configRamp", {nullptr, [](const StagePieces& p) { return rampJson(p.menus.page.ramp); }}},
        {"configEntries", {nullptr, [](const StagePieces& p) { return configEntriesJson(p.menus.entries); }}},
        {"mainMenu", {nullptr, [](const StagePieces& p) { return mainMenuJson(p.menus.mainMenu); }}},
        {"versionRamp", {nullptr, [](const StagePieces& p) { return rampJson(p.menus.versionRamp); }}},
        {"versionList", {nullptr, [](const StagePieces& p) {
                             json out = json::array();
                             for (const scene::VersionRow& r : p.menus.versionList) out.push_back({{"label", r.label}, {"value", r.value}, {"subRows", r.subRows}, {"id", r.id}});
                             return out;
                         }}},
        {"versionPage", {nullptr, [](const StagePieces& p) { return versionPageJson(p.menus.version); }}},
        {"versionDrawn", {nullptr, [](const StagePieces& p) { return versionDrawnJson(p.menus); }}},
        {"dialogRamp", {nullptr, [](const StagePieces& p) { return rampJson(p.menus.dialogRamp); }}},
        {"firstRunRamp", {nullptr, [](const StagePieces& p) { return rampJson(p.menus.firstRunRamp); }}},
        {"pagePointers", {nullptr, [](const StagePieces& p) { return array(p.menus.pagePointers); }}},
        {"entryActive", {nullptr, [](const StagePieces& p) -> json { return p.menus.entryActive; }}},
        {"menuLengths", {nullptr, [](const StagePieces& p) { return array(p.menus.menuLengths); }}},
        {"listConstants",
         {nullptr,
          [](const StagePieces& p) -> json {
              const auto& k = p.menus.listConstants;
              return {{"rate", hex(k.rate)}, {"divisor", hex(k.divisor)}, {"pulse", hex(k.pulse)}, {"standing", hex(k.standing)}};
          }}},
        {"screenCode", {nullptr, [](const StagePieces& p) -> json { return p.menus.screenCode; }}},
        {"adjustFields", {nullptr, [](const StagePieces& p) { return adjustFieldsJson(p.menus.adjustFields); }}},
        {"configGate", {nullptr, [](const StagePieces& p) { return optional(p.menus.configGate); }}},
        {"body", {nullptr, [](const StagePieces& p) -> json { return p.menus.body; }}},
        {"videoMode", {nullptr, [](const StagePieces& p) -> json { return p.menus.videoMode; }}},

        {"cubeRamp", {nullptr, [](const StagePieces& p) { return rampJson(p.cubes.ramp); }}},
        {"cubeList",
         {nullptr,
          [](const StagePieces& p) -> json {
              const auto& l = p.cubes.list;
              return {{"pulse", hex(l.pulse)}, {"pulsed", l.pulsed}, {"position", l.position}, {"left", l.left}, {"speed", l.speed}, {"slowing", l.slowing}};
          }}},
        {"cubeColours",
         {nullptr,
          [](const StagePieces& p) -> json {
              const auto& c = p.cubes.colours;
              return {{"selected", array(c.selected)}, {"plain", array(c.plain)}, {"live", array(c.live)}};
          }}},
        {"cubeRecord", {nullptr, [](const StagePieces& p) { return rodRecordJson(p.cubes.record); }}},
        {"cubeConstants",
         {nullptr,
          [](const StagePieces& p) -> json {
              const auto& k = p.cubes.constants;
              return {{"standingFade", hex(k[0])}, {"ringFade", hex(k[1])}, {"twoPi", hex(k[2])}, {"turn", hex(k[3])}, {"quarter", hex(k[4])}, {"minusPi", hex(k[5])}};
          }}},
        {"centreFactors", {nullptr, [](const StagePieces& p) -> json { return {{"cube", hex(p.cubes.centreFactors[0])}, {"layer", hex(p.cubes.centreFactors[1])}}; }}},
        {"cubeView", {nullptr, [](const StagePieces& p) { return hex(p.cubes.view); }}},
        {"cubeScreen", {nullptr, [](const StagePieces& p) { return hex(p.cubes.screen); }}},
        {"layerClear", {nullptr, [](const StagePieces& p) { return array(p.cubes.layerClear); }}},
        {"addRecord", {nullptr, [](const StagePieces& p) { return rectJson(p.cubes.added); }}},
        {"halfRecord", {nullptr, [](const StagePieces& p) { return rectJson(p.cubes.half); }}},
        {"chainRecord", {nullptr, [](const StagePieces& p) { return rectJson(p.cubes.chain); }}},

        {"configItems", {nullptr, [](const StagePieces& p) { return array(p.items); }}},
        {"item0", {nullptr, [](const StagePieces& p) -> json { return p.items[0]; }}},

        {"disc", {nullptr, [](const StagePieces& p) -> json { return p.externals.disc; }}},
        {"pad",
         {nullptr,
          [](const StagePieces& p) -> json {
              const auto& w = p.externals.pad;
              return {{"held", w.held}, {"pressed", w.pressed}, {"released", w.released}, {"repeating", w.repeating}};
          }}},
        {"configDirty", {nullptr, [](const StagePieces& p) { return optional(p.externals.configDirty); }}},
        {"rtcMirror", {nullptr, [](const StagePieces& p) { return optional(p.externals.rtcMirror); }}},
        {"mechaconParam", {nullptr, [](const StagePieces& p) { return optional(p.externals.mechaconParam); }}},
    };
    return table;
}

const Owner& ownerOf(const std::string& key) {
    const auto found = owners().find(key);
    if (found == owners().end()) throw std::runtime_error("stage key without an owner: " + key);
    return found->second;
}

void differences(const json& ours, const json& expected, const std::string& path, std::vector<std::string>& out) {
    if (expected.is_object() && ours.is_object()) {
        for (const auto& [key, value] : expected.items()) {
            const std::string at = path + "." + key;
            if (!ours.contains(key)) out.push_back(at + ": missing vs " + value.dump());
            else differences(ours.at(key), value, at, out);
        }
        for (const auto& [key, value] : ours.items())
            if (!expected.contains(key)) out.push_back(path + "." + key + ": " + value.dump() + " vs missing");
        return;
    }
    if (expected.is_array() && ours.is_array() && expected.size() == ours.size()) {
        for (size_t i = 0; i < expected.size(); ++i) differences(ours.at(i), expected.at(i), path + "[" + std::to_string(i) + "]", out);
        return;
    }
    if (ours != expected) out.push_back(path + ": " + ours.dump() + " vs " + expected.dump());
}

}

StagePieces stagePieces(const json& stage) {
    StagePieces p;
    for (const auto& [key, value] : stage.items()) {
        const Owner& owner = ownerOf(key);
        if (owner.read) owner.read(p, value);
    }
    if (stage.contains("configPage")) {
        p.menus = scene::menusState(stage);
        if (!(p.menus.page.ramp == rampOf(stage.at("configRamp")))) throw std::runtime_error("configRamp differs from configPage.ramp");
    }
    if (stage.contains("cubeList")) p.cubes = scene::cubeState(stage);
    if (stage.contains("pad")) p.externals = scene::menuExternals(stage);
    if (stage.contains("configItems")) p.items = scene::configItems(stage);
    if (stage.contains("item0")) {
        const int32_t item0 = stage.at("item0");
        if (stage.contains("configItems") && p.items[0] != item0) throw std::runtime_error("item0 differs from configItems[0]");
        p.items[0] = item0;
    }
    return p;
}

StagePieces StagePieces::of(const scene::Clock<scene::EeArithmetic>& clock) {
    if (!clock.menus() || !clock.cubes()) throw std::runtime_error("the clock holds no menus");
    StagePieces p;
    p.clock = clock.state();
    p.head = clock.head();
    p.spriteFade = clock.orbs().spriteFade;
    p.menus = *clock.menus();
    p.cubes = *clock.cubes();
    p.items = clock.items();
    p.width = clock.width();
    p.height = clock.height();
    p.externals = clock.externals();
    return p;
}

std::vector<std::string> stageDifferences(const StagePieces& ours, const json& expected) {
    std::vector<std::string> out;
    for (const auto& [key, value] : expected.items()) differences(ownerOf(key).write(ours), value, key, out);
    return out;
}
