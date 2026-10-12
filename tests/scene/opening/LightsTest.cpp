#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <stdexcept>

#include "../../Check.hpp"
#include "../SceneFixture.hpp"
#include "OpeningFixture.hpp"
#include "Scene/Arithmetic.hpp"
#include "Scene/opening/Lights.hpp"

namespace {

using scene::EeArithmetic;
using scene::Mat4;
using scene::NativeArithmetic;
using scene::PassTopology;
using Bytes = openingtest::Bytes;

uint32_t word(const Bytes& bytes, size_t at) {
    uint32_t v;
    std::memcpy(&v, bytes.data() + at, 4);
    return v;
}

template <class L>
bool stateEqual(const L& lights, const openingtest::Probe& record) {
    const Bytes& vars = record.mem[0];
    const Bytes& history = record.mem[3];
    const Bytes& rings = record.mem[4];
    if (static_cast<int32_t>(word(vars, 0xb0)) != lights.head() || static_cast<int32_t>(word(vars, 0xac)) != lights.tail()) return false;
    for (size_t i = 0; i < 4; ++i)
        for (size_t n = 0; n < 4; ++n)
            for (size_t r = 0; r < 4; ++r)
                for (size_t c = 0; c < 4; ++c)
                    if (scene::floatBits(lights.matrices()[i][n][r][c]) != word(history, i * 0x100 + n * 0x40 + (r * 4 + c) * 4)) return false;
    for (size_t i = 0; i < 4; ++i)
        for (size_t e = 0; e < 128; ++e)
            for (size_t c = 0; c < 4; ++c)
                if (static_cast<uint32_t>(lights.ring()[i][e][c]) != word(rings, i * 0x800 + e * 16 + c * 4)) return false;
    return true;
}

bool tablesEqual(const Bytes& tables, const Bytes& clip, const Bytes& block, const Bytes& constants) {
    const float colours[4][3] = {{32, 128, 0}, {128, 32, 64}, {128, 0, 0}, {64, 32, 128}};
    for (size_t i = 0; i < 4; ++i)
        for (size_t c = 0; c < 4; ++c)
            if (word(tables, i * 16 + c * 4) != scene::floatBits(c < 3 ? colours[i][c] : 0.0f)) return false;
    const float halves[2] = {0.8f, 0.25f};
    for (size_t pair = 0; pair < 2; ++pair)
        for (size_t k = 0; k < 4; ++k) {
            const float v[4] = {(k & 1) ? halves[pair] : -halves[pair], (k & 2) ? halves[pair] : -halves[pair], 0.0f, 1.0f};
            for (size_t c = 0; c < 4; ++c)
                if (word(tables, 0x40 + pair * 0x40 + k * 16 + c * 4) != scene::floatBits(v[c])) return false;
        }
    for (size_t k = 0; k < 4; ++k) {
        const float v[4] = {static_cast<float>(k & 1), static_cast<float>(k >> 1), 0.0f, 0.0f};
        for (size_t c = 0; c < 4; ++c)
            if (word(tables, 0xc0 + k * 16 + c * 4) != scene::floatBits(v[c])) return false;
    }
    const float origin[4] = {0, 0, 0, 1};
    for (size_t c = 0; c < 4; ++c)
        if (word(tables, 0x100 + c * 4) != scene::floatBits(origin[c])) return false;
    const float box[8] = {1728, 1936, 0, 5, 2368, 2160, 0, 16777215};
    for (size_t c = 0; c < 8; ++c)
        if (word(clip, c * 4) != scene::floatBits(box[c])) return false;
    for (size_t r = 0; r < 4; ++r)
        for (size_t c = 0; c < 4; ++c)
            if (word(block, (r * 4 + c) * 4) != scene::floatBits(r == c ? 1.0f : 0.0f)) return false;
    const uint32_t factors[4] = {0x3c23d70a, 0x3dcccccd, 0x3ba3d70a, 0x3dcccccd};
    for (size_t c = 0; c < 4; ++c)
        if (word(constants, c * 4) != factors[c]) return false;
    return true;
}

Mat4 matrixOf(const Bytes& bytes, size_t at) {
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
    std::vector<size_t> frames;
    for (size_t k = 0; k < fixture.frameCount(); ++k)
        if (fixture.lights(k)) frames.push_back(k);
    CHECK(!frames.empty());
    const auto first = fixture.lights(frames[0]);
    CHECK(first->records.size() == 1 && first->records[0].mem.size() == 8);

    const nlohmann::json dump = loadDump(path);
    size_t compared = 0;
    scene::opening::Lights<EeArithmetic> lights(static_cast<uint32_t>(first->phase));
    scene::opening::Lights<NativeArithmetic> native(static_cast<uint32_t>(first->phase));
    CHECK(tablesEqual(first->records[0].mem[5], first->records[0].mem[6], first->records[0].mem[7], first->records[0].mem[2]));
    CHECK(static_cast<int32_t>(word(first->records[0].mem[1], 0)) == first->phase);
    CHECK(stateEqual(lights, first->records[0]));

    size_t drawn = 0, states = 0, library = 0;
    int64_t sprites = 0, trails = 0, leftOut = 0, hidden = 0, quads = 0;
    for (size_t at = 0; at < frames.size(); ++at) {
        const size_t k = frames[at];
        const auto block = fixture.lights(k);
        const openingtest::Probe& record = block->records.at(0);
        const int32_t counter = static_cast<int32_t>(word(record.mem[0], 0));
        CHECK(counter == fixture.counter(k));
        const Mat4 toScreen = matrixOf(record.mem[7], 0xc0);
        std::vector<scene::Pass> passes;
        lights.draw(counter, toScreen, passes);
        CHECK(block->cosines.size() == 4 && block->sines.size() == 4);
        for (size_t i = 0; i < 4; ++i) {
            CHECK(scene::floatBits(lights.cosines()[i]) == block->cosines[i]);
            CHECK(scene::floatBits(lights.sines()[i]) == block->sines[i]);
            library += 2;
        }
        sprites += lights.stats().spritePackets;
        trails += lights.stats().trailPackets;
        leftOut += lights.stats().quadsLeftOut;
        quads += lights.stats().quadsDrawn;
        hidden += lights.stats().trailHidden;
        size_t vertices = 0;
        for (const scene::Pass& p : passes)
            if (p.topology == scene::PassTopology::Triangles) vertices += p.vertices.size();
        CHECK(vertices == static_cast<size_t>(lights.stats().quadsDrawn) * 6);
        {
            const nlohmann::json& frame = dump.at("frames").at(static_cast<size_t>(fixture.counter(k).value() + kDumpShift));
            CHECK(!frame.is_null());
            const nlohmann::json* sprites = nullptr;
            const nlohmann::json* trails = nullptr;
            size_t spriteCount = 0, trailCount = 0;
            for (const nlohmann::json& p : frame.at("passes")) {
                if (p.at("primitive") == "Triangles" && !p.at("texture").is_null() && p.at("texture").at("source").contains("image") && p.at("texture").at("source").at("image") == "t3020-1-0-6x6") { sprites = &p; ++spriteCount; }
                if (p.at("primitive") == "Lines") { trails = &p; ++trailCount; }
            }
            const float shift = frame.at("field") != 0 ? 0.5f : 0.0f;
            size_t expectedPasses = (lights.stats().quadsDrawn > 0 ? 1 : 0) + (passes.size() - (lights.stats().quadsDrawn > 0 ? 1 : 0));
            CHECK(passes.size() == spriteCount + trailCount && expectedPasses == passes.size() && spriteCount <= 1 && trailCount <= 1);
            for (const scene::Pass& p : passes) {
                CHECK(sameVertices(p.vertices, p.topology == PassTopology::Lines ? *trails : *sprites, p.halfLine ? shift : 0.0f, p.topology != PassTopology::Lines, compared));
            }
        }
        ++drawn;
        if (at + 1 < frames.size() && fixture.counter(frames[at + 1]) == counter + 1) {
            CHECK(stateEqual(lights, fixture.lights(frames[at + 1])->records.at(0)));
            ++states;
        }
        std::vector<scene::Pass> nativePasses;
        native.draw(counter, toScreen, nativePasses);
    }
    std::printf("lights dump: %zu vertices equal\n", compared);
    std::printf("lights: %zu frames, %zu carried states equal, %zu library results equal, %lld sprite packets, %lld trail packets, %lld quads drawn, %lld left out, %lld trail vertices hidden\n",
                drawn, states, library, static_cast<long long>(sprites), static_cast<long long>(trails), static_cast<long long>(quads), static_cast<long long>(leftOut),
                static_cast<long long>(hidden));
    CHECK(drawn == 218 && states == 217 && library == 1744);
    CHECK(sprites == 3488 && trails == 872);
    CHECK(leftOut == 244 && hidden == 137);
    return 0;
}

}

int main(int argc, char** argv) {
    return scenetest::run(argc, argv, [](int count, char** arguments) {
        if (count < 2) {
            std::fprintf(stderr, "usage: LightsTest <opening-full opening.json>\n");
            return 2;
        }
        if (!std::filesystem::exists(arguments[1])) {
            std::fprintf(stderr, "no fixture at %s\n", arguments[1]);
            return 2;
        }
        return run(arguments[1]);
    });
}
