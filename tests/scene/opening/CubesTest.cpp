#include <cmath>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <map>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>

#include "../../Check.hpp"
#include "../SceneFixture.hpp"
#include "OpeningFixture.hpp"
#include "Scene/Arithmetic.hpp"
#include "Scene/ProgramImage.hpp"
#include "Scene/opening/Cubes.hpp"

namespace {

using namespace scene::opening;
using openingtest::Bytes;
using openingtest::OpeningFixture;
using openingtest::Probe;
using scene::EeArithmetic;
using scene::Mat4;
using scene::NativeArithmetic;
using scene::Vec4;

uint32_t bitsOf(float x) { return scene::floatBits(x); }
float floatAt(const Bytes& b, size_t at) {
    uint32_t u;
    std::memcpy(&u, b.data() + at, 4);
    return scene::asFloat(u);
}
int32_t intAt(const Bytes& b, size_t at) {
    int32_t i;
    std::memcpy(&i, b.data() + at, 4);
    return i;
}
Vec4 vecAt(const Bytes& b, size_t at) { return {floatAt(b, at), floatAt(b, at + 4), floatAt(b, at + 8), floatAt(b, at + 12)}; }
Mat4 matAt(const Bytes& b, size_t at) { return {vecAt(b, at), vecAt(b, at + 16), vecAt(b, at + 32), vecAt(b, at + 48)}; }

struct Counts {
    size_t cubes = 0, clipped = 0, angles = 0, matrices = 0, centres = 0, values = 0, descriptors = 0, faces = 0;
};

bool same(const Vec4& got, const Vec4& want, size_t n, const char* what, const std::string& where) {
    for (size_t i = 0; i < n; ++i)
        if (bitsOf(got[i]) != bitsOf(want[i])) {
            std::fprintf(stderr, "%s: %s[%zu] is 0x%08x, the capture has 0x%08x\n", where.c_str(), what, i, bitsOf(got[i]), bitsOf(want[i]));
            return false;
        }
    return true;
}
bool same(const Mat4& got, const Mat4& want, const char* what, const std::string& where) {
    for (const size_t r : {0, 1, 2, 3})
        if (!same(got[r], want[r], 4, what, where)) return false;
    return true;
}

// The ALPHA selectors of the OSD's table row (A, B, C, D) as a blend.
scene::BlendOp opOf(const std::array<int32_t, 4>& s) {
    if (s == std::array<int32_t, 4>{0, 1, 0, 1}) return scene::BlendOp::AlphaOver;
    if (s == std::array<int32_t, 4>{0, 2, 0, 1}) return scene::BlendOp::Add;
    if (s == std::array<int32_t, 4>{0, 2, 1, 1}) return scene::BlendOp::AddDestinationAlpha;
    return scene::BlendOp::Opaque;
}

// One frame of the capture: the five transforms and the cubes that were drawn.
struct Frame {
    std::vector<Probe> entries, readies;
};

Frame framesOf(const OpeningFixture& fixture, size_t k) {
    Frame f;
    for (const Probe& p : fixture.records(k, "cubes")) (p.k == 0 ? f.entries : f.readies).push_back(p);
    return f;
}

bool checkWork(const CubeWork& work, const Probe& entry, const Probe& ready, const std::string& where, Counts& counts) {
    const Bytes& record = ready.mem.at(0);
    const Bytes& shape = ready.mem.at(2);
    const Bytes& block = ready.mem.at(7);
    const auto tally = [&](bool ok, size_t& counter) {
        ++counter;
        return ok;
    };
    Vec4 angles{floatAt(record, 0x450), floatAt(record, 0x454), floatAt(record, 0x458), 0.0f};
    if (!same(work.angles, angles, 3, "angles", where)) return false;
    ++counts.angles;
    CHECK(tally(same(work.toWorld, matAt(block, 0x80), "matrix to the world", where), counts.matrices));
    CHECK(tally(same(work.toScreen, matAt(block, 0x40), "matrix to the screen", where), counts.matrices));
    CHECK(tally(same(work.centre, vecAt(shape, 0), 4, "centre", where), counts.centres));
    (void)entry;
    for (size_t i = 0; i < 8; ++i) {
        const CubeCorner& c = work.corners[i];
        const std::string w = where + " vertex " + std::to_string(i);
        CHECK(tally(same(c.world, vecAt(record, 0x80 + i * 16), 4, "world", w), counts.values));
        CHECK(tally(same(c.eye, vecAt(record, 0x100 + i * 16), 4, "eye", w), counts.values));
        CHECK(tally(same(c.screen, vecAt(record, i * 16), 4, "screen", w), counts.values));
        CHECK(tally(bitsOf(c.q) == static_cast<uint32_t>(intAt(record, 0x200 + i * 4)), counts.values));
        CHECK(tally(c.ints[0] == intAt(record, 0x180 + i * 16) && c.ints[1] == intAt(record, 0x184 + i * 16) && c.ints[2] == intAt(record, 0x188 + i * 16), counts.values));
    }
    for (size_t i = 0; i < 6; ++i) {
        const CubeFace& f = work.faces[i];
        const std::string w = where + " face " + std::to_string(i);
        CHECK(tally(same(f.object, vecAt(record, 0x220 + i * 16), 3, "normal", w), counts.values));
        CHECK(tally(same(f.world, vecAt(record, 0x280 + i * 16), 3, "world normal", w), counts.values));
        CHECK(tally(same(f.view, vecAt(record, 0x2e0 + i * 16), 3, "view normal", w), counts.values));
        CHECK(tally(bitsOf(f.facing) == static_cast<uint32_t>(intAt(record, 0x470 + i * 4)), counts.values));
        CHECK(tally(same(f.colour, vecAt(record, 0x3c0 + i * 16), 4, "colour", w), counts.values));
        Vec4 edge{f.edge[0], f.edge[1], f.edge[2], f.edge[3]};
        CHECK(tally(same(edge, vecAt(record, 0x340 + i * 16), 4, "edge terms", w), counts.values));
        counts.faces += f.facing < 0 ? 0 : 1;
    }
    return true;
}

// The ten rows of the table against the probed ALPHA table, and the passes the cube emitted.
bool checkPasses(const std::vector<scene::Pass>& out, size_t first, size_t last, int32_t index, const CubeWork& work, const Probe& ready, const std::string& where,
                 Counts& counts) {
    const auto& setups = cubePassSetups();
    const Bytes& modes = ready.mem.at(6);
    const float limit = floatAt(ready.mem.at(4), 0);
    for (size_t p = 0; p < 10; ++p) {
        const CubePassSetup& setup = setups[p];
        const std::array<int32_t, 4> selectors{intAt(modes, setup.mode * 16), intAt(modes, setup.mode * 16 + 4), intAt(modes, setup.mode * 16 + 8), intAt(modes, setup.mode * 16 + 12)};
        const scene::BlendOp expected = opOf(selectors);
        const std::string name = "cube" + std::to_string(index) + " pass" + std::to_string(p);
        size_t faces = 0, smooth = 0, wanted = 0, wantedSmooth = 0;
        for (const CubeFace& f : work.faces)
            if ((f.facing < 0) == setup.away) {
                ++wanted;
                if (p == 0 || p == 5) wantedSmooth += setup.away || limit < f.facing ? 1 : 0;
            }
        const bool refract = p == 0 || p == 5;
        for (size_t i = first; i < last; ++i) {
            const scene::Pass& pass = out[i];
            if (pass.name != name) continue;
            CHECK(pass.target == (setup.away ? scene::TargetName::Extra : scene::TargetName::Display));
            CHECK(pass.topology == scene::PassTopology::Triangles && pass.halfLine && pass.vertices.size() % 6 == 0);
            CHECK(pass.material.depthTest == scene::DepthTest::Always && !pass.material.depthWrite && pass.material.bilinear);
            CHECK(pass.material.coordinates == scene::CoordinateKind::Projective && pass.material.sampling == scene::Sampling::Repeat);
            faces += pass.vertices.size() / 6;
            if (refract) {
                CHECK(pass.material.source == scene::SourceKind::Target && pass.material.sourceTarget == (p == 0 ? scene::TargetName::Display : scene::TargetName::Extra));
                if (pass.edgeSmoothing) {
                    smooth += pass.vertices.size() / 6;
                    CHECK(pass.material.blend == expected && pass.material.blendConstant == setup.fix);
                } else {
                    CHECK(pass.material.blend == scene::BlendOp::Opaque);
                }
            } else {
                CHECK(pass.material.source == scene::SourceKind::Texture && pass.material.texture == setup.texture);
                CHECK(!pass.edgeSmoothing && pass.material.blend == expected && pass.material.blendConstant == setup.fix);
            }
        }
        if (faces != wanted || smooth != wantedSmooth) {
            std::fprintf(stderr, "%s %s: %zu faces drawn (%zu antialiased), %zu expected (%zu)\n", where.c_str(), name.c_str(), faces, smooth, wanted, wantedSmooth);
            return false;
        }
        CHECK(expected != scene::BlendOp::Opaque && (!refract || expected == scene::BlendOp::AlphaOver));
        ++counts.descriptors;
    }
    return true;
}

template <class T>
int run(const OpeningFixture& fixture, const scene::ProgramImage& program, bool exact, Counts& counts, std::map<int32_t, std::vector<scene::Pass>>* keep = nullptr) {
    const std::string name = fixture.capture();
    T cubes(program);
    size_t frames = 0;
    for (size_t k = 0; k < fixture.frameCount(); ++k) {
        const Frame f = framesOf(fixture, k);
        if (f.entries.empty()) continue;
        const int32_t counter = *fixture.counter(k);
        const Bytes& block = f.entries[0].mem.at(4);
        Matrices m;
        m.worldToScreen = matAt(block, 0xc0);
        m.camera = matAt(block, 0x100);
        m.viewScreen = matAt(block, 0x140);
        m.normalLight = matAt(block, 0x200);
        const Vec4 camera = vecAt(f.entries[0].mem.at(1), 0x40);
        std::vector<scene::Pass> out;
        std::vector<CubeWork> work;
        cubes.draw(m, camera, out, &work, counter & 1);
        ++frames;
        const std::string where = name + " counter " + std::to_string(counter);
        if (!exact) {
            CHECK(work.size() + 1 >= f.readies.size() && f.readies.size() + 1 >= work.size());
            continue;
        }
        if (keep) (*keep)[counter] = out;
        if (work.size() != f.readies.size()) {
            std::fprintf(stderr, "%s: %zu cubes drawn, the capture drew %zu\n", where.c_str(), work.size(), f.readies.size());
            return 1;
        }
        counts.cubes += work.size();
        counts.clipped += f.entries.size() - work.size();
        size_t from = 0;
        for (size_t j = 0; j < work.size(); ++j) {
            const std::string w = where + " cube " + std::to_string(work[j].index);
            if (!checkWork(work[j], f.entries[work[j].index], f.readies[j], w, counts)) return 1;
            size_t to = from;
            while (to < out.size() && out[to].name.rfind("cube" + std::to_string(work[j].index) + " ", 0) == 0) ++to;
            if (!checkPasses(out, from, to, work[j].index, work[j], f.readies[j], w, counts)) return 1;
            from = to;
        }
        CHECK(from == out.size());
    }
    CHECK(frames == 218);
    return 0;
}


// The passes of the capture GS dump (passes.json, vertices kept only for some frames): the descriptors of the cube passes of every
// frame with cubes, and the vertices of a few. The dump frame is the module counter + 5.
nlohmann::json loadDump(const std::string& path, const std::set<int32_t>& withVertices) {
    std::ifstream in(path, std::ios::binary);
    if (!in) throw std::runtime_error("no dump passes at " + path);
    int32_t frame = -1;
    int32_t current = -1;
    nlohmann::json::parser_callback_t keep = [&](int depth, nlohmann::json::parse_event_t event, nlohmann::json& parsed) {
        if (depth == 2 && (event == nlohmann::json::parse_event_t::object_start || event == nlohmann::json::parse_event_t::value)) current = ++frame;
        if (event == nlohmann::json::parse_event_t::key && depth == 5 && parsed == "vertices" && !withVertices.count(current)) return false;
        return true;
    };
    return nlohmann::json::parse(in, keep);
}

bool gateFrame(const nlohmann::json& dump, int32_t counter, const std::vector<scene::Pass>& mine, bool vertices, size_t& compared) {
    const nlohmann::json& frame = dump.at("frames").at(static_cast<size_t>(counter + 5));
    const std::string where = "dump frame " + std::to_string(counter + 5);
    std::vector<const nlohmann::json*> theirs;
    for (const nlohmann::json& p : frame.at("passes")) {
        const bool sprites = p.at("primitive") == "Sprites";
        if (p.at("primitive") != "Triangles" && !(sprites && counter < 214)) continue;
        const std::string target = p.at("target");
        const bool extraTarget = target == "fb1a40";
        bool cubeTexture = false;
        if (p.at("texture").is_object()) {
            const nlohmann::json& source = p.at("texture").at("source");
            if (source.contains("image")) {
                const std::string image = source.at("image");
                cubeTexture = image.rfind("t3120", 0) == 0 || image.rfind("t30e0", 0) == 0 || image.rfind("t3060", 0) == 0;
            } else {
                cubeTexture = source.at("target") == "fb1a40";
            }
        }
        if (extraTarget || cubeTexture) theirs.push_back(&p);
    }
    std::vector<const scene::Pass*> kept;
    for (const scene::Pass& m : mine)
        if (m.topology != scene::PassTopology::Sprites || counter < 214) kept.push_back(&m);
    if (theirs.size() != kept.size()) {
        std::fprintf(stderr, "%s: %zu cube passes in the dump, %zu in the scene\n", where.c_str(), theirs.size(), kept.size());
        return false;
    }
    std::string display;
    const int field = frame.at("field").get<int>();
    for (size_t i = 0; i < kept.size(); ++i) {
        const scene::Pass& m = *kept[i];
        const nlohmann::json& t = *theirs[i];
        const std::string target = t.at("target");
        if (m.target == scene::TargetName::Extra) {
            CHECK(target == "fb1a40");
        } else {
            if (display.empty()) display = target;
            CHECK(target == display && display != "fb1a40");
        }
        CHECK(t.at("antialias").get<bool>() == m.edgeSmoothing);
        CHECK(t.at("depth").at("test") == "Always" && t.at("depth").at("write") == false);
        CHECK(t.at("primitive") == (m.topology == scene::PassTopology::Sprites ? "Sprites" : "Triangles"));
        const nlohmann::json& blend = t.at("blend");
        if (m.material.blend == scene::BlendOp::Opaque) {
            CHECK(blend.is_null());
        } else {
            CHECK(blend.is_object());
            const bool destinationAlpha = m.material.blend == scene::BlendOp::AddDestinationAlpha;
            const bool over = m.material.blend == scene::BlendOp::AlphaOver;
            CHECK(blend.at("a") == "Source" && blend.at("b") == (over ? "Destination" : "Zero") && blend.at("c") == (destinationAlpha ? "DestinationAlpha" : "SourceAlpha") &&
                  blend.at("d") == "Destination");
            CHECK(blend.at("fixed").get<int>() == m.material.blendConstant);
        }
        const nlohmann::json& tex = t.at("texture");
        const bool clearing = m.material.source == scene::SourceKind::None;
        if (clearing) {
            CHECK(tex.is_null());
        } else {
            CHECK(tex.at("coordinates") == (m.topology == scene::PassTopology::Sprites ? "Texel" : "Projective") && tex.at("filter") == "Bilinear");
        }
        if (m.topology == scene::PassTopology::Sprites && !clearing) {
            if (display.empty()) display = tex.at("source").at("target");
            CHECK(tex.at("source").at("target") == display && tex.at("alpha").at("mode") == "Constant" && tex.at("alpha").at("zeroWhenBlack") == true);
        } else if (clearing) {
        } else if (m.material.source == scene::SourceKind::Target) {
            CHECK(tex.at("source").contains("target") && tex.at("width") == 1024 && tex.at("height") == 256);
            CHECK((m.material.sourceTarget == scene::TargetName::Extra) == (tex.at("source").at("target") == "fb1a40"));
        } else {
            const char* ids[] = {"t3060-2-2-7x7", "t30e0-1-0-6x6", "t3120-1-0-6x6"};
            CHECK(tex.at("source").at("image") == ids[m.material.texture - 10]);
        }
        if (vertices) {
            const nlohmann::json& list = t.at("vertices");
            CHECK(list.size() == m.vertices.size());
            for (size_t v = 0; v < list.size(); ++v) {
                const nlohmann::json& d = list[v];
                const scene::Vertex& u = m.vertices[v];
                const float shift = m.halfLine && field == 1 ? 0.5f : 0.0f;
                const bool ok = d[0].get<float>() == u.x && d[1].get<float>() == u.y - shift && d[2].get<uint32_t>() == u.z && d[3].get<int>() == u.r && d[4].get<int>() == u.g &&
                                d[5].get<int>() == u.b && d[6].get<int>() == u.a && (clearing || (d[7].get<float>() == u.u && d[8].get<float>() == u.v)) && d[9].get<float>() == u.q;
                if (!ok) {
                    std::fprintf(stderr, "%s pass %zu (%s) vertex %zu: dump %s, scene x %g y %g z %u rgba %d %d %d %d uvq %g %g %g\n", where.c_str(), i, m.name.c_str(), v, d.dump().c_str(), u.x,
                                 u.y - shift, u.z, u.r, u.g, u.b, u.a, u.u, u.v, u.q);
                    return false;
                }
                ++compared;
            }
        }
    }
    return true;
}


}

int main(int argc, char** argv) {
    return scenetest::run(argc, argv, [](int count, char** arguments) {
        CHECK(count >= 2);
        CHECK(count >= 4);
        const OpeningFixture fixture = OpeningFixture::load(arguments[1]);
        const scene::ProgramImage program = scene::ProgramImage::load(arguments[3]);
        Counts counts;
        std::map<int32_t, std::vector<scene::Pass>> passes;
        if (int failed = run<Cubes<EeArithmetic>>(fixture, program, true, counts, &passes)) return failed;
        std::printf("%s: %zu cubes drawn, %zu left out by the clip test, angles %zu, matrices %zu, centres %zu, work values %zu, pass descriptors %zu\n",
                    fixture.capture().c_str(), counts.cubes, counts.clipped, counts.angles, counts.matrices, counts.centres, counts.values, counts.descriptors);
        CHECK(counts.cubes == 994 && counts.clipped == 96 && counts.angles == 994 && counts.matrices == 1988 && counts.centres == 994 &&
              counts.values == 75544 && counts.descriptors == 9940);
        if (count >= 3 && std::string(arguments[2]) != "-") {
            const std::set<int32_t> sample{3, 20, 60, 95, 150, 200, 218};
            std::set<int32_t> frames;
            for (const int32_t c : sample) frames.insert(c + 5);
            const nlohmann::json dump = loadDump(arguments[2], frames);
            size_t vertices = 0;
            for (const auto& [counter, mine] : passes) CHECK(gateFrame(dump, counter, mine, sample.count(counter) != 0, vertices));
            std::printf("dump: %zu frames of cube passes equal, %zu vertices equal\n", passes.size(), vertices);
        }
        Counts unused;
        if (int failed = run<Cubes<NativeArithmetic>>(fixture, program, false, unused)) return failed;
        std::printf("CubesTest passed\n");
        return 0;
    });
}
