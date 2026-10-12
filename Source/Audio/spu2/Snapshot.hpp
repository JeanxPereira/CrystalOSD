#pragma once
#include <filesystem>
#include <string>

#include <nlohmann/json.hpp>

#include "Assets/Bytes.hpp"

namespace audio::spu2 {

inline constexpr uint32_t kBase = 0x1F900000, kRamBytes = 0x200000, kRegBytes = 0x10000;

struct Snapshot {
    assets::Bytes ram, regs;
    nlohmann::json state;
    static Snapshot load(const std::filesystem::path& captures, const std::string& name, const std::string& which);
};

}
