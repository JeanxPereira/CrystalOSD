#pragma once
#include <array>
#include <cstdint>
#include <filesystem>
#include <map>
#include <string>
#include <string_view>

#include "Assets/Bytes.hpp"

namespace audio::data {

inline constexpr std::array<std::string_view, 12> kSoundMembers{"SNDBOOTH", "SNDBOOTB", "SNDBOOTS", "SNDTNNLS", "SNDCLOKS", "SNDTM30S", "SNDTM60S", "SNDOSDDH", "SNDOSDDB", "SNDLOGOS", "SNDWARNS", "SNDRCLKS"};
inline constexpr uint32_t kSpuRamSize = 0x200000, kBootBodyAt = 0x5010, kOsddBodyAt = 0x85010;

class SndImage {
public:
    static SndImage fromContainer(assets::View container);
    static SndImage fromFolder(const std::filesystem::path& folder);
    const assets::Bytes& member(std::string_view name) const;
    assets::Bytes spuRam() const;

private:
    std::map<std::string, assets::Bytes, std::less<>> m_members;
};

}
