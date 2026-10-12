#include "ColdCompare.hpp"

#include <cstring>
#include <map>
#include <set>

#include "Scene/SceneInputs.hpp"

namespace {

using scene::Colour;

struct Collector {
    std::vector<StartLeaf> out;
    std::string piece;

    void begin(const char* name) { piece = name; }
    void bits(const std::string& leaf, uint32_t v) { out.push_back({piece, leaf, v}); }
    void add(const std::string& leaf, int32_t v) { bits(leaf, static_cast<uint32_t>(v)); }
    void add(const std::string& leaf, float v) {
        uint32_t b;
        std::memcpy(&b, &v, 4);
        bits(leaf, b);
    }
    void add(const std::string& leaf, const Colour& c) {
        for (size_t i = 0; i < 4; ++i) add(leaf + "[" + std::to_string(i) + "]", c[i]);
    }
    void add(const std::string& leaf, const scene::Ramp& r) {
        add(leaf + ".length", r.length);
        add(leaf + ".counter", r.counter);
        add(leaf + ".changed", r.changed);
        add(leaf + ".state", r.state);
    }
    void add(const std::string& leaf, const scene::Vec4& v) {
        for (size_t i = 0; i < 4; ++i) add(leaf + "[" + std::to_string(i) + "]", v[i]);
    }
    void add(const std::string& leaf, const scene::Rect& r) {
        add(leaf + ".colour", r.colour);
        add(leaf + ".x0", r.x0);
        add(leaf + ".y0", r.y0);
        add(leaf + ".u0", r.u0);
        add(leaf + ".v0", r.v0);
        add(leaf + ".x1", r.x1);
        add(leaf + ".y1", r.y1);
        add(leaf + ".u1", r.u1);
        add(leaf + ".v1", r.v1);
        add(leaf + ".z", r.z);
        add(leaf + ".blend", r.blend);
        add(leaf + ".textured", r.textured);
    }
    template <class T>
    void one(const char* name, const T& value) {
        begin(name);
        add("", value);
    }
};

}

std::vector<StartLeaf> startLeaves(const scene::ClockInputs& in) {
    Collector c;
    const scene::ClockState& s = in.state;
    c.begin("time");
    c.add("ms", s.time.milliseconds);
    c.add("seconds", s.time.seconds);
    c.add("minutes", s.time.minutes);
    c.add("hours", s.time.hours);
    c.begin("eased");
    c.add("secondHand", static_cast<int32_t>(s.eased.secondHand));
    c.add("hourHand", static_cast<int32_t>(s.eased.hourHand));
    c.add("progress", s.eased.progress);
    c.add("fraction", s.eased.fraction);
    c.begin("state");
    c.add("currentRod", s.state.currentRod);
    c.add("secondsAngle", static_cast<int32_t>(s.state.secondsAngle));
    c.add("rodAngle", static_cast<int32_t>(s.state.rodAngle));
    for (size_t i = 0; i < s.state.rods.size(); ++i) {
        const std::string p = "rods[" + std::to_string(i) + "].";
        c.add(p + "appearance", s.state.rods[i].appearance);
        c.add(p + "progress", s.state.rods[i].progress);
        c.add(p + "base", s.state.rods[i].base);
        c.add(p + "reflection", s.state.rods[i].reflection);
    }
    c.add("accent", s.state.accent);
    c.add("fourth", s.state.fourth);
    c.add("progressTarget", s.state.progressTarget);
    c.add("accentFrame", s.state.accentFrame);
    c.add("currentTarget", s.state.currentTarget);
    c.one("appearance", s.appearance);
    c.begin("colours");
    c.add("base", s.colours.base);
    c.add("reflection", s.colours.reflection);
    c.add("fourth", s.colours.fourth);
    c.add("currentReflection", s.colours.currentReflection);
    c.begin("cycleCounters");
    c.add("base.index", s.cycleCounters.base.index);
    c.add("base.wait", s.cycleCounters.base.wait);
    c.add("accent.index", s.cycleCounters.accent.index);
    c.add("accent.wait", s.cycleCounters.accent.wait);
    c.add("last", s.cycleCounters.last);
    c.begin("cycleTables");
    for (size_t i = 0; i < 6; ++i) c.add("base[" + std::to_string(i) + "]", s.cycleTables.base[i]);
    for (size_t i = 0; i < 3; ++i) c.add("accent[" + std::to_string(i) + "]", s.cycleTables.accent[i]);
    c.begin("logicConstants");
    c.add("rodEasing", s.logicConstants.rodEasing);
    c.add("secondsEasing", s.logicConstants.secondsEasing);
    c.add("progressStep", s.logicConstants.progressStep);
    c.begin("scene");
    c.add("scale", s.scene.scale);
    c.add("leaving", s.scene.leaving);
    c.add("field", s.scene.field);
    c.one("scaleTarget", s.scaleTarget);
    c.one("scaleFactor", s.scaleFactor);
    c.one("timeFilled", s.timeFilled);
    c.one("mode", s.mode);
    c.one("level", s.level);
    c.one("overlayLevel", s.overlayLevel);
    c.one("vignetteRamp", s.vignetteRamp);
    c.one("vignetteLength", s.vignetteLength);
    c.one("menuRamp", s.menuRamp);
    c.one("tail", s.tail);
    c.one("counter", s.counter);
    c.begin("proportions");
    c.add("ax", s.proportions.ax);
    c.add("ay", s.proportions.ay);
    c.one("position", s.position);
    c.one("direction", s.direction);
    c.one("up", s.up);
    c.one("rotation", s.rotation);
    c.one("cameraOffset", s.cameraOffset);
    c.one("zmax", s.zmax);
    c.one("cameraFactor", s.cameraFactor);

    const scene::HeadState& h = in.head;
    c.one("greyRamp", h.greyRamp);
    c.begin("greys");
    for (size_t i = 0; i < 3; ++i) c.add("[" + std::to_string(i) + "]", h.greys[i]);
    c.one("headVignetteRamp", h.vignetteRamp);
    c.begin("ringRecord");
    c.add("alpha", h.ring.alpha);
    c.add("cx", h.ring.cx);
    c.add("cy", h.ring.cy);
    c.add("rx", h.ring.rx);
    c.add("ry", h.ring.ry);
    c.add("z", h.ring.z);
    c.one("tint", h.tint);
    c.one("blurRecord", h.blur);
    c.one("copyRecord", h.copy);
    c.one("fadeRecord", h.fade);
    c.one("bars", h.bars);
    c.one("column", h.column);

    const scene::RodRecord& r = in.rodTemplate;
    c.begin("template");
    c.add("number", r.number);
    c.add("faces", r.faces);
    for (size_t i = 0; i < 4; ++i) c.add("local[" + std::to_string(i) + "]", r.local[i]);
    c.add("sx", r.sx);
    c.add("sy", r.sy);
    c.add("sz", r.sz);
    c.add("base", r.base);
    c.add("strength", r.strength);
    c.add("textured", r.textured);
    c.add("pair[0]", r.pair[0]);
    c.add("pair[1]", r.pair[1]);
    c.add("refraction", r.refraction);
    c.add("reflection", r.reflection);
    c.add("extra", r.extra);

    c.begin("rings");
    for (size_t k = 0; k < in.orbs.rings.size(); ++k) {
        const scene::OrbRing& ring = in.orbs.rings[k];
        const std::string p = "[" + std::to_string(k) + "].";
        c.add(p + "head", ring.head);
        c.add(p + "count", ring.count);
        c.add(p + "full", ring.full);
        for (size_t n = 0; n < ring.entries.size(); ++n) {
            const std::string e = p + "entries[" + std::to_string(n) + "].";
            c.add(e + "x", ring.entries[n].x);
            c.add(e + "y", ring.entries[n].y);
            c.add(e + "z", ring.entries[n].z);
            c.add(e + "colour", ring.entries[n].colour);
        }
    }
    c.one("spriteFade", in.orbs.spriteFade);
    c.one("clearColour", in.clearColour);
    c.begin("display");
    c.add("firstClear", in.firstDisplayClear);
    c.begin("tubeConstants");
    c.add("near", in.tube.near);
    c.add("turn", in.tube.turn);
    c.add("scroll", in.tube.scroll);
    c.add("ripple", in.tube.ripple);
    c.add("scrollEnd", in.tube.scrollEnd);
    c.add("turnEnd", in.tube.turnEnd);
    c.add("far", in.tube.far);
    c.add("radius", in.tube.radius);
    c.begin("orbConstants");
    c.add("minuteFactor", in.minuteFactor);
    c.add("fractionEasing", in.fractionEasing);
    c.one("orbColour", in.orbColour);
    c.one("wide", in.wide);
    c.begin("orbRandom");
    for (size_t k = 0; k < in.orbRandom.size(); ++k) c.add("[" + std::to_string(k) + "]", in.orbRandom[k]);
    c.begin("orbColours");
    for (size_t k = 0; k < in.orbColours.size(); ++k) c.add("[" + std::to_string(k) + "]", in.orbColours[k]);
    c.begin("screen");
    c.add("width", in.width);
    c.add("height", in.height);
    if (s.spin) c.one("spin", static_cast<int32_t>(*s.spin));
    if (in.menus) {
        const scene::MenusState& m = in.menus->menus;
        c.begin("configPage");
        c.add("word0", m.page.word0);
        c.add("entries", static_cast<int32_t>(m.page.entries));
        c.add("count", m.page.count);
        c.add("titleWidth", m.page.titleWidth);
        c.add("selected", m.page.selected);
        c.add("word14", m.page.word14);
        c.add("level", m.page.level);
        c.add("ramp", m.page.ramp);
        c.add("word2c", m.page.word2c);
        c.add("word30", m.page.word30);
        c.add("glow", m.page.glow);
        c.begin("configEntries");
        for (size_t i = 0; i < m.entries.size(); ++i) {
            const scene::ConfigEntry& e = m.entries[i];
            const std::string p = "[" + std::to_string(i) + "].";
            c.add(p + "id", e.id);
            c.add(p + "valueCount", e.valueCount);
            c.add(p + "valueIndex", e.valueIndex);
            c.add(p + "item", e.item);
            c.add(p + "valueTable", static_cast<int32_t>(e.valueTable));
            c.add(p + "enter", static_cast<int32_t>(e.enter));
            c.add(p + "stringCallback", static_cast<int32_t>(e.stringCallback));
            c.add(p + "frameCallback", static_cast<int32_t>(e.frameCallback));
            c.add(p + "confirm", static_cast<int32_t>(e.confirm));
            c.add(p + "cancel", static_cast<int32_t>(e.cancel));
            c.add(p + "focus", static_cast<int32_t>(e.focus));
            for (size_t k = 0; k < 3; ++k) c.add(p + "rest[" + std::to_string(k) + "]", e.rest[k]);
        }
        c.begin("mainMenu");
        c.add("word0", m.mainMenu.word0);
        c.add("items", static_cast<int32_t>(m.mainMenu.items));
        c.add("count", m.mainMenu.count);
        c.add("word0c", m.mainMenu.word0c);
        c.add("selected", m.mainMenu.selected);
        c.add("word14", m.mainMenu.word14);
        c.add("ramp", m.mainMenu.ramp);
        c.one("versionRamp", m.versionRamp);
        c.one("dialogRamp", m.dialogRamp);
        c.one("firstRunRamp", m.firstRunRamp);
        c.begin("pagePointers");
        for (size_t i = 0; i < m.pagePointers.size(); ++i) c.add("[" + std::to_string(i) + "]", m.pagePointers[i]);
        c.one("entryActive", m.entryActive);
        c.begin("menuLengths");
        for (size_t i = 0; i < m.menuLengths.size(); ++i) c.add("[" + std::to_string(i) + "]", m.menuLengths[i]);
        c.begin("listConstants");
        c.add("rate", m.listConstants.rate);
        c.add("divisor", m.listConstants.divisor);
        c.add("pulse", m.listConstants.pulse);
        c.add("standing", m.listConstants.standing);
        c.one("screenCode", m.screenCode);
        c.begin("adjustFields");
        for (size_t i = 0; i < m.adjustFields.size(); ++i) {
            const std::string p = "[" + std::to_string(i) + "].";
            c.add(p + "item", m.adjustFields[i].item);
            c.add(p + "lowest", m.adjustFields[i].lowest);
            c.add(p + "highest", m.adjustFields[i].highest);
        }
        if (m.configGate) c.one("configGate", *m.configGate);
        c.one("body", m.body);
        c.one("videoMode", m.videoMode);
        c.begin("configItems");
        for (size_t i = 0; i < in.menus->items.size(); ++i) c.add("[" + std::to_string(i) + "]", in.menus->items[i]);
        const scene::CubeState& q = in.menus->cubes;
        c.one("cubeRamp", q.ramp);
        c.begin("cubeList");
        c.add("pulse", q.list.pulse);
        c.add("pulsed", q.list.pulsed);
        c.add("position", q.list.position);
        c.add("left", q.list.left);
        c.add("speed", q.list.speed);
        c.add("slowing", q.list.slowing);
        c.begin("cubeColours");
        c.add("selected", q.colours.selected);
        c.add("plain", q.colours.plain);
        c.add("live", q.colours.live);
        const scene::RodRecord& cr = q.record;
        c.begin("cubeRecord");
        c.add("number", cr.number);
        c.add("faces", cr.faces);
        for (size_t i = 0; i < 4; ++i) c.add("local[" + std::to_string(i) + "]", cr.local[i]);
        c.add("sx", cr.sx);
        c.add("sy", cr.sy);
        c.add("sz", cr.sz);
        c.add("base", cr.base);
        c.add("strength", cr.strength);
        c.add("textured", cr.textured);
        c.add("pair[0]", cr.pair[0]);
        c.add("pair[1]", cr.pair[1]);
        c.add("refraction", cr.refraction);
        c.add("reflection", cr.reflection);
        c.add("extra", cr.extra);
        c.begin("cubeConstants");
        for (size_t i = 0; i < q.constants.size(); ++i) c.add("[" + std::to_string(i) + "]", q.constants[i]);
        c.begin("centreFactors");
        c.add("[0]", q.centreFactors[0]);
        c.add("[1]", q.centreFactors[1]);
        c.begin("cubeView");
        for (size_t i = 0; i < 4; ++i) c.add("[" + std::to_string(i) + "]", q.view[i]);
        c.begin("cubeScreen");
        for (size_t i = 0; i < 4; ++i) c.add("[" + std::to_string(i) + "]", q.screen[i]);
        c.one("layerClear", q.layerClear);
        c.one("addRecord", q.added);
        c.one("halfRecord", q.half);
        c.one("chainRecord", q.chain);
    }
    return std::move(c.out);
}

namespace {

std::string keyOf(const std::string& piece) { return piece == "headVignetteRamp" ? "vignetteRamp" : piece; }

}

std::vector<FieldDiff> compareStart(const scene::ClockInputs& got, const nlohmann::json& input, const ExemptList& exempt, std::vector<Exempt>* stale) {
    const scene::RodMesh cubeMesh;
    const scene::ClockInputs want = scene::clockInputs(input, scene::RodMesh{}, &cubeMesh);
    const std::vector<StartLeaf> a = startLeaves(got);
    const std::vector<StartLeaf> b = startLeaves(want);
    std::map<std::pair<std::string, std::string>, uint32_t> expected;
    for (const StartLeaf& leaf : b)
        if (input.contains(keyOf(leaf.piece))) expected[{leaf.piece, leaf.leaf}] = leaf.bits;
    std::vector<FieldDiff> diffs;
    std::set<size_t> used;
    std::set<std::pair<std::string, std::string>> seen;
    const auto exempted = [&](const std::string& piece, const std::string& leaf) {
        bool any = false;
        for (size_t e = 0; e < exempt.size(); ++e) {
            if (exempt[e].piece == piece && (exempt[e].leaf.empty() || exempt[e].leaf == leaf)) {
                any = true;
                used.insert(e);
            }
        }
        return any;
    };
    for (const StartLeaf& leaf : a) {
        const auto found = expected.find({leaf.piece, leaf.leaf});
        if (found == expected.end()) continue;
        seen.insert(found->first);
        if (found->second == leaf.bits) continue;
        if (!exempted(leaf.piece, leaf.leaf)) diffs.push_back({leaf.piece, leaf.leaf, leaf.bits, found->second});
    }
    for (const auto& [key, bits] : expected)
        if (!seen.count(key) && !exempted(key.first, key.second)) diffs.push_back({key.first, key.second + " (not produced)", 0, bits});
    if (stale)
        for (size_t e = 0; e < exempt.size(); ++e)
            if (!used.count(e)) stale->push_back(exempt[e]);
    return diffs;
}
