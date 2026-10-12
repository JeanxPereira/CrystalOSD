#include "Scene/SceneInputs.hpp"

#include <array>
#include <fstream>
#include <iterator>
#include <stdexcept>
#include <string>

namespace scene {

namespace {

using nlohmann::json;

float f(const json& hex) { return hexFloat(hex); }
Colour colour(const json& j) { return {j.at(0).get<int32_t>(), j.at(1).get<int32_t>(), j.at(2).get<int32_t>(), j.at(3).get<int32_t>()}; }
Ramp ramp(const json& j) { return {j.at("length"), j.at("counter"), j.at("changed"), j.at("state")}; }

ClockState clockState(const json& in) {
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
    s.position = hexVec4(in.at("position"));
    s.direction = hexVec4(in.at("direction"));
    s.up = hexVec4(in.at("up"));
    s.rotation = hexVec4(in.at("rotation"));
    s.cameraOffset = f(in.at("cameraOffset"));
    s.zmax = f(in.at("zmax"));
    s.cameraFactor = f(in.at("cameraFactor"));
    if (in.contains("spin") && !in.at("spin").is_null()) s.spin = in.at("spin").get<uint16_t>();
    return s;
}

Rect rect(const json& j) {
    Rect r;
    r.colour = colour(j.at("colour"));
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

HeadState headState(const json& in) {
    HeadState s;
    s.greyRamp = ramp(in.at("greyRamp"));
    for (int i = 0; i < 3; ++i) s.greys[i] = in.at("greys").at(i);
    s.vignetteRamp = ramp(in.at("vignetteRamp"));
    const json& ring = in.at("ringRecord");
    s.ring = {ring.at("alpha"), ring.at("cx"), ring.at("cy"), ring.at("rx"), ring.at("ry"), ring.at("z")};
    s.tint = rect(in.at("tint"));
    s.blur = rect(in.at("blurRecord"));
    s.copy = rect(in.at("copyRecord"));
    s.fade = rect(in.at("fadeRecord"));
    s.bars = rect(in.at("bars"));
    s.column = rect(in.at("column"));
    return s;
}

RodRecord rodRecord(const json& j) {
    RodRecord r;
    r.number = j.at("number");
    r.faces = j.at("faces");
    r.local = hexMat4(j.at("local"));
    r.sx = f(j.at("sx"));
    r.sy = f(j.at("sy"));
    r.sz = f(j.at("sz"));
    r.base = colour(j.at("base"));
    r.strength = f(j.at("strength"));
    r.textured = colour(j.at("textured"));
    r.pair = {f(j.at("pair").at(0)), f(j.at("pair").at(1))};
    r.refraction = f(j.at("refraction"));
    r.reflection = colour(j.at("reflection"));
    r.extra = colour(j.at("extra"));
    return r;
}

TextRamps textRamps(const json& r) {
    TextRamps t;
    t.config = ramp(r.at("config"));
    t.mainMenu = ramp(r.at("mainMenu"));
    t.version = ramp(r.at("version"));
    t.dialogClosing = ramp(r.at("dialogClosing"));
    t.firstRun = ramp(r.at("firstRun"));
    t.dialog = ramp(r.at("dialog"));
    t.lead = r.at("lead");
    t.body = r.at("body");
    t.panel7 = r.at("panel7");
    t.panel8On = r.at("panel8On");
    t.panel8 = r.at("panel8");
    t.adjustRow = r.at("adjustRow");
    return t;
}

// The text's inputs (tools/scene/instrument.mjs fontContext, fontState; export_fixture.mjs textRamps).
TextInputs textInputs(const json& in) {
    TextInputs t;
    const json& font = in.at("font");
    for (const json& e : font.at("list")) t.cache.list.push_back({e.at("code"), e.at("loaded"), e.at("cell"), e.at("block")});
    t.cache.format = font.at("format");
    t.cache.cellW = font.at("cellW");
    t.cache.cellH = font.at("cellH");
    t.cache.cells = font.at("cells");
    t.cache.width = font.at("width");
    t.cache.height = font.at("height");
    t.cache.logW = font.at("logW");
    t.cache.logH = font.at("logH");
    t.cache.setUp = font.at("setUp");
    t.cache.block = font.at("block");
    t.cache.memory = font.at("memory");
    t.cache.texture = font.at("texture");
    t.cache.table = font.at("table");
    t.font = fontState(font.at("state"));
    t.ramps = textRamps(in.at("textRamps"));
    const json& items = in.at("configItems");
    t.settings.timeFormat = items.at(0xd);
    t.settings.dateFormat = items.at(0xe);
    t.settings.settingsWord = in.at("mechaconParam").at(0).get<uint32_t>();
    t.settings.videoMode = in.at("videoMode");
    return t;
}

OrbState orbState(const json& in) {
    OrbState s;
    for (int k = 0; k < kOrbCount; ++k) {
        const json& r = in.at("rings").at(k);
        OrbRing& ring = s.rings[k];
        ring.head = r.at("head");
        ring.count = r.at("count");
        ring.full = r.at("full");
        for (int n = 0; n < kRingLength; ++n) {
            const json& e = r.at("entries").at(n);
            ring.entries[n] = {f(e.at("x")), f(e.at("y")), f(e.at("z")), colour(e.at("colour"))};
        }
    }
    s.spriteFade = ramp(in.at("spriteFade"));
    s.fraction = f(in.at("eased").at("fraction"));
    return s;
}

template <size_t N>
std::array<int32_t, N> ints(const json& j) {
    if (j.size() != N) throw std::runtime_error("expected " + std::to_string(N) + " words: " + j.dump());
    std::array<int32_t, N> out{};
    for (size_t i = 0; i < N; ++i) out[i] = j.at(i);
    return out;
}

ConfigEntry configEntry(const json& j) {
    ConfigEntry e;
    e.id = j.at("id");
    e.valueCount = j.at("valueCount");
    e.valueIndex = j.at("valueIndex");
    e.item = j.at("item");
    e.valueTable = j.at("valueTable");
    e.enter = j.at("enter");
    e.stringCallback = j.at("stringCallback");
    e.frameCallback = j.at("frameCallback");
    e.confirm = j.at("confirm");
    e.cancel = j.at("cancel");
    e.focus = j.at("focus");
    e.rest = ints<3>(j.at("rest"));
    return e;
}

ConfigPage configPage(const json& j) {
    ConfigPage p;
    p.word0 = j.at("word0");
    p.entries = j.at("entries");
    p.count = j.at("count");
    p.titleWidth = j.at("titleWidth");
    p.selected = j.at("selected");
    p.word14 = j.at("word14");
    p.level = j.at("level");
    p.ramp = ramp(j.at("ramp"));
    p.word2c = j.at("word2c");
    p.word30 = j.at("word30");
    p.glow = j.at("glow");
    return p;
}

MainMenu mainMenu(const json& j) {
    MainMenu m;
    m.word0 = j.at("word0");
    m.items = j.at("items");
    m.count = j.at("count");
    m.word0c = j.at("word0c");
    m.selected = j.at("selected");
    m.word14 = j.at("word14");
    m.ramp = ramp(j.at("ramp"));
    return m;
}

}

uint32_t hexBits(const json& hex) {
    const std::string text = hex.get<std::string>();
    if (text.size() != 10 || text[0] != '0' || text[1] != 'x') throw std::runtime_error("not a float pattern: " + text);
    return static_cast<uint32_t>(std::stoul(text.substr(2), nullptr, 16));
}

float hexFloat(const json& hex) { return asFloat(hexBits(hex)); }

Vec4 hexVec4(const json& hex) { return {hexFloat(hex.at(0)), hexFloat(hex.at(1)), hexFloat(hex.at(2)), hexFloat(hex.at(3))}; }

Mat4 hexMat4(const json& hex) { return {hexVec4(hex.at(0)), hexVec4(hex.at(1)), hexVec4(hex.at(2)), hexVec4(hex.at(3))}; }

ClockInputs clockInputs(const json& in, const RodMesh& mesh, const RodMesh* cubeMesh) {
    ClockInputs c;
    c.state = clockState(in);
    c.head = headState(in);
    c.rodTemplate = rodRecord(in.at("template"));
    c.orbs = orbState(in);
    c.mesh = mesh;
    c.clearColour = colour(in.at("clearColour"));
    c.firstDisplayClear = colour(in.at("display").at("firstClear"));
    const json& t = in.at("tubeConstants");
    c.tube = {f(t.at("near")), f(t.at("turn")), f(t.at("scroll")), f(t.at("ripple")), f(t.at("scrollEnd")), f(t.at("turnEnd")), f(t.at("far")), f(t.at("radius"))};
    c.minuteFactor = f(in.at("orbConstants").at("minuteFactor"));
    c.fractionEasing = f(in.at("orbConstants").at("fractionEasing"));
    c.orbColour = colour(in.at("orbColour"));
    c.hasEntryData = in.contains("wide") && in.contains("orbRandom") && in.contains("orbColours");
    if (in.contains("wide")) c.wide = in.at("wide");
    if (in.contains("orbRandom"))
        for (size_t k = 0; k < kOrbCount; ++k) c.orbRandom[k] = in.at("orbRandom").at(k);
    if (in.contains("orbColours"))
        for (size_t k = 0; k < kOrbCount; ++k) c.orbColours[k] = colour(in.at("orbColours").at(k));
    c.width = in.at("screen").at("width");
    c.height = in.at("screen").at("height");
    if (in.contains("font")) c.text = textInputs(in);
    if (cubeMesh && hasMenus(in)) c.menus = MenusInputs{menusState(in), cubeState(in), *cubeMesh, configItems(in), {}};
    return c;
}

FontState fontState(const json& j) {
    FontState s;
    s.lineHeight = j.at("lineHeight");
    s.fixed = j.at("fixed");
    s.percent = j.at("percent");
    s.pitch = j.at("pitch");
    s.decoration = j.at("decoration");
    s.clip = j.at("clip");
    s.blank = j.at("blank");
    s.ascent = j.at("ascent");
    s.dirty = j.at("dirty");
    s.tv = f(j.at("tv"));
    s.ratio = f(j.at("ratio"));
    s.locate = {f(j.at("locate").at(0)), f(j.at("locate").at(1))};
    for (int i = 0; i < 4; ++i) s.colour[i] = f(j.at("colour").at(i));
    s.matrix = hexMat4(j.at("matrix"));
    return s;
}

json firstInput(const std::string& path) {
    std::ifstream file(path, std::ios::binary);
    if (!file) throw std::runtime_error("cannot open " + path);
    const std::string text((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
    const size_t frames = text.find("\"frames\"");
    if (frames == std::string::npos) return json::parse(text);
    const size_t start = text.find('{', frames);
    if (start == std::string::npos) throw std::runtime_error(path + ": no frames");
    int depth = 0;
    bool quoted = false;
    for (size_t i = start; i < text.size(); ++i) {
        const char c = text[i];
        if (quoted) {
            if (c == '\\') ++i;
            else if (c == '"') quoted = false;
        } else if (c == '"') {
            quoted = true;
        } else if (c == '{') {
            ++depth;
        } else if (c == '}' && --depth == 0) {
            return json::parse(text.begin() + static_cast<std::ptrdiff_t>(start), text.begin() + static_cast<std::ptrdiff_t>(i + 1)).at("input");
        }
    }
    throw std::runtime_error(path + ": frame 0 does not end");
}

FrameInputs frameInputs(const json& in) {
    const json& t = in.at("time");
    FrameInputs out{{f(t.at("ms")), t.at("seconds"), t.at("minutes"), t.at("hours")}, in.at("scene").at("field"), in.at("index"), in.at("item0"), {}};
    if (in.contains("timeFilled")) out.timeFilled = in.at("timeFilled");
    if (in.contains("configItems")) {
        const json& items = in.at("configItems");
        out.items = {items.at(6), items.at(7), items.at(8), items.at(9), items.at(10), items.at(11)};
    }
    if (hasMenus(in)) {
        out.menu = menuExternals(in);
        out.configItems = configItems(in);
        if (in.contains("timeFilled")) out.timeFilled = in.at("timeFilled").get<int32_t>();
        if (in.contains("textRamps")) {
            out.textRamps = textRamps(in.at("textRamps"));
        } else {
            TextRamps idle;
            const Ramp rest{10, 0, 0, 0};
            idle.config = idle.mainMenu = idle.version = idle.dialogClosing = idle.firstRun = idle.dialog = rest;
            out.textRamps = idle;
        }
    }
    return out;
}

VersionRow versionRow(const json& row) { return {row.at("label"), row.at("value"), row.at("subRows"), row.at("id")}; }

VersionPage versionPage(const json& page) {
    VersionPage v;
    v.title = page.at("title");
    v.count = page.at("count");
    v.shown = page.at("shown");
    v.selected = page.at("selected");
    v.first = page.at("first");
    const json& rows = page.at("rows");
    for (size_t i = 0; i < rows.size() && i < v.rows.size(); ++i) v.rows[i] = versionRow(rows.at(i));
    if (page.contains("job")) v.job = page.at("job");
    if (page.contains("panelOn")) v.panelOn = page.at("panelOn");
    if (page.contains("panelAlpha")) v.panelAlpha = page.at("panelAlpha");
    if (page.contains("arrows")) v.arrows = page.at("arrows");
    if (page.contains("hints"))
        for (size_t i = 0; i < 4; ++i) v.hints[i] = page.at("hints").at(i);
    if (page.contains("polls")) v.polls = page.at("polls");
    return v;
}

bool hasMenus(const json& input) { return input.contains("configPage"); }

MenusState menusState(const json& in) {
    MenusState s;
    s.page = configPage(in.at("configPage"));
    const json& entries = in.at("configEntries");
    if (entries.size() != s.entries.size()) throw std::runtime_error("expected 9 configuration entries: " + std::to_string(entries.size()));
    for (size_t i = 0; i < s.entries.size(); ++i) s.entries[i] = configEntry(entries.at(i));
    s.mainMenu = mainMenu(in.at("mainMenu"));
    s.versionRamp = ramp(in.at("versionRamp"));
    s.dialogRamp = ramp(in.at("dialogRamp"));
    s.firstRunRamp = ramp(in.at("firstRunRamp"));
    s.pagePointers = ints<5>(in.at("pagePointers"));
    s.entryActive = in.at("entryActive");
    s.menuLengths = ints<3>(in.at("menuLengths"));
    const json& k = in.at("listConstants");
    s.listConstants = {f(k.at("rate")), f(k.at("divisor")), f(k.at("pulse")), f(k.at("standing"))};
    s.screenCode = in.at("screenCode");
    if (in.contains("adjustFields")) {
        const json& fields = in.at("adjustFields");
        if (fields.size() != s.adjustFields.size()) throw std::runtime_error("expected 6 adjustment fields: " + fields.dump());
        for (size_t i = 0; i < s.adjustFields.size(); ++i) s.adjustFields[i] = {fields.at(i).at("item"), fields.at(i).at("lowest"), fields.at(i).at("highest")};
    }
    if (in.contains("configGate") && !in.at("configGate").is_null()) s.configGate = in.at("configGate").get<int32_t>();
    if (in.contains("listFade")) s.listFade = listFade(in.at("listFade"));
    s.body = in.at("body");
    s.videoMode = in.at("videoMode");
    if (in.contains("versionPage")) s.version = versionPage(in.at("versionPage"));
    if (in.contains("versionList"))
        for (const json& row : in.at("versionList")) s.versionList.push_back(versionRow(row));
    if (in.contains("versionDrawn")) {
        s.versionDrawn = versionPage(in.at("versionDrawn"));
        s.versionRampDrawn = ramp(in.at("versionDrawn").at("ramp"));
        s.versionDrawnValid = true;
    }
    return s;
}

CubeState cubeState(const json& in) {
    CubeState s;
    s.ramp = ramp(in.at("cubeRamp"));
    const json& l = in.at("cubeList");
    s.list = {f(l.at("pulse")), l.at("pulsed"), l.at("position"), l.at("left"), l.at("speed"), l.at("slowing")};
    const json& c = in.at("cubeColours");
    s.colours = {colour(c.at("selected")), colour(c.at("plain")), colour(c.at("live"))};
    s.record = rodRecord(in.at("cubeRecord"));
    const json& k = in.at("cubeConstants");
    s.constants = {f(k.at("standingFade")), f(k.at("ringFade")), f(k.at("twoPi")), f(k.at("turn")), f(k.at("quarter")), f(k.at("minusPi"))};
    s.centreFactors = {f(in.at("centreFactors").at("cube")), f(in.at("centreFactors").at("layer"))};
    s.view = hexMat4(in.at("cubeView"));
    s.screen = hexMat4(in.at("cubeScreen"));
    s.layerClear = colour(in.at("layerClear"));
    s.added = rect(in.at("addRecord"));
    s.half = rect(in.at("halfRecord"));
    s.chain = rect(in.at("chainRecord"));
    return s;
}

MenuExternals menuExternals(const json& in) {
    MenuExternals e;
    e.pad = padWords(in.at("pad"));
    e.disc = in.at("disc");
    if (in.contains("configDirty")) e.configDirty = ints<3>(in.at("configDirty"));
    if (in.contains("rtcMirror")) e.rtcMirror = ints<6>(in.at("rtcMirror"));
    if (in.contains("mechaconParam")) e.mechaconParam = std::array<uint32_t, 2>{in.at("mechaconParam").at(0).get<uint32_t>(), in.at("mechaconParam").at(1).get<uint32_t>()};
    return e;
}

ConfigItems configItems(const json& in) { return ints<20>(in.at("configItems")); }

PadWords padWords(const json& pad) { return {pad.at("held"), pad.at("pressed"), pad.at("released"), pad.at("repeating")}; }

ListFade listFade(const json& fade) { return {fade.at("first"), fade.at("second"), fade.at("secondIndex")}; }

}
