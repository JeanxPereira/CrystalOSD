#pragma once
#include <algorithm>
#include <array>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <stdexcept>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "FixtureReader.hpp"
#include "Audio/spu2/Snapshot.hpp"
#include "Audio/spu2/Spu2.hpp"

namespace audio::test {

inline constexpr std::array<const char*, 24> kFields{"c0.dry.l", "c0.dry.r", "c0.wet.l", "c0.wet.r", "c0.pre.l", "c0.pre.r", "c0.post.l", "c0.post.r", "c0.mix.l", "c0.mix.r",
    "c1.dry.l", "c1.dry.r", "c1.wet.l", "c1.wet.r", "c1.pre.l", "c1.pre.r", "c1.post.l", "c1.post.r", "c1.mix.l", "c1.mix.r", "c0.out.l", "c0.out.r", "out.l", "out.r"};

struct MissingFixture : std::runtime_error {
    using std::runtime_error::runtime_error;
};

struct StageDiff {
    uint64_t differ = 0;
    int64_t maxAbs = 0;
    int64_t firstSample = -1;
    int64_t lastSample = -1;
};

struct Replayed {
    std::array<StageDiff, 24> stages{};
    uint64_t samples = 0;
    uint64_t wavDiffer = 0;
    uint64_t wavSamples = 0;
    bool wavCompared = false;
    uint64_t ramDiffer = 0;
    bool ramCompared = false;
};

inline Replayed replay(const std::filesystem::path& captures, const std::filesystem::path& fixtures, const std::string& name) {
    spu2::Spu2 spu;
    spu.restore(spu2::Snapshot::load(captures, name, "start"));
    const std::filesystem::path history = fixtures / (name + ".start.history.bin");
    if (!std::filesystem::exists(history)) throw MissingFixture(history.string());
    spu.restoreHistory(assets::readFile(history));
    const WriteStream writes = readWrites(fixtures / (name + ".writes.bin"));
    const assets::Bytes stages = assets::readFile(captures / (name + ".stages.bin"));
    const std::filesystem::path wavPath = captures / (name + ".wav");
    assets::Bytes wav;
    if (std::filesystem::exists(wavPath)) wav = assets::readFile(wavPath);
    Replayed out;
    out.samples = stages.size() / 96;
    out.wavCompared = wav.size() >= 44;
    size_t w = 0;
    for (uint64_t s = 0; s < out.samples; ++s) {
        while (w < writes.size() && writes[w].sample <= s) {
            spu.write(writes[w].address, writes[w].value);
            ++w;
        }
        const spu2::StageSample got = spu.mix();
        for (size_t f = 0; f < 24; ++f) {
            const int32_t want = int32_t(assets::le32(stages, size_t(s) * 96 + 4 * f));
            const int64_t d = std::llabs(int64_t(got.field[f]) - want);
            if (d != 0) {
                if (out.stages[f].differ == 0) out.stages[f].firstSample = int64_t(s);
                out.stages[f].lastSample = int64_t(s);
                ++out.stages[f].differ;
                out.stages[f].maxAbs = std::max(out.stages[f].maxAbs, d);
            }
        }
        if (out.wavCompared && 44 + 4 * s + 4 <= wav.size()) {
            const int16_t wl = int16_t(wav[44 + 4 * s] | wav[45 + 4 * s] << 8), wr = int16_t(wav[46 + 4 * s] | wav[47 + 4 * s] << 8);
            if (spu.finalLeft() != wl || spu.finalRight() != wr) ++out.wavDiffer;
            ++out.wavSamples;
        }
    }
    const std::filesystem::path endRam = captures / (name + ".end.spuram.bin");
    if (std::filesystem::exists(endRam)) {
        const assets::Bytes want = assets::readFile(endRam);
        out.ramCompared = true;
        for (size_t i = 0; i + 1 < want.size(); i += 2)
            if (spu.ram()[i] != want[i] || spu.ram()[i + 1] != want[i + 1]) ++out.ramDiffer;
    }
    return out;
}

inline nlohmann::json toJson(const std::string& name, const Replayed& r) {
    nlohmann::json j;
    j["capture"] = name;
    j["history"] = true;
    for (size_t f = 0; f < 24; ++f) j["stages"][kFields[f]] = {{"differ", r.stages[f].differ}, {"maxAbs", r.stages[f].maxAbs}, {"first", r.stages[f].firstSample}, {"last", r.stages[f].lastSample}};
    j["wavDiffer"] = r.wavDiffer;
    j["ramDiffer"] = r.ramDiffer;
    return j;
}

inline int checkComplete(const Replayed& r) {
    int failures = 0;
    if (!r.wavCompared) {
        std::fprintf(stderr, "the capture WAV is missing or has no header, nothing was compared with it");
        std::fputc(10, stderr);
        ++failures;
    } else if (r.wavSamples != r.samples) {
        std::fprintf(stderr, "the capture WAV holds %llu samples, the stages %llu", (unsigned long long)r.wavSamples, (unsigned long long)r.samples);
        std::fputc(10, stderr);
        ++failures;
    }
    if (!r.ramCompared) {
        std::fprintf(stderr, "the capture end RAM is missing, nothing was compared with it");
        std::fputc(10, stderr);
        ++failures;
    }
    return failures;
}

inline int checkBudget(const std::filesystem::path& budgetFile, const Replayed& r, const std::vector<std::string>& owned) {
    std::ifstream in(budgetFile);
    if (!in) {
        std::fprintf(stderr, "no budget file %s\n", budgetFile.string().c_str());
        return 1;
    }
    const nlohmann::json budget = nlohmann::json::parse(in);
    int failures = 0;
    for (const std::string& field : owned) {
        for (size_t f = 0; f < 24; ++f) {
            if (field != kFields[f]) continue;
            const auto& b = budget.at("stages").at(field);
            const uint64_t differ = b.at("differ").get<uint64_t>();
            const int64_t maxAbs = b.at("maxAbs").get<int64_t>();
            const int64_t last = b.at("last").get<int64_t>();
            const int64_t first = b.at("first").get<int64_t>();
            if (r.stages[f].differ != differ || r.stages[f].maxAbs != maxAbs || r.stages[f].lastSample != last || r.stages[f].firstSample != first) {
                std::fprintf(stderr, "%s: %llu samples differ (max %lld, last %lld), budget %llu (max %lld, last %lld)\n", field.c_str(), (unsigned long long)r.stages[f].differ,
                    (long long)r.stages[f].maxAbs, (long long)r.stages[f].lastSample, (unsigned long long)differ, (long long)maxAbs, (long long)last);
                ++failures;
            }
        }
    }
    if (budget.contains("wavDiffer") && r.wavDiffer != budget.at("wavDiffer").get<uint64_t>()) {
        std::fprintf(stderr, "wav: %llu samples differ, budget %llu\n", (unsigned long long)r.wavDiffer, (unsigned long long)budget.at("wavDiffer").get<uint64_t>());
        ++failures;
    }
    if (budget.contains("ramDiffer") && r.ramDiffer != budget.at("ramDiffer").get<uint64_t>()) {
        std::fprintf(stderr, "ram: %llu words differ, budget %llu\n", (unsigned long long)r.ramDiffer, (unsigned long long)budget.at("ramDiffer").get<uint64_t>());
        ++failures;
    }
    return failures;
}

}
