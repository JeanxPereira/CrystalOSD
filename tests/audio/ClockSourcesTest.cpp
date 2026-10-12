#include <cstdio>
#include <filesystem>
#include <string>
#include <vector>

#include "../Check.hpp"
#include "Audio/ClockSound.hpp"
#include "Scene/Sound.hpp"

namespace {

void startClockThread(audio::ClockSound& sound) {
    sound.queue({.sample = 0, .id = 0x6150, .words = {1, 0, 0, 0, 0}});
    sound.queue({.sample = scene::kClockInitFrames * 4004 / 5, .id = 0x6140, .words = {2, 0x06DC, 0x06D8, 0, 0}});
}

std::vector<int16_t> render(audio::ClockSound& sound, size_t frames) {
    startClockThread(sound);
    std::vector<int16_t> out(2 * frames);
    for (size_t at = 0; at < frames; at += 1000) sound.render(out.data() + 2 * at, std::min<size_t>(1000, frames - at));
    return out;
}

}

int main(int argc, char** argv) {
    if (argc >= 3 && std::string(argv[1]) == "skip") {
        std::printf("SKIPPED: %s\n", argv[2]);
        return 77;
    }
    if (argc < 3) return 2;
    const std::filesystem::path dumps = argv[1], captures = argv[2];
    constexpr size_t kFrames = 96000;

    audio::ClockSoundSources derived = audio::clockSoundSources(dumps);
    derived.spuTicks = 4003;
    audio::ClockSoundSources captured = audio::clockSoundSources(dumps);
    captured.snapshot = audio::driver::loadSnapshot(captures / "hddosd-110U-sound-boot-b");
    captured.libsd = assets::readFile(captures / "hddosd-110U-sound-libsd.bin");
    captured.spuTicks = 4003;

    audio::ClockSound fromFiles(derived);
    audio::ClockSound fromCapture(captured);
    const std::vector<int16_t> a = render(fromFiles, kFrames), b = render(fromCapture, kFrames);
    CHECK(a == b);
    bool sounding = false;
    for (int16_t v : a) sounding |= v != 0;
    CHECK(sounding);

    audio::ClockSound byPath(dumps);
    const std::vector<int16_t> c = render(byPath, kFrames);
    audio::ClockSoundSources plain = audio::clockSoundSources(dumps);
    audio::ClockSound bySources(plain);
    CHECK(c == render(bySources, kFrames));
    std::printf("clock sources: %zu frames from the console's files equal the render from the capture's start snapshot, and the path constructor equals its sources\n", kFrames);
    return 0;
}
