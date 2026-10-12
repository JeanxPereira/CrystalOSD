#include <cstdio>
#include <string>

#include "SceneFixture.hpp"
#include "StageCompare.hpp"
#include "Scene/Cubes.hpp"
#include "Scene/SceneInputs.hpp"

namespace {

using nlohmann::json;

float native(const json& v, const char* key, float scale) { return static_cast<float>(v.at(key).get<int32_t>()) / scale; }

scene::RodVertex toNative(const json& v, int32_t width, int32_t height) {
    scene::RodVertex out;
    out.x = static_cast<float>(v.at("x").get<int32_t>() - ((0x800 - width / 2) << 4)) / 16.0f;
    out.y = static_cast<float>(v.at("y").get<int32_t>() - ((0x800 - height / 2) << 4)) / 16.0f;
    out.z = static_cast<float>(static_cast<int32_t>(v.at("z").get<uint32_t>() | (v.at("f").get<uint32_t>() << 24))) / 16.0f;
    if (v.contains("s")) {
        out.u = scenetest::hexFloat(v.at("s"));
        out.v = scenetest::hexFloat(v.at("t"));
        out.q = scenetest::hexFloat(v.at("q"));
    } else if (v.contains("u")) {
        out.u = native(v, "u", 16.0f);
        out.v = native(v, "v", 16.0f);
        out.q = 1.0f;
    }
    out.r = native(v, "r", 128.0f);
    out.g = native(v, "g", 128.0f);
    out.b = native(v, "b", 128.0f);
    out.a = native(v, "a", 128.0f);
    return out;
}

bool sameVertex(const scene::RodVertex& got, const scene::RodVertex& want, bool withQ) {
    const float g[] = {got.x, got.y, got.z, got.u, got.v, got.q, got.r, got.g, got.b, got.a};
    const float w[] = {want.x, want.y, want.z, want.u, want.v, want.q, want.r, want.g, want.b, want.a};
    for (int i = 0; i < 10; ++i)
        if ((i != 5 || withQ) && scene::floatBits(g[i]) != scene::floatBits(w[i])) return false;
    return true;
}

bool sameTarget(scene::Target target, uint32_t fbp) { return target == scene::Target::Display || fbp == (target == scene::Target::Work1 ? 280u : 210u); }

bool sameRectangle(const scene::HeadDraw& d, const json& t, int32_t width, int32_t height) {
    const uint32_t prim = (d.topology == scene::Topology::Sprite ? 6u : 4u) | (d.gouraud ? 8u : 0u) | (d.textured ? 0x10u : 0u) | (d.blended ? 0x40u : 0u) |
                          (d.coordinates == scene::Coordinates::Uv ? 0x100u : 0u);
    if (prim != t.at("prim").get<uint32_t>() || !sameTarget(d.target, t.at("fbp").get<uint32_t>())) return false;
    const json& vs = t.at("vertices");
    if (vs.size() != d.vertices.size()) return false;
    const float ox = static_cast<float>(2048 - (width >> 1)), oy = static_cast<float>(2048 - (height >> 1));
    for (size_t i = 0; i < vs.size(); ++i) {
        const scene::HeadVertex& v = d.vertices[i];
        const json& x = vs.at(i);
        if (static_cast<float>(x.at("x").get<int32_t>()) != (v.x + ox) * 16 || static_cast<float>(x.at("y").get<int32_t>()) != (v.y + oy) * 16 || v.z != x.at("z").get<uint32_t>() ||
            v.fog != x.at("f").get<uint32_t>() || v.r * 128 != x.at("r").get<float>() || v.g * 128 != x.at("g").get<float>() || v.b * 128 != x.at("b").get<float>() ||
            v.a * 128 != x.at("a").get<float>() || v.u * 16 != x.at("u").get<float>() || v.v * 16 != x.at("v").get<float>() ||
            scene::floatBits(v.q) != scenetest::hexBits(x.at("q")))
            return false;
    }
    return true;
}

int draws(const std::vector<scene::CubeDraw>& ours, const json& theirs, int32_t width, int32_t height, const std::string& at) {
    size_t k = 0;
    for (const scene::CubeDraw& d : ours) {
        if (k >= theirs.size()) { std::fprintf(stderr, "%s: more draws than the model's %zu\n", at.c_str(), theirs.size()); return 1; }
        const json& t = theirs.at(k++);
        const std::string where = at + " draw " + std::to_string(k - 1) + " (" + d.label + ")";
        if (d.label != t.at("label").get<std::string>()) { std::fprintf(stderr, "%s: label %s\n", where.c_str(), t.at("label").get<std::string>().c_str()); return 1; }
        const json& vs = t.at("vertices");
        if (d.send == scene::CubeSend::LayerClear) {
            const scene::Colour& c = d.clear;
            const json& v = vs.at(0);
            if (vs.size() != 2 || v.at("r") != c[0] || v.at("g") != c[1] || v.at("b") != c[2] || v.at("a") != c[3]) { std::fprintf(stderr, "%s: clear colour differs\n", where.c_str()); return 1; }
            continue;
        }
        if (d.rectangle) {
            if (!sameRectangle(*d.rectangle, t, width, height)) { std::fprintf(stderr, "%s: rectangle differs\n", where.c_str()); return 1; }
            continue;
        }
        if (d.faces.size() * 4 != vs.size()) { std::fprintf(stderr, "%s: %zu vertices, the model %zu\n", where.c_str(), d.faces.size() * 4, vs.size()); return 1; }
        const bool smooth = (t.at("prim").get<uint32_t>() & 0x80) != 0;
        if (d.faces.back().edgeSmoothing != smooth) { std::fprintf(stderr, "%s: edge smoothing differs from PRIM %u\n", where.c_str(), t.at("prim").get<uint32_t>()); return 1; }
        size_t n = 0;
        for (const scene::RodFaceDraw& f : d.faces)
            for (const scene::RodVertex& v : f.strip) {
                const json& g = vs.at(n);
                if (!sameVertex(v, toNative(g, width, height), g.contains("s") || g.contains("u"))) { std::fprintf(stderr, "%s vertex %zu differs\n", where.c_str(), n); return 1; }
                ++n;
            }
    }
    if (k != theirs.size()) { std::fprintf(stderr, "%s: %zu draws, the model %zu\n", at.c_str(), k, theirs.size()); return 1; }
    return 0;
}

template <class A>
int sceneFile(const std::string& path, const scene::RodMesh& mesh, bool compare) {
    const json scene = scenetest::loadScene(path);
    size_t drawn = 0;
    for (const json& frame : scene.at("frames")) {
        const std::string at = path + " frame " + std::to_string(frame.at("index").get<int>());
        const json& stage = frame.at("expect").at("stages").at("cubes");
        if (stage.is_null()) continue;
        StagePieces p = stagePieces(stage.at("before"));
        scene::Cubes<A> cubes(mesh);
        const json& input = frame.at("input");
        const scene::CubeFrameInputs in{p.width, p.height, input.at("scene").at("field").get<int32_t>(), input.at("body").get<int32_t>()};
        const auto out = cubes.frame(p.cubes, p.head, p.clock, in);
        if (!compare) continue;
        const auto differences = stageDifferences(p, stage.at("after"));
        if (!differences.empty()) { std::fprintf(stderr, "%s: %s\n", at.c_str(), differences.front().c_str()); return 1; }
        if (draws(out, frame.at("expect").at("cubes"), p.width, p.height, at)) return 1;
        drawn += out.size();
    }
    if (compare) std::printf("%s: every frame equal, %zu draws\n", path.c_str(), drawn);
    return 0;
}

}

int main(int argc, char** argv) {
    return scenetest::run(argc, argv, [](int count, char** arguments) {
        const scene::RodMesh mesh = scene::loadRodMesh(arguments[1]);
        for (int i = 2; i < count; ++i) {
            if (int failed = sceneFile<scene::EeArithmetic>(arguments[i], mesh, true)) return failed;
            if (int failed = sceneFile<scene::NativeArithmetic>(arguments[i], mesh, false)) return failed;
        }
        return 0;
    });
}
