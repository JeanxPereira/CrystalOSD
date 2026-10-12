#include <cstdio>
#include <string>
#include <vector>

#include "../Check.hpp"
#include "SceneFixture.hpp"
#include "Scene/Rods.hpp"

using json = nlohmann::json;
using scene::RodPiece;
using scene::RodSendKind;
using scenetest::hexFloat;
using scenetest::hexMat4;
using scenetest::sameBits;

namespace {

using EeRods = scene::Rods<scene::EeArithmetic>;
using NativeRods = scene::Rods<scene::NativeArithmetic>;

scene::Colour colour(const json& j) { return {j.at(0).get<int32_t>(), j.at(1).get<int32_t>(), j.at(2).get<int32_t>(), j.at(3).get<int32_t>()}; }

scene::RodRecord record(const json& j) {
    scene::RodRecord r;
    r.number = j.at("number");
    r.faces = j.at("faces");
    r.local = hexMat4(j.at("local"));
    r.sx = hexFloat(j.at("sx"));
    r.sy = hexFloat(j.at("sy"));
    r.sz = hexFloat(j.at("sz"));
    r.base = colour(j.at("base"));
    r.strength = hexFloat(j.at("strength"));
    r.textured = colour(j.at("textured"));
    r.pair = {hexFloat(j.at("pair").at(0)), hexFloat(j.at("pair").at(1))};
    r.refraction = hexFloat(j.at("refraction"));
    r.reflection = colour(j.at("reflection"));
    r.extra = colour(j.at("extra"));
    return r;
}

scene::RodsInput rodsInput(const json& input) {
    const json& state = input.at("state");
    scene::RodsInput in;
    in.currentRod = state.at("currentRod");
    in.secondsAngle = state.at("secondsAngle");
    in.rodAngle = state.at("rodAngle");
    for (size_t i = 0; i < 12; ++i) {
        const json& rod = state.at("rods").at(i);
        in.rods[i] = {hexFloat(rod.at("appearance")), hexFloat(rod.at("progress")), colour(rod.at("base")), colour(rod.at("reflection"))};
    }
    in.accent = colour(state.at("accent"));
    in.fourth = colour(state.at("fourth"));
    in.width = input.at("screen").at("width");
    in.height = input.at("screen").at("height");
    in.field = input.at("scene").at("field");
    return in;
}

// The fixture's GS units as native units (scene::RodVertex), a unit conversion only:
// x, y are 12.4 fixed point in the GS window, whose screen starts at (0x800 - width / 2,
// 0x800 - height / 2) pixels; z with f above it is the depth word in the same 4-bit fixed
// point; r, g, b, a: 0x80 is 1.0; texel sends: u, v are 12.4 texels and q is 1; perspective
// sends: s, t, q as the registers hold them.
scene::RodVertex toNative(const json& v, bool perspective, int32_t width, int32_t height) {
    scene::RodVertex out;
    out.x = static_cast<float>(v.at("x").get<int32_t>() - ((0x800 - width / 2) << 4)) / 16.0f;
    out.y = static_cast<float>(v.at("y").get<int32_t>() - ((0x800 - height / 2) << 4)) / 16.0f;
    const uint32_t depth = v.at("z").get<uint32_t>() | (v.at("f").get<uint32_t>() << 24);
    out.z = static_cast<float>(static_cast<int32_t>(depth)) / 16.0f;
    if (perspective) {
        out.u = hexFloat(v.at("s"));
        out.v = hexFloat(v.at("t"));
        out.q = hexFloat(v.at("q"));
    } else {
        out.u = static_cast<float>(v.at("u").get<int32_t>()) / 16.0f;
        out.v = static_cast<float>(v.at("v").get<int32_t>()) / 16.0f;
        out.q = 1.0f;
    }
    out.r = static_cast<float>(v.at("r").get<int32_t>()) / 128.0f;
    out.g = static_cast<float>(v.at("g").get<int32_t>()) / 128.0f;
    out.b = static_cast<float>(v.at("b").get<int32_t>()) / 128.0f;
    out.a = static_cast<float>(v.at("a").get<int32_t>()) / 128.0f;
    return out;
}

bool sameVertex(const scene::RodVertex& got, const scene::RodVertex& want, const std::string& what) {
    const float g[] = {got.x, got.y, got.z, got.u, got.v, got.q, got.r, got.g, got.b, got.a};
    const float w[] = {want.x, want.y, want.z, want.u, want.v, want.q, want.r, want.g, want.b, want.a};
    const char* names[] = {"x", "y", "z", "u", "v", "q", "r", "g", "b", "a"};
    for (int i = 0; i < 10; ++i)
        if (!sameBits(g[i], scene::floatBits(w[i]), what + "." + names[i])) return false;
    return true;
}

bool sameColour(const scene::Colour& got, const json& want, const std::string& what) {
    if (got == colour(want)) return true;
    std::fprintf(stderr, "%s: colour differs\n", what.c_str());
    return false;
}

bool sameRecord(const scene::RodRecord& got, const json& want, const std::string& what) {
    bool same = got.number == want.at("number").get<int32_t>() && got.faces == want.at("faces").get<int32_t>();
    if (!same) std::fprintf(stderr, "%s: number or faces differ\n", what.c_str());
    same = same && sameBits(got.local, want.at("local"), what + ".local") && sameBits(got.sx, want.at("sx"), what + ".sx") &&
           sameBits(got.sy, want.at("sy"), what + ".sy") && sameBits(got.sz, want.at("sz"), what + ".sz") &&
           sameColour(got.base, want.at("base"), what + ".base") && sameBits(got.strength, want.at("strength"), what + ".strength") &&
           sameColour(got.textured, want.at("textured"), what + ".textured") && sameBits(got.pair[0], want.at("pair").at(0), what + ".pair[0]") &&
           sameBits(got.pair[1], want.at("pair").at(1), what + ".pair[1]") && sameBits(got.refraction, want.at("refraction"), what + ".refraction") &&
           sameColour(got.reflection, want.at("reflection"), what + ".reflection") && sameColour(got.extra, want.at("extra"), what + ".extra");
    return same;
}

bool sameFaces(const std::vector<scene::RodFace>& got, const json& want, const std::string& what) {
    if (got.size() != want.size()) {
        std::fprintf(stderr, "%s: %zu faces, expected %zu\n", what.c_str(), got.size(), want.size());
        return false;
    }
    for (size_t i = 0; i < got.size(); ++i) {
        const scene::RodFace& face = got[i];
        const json& w = want.at(i);
        const std::string at = what + ".faces[" + std::to_string(i) + "]";
        if (face.index != w.at("index").get<int32_t>() || face.flag != w.at("flag").get<int32_t>()) {
            std::fprintf(stderr, "%s: index or flag differ\n", at.c_str());
            return false;
        }
        if (!sameBits(face.normal, w.at("normal"), at + ".normal")) return false;
        if (!sameBits(EeRods::edgeTerm(face), w.at("edge"), at + ".edge")) return false;
        for (size_t k = 0; k < 4; ++k) {
            const scene::RodFaceVertex& v = face.vertices[k];
            const json& wv = w.at("vertices").at(k);
            const std::string vat = at + ".vertices[" + std::to_string(k) + "]";
            if (!sameBits(v.eye, wv.at("eye"), vat + ".eye") || !sameBits(v.screen, wv.at("screen"), vat + ".screen") ||
                !sameBits(v.q, wv.at("q"), vat + ".q") || !sameBits(v.s, wv.at("s"), vat + ".s") || !sameBits(v.t, wv.at("t"), vat + ".t"))
                return false;
            const uint32_t x = static_cast<uint32_t>(v.fixed[0]) & 0xffffu, y = static_cast<uint32_t>(v.fixed[1]) & 0xffffu;
            const uint32_t z = static_cast<uint32_t>(v.fixed[2]) & 0xffffffu, f = static_cast<uint32_t>(v.fixed[2]) >> 24;
            if (x != wv.at("x").get<uint32_t>() || y != wv.at("y").get<uint32_t>() || z != wv.at("z").get<uint32_t>() || f != wv.at("f").get<uint32_t>()) {
                std::fprintf(stderr, "%s: fixed-point position differs\n", vat.c_str());
                return false;
            }
        }
    }
    return true;
}

const char* pieceName(RodPiece piece) { return piece == RodPiece::Whole ? "whole" : piece == RodPiece::A ? "A" : "B"; }

const char* emitterOf(RodSendKind kind) {
    switch (kind) {
    case RodSendKind::GrainSubtracted:
    case RodSendKind::GrainAdded:
    case RodSendKind::Grain: return "textured";
    case RodSendKind::Reflection: return "reflected";
    default: return "refracted";
    }
}

struct Call {
    std::string phase;
    RodSendKind kind;
    const scene::RodFaceDraw* draw;
};

bool sameCalls(const scene::Rod& rod, const std::vector<std::pair<std::string, const scene::RodSend*>>& sends, const json& want, int32_t width,
               int32_t height, const std::string& what) {
    std::vector<std::vector<Call>> calls(want.size());
    for (const auto& [phase, send] : sends)
        for (const scene::RodFaceDraw& draw : send->faces) {
            if (draw.face < 0 || static_cast<size_t>(draw.face) >= calls.size()) {
                std::fprintf(stderr, "%s: face %d drawn, %zu faces expected\n", what.c_str(), draw.face, calls.size());
                return false;
            }
            calls[draw.face].push_back({phase, send->kind, &draw});
        }
    for (size_t i = 0; i < want.size(); ++i)
        for (const char* emitter : {"refracted", "textured", "reflected"}) {
            const json& expected = want.at(i).at(emitter);
            std::vector<const Call*> mine;
            for (const Call& call : calls[i])
                if (std::string(emitterOf(call.kind)) == emitter) mine.push_back(&call);
            const std::string at = what + ".faces[" + std::to_string(i) + "]." + emitter;
            if (mine.size() != expected.size()) {
                std::fprintf(stderr, "%s: %zu calls, expected %zu\n", at.c_str(), mine.size(), expected.size());
                return false;
            }
            for (size_t c = 0; c < mine.size(); ++c) {
                const json& e = expected.at(c);
                const Call& call = *mine[c];
                const std::string cat = at + "[" + std::to_string(c) + "]";
                if (call.phase != e.at("phase").get<std::string>() || std::string(pieceName(call.draw->piece)) != e.at("piece").get<std::string>()) {
                    std::fprintf(stderr, "%s: %s %s, expected %s %s\n", cat.c_str(), call.phase.c_str(), pieceName(call.draw->piece),
                                 e.at("phase").get<std::string>().c_str(), e.at("piece").get<std::string>().c_str());
                    return false;
                }
                if (call.draw->edgeSmoothing != ((e.at("prim").get<int32_t>() & 0x80) != 0)) {
                    std::fprintf(stderr, "%s: edge smoothing differs from PRIM %d\n", cat.c_str(), e.at("prim").get<int32_t>());
                    return false;
                }
                if (std::string(emitter) == "refracted" &&
                    !(sameBits(rod.cx, e.at("centre").at(0), cat + ".centre[0]") && sameBits(rod.cy, e.at("centre").at(1), cat + ".centre[1]")))
                    return false;
                for (size_t k = 0; k < 4; ++k)
                    if (!sameVertex(call.draw->strip[k], toNative(e.at("vertices").at(k), scene::perspective(call.kind), width, height),
                                    cat + ".vertices[" + std::to_string(k) + "]"))
                        return false;
            }
        }
    return true;
}

int compareFrame(const json& frame, const scene::RodsFrame& out, const scene::RodsInput& input) {
    const std::string at = "frame " + std::to_string(frame.at("index").get<int>());
    std::vector<int32_t> order, mine;
    for (const json& name : frame.at("expect").at("drawOrder")) {
        const std::string text = name.get<std::string>();
        if (text.rfind("rod ", 0) == 0) order.push_back(std::stoi(text.substr(4)));
    }
    for (const scene::DepthNode& node : out.list) {
        if (node.orb) {
            std::fprintf(stderr, "%s: an orb in the rods' list\n", at.c_str());
            return 1;
        }
        mine.push_back(out.rods.at(static_cast<size_t>(node.index)).record.number);
    }
    if (order != mine) {
        std::fprintf(stderr, "%s: rod order differs\n", at.c_str());
        return 1;
    }

    std::vector<std::vector<std::pair<std::string, const scene::RodSend*>>> sends(out.rods.size());
    for (size_t r = 0; r < out.rods.size(); ++r)
        for (const scene::RodSend& send : out.rods[r].sends) sends[r].push_back({"rod", &send});
    for (size_t pass = 0; pass < 2; ++pass)
        for (const scene::RodExtraDraw& extra : out.extraPasses[pass]) {
            const std::string phase = "extra pass " + std::to_string(pass);
            // facts/clock-extra-passes.md: whole rods grain with texture 3 in pass 0 and 2 in pass 1, the split rod the other way round.
            const int32_t texture = extra.split ? (pass == 0 ? 2 : 3) : (pass == 0 ? 3 : 2);
            if (extra.grainTexture != texture || extra.split != !out.rods.at(extra.rod).pieces.empty()) {
                std::fprintf(stderr, "%s: %s grain texture %d, expected %d\n", at.c_str(), phase.c_str(), extra.grainTexture, texture);
                return 1;
            }
            sends.at(extra.rod).push_back({phase, &extra.reflection});
            sends.at(extra.rod).push_back({phase, &extra.grain});
        }

    std::vector<size_t> drawn;
    for (const scene::DepthNode& node : out.list)
        if (out.rods[static_cast<size_t>(node.index)].drawn) drawn.push_back(static_cast<size_t>(node.index));
    const json& rods = frame.at("expect").at("rods");
    if (drawn.size() != rods.size()) {
        std::fprintf(stderr, "%s: %zu rods drawn, expected %zu\n", at.c_str(), drawn.size(), rods.size());
        return 1;
    }
    for (size_t j = 0; j < rods.size(); ++j) {
        const scene::Rod& rod = out.rods[drawn[j]];
        const json& want = rods.at(j);
        const std::string rat = at + " rod " + std::to_string(want.at("number").get<int>());
        CHECK(rod.record.number == want.at("number").get<int32_t>());
        CHECK(sameRecord(rod.record, want.at("record"), rat + ".record"));
        CHECK(sameBits(rod.record.local, want.at("local"), rat + ".local"));
        CHECK(sameBits(rod.matrix, want.at("matrix"), rat + ".matrix"));
        CHECK(sameBits(rod.whole.cx, want.at("centre").at("cx"), rat + ".centre.cx"));
        CHECK(sameBits(rod.whole.cy, want.at("centre").at("cy"), rat + ".centre.cy"));
        CHECK(sameBits(rod.whole.cz, want.at("centre").at("cz"), rat + ".centre.cz"));
        CHECK(sameFaces(rod.whole.faces, want.at("faces"), rat));
        const json& pieces = want.at("pieces");
        CHECK(rod.pieces.size() == pieces.size());
        for (size_t p = 0; p < pieces.size(); ++p) {
            const std::string pat = rat + ".pieces[" + std::to_string(p) + "]";
            CHECK(std::string(pieceName(rod.pieces[p].piece)) == pieces.at(p).at("piece").get<std::string>());
            CHECK(sameRecord(rod.pieces[p].record, pieces.at(p).at("record"), pat + ".record"));
            CHECK(sameFaces(rod.pieces[p].transform.faces, pieces.at(p).at("faces"), pat));
        }
        CHECK(sameCalls(rod, sends[drawn[j]], want.at("faces"), input.width, input.height, rat));
    }
    return 0;
}

int sameTemplate(const scene::RodRecord& got, json want, const std::string& what) {
    want["local"] = json::array();
    for (const auto& row : got.local) {
        json r = json::array();
        for (float x : row) r.push_back(scenetest::bitsText(scene::floatBits(x)));
        want["local"].push_back(r);
    }
    return sameRecord(got, want, what) ? 0 : 1;
}

}

int main(int argc, char** argv) {
    return scenetest::run(argc, argv, [](int argc, char** argv) {
        if (argc < 3) {
            std::fprintf(stderr, "usage: RodsTest <scene.json> <rod-mesh.json>\n");
            return 1;
        }
        const json scene = scenetest::loadScene(argv[1]);
        const scene::RodMesh mesh = scene::loadRodMesh(argv[2]);
        const json& frames = scene.at("frames");
        CHECK(!frames.empty());

        int rodsCompared = 0, splitRods = 0;
        for (const json& frame : frames) {
            const json& input = frame.at("input");
            const scene::RodsInput in = rodsInput(input);
            EeRods rods(mesh, record(input.at("template")));
            const scene::RodsFrame out = rods.frame(in, hexMat4(frame.at("expect").at("camera").at("view")), hexMat4(frame.at("expect").at("camera").at("screen")));
            if (compareFrame(frame, out, in)) return 1;
            rodsCompared += static_cast<int>(frame.at("expect").at("rods").size());
            for (const json& rod : frame.at("expect").at("rods")) splitRods += rod.at("pieces").empty() ? 0 : 1;
        }
        std::printf("isolated: %zu frames, %d rods, %d split, equal\n", frames.size(), rodsCompared, splitRods);

        EeRods carried(mesh, record(frames.at(0).at("input").at("template")));
        for (const json& frame : frames) {
            const json& input = frame.at("input");
            const scene::RodsInput in = rodsInput(input);
            const scene::RodsFrame out = carried.frame(in, hexMat4(frame.at("expect").at("camera").at("view")), hexMat4(frame.at("expect").at("camera").at("screen")));
            if (compareFrame(frame, out, in)) return 1;
            if (sameTemplate(carried.rodTemplate(), frame.at("expect").at("after").at("template"), "frame " + std::to_string(frame.at("index").get<int>()) + " template after"))
                return 1;
        }
        std::printf("carried: %zu frames, equal; template carried\n", frames.size());

        const json& first = frames.at(0);
        NativeRods native(mesh, record(first.at("input").at("template")));
        const scene::RodsFrame plain = native.frame(rodsInput(first.at("input")), hexMat4(first.at("expect").at("camera").at("view")),
                                                    hexMat4(first.at("expect").at("camera").at("screen")));
        CHECK(plain.rods.size() == 12);
        std::printf("native: frame 0 placed %zu rods\n", plain.rods.size());
        return 0;
    });
}
