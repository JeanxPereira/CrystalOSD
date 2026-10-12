#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <memory>
#include <vector>

#include "../Check.hpp"
#include "LabSources.hpp"
#include "Audio/ClockSound.hpp"

namespace {

class Delay final : public audio::WriteTiming {
public:
    explicit Delay(uint64_t samples) : m_samples(samples) {}
    uint64_t sample(const audio::WriteContext& context) override {
        ++writes;
        if (context.tick) ++tickWrites;
        return context.eventSample + m_samples;
    }
    int writes = 0, tickWrites = 0;

private:
    uint64_t m_samples;
};

std::vector<int16_t> run(const audio::ClockSoundSources& sources, std::shared_ptr<audio::WriteTiming> timing, size_t frames) {
    audio::ClockSound sound(sources);
    if (timing) sound.setWriteTiming(timing);
    std::vector<int16_t> out(2 * frames);
    for (size_t at = 0; at < frames; at += 1000) sound.render(out.data() + 2 * at, std::min<size_t>(1000, frames - at));
    return out;
}

}

int main(int argc, char** argv) {
    if (argc < 5) {
        std::printf("SKIPPED: ClockSoundTest needs <captures> <render-dir> <name> <dumps>\n");
        return 77;
    }
    const audio::ClockSoundSources sources = audio::lab::labSources(argv[1], argv[4], argv[2], argv[3]);
    constexpr size_t kFrames = 48000;
    const std::vector<int16_t> a = run(sources, nullptr, kFrames), b = run(sources, nullptr, kFrames);
    CHECK(a == b);
    auto delay = std::make_shared<Delay>(0);
    const std::vector<int16_t> zero = run(sources, delay, kFrames);
    CHECK(zero == a);
    CHECK(delay->writes > 0);
    CHECK(delay->tickWrites <= delay->writes);
    auto late = std::make_shared<Delay>(9);
    const std::vector<int16_t> shifted = run(sources, late, kFrames);
    CHECK(late->writes == delay->writes);
    audio::ClockSound chunked(sources);
    std::vector<int16_t> one(2 * kFrames);
    chunked.render(one.data(), kFrames);
    CHECK(one == a);
    CHECK(chunked.position() == kFrames);
    bool differs = shifted != a;
    std::printf("clock sound: deterministic over %zu frames, chunking-independent, %d writes through the timing seam, a 9-sample delay %s the samples\n", kFrames, delay->writes,
                differs ? "changes" : "leaves");
    return 0;
}
