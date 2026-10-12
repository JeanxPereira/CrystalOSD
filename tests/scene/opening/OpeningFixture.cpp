#include "OpeningFixture.hpp"

#include <fstream>
#include <stdexcept>

#include "Scene/SceneInputs.hpp"

namespace openingtest {

using nlohmann::json;

Bytes fromHex(const std::string& text) {
    if (text.size() % 2) throw std::runtime_error("odd hex string");
    Bytes out(text.size() / 2);
    auto digit = [](char c) -> uint8_t {
        if (c >= '0' && c <= '9') return static_cast<uint8_t>(c - '0');
        if (c >= 'a' && c <= 'f') return static_cast<uint8_t>(c - 'a' + 10);
        throw std::runtime_error("bad hex digit");
    };
    for (size_t i = 0; i < out.size(); ++i) out[i] = static_cast<uint8_t>(digit(text[2 * i]) << 4 | digit(text[2 * i + 1]));
    return out;
}

namespace {

uint32_t bits(const json& hex) { return scene::hexBits(hex); }

template <size_t N>
std::array<uint32_t, N> bitsArray(const json& list) {
    if (list.size() != N) throw std::runtime_error("float list of the wrong length");
    std::array<uint32_t, N> out{};
    for (size_t i = 0; i < N; ++i) out[i] = bits(list.at(i));
    return out;
}

template <typename T>
std::optional<T> maybe(const json& object, const char* key) {
    if (!object.contains(key) || object.at(key).is_null()) return std::nullopt;
    return object.at(key).get<T>();
}

Probe probeOf(const json& r) {
    Probe p;
    p.k = r.at("k").get<int32_t>();
    p.pc = static_cast<uint32_t>(std::stoul(r.at("pc").get<std::string>(), nullptr, 16));
    const json& g = r.at("gpr");
    p.v0 = g.at("v0"); p.a0 = g.at("a0"); p.a1 = g.at("a1"); p.a2 = g.at("a2"); p.a3 = g.at("a3"); p.s0 = g.at("s0");
    if (!r.at("fpr0").is_null()) p.fpr0 = bits(r.at("fpr0"));
    for (const json& m : r.at("mem")) p.mem.push_back(m.is_null() ? Bytes{} : fromHex(m.get<std::string>()));
    return p;
}

Pose poseOf(const json& t) {
    Pose p;
    p.stage = t.at("stage");
    p.go = t.at("go");
    p.pending = t.at("pending");
    p.camera = bitsArray<3>(t.at("camera"));
    p.up = bitsArray<2>(t.at("up"));
    p.roll = bits(t.at("roll"));
    static const char* const offsets[] = {"0x00", "0x04", "0x08", "0x10", "0x14", "0x18", "0x20", "0x24", "0x28", "0x30", "0x34", "0x38", "0x40", "0x44", "0x48"};
    for (size_t i = 0; i < 15; ++i) p.block[i] = bits(t.at("block").at(offsets[i]));
    return p;
}

}

OpeningFixture OpeningFixture::load(const std::filesystem::path& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) throw std::runtime_error("no opening fixture at " + path.string());
    const json doc = json::parse(in);
    OpeningFixture f;
    f.m_capture = doc.at("capture");
    f.m_probes = doc.at("probes");
    const json& e = doc.at("externals");
    f.m_externals.firstCounter = maybe<int32_t>(e, "firstCounter");
    f.m_externals.phase = maybe<int32_t>(e, "phase");
    for (const json& d : e.at("discAtCounter")) f.m_externals.discAtCounter.push_back({d.at(0), d.at(1)});
    if (!e.at("history").is_null()) {
        scene::opening::History h{};
        for (size_t i = 0; i < 21; ++i) {
            const json& item = e.at("history").at(i);
            const std::string name = item.at("name");
            for (size_t c = 0; c < name.size() && c < 16; ++c) h[i].name[c] = name[c];
            h[i].count = item.at("count");
            h[i].mask = item.at("mask");
            h[i].mainCell = item.at("mainCell");
        }
        f.m_externals.history = h;
    }
    f.m_externals.emptyName = maybe<std::string>(e, "emptyName");
    f.m_externals.clockForced = maybe<bool>(e, "clockForced");
    f.m_externals.hddReady = maybe<int32_t>(e, "hddReady");
    f.m_externals.hddExec = maybe<int32_t>(e, "hddExec");
    for (const json& frame : doc.at("frames")) f.m_frames.push_back(frame);
    return f;
}

std::optional<int32_t> OpeningFixture::counter(size_t k) const { return maybe<int32_t>(m_frames.at(k), "counter"); }

std::optional<Timeline> OpeningFixture::timeline(size_t k) const {
    const json& frame = m_frames.at(k);
    if (!frame.contains("timeline")) return std::nullopt;
    const json& t = frame.at("timeline");
    Timeline out;
    out.before = poseOf(t);
    out.after = poseOf(t.at("after"));
    out.scene = t.at("scene");
    out.snapshot = t.at("snapshot");
    out.discState = t.at("discState");
    for (size_t i = 0; i < 8; ++i) out.thresholds[i] = t.at("thresholds").at(i);
    out.forcedClock = maybe<bool>(t, "forcedClock");
    out.matricesHex = maybe<std::string>(t, "matrices");
    out.result = t.at("result");
    if (t.contains("fade")) out.fade = t.at("fade").get<uint32_t>();
    if (t.contains("blur")) out.blur = t.at("blur").get<uint32_t>();
    if (t.contains("logo")) out.logo = t.at("logo").at("alpha").get<uint32_t>();
    return out;
}

std::optional<Fog> OpeningFixture::fog(size_t k) const {
    const json& frame = m_frames.at(k);
    if (!frame.contains("fog")) return std::nullopt;
    Fog out;
    if (!frame.at("fog").at("offsets").is_null()) out.offsets = bitsArray<6>(frame.at("fog").at("offsets"));
    out.record = probeOf(frame.at("fog").at("records").at(0));
    return out;
}

std::optional<Lights> OpeningFixture::lights(size_t k) const {
    const json& frame = m_frames.at(k);
    if (!frame.contains("lights")) return std::nullopt;
    const json& l = frame.at("lights");
    Lights out;
    if (!l.at("phase").is_null()) out.phase = l.at("phase");
    if (!l.at("head").is_null()) out.head = l.at("head");
    if (!l.at("tail").is_null()) out.tail = l.at("tail");
    for (const json& r : l.at("records")) out.records.push_back(probeOf(r));
    for (const json& c : l.at("cosines")) out.cosines.push_back(bits(c));
    for (const json& s : l.at("sines")) out.sines.push_back(bits(s));
    return out;
}

std::vector<Probe> OpeningFixture::records(size_t k, const std::string& group) const {
    std::vector<Probe> out;
    const json& frame = m_frames.at(k);
    if (!frame.contains(group)) return out;
    for (const json& r : frame.at(group)) out.push_back(probeOf(r));
    return out;
}

std::vector<std::pair<uint32_t, std::vector<std::string>>> OpeningFixture::table(const std::string& group) const {
    std::vector<std::pair<uint32_t, std::vector<std::string>>> out;
    if (!m_probes.contains(group)) return out;
    for (const json& p : m_probes.at(group)) {
        std::vector<std::string> ranges;
        for (const json& r : p.at("ranges")) ranges.push_back(r);
        out.emplace_back(static_cast<uint32_t>(std::stoul(p.at("pc").get<std::string>(), nullptr, 16)), std::move(ranges));
    }
    return out;
}

}
