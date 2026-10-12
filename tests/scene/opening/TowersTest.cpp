#include <cstdio>
#include <cstring>
#include <filesystem>
#include <string>

#include "../../Check.hpp"
#include "../SceneFixture.hpp"
#include "OpeningFixture.hpp"
#include "TowerCalls.hpp"
#include "Scene/Arithmetic.hpp"
#include "Scene/ProgramImage.hpp"
#include "Scene/opening/Towers.hpp"

namespace {

using namespace scene::opening;
using scene::EeArithmetic;
using scene::floatBits;
using openingtest::Bytes;

int emptyHistory(const scene::ProgramImage& program) {
    const Towers<EeArithmetic> towers(History{}, program);
    for (int c = 0; c < kTowerColumns; ++c)
        for (int r = 0; r < kTowerRows; ++r) CHECK(towers.tables().flag[c][r] == 0);
    std::vector<scene::Pass> passes;
    std::vector<TowerChain> probe;
    towers.draw(10, TowerMatrices{}, {0, 0, 0, 1}, passes, &probe);
    CHECK(passes.empty() && probe.empty());
    return 0;
}

struct Tally {
    size_t tables = 0, places = 0, brightness = 0, calls = 0, chains = 0, words = 0, sines = 0;
};

int capture(const std::string& path, const scene::ProgramImage& program, Tally& tally) {
    const openingtest::OpeningFixture fixture = openingtest::OpeningFixture::load(path);
    CHECK(fixture.externals().history.has_value());
    const Towers<EeArithmetic> towers(*fixture.externals().history, program);
    const std::vector<openingtest::TowerCall> calls = openingtest::towerCalls(fixture);
    CHECK(!calls.empty());

    const openingtest::TowerCall& first = calls.front();
    const TowerTables& t = towers.tables();
    const Bytes &places = first.entry.mem.at(0), &flags = first.entry.mem.at(1), &sways = first.entry.mem.at(2), &fades = first.entry.mem.at(3),
                &heights = first.entry.mem.at(4), &bright = first.entry.mem.at(5);
    const Bytes& talls = first.entry2.mem.at(5);
    for (int c = 0; c < kTowerColumns; ++c)
        for (int r = 0; r < kTowerRows; ++r) {
            CHECK(openingtest::wordAt(flags, c * 0x50 + r * 4) == static_cast<uint32_t>(t.flag[c][r]));
            CHECK(openingtest::wordAt(sways, c * 0x38 + r * 4) == floatBits(t.sway[c][r]));
            CHECK(openingtest::wordAt(talls, c * 0x38 + r * 4) == floatBits(t.tall[c][r]));
            CHECK(openingtest::wordAt(heights, c * 0x24 + r * 4) == floatBits(t.height[c][r]));
            CHECK(openingtest::wordAt(fades, c * 0x24 + r * 4) == static_cast<uint32_t>(t.fade[c][r]));
            tally.tables += 5;
            for (int k = 0; k < 4; ++k) {
                CHECK(openingtest::wordAt(places, c * 0x90 + r * 0x10 + k * 4) == floatBits(t.place[c][r][k]));
                ++tally.places;
            }
        }
    for (int j = 0; j < 20; ++j)
        for (int i = 0; i < 20; ++i) {
            CHECK(openingtest::wordAt(bright, j * 0x50 + i * 4) == floatBits(towers.brightness()[j][i]));
            ++tally.brightness;
        }

    for (const openingtest::TowerCall& call : calls) {
        const int32_t counter = static_cast<int32_t>(openingtest::wordAt(call.entry.mem.at(7), 0));
        if (call.sine) {
            CHECK(floatBits(towers.swing(counter)) == *call.sine);
            ++tally.sines;
        }
        const scene::Vec4 camera = openingtest::vecAt(call.entry.mem.at(6), 0);
        std::vector<scene::Pass> passes;
        std::vector<TowerChain> chains;
        towers.draw(counter, openingtest::matricesOf(call.entry2.mem.at(0)), camera, passes, &chains);
        if (chains.size() != call.chains.size()) {
            std::fprintf(stderr, "%s: counter %d: %zu chains drawn, %zu probed\n", path.c_str(), counter, chains.size(), call.chains.size());
            return 1;
        }
        for (size_t n = 0; n < chains.size(); ++n)
            for (size_t w = 0; w < 0x840 / 4; ++w) {
                uint32_t mine;
                std::memcpy(&mine, chains[n].bytes.data() + w * 4, 4);
                if (mine != openingtest::wordAt(call.chains[n], w * 4)) {
                    std::fprintf(stderr, "%s: counter %d chain %zu word 0x%zx: computed 0x%x, probed 0x%x\n", path.c_str(), counter, n, w * 4, mine,
                                 openingtest::wordAt(call.chains[n], w * 4));
                    return 1;
                }
                ++tally.words;
            }
        tally.chains += chains.size();
        ++tally.calls;
    }
    std::printf("%s: %zu calls, %zu chains\n", fixture.capture().c_str(), calls.size(), tally.chains);
    return 0;
}

}

int main(int argc, char** argv) {
    return scenetest::run(argc, argv, [](int count, char** arguments) {
        if (count < 3) {
            std::fprintf(stderr, "usage: TowersTest <hddosd.elf> <opening.json>...\n");
            return 2;
        }
        const scene::ProgramImage program = scene::ProgramImage::load(arguments[1]);
        if (int failed = emptyHistory(program)) return failed;
        Tally tally;
        for (int i = 2; i < count; ++i) {
            if (!std::filesystem::exists(arguments[i])) {
                std::fprintf(stderr, "missing %s\n", arguments[i]);
                return 1;
            }
            if (int failed = capture(arguments[i], program, tally)) return failed;
        }
        std::printf("towers: %zu set-up values, %zu places, %zu brightness, %zu sines, %zu calls, %zu chains, %zu words, all equal\n", tally.tables,
                    tally.places, tally.brightness, tally.sines, tally.calls, tally.chains, tally.words);
        return 0;
    });
}
