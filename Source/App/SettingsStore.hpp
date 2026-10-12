#pragma once
#include <cstdint>
#include <filesystem>
#include <optional>

namespace app {

struct Range {
    int low, high;
};

// HDD OSD 1.10U config_get_osd_language 0x203DD8 (language 1 to 7), config_get_aspect_ratio 0x203D30 (0 to 2), config_set_timezone_offset
// 0x203F00 (11 bits), config_get_date_format 0x204048 (0 to 2), config_get_time_format 0x204008 (1 bit).
inline constexpr Range kLanguage{1, 7};
inline constexpr Range kAspect{0, 2};
inline constexpr Range kTimeZone{-1024, 1023};
inline constexpr Range kDateFormat{0, 2};
inline constexpr Range kTimeFormat{0, 1};

struct StoredSettings {
    std::optional<int> language, aspect, timeZone, dateFormat, timeFormat;
    std::optional<bool> summerTime;
    std::optional<int64_t> clockOffset;
};

StoredSettings readStored(const std::filesystem::path& path);
void writeStored(const std::filesystem::path& path, const StoredSettings& settings);

}
