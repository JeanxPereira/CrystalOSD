#include "App/HostInputs.hpp"

#include <stdexcept>
#include <string>

#include "App/SettingsStore.hpp"
#include "Scene/ClockDate.hpp"

namespace app {

namespace {

// HDD OSD 1.10U 0x203A20 config_set_default_main: language field 0 reads as 1, aspect 0, summer 0, 24 hour, date format 0.
constexpr int kDefaultLanguage = 1;
constexpr int kDefaultAspect = 0;
constexpr int kDefaultDateFormat = 0;
constexpr int kDefaultTimeFormat = 0;

constexpr uint32_t kNoDisc = 0x64;
constexpr uint32_t kScreenWidth = 640;
constexpr uint32_t kScreenHeightNtsc = 0xE0;
constexpr uint32_t kScreenHeightPal = 0x100;

int checked(const char* key, int value, Range range, const char* origin) {
    if (value < range.low || value > range.high)
        throw std::runtime_error(std::string(origin) + ": " + key + " " + std::to_string(value) + " is outside " + std::to_string(range.low) + ".." + std::to_string(range.high));
    return value;
}

}

scene::ColdInputs hostInputs(const HostOptions& options, std::chrono::system_clock::time_point now, const std::filesystem::path& settings, const std::chrono::time_zone& zone) {
    return hostInputs(options, now, readStored(settings), zone);
}

scene::ColdInputs hostInputs(const HostOptions& options, std::chrono::system_clock::time_point now, const StoredSettings& stored, const std::chrono::time_zone& zone) {
    scene::ColdInputs out;
    out.language = kDefaultLanguage;
    out.aspect = kDefaultAspect;
    out.dateFormat = kDefaultDateFormat;
    out.timeFormat = kDefaultTimeFormat;
    out.summerTime = false;
    out.pal = options.pal;
    out.screenWidth = kScreenWidth;
    out.screenHeight = options.pal ? kScreenHeightPal : kScreenHeightNtsc;
    out.randState = 1;
    out.wide = false;
    out.screenCode = kNoDisc;

    if (stored.language) out.language = *stored.language;
    if (stored.aspect) out.aspect = *stored.aspect;
    if (stored.timeZone) out.timeZone = *stored.timeZone;
    if (stored.summerTime) out.summerTime = *stored.summerTime;
    if (stored.dateFormat) out.dateFormat = *stored.dateFormat;
    if (stored.timeFormat) out.timeFormat = *stored.timeFormat;
    out.clockOffset = stored.clockOffset;
    if (options.language) out.language = checked("language", *options.language, kLanguage, "--language");
    if (options.aspect) out.aspect = checked("aspect", *options.aspect, kAspect, "--aspect");
    const std::chrono::sys_info info = zone.get_info(now);
    if (!stored.timeZone) {
        const auto offset = std::chrono::duration_cast<std::chrono::minutes>(info.offset - info.save);
        out.timeZone = checked("timeZone", static_cast<int>(offset.count()), kTimeZone, "host time zone");
    }
    if (!stored.summerTime) out.summerTime = info.save != std::chrono::minutes::zero();

    const auto rtcAt = [&](int64_t offset) {
        const auto console = std::chrono::floor<std::chrono::seconds>(now) + std::chrono::seconds(offset) + std::chrono::minutes(scene::kBaseZone);
        const auto day = std::chrono::floor<std::chrono::days>(console);
        const std::chrono::year_month_day date{day};
        const std::chrono::hh_mm_ss time{console - day};
        return scene::RtcTime{static_cast<int32_t>(date.year()), static_cast<int32_t>(static_cast<unsigned>(date.month())), static_cast<int32_t>(static_cast<unsigned>(date.day())),
                              static_cast<int32_t>(time.hours().count()), static_cast<int32_t>(time.minutes().count()), static_cast<int32_t>(time.seconds().count())};
    };
    out.rtc = rtcAt(out.clockOffset.value_or(0));
    if (out.clockOffset && (out.rtc.year < 2000 || out.rtc.year > 2099)) {
        out.clockOffset.reset();
        out.rtc = rtcAt(0);
    }
    return out;
}

}
