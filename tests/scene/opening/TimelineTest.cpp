#include <cmath>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <optional>
#include <string>
#include <vector>

#include "../../Check.hpp"
#include "../SceneFixture.hpp"
#include "OpeningFixture.hpp"
#include "Scene/Arithmetic.hpp"
#include "Scene/ProgramImage.hpp"
#include "Scene/opening/Timeline.hpp"

namespace {

using namespace scene::opening;
using openingtest::OpeningFixture;
using openingtest::Pose;
using scene::EeArithmetic;
using scene::Mat4;
using scene::NativeArithmetic;
using scene::Vec4;
using Ee = Timeline<EeArithmetic>;
using Native = Timeline<NativeArithmetic>;

uint32_t bitsOf(float x) { return scene::floatBits(x); }

bool poseMatches(const TimelineState& s, const Pose& want, const char* capture, int32_t counter) {
    bool ok = true;
    const auto report = [&](const char* what, uint32_t got, uint32_t expected) {
        std::fprintf(stderr, "%s counter %d: %s is 0x%08x, the capture has 0x%08x\n", capture, counter, what, got, expected);
        ok = false;
    };
    for (size_t i = 0; i < 15; ++i)
        if (bitsOf(s.block[i]) != want.block[i]) report(("block " + std::to_string(i)).c_str(), bitsOf(s.block[i]), want.block[i]);
    for (size_t i = 0; i < 3; ++i)
        if (bitsOf(s.camera[i]) != want.camera[i]) report(("camera " + std::to_string(i)).c_str(), bitsOf(s.camera[i]), want.camera[i]);
    for (size_t i = 0; i < 2; ++i)
        if (bitsOf(s.up[i]) != want.up[i]) report(("up " + std::to_string(i)).c_str(), bitsOf(s.up[i]), want.up[i]);
    if (bitsOf(s.roll) != want.roll) report("roll", bitsOf(s.roll), want.roll);
    if (s.stage != want.stage) report("stage", static_cast<uint32_t>(s.stage), static_cast<uint32_t>(want.stage));
    if (s.go != (want.go != 0)) report("go", s.go, want.go != 0);
    if (s.pending != want.pending) report("pending", static_cast<uint32_t>(s.pending), static_cast<uint32_t>(want.pending));
    return ok;
}

std::array<uint32_t, 16> matrixBits(const std::vector<uint8_t>& bytes, size_t at) {
    std::array<uint32_t, 16> out{};
    std::memcpy(out.data(), bytes.data() + at, 64);
    return out;
}

bool matrixMatches(const Mat4& got, const std::array<uint32_t, 16>& want, const char* what, const char* capture, int32_t counter) {
    for (size_t r = 0; r < 4; ++r)
        for (size_t c = 0; c < 4; ++c)
            if (bitsOf(got[r][c]) != want[r * 4 + c]) {
                std::fprintf(stderr, "%s counter %d: %s[%zu][%zu] is 0x%08x, the capture has 0x%08x\n", capture, counter, what, r, c, bitsOf(got[r][c]), want[r * 4 + c]);
                return false;
            }
    return true;
}

using Logo = std::optional<std::array<int32_t, 3>>;

nlohmann::json loadJson(const std::string& path) {
    std::ifstream in(path, std::ios::binary);
    return nlohmann::json::parse(in);
}

Logo logoStepOf(const nlohmann::json& doc, size_t k) {
    const auto& t = doc.at("frames").at(k).at("timeline");
    if (!t.contains("logoStep")) return std::nullopt;
    return std::array<int32_t, 3>{t.at("logoStep").at("state"), t.at("logoStep").at("value"), t.at("logoStep").at("step")};
}

TimelineState stateFrom(const OpeningFixture& fixture, const Logo& logo, size_t k) {
    const auto line = *fixture.timeline(k);
    const int32_t counter = *fixture.counter(k);
    TimelineState s = Ee::initialState(counter);
    for (size_t i = 0; i < 15; ++i) s.block[i] = scene::asFloat(line.before.block[i]);
    for (size_t i = 0; i < 3; ++i) s.camera[i] = scene::asFloat(line.before.camera[i]);
    s.up = {scene::asFloat(line.before.up[0]), scene::asFloat(line.before.up[1]), 0.0f, 1.0f};
    s.roll = scene::asFloat(line.before.roll);
    s.stage = line.before.stage;
    s.go = line.before.go != 0;
    s.pending = line.before.pending;
    s.scene = line.scene;
    s.snapshot = line.snapshot;
    const bool placed = !(counter == 1 && line.before.camera[2] == 0);
    if (placed) {
        Ee scratch(BootOptions{}, s);
        scratch.sceneSetUp();
        s.direction = scratch.state().direction;
        s.lights = scratch.state().lights;
    }
    if (logo) {
        s.logoState = (*logo)[0];
        s.logoValue = (*logo)[1];
        s.logoStep = (*logo)[2];
    }
    return s;
}

BootOptions optionsOf(const OpeningFixture& fixture, size_t k) {
    BootOptions o;
    o.clockForced = fixture.timeline(k)->forcedClock.value_or(false);
    o.hddReady = fixture.externals().hddReady.value_or(0) != 0;
    o.hddExec = fixture.externals().hddExec.value_or(0);
    return o;
}

// The capture's matrices of frame k: the camera group's view and view-screen, the inputs group's four.
bool checkMatrices(const OpeningFixture& fixture, size_t k, const Matrices& m, const char* capture, int32_t counter, size_t& compared) {
    const auto line = *fixture.timeline(k);
    if (line.matricesHex) {
        const auto bytes = openingtest::fromHex(*line.matricesHex);
        if (bytes.size() != 128) return false;
        if (!matrixMatches(m.camera, matrixBits(bytes, 0), "view matrix", capture, counter)) return false;
        if (!matrixMatches(m.viewScreen, matrixBits(bytes, 64), "view to screen", capture, counter)) return false;
        compared += 2;
    }
    for (const auto& r : fixture.records(k, "inputs")) {
        if (r.k != 2 || r.mem.empty() || r.mem[0].size() < 0x280) continue;
        if (!matrixMatches(m.worldToScreen, matrixBits(r.mem[0], 0xc0), "world to screen", capture, counter)) return false;
        if (!matrixMatches(m.camera, matrixBits(r.mem[0], 0x100), "view matrix", capture, counter)) return false;
        if (!matrixMatches(m.viewScreen, matrixBits(r.mem[0], 0x140), "view to screen", capture, counter)) return false;
        if (!matrixMatches(m.normalLight, matrixBits(r.mem[0], 0x200), "light directions", capture, counter)) return false;
        compared += 4;
    }
    return true;
}

std::vector<SoundEvent> soundsOf(const OpeningFixture& fixture, size_t k) {
    std::vector<SoundEvent> out;
    for (const auto& r : fixture.records(k, "stages3")) {
        if (r.k != 4 && r.k != 5) continue;
        if (r.k == 5 || (r.a0 != 0x6140 && r.a0 != 0x6150)) continue;
        out.push_back({r.a0, static_cast<int32_t>(r.a0 == 0x6140 ? r.a1 : r.a3), *fixture.counter(k)});
    }
    return out;
}

bool hasSoundProbes(const OpeningFixture& fixture) {
    for (size_t k = 0; k < fixture.frameCount(); ++k)
        for (const auto& r : fixture.records(k, "stages3"))
            if (r.k == 4) return true;
    return false;
}

int constants(const std::string& elf) {
    const scene::ProgramImage image = scene::ProgramImage::load(elf);
    using namespace scene::opening::TimelineConstant;
    const std::pair<uint32_t, float> table[] = {{0x36f9d4, HddRollVelocity}, {0x36f9d8, HddWaitVz}, {0x36f9dc, HddLateVz}, {0x36f9e0, HddExecVz}, {0x36f9e4, StageOneAz},
                                                {0x36f9e8, HddAz}, {0x36f9ec, HddRollAcc}, {0x36f9f0, PlainVz}, {0x36f9f4, PlainRollAcc}, {0x36f9f8, Pi},
                                                {0x36f9fc, TwoPi}, {0x36fa04, TwoPi}};
    for (const auto& [address, value] : table)
        if (image.word(address) != scene::floatBits(value)) {
            std::fprintf(stderr, "constant at 0x%08x: the program has 0x%08x, the scene 0x%08x\n", address, image.word(address), scene::floatBits(value));
            return 1;
        }
    CHECK(image.word(0x36fa00) == scene::floatBits(-Pi));
    std::printf("%zu constants equal the program's words\n", sizeof table / sizeof table[0] + 1);
    return 0;
}

struct Totals {
    size_t calls = 0, matrices = 0, sounds = 0, gaps = 0;
};

// (a) and (e): every call from the probed state at its entry.
int isolated(const std::string& path, Totals& totals) {
    const OpeningFixture fixture = OpeningFixture::load(path);
    const nlohmann::json doc = loadJson(path);
    const std::string name = fixture.capture();
    const bool soundProbes = hasSoundProbes(fixture);
    for (size_t k = 0; k < fixture.frameCount(); ++k) {
        const auto line = fixture.timeline(k);
        if (!line || !fixture.counter(k)) continue;
        const int32_t counter = *fixture.counter(k);
        Ee timeline(optionsOf(fixture, k), stateFrom(fixture, logoStepOf(doc, k), k));
        const TimelineStep step = timeline.step(static_cast<uint32_t>(line->discState));
        if (!poseMatches(timeline.state(), line->after, name.c_str(), counter)) return 1;
        CHECK(static_cast<uint32_t>(step.result) == line->result);
        CHECK(checkMatrices(fixture, k, step.matrices, name.c_str(), counter, totals.matrices));
        if (soundProbes) {
            const auto want = soundsOf(fixture, k);
            const bool exact = step.result == 0 && k > 0;
            if (exact ? step.sounds.size() != want.size() : step.sounds.size() > want.size()) {
                std::fprintf(stderr, "%s counter %d: %zu sound commands computed, %zu sent\n", name.c_str(), counter, step.sounds.size(), want.size());
                return 1;
            }
            for (size_t i = 0; i < step.sounds.size(); ++i) CHECK(step.sounds[i] == want[i]);
            if (k == 0 && step.sounds.empty() && !want.empty() && fixture.frameCount() > 1) {
                const TimelineStep next = timeline.step(static_cast<uint32_t>(line->discState));
                CHECK(next.sounds.size() == want.size());
                for (size_t i = 0; i < want.size(); ++i) CHECK(next.sounds[i].id == want[i].id && next.sounds[i].argument == want[i].argument);
                CHECK(poseMatches(timeline.state(), fixture.timeline(1)->before, name.c_str(), 0));
                totals.sounds += want.size();
                ++totals.gaps;
            }
            totals.sounds += step.sounds.size();
        }
        if (k + 1 < fixture.frameCount() && fixture.timeline(k + 1) && fixture.counter(k + 1) && *fixture.counter(k + 1) == counter + 1)
            CHECK(timeline.state().snapshot == fixture.timeline(k + 1)->snapshot);
        ++totals.calls;
    }
    return 0;
}

struct Run {
    std::vector<TimelineStep> steps;
    std::vector<TimelineState> after;
};

// (b): the module's calls from the first one, the disc schedule fed, the scene set up after the first.
template <class T>
Run carried(const OpeningFixture* fixture, const BootOptions& options, size_t calls) {
    T timeline(options, T::initialState(1));
    Run run;
    for (size_t i = 0; i < calls; ++i) {
        const uint32_t disc = i == 0 ? options.disc.first : options.disc.later;
        run.steps.push_back(timeline.step(disc));
        run.after.push_back(timeline.state());
        if (i == 0) timeline.sceneSetUp();
    }
    (void)fixture;
    return run;
}

int whole(const std::string& path) {
    const OpeningFixture fixture = OpeningFixture::load(path);
    const nlohmann::json doc = loadJson(path);
    const std::string name = fixture.capture();
    BootOptions options;
    options.disc = {0x65, 0x64};

    const auto first = fixture.timeline(0);
    CHECK(first && fixture.frameCount() == 247);
    TimelineState initial = stateFrom(fixture, logoStepOf(doc, 0), 0);
    CHECK(initial.counter == 1 && initial.direction == Vec4{} && initial.lights[0] == Vec4{});
    {
        Ee start(options, Ee::initialState(1));
        TimelineStep reference = start.step(0x65);
        Ee probed(options, initial);
        TimelineStep got = probed.step(0x65);
        CHECK(reference.matrices.worldToScreen == got.matrices.worldToScreen && start.state().block == probed.state().block);
    }

    Ee timeline(options, Ee::initialState(1));
    size_t drawn = 0, dive = 0, logoDraws = 0;
    int32_t firstBlur[4] = {0, 0, 0, 0}, firstFade = 0, lastFade = 0, lastResult = -1, lastLogo = -1;
    float diveZ = 0, blurZ = 0;
    size_t matrixCompared = 0;
    int32_t lastCounter = 0;
    std::vector<SoundEvent> heard;
    for (size_t k = 0; k < fixture.frameCount(); ++k) {
        const auto line = *fixture.timeline(k);
        const int32_t counter = *fixture.counter(k);
        const TimelineState& before = timeline.state();
        CHECK(before.counter == counter);
        CHECK(poseMatches(before, line.before, name.c_str(), counter));
        if (const auto logo = logoStepOf(doc, k)) CHECK(before.logoState == (*logo)[0] && before.logoValue == (*logo)[1] && before.logoStep == (*logo)[2]);
        const uint32_t disc = k == 0 ? options.disc.first : options.disc.later;
        CHECK(static_cast<int32_t>(disc) == line.discState);
        const TimelineStep step = timeline.step(disc);
        if (!poseMatches(timeline.state(), line.after, name.c_str(), counter)) return 1;
        CHECK(static_cast<uint32_t>(step.result) == line.result);
        CHECK(checkMatrices(fixture, k, step.matrices, name.c_str(), counter, matrixCompared));
        CHECK((line.fade ? static_cast<int32_t>(*line.fade) : -1) == step.fadeAlpha);
        CHECK(static_cast<int32_t>(line.blur.value_or(0)) == step.blurLevel);
        CHECK((line.logo ? static_cast<int32_t>(*line.logo) : -1) == step.logoAlpha);
        if (k == 0) timeline.sceneSetUp();
        heard.insert(heard.end(), step.sounds.begin(), step.sounds.end());
        if (step.result == 0) ++drawn;
        lastResult = step.result;
        lastCounter = counter;
        if (timeline.state().go && dive == 0) {
            dive = static_cast<size_t>(counter);
            diveZ = timeline.state().camera[2];
        }
        if (step.blurLevel > 0 && firstBlur[step.blurLevel] == 0) {
            firstBlur[step.blurLevel] = counter;
            if (step.blurLevel == 1) blurZ = timeline.state().camera[2];
        }
        if (step.fadeAlpha >= 0 && counter > 2) {
            if (firstFade == 0) firstFade = counter;
            lastFade = step.fadeAlpha;
        }
        if (step.logoAlpha >= 0) {
            ++logoDraws;
            if (logoDraws == 1) CHECK(counter == 51);
            const int32_t expected = static_cast<int32_t>(logoDraws <= 60 ? 4 * logoDraws : 4 * (120 - logoDraws));
            CHECK(step.logoValue == expected && step.logoAlpha == std::min(0x70, expected));
            lastLogo = counter;
        }
    }
    CHECK(drawn == 246 && lastResult == 1 && lastCounter == 247);
    CHECK(dive == 121 && std::fabs(diveZ - 20.9f) < 0.05f);
    CHECK(firstBlur[1] == 214 && std::fabs(blurZ - 68.6f) < 0.05f && firstBlur[2] == 226 && firstBlur[3] == 236);
    CHECK(firstFade == 218 && lastFade == 131);
    CHECK(logoDraws == 120 && lastLogo == 170);
    CHECK(heard.size() == 1 && heard[0] == (SoundEvent{0x6140, 1, 122}));

    const Run native = carried<Native>(&fixture, options, 247);
    size_t nativeDrawn = 0;
    for (const auto& step : native.steps) nativeDrawn += step.result == 0;
    CHECK(nativeDrawn == 246 && native.steps.back().result == 1);
    std::printf("%s: 247 calls carried, %zu drawn, matrices %zu compared, Native runs %zu drawn\n", name.c_str(), drawn, matrixCompared, nativeDrawn);
    return 0;
}

// (d): the hold set: stage 1 waits for z > 56, then the verified number of calls to the end.
int hold(const std::string& path, size_t calls) {
    const OpeningFixture fixture = OpeningFixture::load(path);
    const std::string name = fixture.capture();
    BootOptions options = optionsOf(fixture, 1);
    const uint32_t disc = static_cast<uint32_t>(fixture.timeline(1)->discState);
    Ee timeline(options, stateFrom(fixture, std::nullopt, 1));
    size_t made = 0;
    bool released = false;
    for (;; ++made) {
        const float zBefore = timeline.state().camera[2];
        const int32_t stageBefore = timeline.state().stage;
        const TimelineStep step = timeline.step(disc);
        if (made + 1 < fixture.frameCount() && fixture.timeline(made + 1)) CHECK(poseMatches(timeline.state(), fixture.timeline(made + 1)->after, name.c_str(), timeline.state().counter - 1));
        if (stageBefore == 1 && timeline.state().stage == 2 && !released) {
            released = true;
            CHECK(zBefore > 56.0f);
        }
        if (stageBefore == 1) CHECK((timeline.state().stage == 2) == (zBefore > 56.0f));
        if (step.result != 0) break;
        CHECK(made < 1000);
    }
    made += 2;
    CHECK(released);
    CHECK(made == fixture.frameCount() && fixture.timeline(fixture.frameCount() - 1)->result == 1);
    if (made + 1 != calls) std::fprintf(stderr, "%s: %zu calls to the end, the verified length is %zu\n", name.c_str(), made, calls);
    CHECK(made + 1 == calls);
    std::printf("%s: stage 1 held until z > 56, ended with the capture's last call, %zu calls (verified length %zu)\n", name.c_str(), made, calls);
    return 0;
}

}

int main(int argc, char** argv) {
    return scenetest::run(argc, argv, [](int count, char** arguments) {
        CHECK(count >= 2);
        const std::filesystem::path root = arguments[1];
        const auto path = [&](const char* capture) { return (root / ("hddosd-110U-" + std::string(capture)) / "opening.json").string(); };
        const auto present = [&](const char* capture) {
            if (std::filesystem::exists(path(capture))) return true;
            std::printf("MISSING capture, not checked: %s\n", capture);
            return false;
        };
        if (count >= 3)
            if (int failed = constants(arguments[2])) return failed;
        Totals totals;
        const bool debugSubset = count >= 3 && std::string(arguments[2]) == "--quick";
        for (const char* capture : {"opening-full", "opening3-intro", "opening3-disc65-b", "opening3-disc69", "opening3-disc71", "opening3-disc6a", "opening3-disc6b",
                                    "opening3-disc6c", "opening3-disc6d", "opening3-disc6e", "opening3-disc6f", "opening3-disc70", "opening3-disc73", "opening3-forced", "opening3-ready-a", "opening3-ready-b", "opening3-readymid"}) {
            if (!present(capture)) continue;
            if (int failed = isolated(path(capture), totals)) return failed;
            if (debugSubset && std::string(capture) == "opening3-intro") break;
        }
        std::printf("isolated: %zu calls equal, %zu matrix blocks, %zu sound commands\n", totals.calls, totals.matrices, totals.sounds);
        if (present("opening-full"))
            if (int failed = whole(path("opening-full"))) return failed;
        struct Hold { const char* capture; size_t calls; };
        for (const Hold& h : {Hold{"opening3-disc65-b", 135}, Hold{"opening3-disc69", 173}, Hold{"opening3-disc71", 166}})
            if (present(h.capture))
                if (int failed = hold(path(h.capture), h.calls)) return failed;
        std::printf("TimelineTest passed\n");
        return 0;
    });
}
