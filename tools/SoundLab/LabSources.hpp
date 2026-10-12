#pragma once
#include <filesystem>
#include <fstream>
#include <stdexcept>
#include <string>

#include "Audio/ClockSound.hpp"
#include "Audio/data/SndImage.hpp"
#include "Audio/driver/Memory.hpp"

namespace audio::lab {

inline ClockSoundSources labSources(const std::filesystem::path& captures, const std::filesystem::path& dumps, const std::filesystem::path& renderDir, const std::string& name) {
    ClockSoundSources sources;
    sources.snapshot = driver::loadSnapshot(captures / "hddosd-110U-sound-boot-b");
    sources.libsd = assets::readFile(captures / "hddosd-110U-sound-libsd.bin");
    sources.spuRam = data::SndImage::fromFolder(dumps).spuRam();
    std::ifstream meta(renderDir / (name + ".render.meta.txt"));
    uint64_t cycle = 0, samples = 0, frames = 0, originClocks = 0;
    meta >> cycle >> samples >> frames >> originClocks;
    if (samples == 0) throw std::runtime_error("the render meta file holds no sample count");
    sources.spuTicks = uint32_t(originClocks / 768);
    return sources;
}

}
