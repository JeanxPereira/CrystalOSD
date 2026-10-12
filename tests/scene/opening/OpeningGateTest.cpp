#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <memory>
#include <string>
#include <vector>

#include "../../Check.hpp"
#include "../SceneFixture.hpp"
#include "../OpeningGate.hpp"
#include "OpeningFixture.hpp"
#include "OpeningRun.hpp"
#include "Parity/Fixture.hpp"
#include "Parity/FromScene.hpp"
#include "Scene/Arithmetic.hpp"
#include "Scene/ProgramImage.hpp"
#include "Scene/opening/Opening.hpp"

namespace {

using nlohmann::json;

// The OSD's Framebuffer clear sprites (4 per blur trip, 2 per frame copy) land outside the scissor at the GS offset; the scene's flat draws do
// not hold them. The cubes' clear of the extra buffer is a scene pass (func module_opening_225728): it is the one the colour-only copy follows.
bool clearSprite(const parity::GsPass& pass) {
    return pass.primitive == parity::GsPrimitive::Sprites && !pass.texture && !pass.vertices.empty() && pass.vertices[0].x == -1728.0f && (pass.vertices[0].y == -1936.0f || pass.vertices[0].y == -1936.5f);
}

bool cubeClear(const parity::GsPass& clear, const parity::GsPass* next) {
    return clear.target == "fb1a40" && next && next->texture && next->texture->alpha.constant;
}

// What the oracle could not draw is a note for the pixel rule; the dump's states are what this gate compares.
std::vector<parity::GsPass> dumpPasses(const json& frame, size_t& dropped) {
    std::vector<parity::GsPass> all;
    for (const json& p : frame.at("passes")) all.push_back(parity::readPass(p));
    std::vector<parity::GsPass> out;
    for (size_t i = 0; i < all.size(); ++i) {
        if (clearSprite(all[i]) && !cubeClear(all[i], i + 1 < all.size() ? &all[i + 1] : nullptr)) {
            ++dropped;
            continue;
        }
        all[i].skip.clear();
        out.push_back(std::move(all[i]));
    }
    return out;
}

}

int main(int argc, char** argv) {
    return scenetest::run(argc, argv, [](int count, char** args) {
        if (count < 5) {
            std::fprintf(stderr, "usage: OpeningGateTest <hddosd.elf> <opening.json> <passes.json> <dump frame - counter> [cold|saved [all]]\n");
            return 2;
        }
        const auto program = std::make_shared<const scene::ProgramImage>(scene::ProgramImage::load(args[1]));
        const openingtest::OpeningFixture fixture = openingtest::OpeningFixture::load(args[2]);
        const openingtest::DumpFrames dump(args[3]);
        const int32_t shift = std::atoi(args[4]);
        const std::string start = count > 5 ? args[5] : "cold";
        const char* only = count > 6 ? args[6] : nullptr;
        scene::opening::Opening<scene::EeArithmetic> opening(openingtest::bootOptionsOf(fixture, start == "cold"), program);
        size_t frames = 0, passes = 0, dropped = 0, vertices = 0;
        int failures = 0;
        while (!opening.ended()) {
            const int32_t counter = opening.counter();
            if (counter + shift < 0) {
                opening.frame(counter & 1, counter & 1);
                continue;
            }
            const size_t at = static_cast<size_t>(counter + shift);
            CHECK(at < dump.size());
            const json frame = dump.at(at);
            CHECK(!frame.is_null());
            const int32_t field = frame.at("field").get<int32_t>();
            scene::Frame scene = opening.frame(counter & 1, field);
            parity::GsFrame gs = parity::fromScene(scene, parity::openingLayout(counter & 1));
            parity::applyDepthFormat(gs);
            const std::vector<parity::GsPass> theirs = dumpPasses(frame, dropped);
            const std::string label = std::string(fixture.capture()) + " counter " + std::to_string(counter) + " (dump frame " + std::to_string(at) + ")";
            const std::vector<parity::GsPass> ours = scenegate::coalesce(gs.passes);
            if (scenegate::comparePasses(ours, theirs, label, [&](const parity::GsPass& pass) { vertices += pass.vertices.size(); })) {
                ++failures;
                if (!only) return 1;
            }
            passes += ours.size();
            ++frames;
        }
        std::printf("gate %s: %zu frames, %zu passes equal after coalescing, %zu vertices, %zu clear sprites dropped from the dump, %d failing frames\n", fixture.capture().c_str(), frames,
                    passes, vertices, dropped, failures);
        return failures ? 1 : 0;
    });
}
