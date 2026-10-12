#pragma once
#include <array>
#include <filesystem>
#include <string_view>

#include "Assets/Bytes.hpp"
#include "Audio/data/SndImage.hpp"
#include "Audio/driver/Memory.hpp"

namespace audio::driver {

inline constexpr int64_t kLibsdModuleBase = 0x8b830;
inline constexpr size_t kLibsdImageSize = 0x10130;
inline constexpr size_t kSoundIopSize = 0xf000;
inline constexpr int64_t kStagingBase = 0xebc00;

struct SoundImages {
    Snapshot snapshot;
    assets::Bytes libsd;
    assets::Bytes spuRam;
};

struct StagedMember {
    std::string_view name;
    int64_t address;
};

inline constexpr std::array<StagedMember, 10> kStagedMembers{{
    {"SNDBOOTH", 0xebc00}, {"SNDBOOTS", 0xecc00}, {"SNDTNNLS", 0xedc00}, {"SNDCLOKS", 0xeec00}, {"SNDLOGOS", 0xefc00},
    {"SNDTM60S", 0xf0c00}, {"SNDOSDDH", 0xf1c00}, {"SNDTM30S", 0xf2c00}, {"SNDWARNS", 0xf3c00}, {"SNDRCLKS", 0xf4c00},
}};

SoundImages buildSoundImages(assets::View program, const data::SndImage& sound);
SoundImages buildSoundImages(const std::filesystem::path& resources);

}
