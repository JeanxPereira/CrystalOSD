#include <cstdio>
#include <cstring>
#include <string>

#include "../../Check.hpp"
#include "../SceneFixture.hpp"
#include "OpeningFixture.hpp"
#include "Scene/opening/Handoff.hpp"

namespace {

using namespace scene::opening;

int32_t word(const openingtest::Bytes& bytes, size_t at) {
    int32_t v = 0;
    std::memcpy(&v, bytes.data() + at, 4);
    return v;
}

bool same(const HandOff& a, const HandOff& b) { return a == b; }

int branches() {
    CHECK(same(decide({0x6C, true, false, 0, 0}), HandOff{2, -1, true}));
    CHECK(same(decide({0x6C, true, false, 0, 0}), decide({0, true, false, 0, 0})));
    CHECK(same(decide({0x6C, true, true, 0, 0}), HandOff{1, 1, false}));
    CHECK(same(decide({0x6C, true, false, 1, 0}), HandOff{1, 1, false}));
    CHECK(same(decide({0x6A, false, false, 0, 0}), HandOff{1, 2, false}));
    CHECK(same(decide({0x6B, false, false, 0, 0}), HandOff{1, 2, false}));
    CHECK(same(decide({0x6C, false, false, 0, 0}), HandOff{1, 1, false}));
    CHECK(same(decide({0x6D, false, false, 0, 0}), HandOff{1, 1, false}));
    CHECK(same(decide({0x6E, false, false, 0, 0}), HandOff{1, 0, false}));
    CHECK(same(decide({0x6F, false, false, 0, 0}), HandOff{1, 5, false}));
    CHECK(same(decide({0x70, false, false, 0, 0}), HandOff{1, 4, false}));
    CHECK(same(decide({0x71, false, false, 0, 0}), HandOff{2, -1, true}));
    CHECK(same(decide({0x72, false, false, 0, 1}), HandOff{5, -1, true}));
    CHECK(same(decide({0x72, false, false, 0, 0}), HandOff{2, -1, true}));
    CHECK(same(decide({0x72, false, false, 0, -1}), HandOff{2, -1, true}));
    CHECK(same(decide({0x73, false, false, 0, 0}), HandOff{1, 3, false}));
    CHECK(same(decide({0x74, false, false, 0, 0}), HandOff{4, -1, true}));
    for (uint32_t s : {0u, 0x64u, 0x65u, 0x69u, 0x75u, 0xFFFFFFFFu}) CHECK(same(decide({s, false, false, 0, 0}), HandOff{2, -1, true}));
    CHECK(same(decide({0x64, false, true, 1, 0}), HandOff{0, 6, true}));
    CHECK(same(decide({0x6A, false, true, 1, 0}), HandOff{0, 6, true}));
    CHECK(same(decide({0x64, false, true, 0, 0}), HandOff{2, -1, true}));
    CHECK(kFramesToClock == 34);
    return 0;
}

int capture(const std::string& path) {
    const openingtest::OpeningFixture fixture = openingtest::OpeningFixture::load(path);
    size_t calls = 0;
    for (size_t k = 0; k < fixture.frameCount(); ++k) {
        const auto records = fixture.records(k, "handoff");
        if (records.empty()) continue;
        const openingtest::Probe *entry = nullptr, *exit = nullptr;
        int32_t result[7];
        bool seen[7] = {};
        for (const auto& p : records) {
            if (p.k == 0) entry = &p;
            if (p.k == 6) exit = &p;
            if (p.k >= 1 && p.k <= 5) {
                result[p.k] = static_cast<int32_t>(p.v0);
                seen[p.k] = true;
            }
        }
        CHECK(entry && exit);
        HandOffInputs in;
        in.snapshot = static_cast<uint32_t>(word(entry->mem.at(0), 0));
        in.cdda = word(entry->mem.at(2), 0);
        in.clockForced = seen[1] && result[1] != 0;
        in.hddReady = seen[2] ? result[2] != 0 : seen[4] && result[4] != 0;
        in.hddExec = seen[3] ? result[3] : seen[5] ? result[5] : 0;
        const HandOff want{word(exit->mem.at(1), 0), word(exit->mem.at(0), 0), word(exit->mem.at(1), 4) != 0};
        const HandOff got = decide(in);
        if (!same(got, want)) {
            std::fprintf(stderr, "%s frame %d: snapshot 0x%x: decided module %d execute %d previous %d, the capture left module %d execute %d previous %d\n",
                         fixture.capture().c_str(), fixture.index(k), in.snapshot, got.module, got.executeAppType, got.previousWasOpening, want.module,
                         want.executeAppType, want.previousWasOpening);
            return 1;
        }
        ++calls;
    }
    CHECK(calls > 0);
    std::printf("%s: %zu hand-off calls equal\n", fixture.capture().c_str(), calls);
    return 0;
}

}

int main(int argc, char** argv) {
    return scenetest::run(argc, argv, [](int count, char** arguments) {
        if (int failed = branches()) return failed;
        for (int i = 1; i < count; ++i) {
            const std::string argument = arguments[i];
            if (argument.rfind("--missing=", 0) == 0) {
                std::printf("MISSING capture, not checked: %s\n", argument.c_str() + 10);
                continue;
            }
            if (int failed = capture(argument)) return failed;
        }
        std::printf("HandoffTest passed\n");
        return 0;
    });
}
