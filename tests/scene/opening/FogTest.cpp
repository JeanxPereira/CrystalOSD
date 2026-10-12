#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <stdexcept>

#include "../../Check.hpp"
#include "../SceneFixture.hpp"
#include "OpeningFixture.hpp"
#include "Scene/Arithmetic.hpp"
#include "Scene/opening/Fog.hpp"

namespace {

using scene::EeArithmetic;
using scene::Mat4;
using scene::NativeArithmetic;

uint32_t word(const openingtest::Bytes& bytes, size_t at) {
    uint32_t v;
    std::memcpy(&v, bytes.data() + at, 4);
    return v;
}

Mat4 matrixOf(const openingtest::Bytes& bytes, size_t at) {
    Mat4 m{};
    for (size_t r = 0; r < 4; ++r)
        for (size_t c = 0; c < 4; ++c) m[r][c] = scene::asFloat(word(bytes, at + (r * 4 + c) * 4));
    return m;
}


nlohmann::json loadDump(const std::string& openingPath) {
    const std::filesystem::path path = std::filesystem::path(openingPath).parent_path() / "passes.json";
    std::ifstream in(path, std::ios::binary);
    if (!in) throw std::runtime_error("no passes.json at " + path.string());
    return nlohmann::json::parse(in);
}

bool sameVertices(const std::vector<scene::Vertex>& mine, const nlohmann::json& dump, float shift, bool textured, size_t& compared) {
    if (dump.at("vertices").size() != mine.size()) return false;
    for (size_t i = 0; i < mine.size(); ++i) {
        const nlohmann::json& d = dump.at("vertices").at(i);
        const scene::Vertex& v = mine[i];
        const float want[10] = {v.x, v.y - shift, static_cast<float>(v.z), float(v.r), float(v.g), float(v.b), float(v.a), v.u, v.v, v.q};
        for (int c = 0; c < (textured ? 10 : 7); ++c)
            if (static_cast<float>(d.at(c).get<double>()) != want[c]) {
                std::fprintf(stderr, "vertex %zu field %d: dump %.9g, scene %.9g\n", i, c, d.at(c).get<double>(), static_cast<double>(want[c]));
                return false;
            }
        ++compared;
    }
    return true;
}

constexpr int kDumpShift = 5;

int run(const std::string& path) {
    const openingtest::OpeningFixture fixture = openingtest::OpeningFixture::load(path);
    const nlohmann::json dump = loadDump(path);
    size_t compared = 0;
    scene::opening::Fog<EeArithmetic> fog;
    scene::opening::Fog<NativeArithmetic> native;

    size_t frames = 0, layers = 0, meshValues = 0, offsetsEqual = 0, offsetsTotal = 0;
    int64_t drawn = 0, leftOut = 0;
    bool first = true;
    std::array<float, 6> previous{};
    for (size_t k = 0; k < fixture.frameCount(); ++k) {
        const auto block = fixture.fog(k);
        if (!block) continue;
        const openingtest::Probe& record = block->record;
        CHECK(record.mem.size() == 7 && record.mem[0].size() == 0x2440);
        const openingtest::Bytes& memory = record.mem[0];

        for (size_t n = 0; n < fog.mesh().size(); ++n) {
            for (size_t c = 0; c < 4; ++c) {
                CHECK(scene::floatBits(fog.mesh()[n][c]) == word(memory, 0x20 + n * 16 + c * 4));
                CHECK(static_cast<uint32_t>(fog.brightness()[n][c]) == word(memory, 0x1230 + n * 16 + c * 4));
                meshValues += 2;
            }
        }
        if (first) {
            for (size_t layer = 0; layer < 6; ++layer) CHECK(word(memory, layer * 4) == 0);
            first = false;
        } else {
            for (size_t layer = 0; layer < 6; ++layer) {
                ++offsetsTotal;
                if (scene::floatBits(previous[layer]) == word(memory, layer * 4)) ++offsetsEqual;
            }
        }
        const Mat4 toScreen = matrixOf(record.mem[5], 0);
        std::vector<scene::Pass> passes;
        fog.draw(toScreen, passes);
        CHECK(fog.stats().drawn + fog.stats().leftOut == 6 * 256);
        size_t vertices = 0;
        for (const scene::Pass& p : passes) vertices += p.vertices.size();
        CHECK(vertices == static_cast<size_t>(fog.stats().drawn) * 6);
        {
            const nlohmann::json& frame = dump.at("frames").at(static_cast<size_t>(fixture.counter(k).value() + kDumpShift));
            CHECK(!frame.is_null());
            std::vector<const nlohmann::json*> layersInDump;
            for (const nlohmann::json& p : frame.at("passes")) {
                const nlohmann::json& b = p.at("blend");
                if (p.at("primitive") == "Triangles" && !b.is_null() && b.at("a") == "Source" && b.at("b") == "Zero" && b.at("c") == "Fixed" && b.at("fixed") == 20) layersInDump.push_back(&p);
            }
            CHECK(layersInDump.size() == passes.size());
            for (size_t i = 0; i < passes.size(); ++i) {
                CHECK(sameVertices(passes[i].vertices, *layersInDump[i], passes[i].halfLine && frame.at("field") != 0 ? 0.5f : 0.0f, true, compared));
                CHECK((*layersInDump[i]).at("depth").at("test") == "GreaterEqual" && !(*layersInDump[i]).at("depth").at("write").get<bool>());
            }
        }
        layers += 6;
        drawn += fog.stats().drawn;
        leftOut += fog.stats().leftOut;
        previous = fog.offsets();

        std::vector<scene::Pass> nativePasses;
        native.draw(toScreen, nativePasses);
        CHECK(native.stats().drawn > 0 || fog.stats().drawn == 0);
        ++frames;
    }
    std::printf("fog dump: %zu vertices equal\n", compared);
    std::printf("fog: %zu frames, %zu layers, mesh+brightness %zu values equal, offsets carried %zu of %zu, quads drawn %lld, left out %lld\n", frames, layers, meshValues,
                offsetsEqual, offsetsTotal, static_cast<long long>(drawn), static_cast<long long>(leftOut));
    CHECK(frames == 246);
    CHECK(offsetsEqual == offsetsTotal && offsetsTotal == 1470);
    CHECK(drawn == 127136 && leftOut == 250720);
    return 0;
}

}

int main(int argc, char** argv) {
    return scenetest::run(argc, argv, [](int count, char** arguments) {
        if (count < 2) {
            std::fprintf(stderr, "usage: FogTest <opening-full opening.json>\n");
            return 2;
        }
        if (!std::filesystem::exists(arguments[1])) {
            std::fprintf(stderr, "no fixture at %s\n", arguments[1]);
            return 2;
        }
        return run(arguments[1]);
    });
}
