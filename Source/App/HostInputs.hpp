#pragma once
#include <chrono>
#include <filesystem>
#include <optional>

#include "App/SettingsStore.hpp"
#include "Scene/ColdTypes.hpp"

namespace app {

struct HostOptions {
    bool pal = false;
    std::optional<int> language;
    std::optional<int> aspect;
};

scene::ColdInputs hostInputs(const HostOptions& options, std::chrono::system_clock::time_point now, const std::filesystem::path& settings, const std::chrono::time_zone& zone);

scene::ColdInputs hostInputs(const HostOptions& options, std::chrono::system_clock::time_point now, const StoredSettings& stored, const std::chrono::time_zone& zone);

}
