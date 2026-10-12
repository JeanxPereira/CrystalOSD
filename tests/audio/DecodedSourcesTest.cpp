#include <cstdio>
#include <filesystem>
#include <string>
#include <vector>

#include "../Check.hpp"
#include "Assets/Resources.hpp"
#include "Audio/ClockSound.hpp"
#include "Scene/Sound.hpp"

namespace {

void startClockThread(audio::ClockSound& sound) {
    sound.queue({.sample = 0, .id = 0x6150, .words = {1, 0, 0, 0, 0}});
    sound.queue({.sample = scene::kClockInitFrames * 4004 / 5, .id = 0x6140, .words = {2, 0x06DC, 0x06D8, 0, 0}});
}

std::vector<int16_t> render(audio::ClockSoundSources sources, size_t frames) {
    audio::ClockSound sound(std::move(sources));
    startClockThread(sound);
    std::vector<int16_t> out(2 * frames);
    for (size_t at = 0; at < frames; at += 1000) sound.render(out.data() + 2 * at, std::min<size_t>(1000, frames - at));
    return out;
}

}

int main(int argc, char** argv) {
    if (argc < 3) return 2;
    const std::filesystem::path dumps = argv[1], scratch = argv[2];
    if (!std::filesystem::is_regular_file(dumps / "SNDIMAGE")) {
        std::printf("SKIPPED: no SNDIMAGE in %s\n", dumps.string().c_str());
        return 77;
    }
    std::filesystem::create_directories(scratch);
    constexpr size_t kFrames = 48000;
    const std::vector<int16_t> fromFolder = render(audio::clockSoundSources(dumps), kFrames);
    bool sounding = false;
    for (int16_t v : fromFolder) sounding |= v != 0;
    CHECK(sounding);

    const assets::AssetSet decoded = assets::decodeFolder(dumps);
    CHECK(decoded.find("PROGRAM") && decoded.find("SNDIMAGE"));
    CHECK(render(audio::clockSoundSources(decoded), kFrames) == fromFolder);

    assets::AssetSet bare = decoded;
    std::erase_if(bare.assets, [](const assets::Asset& a) { return a.name == "SNDIMAGE"; });
    bool refused = false;
    try {
        audio::clockSoundSources(bare);
    } catch (const std::exception&) {
        refused = true;
    }
    CHECK(refused);
    std::printf("cache sources: %zu frames of the decoded set equal the render from the folder\n", kFrames);
    return 0;
}
