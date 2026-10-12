#include <cstdio>
#include <cstring>
#include <filesystem>
#include <map>
#include <memory>
#include <optional>
#include <string>

#include "../../Check.hpp"
#include "../SceneFixture.hpp"
#include "OpeningFixture.hpp"
#include "OpeningRun.hpp"
#include "Scene/Arithmetic.hpp"
#include "Scene/ProgramImage.hpp"
#include "Scene/opening/Opening.hpp"

namespace {

using namespace scene::opening;
using openingtest::Bytes;
using openingtest::OpeningFixture;
using scene::EeArithmetic;
using scene::NativeArithmetic;

uint32_t word(const Bytes& b, size_t at) {
    uint32_t v;
    std::memcpy(&v, b.data() + at, 4);
    return v;
}

bool pose(const TimelineState& s, const openingtest::Pose& want, int32_t counter) {
    bool ok = true;
    const auto report = [&](const char* what, uint32_t got, uint32_t expected) {
        std::fprintf(stderr, "counter %d: %s is 0x%08x, the capture has 0x%08x\n", counter, what, got, expected);
        ok = false;
    };
    for (size_t i = 0; i < 15; ++i)
        if (scene::floatBits(s.block[i]) != want.block[i]) report("block", scene::floatBits(s.block[i]), want.block[i]);
    for (size_t i = 0; i < 3; ++i)
        if (scene::floatBits(s.camera[i]) != want.camera[i]) report("camera", scene::floatBits(s.camera[i]), want.camera[i]);
    for (size_t i = 0; i < 2; ++i)
        if (scene::floatBits(s.up[i]) != want.up[i]) report("up", scene::floatBits(s.up[i]), want.up[i]);
    if (scene::floatBits(s.roll) != want.roll) report("roll", scene::floatBits(s.roll), want.roll);
    if (s.stage != want.stage) report("stage", static_cast<uint32_t>(s.stage), static_cast<uint32_t>(want.stage));
    if (s.go != (want.go != 0)) report("go", s.go, want.go != 0);
    if (s.pending != want.pending) report("pending", static_cast<uint32_t>(s.pending), static_cast<uint32_t>(want.pending));
    return ok;
}

template <class L>
bool lightsEqual(const L& lights, const openingtest::Probe& record) {
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

struct Tally {
    size_t frames = 0, poses = 0, fogs = 0, lights = 0, cubes = 0;
};

int run(const std::string& path, const std::shared_ptr<const scene::ProgramImage>& program, Tally& tally) {
    const OpeningFixture fixture = OpeningFixture::load(path);
    const std::string where = fixture.capture();
    scene::opening::Opening<EeArithmetic> opening(openingtest::bootOptionsOf(fixture), program);
    scene::opening::Opening<NativeArithmetic> native(openingtest::bootOptionsOf(fixture), program);
    const bool timed = fixture.timeline(1).has_value();
    const size_t drawn = timed ? fixture.frameCount() - 1 : fixture.frameCount();
    std::map<int32_t, size_t> lightsAt;
    for (size_t k = 0; k < fixture.frameCount(); ++k)
        if (const auto lights = fixture.lights(k); lights && !lights->records.empty()) lightsAt[static_cast<int32_t>(word(lights->records[0].mem[0], 0))] = k;
    for (size_t step = 0; step < drawn; ++step) {
        CHECK(!opening.ended());
        const int32_t counter = opening.counter();
        CHECK(counter == static_cast<int32_t>(step) + 1);
        const size_t k = timed ? step : lightsAt.count(counter) ? lightsAt[counter] : fixture.frameCount();
        if (timed) {
            CHECK(pose(opening.timeline().state(), k == 0 ? fixture.timeline(1)->before : fixture.timeline(k)->after, counter));
            ++tally.poses;
        }
        if (const auto fog = timed ? fixture.fog(k) : std::nullopt) {
            for (size_t layer = 0; layer < 6; ++layer) {
                const uint32_t want = word(fog->record.mem.at(0), layer * 4);
                if (scene::floatBits(opening.fog().offsets()[layer]) != want) {
                    std::fprintf(stderr, "%s counter %d: fog offset %zu is 0x%08x, the capture has 0x%08x\n", where.c_str(), counter, layer, scene::floatBits(opening.fog().offsets()[layer]), want);
                    return 1;
                }
            }
            ++tally.fogs;
        }
        if (const auto lights = k < fixture.frameCount() ? fixture.lights(k) : std::nullopt; lights && !lights->records.empty()) {
            if (!lightsEqual(opening.lights(), lights->records[0])) {
                std::fprintf(stderr, "%s counter %d: the lights' ring or matrices differ from the capture's\n", where.c_str(), counter);
                return 1;
            }
            ++tally.lights;
        }
        scene::Frame frame = opening.frame(counter & 1, counter & 1);
        native.frame(counter & 1, counter & 1);
        CHECK(!frame.passes.empty() && frame.textureSet == scene::TextureSet::Opening && frame.depthBits == 24);
        std::vector<openingtest::Probe> readies;
        if (timed)
            for (const auto& p : fixture.records(k, "cubes"))
                if (p.k == 1) readies.push_back(p);
        if (timed) {
            CHECK(opening.cubeWork().size() == readies.size());
            for (size_t j = 0; j < readies.size(); ++j)
                for (size_t a = 0; a < 3; ++a) {
                    const uint32_t want = word(readies[j].mem.at(0), 0x450 + a * 4);
                    if (scene::floatBits(opening.cubeWork()[j].angles[a]) != want) {
                        std::fprintf(stderr, "%s counter %d cube %d: angle %zu is 0x%08x, the capture has 0x%08x\n", where.c_str(), counter, opening.cubeWork()[j].index, a,
                                     scene::floatBits(opening.cubeWork()[j].angles[a]), want);
                        return 1;
                    }
                    ++tally.cubes;
                }
        }
        ++tally.frames;
    }
    CHECK(opening.ended() && native.ended());
    CHECK(opening.counter() == static_cast<int32_t>(drawn) + 1);
    CHECK(opening.handOff() != nullptr && opening.handOff()->module == 2 && opening.handOff()->executeAppType == -1);
    return 0;
}

}

int main(int argc, char** argv) {
    return scenetest::run(argc, argv, [](int count, char** args) {
        if (count < 3) {
            std::fprintf(stderr, "usage: OpeningCarriedTest <hddosd.elf> <opening.json>...\n");
            return 2;
        }
        const auto program = std::make_shared<const scene::ProgramImage>(scene::ProgramImage::load(args[1]));
        for (int i = 2; i < count; ++i) {
            Tally tally;
            if (run(args[i], program, tally)) return 1;
            std::printf("carried %s: %zu frames, %zu poses, %zu fog offsets, %zu lights states, %zu cube angles equal\n", args[i], tally.frames, tally.poses, tally.fogs, tally.lights,
                        tally.cubes);
            CHECK(tally.frames == 246);
        }
        return 0;
    });
}
