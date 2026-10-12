#include <array>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "../../Check.hpp"
#include "../SceneFixture.hpp"
#include "OpeningFixture.hpp"
#include "TowerCalls.hpp"
#include "Scene/Arithmetic.hpp"
#include "Scene/ProgramImage.hpp"
#include "Scene/opening/TowerVu1.hpp"
#include "Scene/opening/Towers.hpp"

namespace {

using namespace scene::opening;
using scene::EeArithmetic;
using scene::NativeArithmetic;
using Row = std::array<float, 10>;

Row rowOf(const scene::Vertex& p) { return {p.x, p.y, static_cast<float>(p.z), float(p.r), float(p.g), float(p.b), float(p.a), p.u, p.v, p.q}; }

// The pass Towers::draw makes against the dump's description of the same draw.
int passState(const scene::Pass& pass, const nlohmann::json& dump) {
    const scene::Material& m = pass.material;
    const nlohmann::json& tex = dump.at("texture");
    CHECK(pass.topology == scene::PassTopology::Triangles && pass.target == scene::TargetName::Display);
    CHECK(pass.edgeSmoothing == dump.at("antialias").get<bool>() && pass.halfLine);
    CHECK(m.source == scene::SourceKind::Texture && m.texture == 6);
    CHECK(tex.at("coordinates") == "Projective" && m.coordinates == scene::CoordinateKind::Projective);
    CHECK(tex.at("addressU").at("mode") == "Repeat" && tex.at("addressV").at("mode") == "Repeat" && m.sampling == scene::Sampling::Repeat);
    CHECK(tex.at("filter") == "Bilinear" && m.bilinear);
    const nlohmann::json& blend = dump.at("blend");
    CHECK(blend.at("a") == "Source" && blend.at("b") == "Destination" && blend.at("c") == "SourceAlpha" && blend.at("d") == "Destination");
    CHECK(m.blend == scene::BlendOp::AlphaOver && m.blendConstant == blend.at("fixed").get<int>());
    CHECK(dump.at("depth").at("test") == "GreaterEqual" && m.depthTest == scene::DepthTest::GreaterEqual);
    CHECK(dump.at("depth").at("write").get<bool>() == m.depthWrite && m.gouraud && !m.perPixelAlpha);
    return 0;
}

struct Tally {
    size_t calls = 0, chains = 0, vertices = 0, hidden = 0, frames = 0, triangles = 0;
};

int chainsOf(const scene::ProgramImage& program, const std::string& openingPath, const std::string& passesPath, long expectedHidden, Tally& tally) {
    const openingtest::OpeningFixture fixture = openingtest::OpeningFixture::load(openingPath);
    const std::vector<openingtest::TowerCall> calls = openingtest::towerCalls(fixture);
    CHECK(!calls.empty() && fixture.externals().history);
    const scene::opening::Towers<EeArithmetic> towers(*fixture.externals().history, program);
    std::vector<std::vector<Row>> expansions;
    std::vector<scene::Pass> drawn(calls.size());
    size_t hidden = 0, vertices = 0;
    for (const openingtest::TowerCall& call : calls) {
        std::vector<Row> rows;
        std::vector<scene::Pass> made;
        towers.draw(static_cast<int32_t>(openingtest::wordAt(call.entry.mem.at(7), 0)), openingtest::matricesOf(call.entry2.mem.at(0)), openingtest::vecAt(call.entry.mem.at(6), 0), made);
        if (!made.empty()) {
            for (const scene::Vertex& v : made.front().vertices) rows.push_back(rowOf(v));
            drawn[expansions.size()] = made.front();
        }
        for (const openingtest::Bytes& bytes : call.chains) {
            const TowerChain chain = openingtest::chainOf(bytes);
            const TowerVertices ee = TowerVu1<EeArithmetic>::run(chain);
            CHECK(ee.alpha == 0x8000000044ull);
            for (bool kicked : ee.kicked) {
                ++vertices;
                if (!kicked) ++hidden;
            }
            ++tally.chains;
        }
        expansions.push_back(std::move(rows));
        ++tally.calls;
    }
    tally.vertices += vertices;
    tally.hidden += hidden;
    std::printf("%s: %zu calls, %zu vertices, %zu not kicked\n", fixture.capture().c_str(), calls.size(), vertices, hidden);
    if (expectedHidden >= 0) CHECK(static_cast<long>(hidden) == expectedHidden);

    if (passesPath == "-") return 0;
    std::ifstream in(passesPath, std::ios::binary);
    if (!in) {
        std::fprintf(stderr, "no passes at %s\n", passesPath.c_str());
        return 1;
    }
    const nlohmann::json passes = nlohmann::json::parse(in);
    size_t next = 0;
    for (const nlohmann::json& frame : passes.at("frames")) {
        if (frame.is_null()) continue;
        for (const nlohmann::json& pass : frame.at("passes")) {
            if (pass.at("primitive") != "Triangles" || pass.at("texture").is_null() || pass.at("texture").at("source").value("image", "") != "t2d40-4-2-8x8") continue;
            const nlohmann::json& list = pass.at("vertices");
            bool found = false;
            for (size_t c = next; c < expansions.size() && !found; ++c) {
                const std::vector<Row>& rows = expansions[c];
                if (rows.size() != list.size()) continue;
                bool same = true;
                for (size_t n = 0; n < rows.size() && same; ++n) {
                    const nlohmann::json& v = list.at(n);
                    const float x = v.at(0), y = static_cast<float>(v.at(1).get<double>() + 0.5 * frame.at("field").get<int>()), z = v.at(2);
                    same = x == rows[n][0] && y == rows[n][1] && z == rows[n][2];
                    for (size_t k = 3; k < 10 && same; ++k) same = static_cast<float>(v.at(k).get<double>()) == rows[n][k];
                }
                if (same) {
                    found = true;
                    next = c + 1;
                    tally.triangles += rows.size() / 3;
                    if (int failed = passState(drawn[c], pass)) return failed;
                }
            }
            if (!found) {
                std::fprintf(stderr, "%s: dump frame %d draw %d: %zu vertices equal no call from %zu\n", fixture.capture().c_str(), frame.at("frame").get<int>(),
                             pass.at("index").get<int>(), list.size(), next);
                for (size_t c = next; c < expansions.size(); ++c) {
                    if (expansions[c].size() != list.size()) continue;
                    size_t shown = 0;
                    for (size_t n = 0; n < list.size() && shown < 8; ++n)
                        for (size_t k = 0; k < 10; ++k)
                            if (static_cast<float>(list.at(n).at(k).get<double>()) != expansions[c][n][k]) {
                                ++shown;
                                std::fprintf(stderr, "  call %zu vertex %zu field %zu: dump %.9g, computed %.9g\n", c, n, k, list.at(n).at(k).get<double>(), expansions[c][n][k]);
                            }
                    break;
                }
                return 1;
            }
            ++tally.frames;
        }
    }
    return 0;
}

int entryTwentyOne(const std::string& openingPath) {
    const openingtest::OpeningFixture fixture = openingtest::OpeningFixture::load(openingPath);
    const std::vector<openingtest::TowerCall> calls = openingtest::towerCalls(fixture);
    CHECK(!calls.empty() && !calls.front().chains.empty());
    TowerChain chain = openingtest::chainOf(calls.front().chains.front());
    const TowerVertices zero = TowerVu1<NativeArithmetic>::run(chain);
    CHECK(zero.alpha == 0x8000000044ull);
    chain.bytes[0x2a5040 - kTowerChainAddress] = 1;
    bool refused = false;
    try {
        TowerVu1<NativeArithmetic>::run(chain);
    } catch (const std::exception&) {
        refused = true;
    }
    CHECK(refused);
    return 0;
}

}

int main(int argc, char** argv) {
    return scenetest::run(argc, argv, [](int count, char** arguments) {
        if (count < 4) {
            std::fprintf(stderr, "usage: TowerVu1Test <hddosd.elf> (<opening.json> <passes.json> [--hidden=N])...\n");
            return 2;
        }
        Tally tally;
        bool twentyOne = false;
        const scene::ProgramImage program = scene::ProgramImage::load(arguments[1]);
        for (int i = 2; i + 1 < count;) {
            long hidden = -1;
            const std::string opening = arguments[i], passes = arguments[i + 1];
            i += 2;
            if (i < count && std::strncmp(arguments[i], "--hidden=", 9) == 0) hidden = std::atol(arguments[i++] + 9);
            if (!std::filesystem::exists(opening) || (passes != "-" && !std::filesystem::exists(passes))) {
                std::fprintf(stderr, "missing %s or %s\n", opening.c_str(), passes.c_str());
                return 1;
            }
            if (int failed = chainsOf(program, opening, passes, hidden, tally)) return failed;
            if (!twentyOne) {
                if (int failed = entryTwentyOne(opening)) return failed;
                twentyOne = true;
            }
        }
        CHECK(tally.frames > 0);
        std::printf("towervu1: %zu calls, %zu chains, %zu vertices (%zu not kicked), %zu dump frames, %zu triangles equal\n", tally.calls, tally.chains, tally.vertices,
                    tally.hidden, tally.frames, tally.triangles);
        return 0;
    });
}
