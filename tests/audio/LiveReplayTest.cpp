#include <algorithm>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <string>
#include <vector>

#include <SDL3/SDL.h>

#include "../Check.hpp"
#include "Audio/LiveAudio.hpp"

namespace {

constexpr uint32_t kFrames = 60;

std::vector<int16_t> live(const audio::ClockSoundSources& sources, const std::filesystem::path& log, uint32_t menuFrame, uint32_t a2) {
    audio::LiveAudioOptions options;
    options.device = false;
    options.commandLog = log;
    audio::LiveAudio audio(sources, options);
    std::vector<int16_t> out;
    for (uint32_t frame = 0; frame < kFrames; ++frame) {
        if (frame == 0) audio.queue({0x6150, 1, 0, 0});
        if (frame == 2) {
            audio.queue({0x6150, 6, 0, 0xF});
            audio.queue({0x6140, 2, 0, 0}, true, true);
        }
        if (frame == menuFrame) audio.queue({0x6300, 1, uint16_t(a2), 0});
        audio.drain();
        audio.step();
        out.insert(out.end(), audio.lastFrame().begin(), audio.lastFrame().end());
    }
    audio.finish();
    return out;
}

std::vector<int16_t> replay(const audio::ClockSoundSources& sources, const std::filesystem::path& log) {
    std::ifstream in(log);
    std::string word, video;
    uint64_t total = 0, preroll = 0;
    in >> word >> total >> word >> video >> word >> preroll;
    audio::ClockSoundOptions options;
    options.video = video == "pal" ? audio::Video::Pal : audio::Video::Ntsc;
    options.modelledWrites = true;
    options.preRollSamples = preroll;
    audio::ClockSound sound(sources, options);
    for (uint64_t sample = 0, frame = 0; in >> sample >> frame;) {
        audio::DriverCommand c;
        c.sample = sample;
        c.frame = uint32_t(frame);
        in >> std::hex >> c.id >> std::dec;
        for (uint32_t& w : c.words) in >> w;
        sound.queue(c);
    }
    std::vector<int16_t> samples(2 * total);
    sound.render(samples.data(), total);
    return samples;
}

}

int main(int argc, char** argv) {
    if (argc >= 3 && std::string(argv[1]) == "skip") {
        std::printf("SKIPPED: %s\n", argv[2]);
        return 77;
    }
    if (argc < 3) return 2;
    SDL_SetHint(SDL_HINT_AUDIO_DRIVER, "dummy");
    const audio::ClockSoundSources sources = audio::clockSoundSources(std::filesystem::path(argv[1]));
    const std::filesystem::path scratch = argv[2];
    std::filesystem::create_directories(scratch);
    const std::filesystem::path log = scratch / "live-replay.commands.txt";

    const std::vector<int16_t> bare = live(sources, log, UINT32_MAX, 0);
    bool audible = false;
    for (uint32_t frame : {5u, 7u, 13u, 27u}) {
        for (uint32_t a2 = 1; a2 <= 12; ++a2) {
            const std::vector<int16_t> out = live(sources, log, frame, a2);
            const std::vector<int16_t> again = replay(sources, log);
            if (out != again) {
                std::fprintf(stderr, "%s:%d: live and replay differ (frame %u, a2 %u)\n", __FILE__, __LINE__, frame, a2);
                return 1;
            }
            if (out != bare) audible = true;
        }
    }
    CHECK(audible);
    std::printf("live and replay agree with a 0x6300 sharing a sample with a ramp entry\n");
    return 0;
}
