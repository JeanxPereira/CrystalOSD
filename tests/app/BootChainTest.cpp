#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <memory>
#include <vector>

#include "../Check.hpp"
#include "App/BootChain.hpp"
#include "App/ClockScreen.hpp"
#include "App/OpeningScreen.hpp"
#include "Scene/SceneInputs.hpp"
#include "Scene/opening/Handoff.hpp"

namespace {

#define REQUIRE(c) do { if (!(c)) { std::fprintf(stderr, "REQUIRE failed line %d\n", __LINE__); std::exit(1); } } while (0)

struct Counting : app::FrameSource {
    int total, steps = 0;
    scene::Frame m_frame;
    explicit Counting(int n) : total(n) {}
    void step() override { m_frame.field = ++steps; }
    scene::Frame& frame() override { return m_frame; }
    bool done() const override { return steps >= total; }
};

uint64_t hashOf(const scene::Frame& f) {
    uint64_t h = 1469598103934665603ull;
    const auto mix = [&](const void* p, size_t n) {
        for (size_t i = 0; i < n; ++i) h = (h ^ static_cast<const uint8_t*>(p)[i]) * 1099511628211ull;
    };
    for (const scene::Pass& pass : f.passes) {
        mix(&pass.target, sizeof pass.target);
        mix(&pass.material.blend, sizeof pass.material.blend);
        for (const scene::Vertex& v : pass.vertices) {
            mix(&v.x, sizeof v.x);
            mix(&v.y, sizeof v.y);
            mix(&v.z, sizeof v.z);
            mix(&v.u, sizeof v.u);
            mix(&v.v, sizeof v.v);
            mix(&v.r, 4);
        }
    }
    return h ^ f.passes.size();
}

}

int main(int argc, char** argv) {
    if (argc < 3) return 1;
    {
        auto opening = std::make_unique<Counting>(246);
        auto clock = std::make_unique<Counting>(1 << 30);
        Counting* clockRaw = clock.get();
        app::BootChain chain(std::move(opening), std::move(clock), scene::opening::kFramesToClock);
        for (int i = 0; i < 246; ++i) {
            CHECK(chain.phase() == app::BootPhase::Opening);
            chain.step();
            CHECK(chain.frame().field == i + 1);
        }
        for (int i = 0; i < scene::opening::kFramesToClock; ++i) {
            CHECK(chain.phase() == app::BootPhase::Gap);
            chain.step();
            CHECK(chain.frame().textureSet == scene::TextureSet::Opening && !chain.frame().passes.empty());
        }
        CHECK(chain.phase() == app::BootPhase::Clock && clockRaw->steps == 0);
        chain.step();
        CHECK(clockRaw->steps == 1);
    }
    if (argc < 4 || !std::filesystem::exists(argv[3])) {
        std::printf("BootChainTest passed (mock only)\n");
        return 0;
    }
    const auto program = std::make_shared<const scene::ProgramImage>(scene::ProgramImage::load(argv[3]));
    const nlohmann::json start = scene::firstInput(argv[1]);
    const scene::RodMesh mesh = scene::loadRodMesh(argv[2]);
    const auto run = [&](uint32_t phase, bool clockForced) -> std::vector<uint64_t> {
        scene::opening::BootOptions options;
        options.lightsPhase = phase;
        options.clockForced = clockForced;
        auto opening = std::make_unique<app::OpeningScreen>(options, program);
        app::OpeningScreen* raw = opening.get();
        app::BootChain chain(std::move(opening), std::make_unique<app::ClockScreen>(scene::clockInputs(start, mesh), scene::frameInputs(start)), scene::opening::kFramesToClock);
        std::vector<uint64_t> hashes;
        int openingFrames = 0, gap = 0, clock = 0;
        scene::opening::HandOff handOff;
        for (int i = 0; i < 246 + scene::opening::kFramesToClock + 10; ++i) {
            const app::BootPhase before = chain.phase();
            chain.step();
            hashes.push_back(hashOf(chain.frame()));
            openingFrames += before == app::BootPhase::Opening;
            gap += before == app::BootPhase::Gap;
            clock += before == app::BootPhase::Clock;
            if (before == app::BootPhase::Opening && chain.phase() != before) handOff = *raw->handOff();
        }
        REQUIRE(openingFrames == 246 && gap == scene::opening::kFramesToClock && clock == 10);
        REQUIRE(chain.phase() == app::BootPhase::Clock);
        std::printf("hand-off module %d, execute type %d\n", handOff.module, handOff.executeAppType);
        return hashes;
    };
    const auto a = run(0xD80, false), b = run(0xD80, false);
    CHECK(a == b);
    const auto forced = run(0xD80, true);
    CHECK(forced.size() == a.size());
    const auto other = run(0x123, false);
    CHECK(other != a);
    std::printf("BootChainTest passed\n");
    return 0;
}
