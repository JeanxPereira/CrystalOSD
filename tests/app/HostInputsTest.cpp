#include <chrono>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <string>

#include "../Check.hpp"
#include "App/HostInputs.hpp"
#include "App/SettingsStore.hpp"

namespace {

using namespace std::chrono;

std::filesystem::path write(const std::string& name, const std::string& text) {
    const std::filesystem::path path = std::filesystem::temp_directory_path() / ("HostInputsTest-" + name + ".json");
    std::ofstream(path) << text;
    return path;
}

bool rejects(const app::HostOptions& options, const std::filesystem::path& path, const time_zone& zone) {
    try {
        app::hostInputs(options, sys_days{2024y / January / 1}, path, zone);
    } catch (const std::runtime_error&) {
        return true;
    }
    return false;
}

}

int main() {
    const time_zone& tokyo = *locate_zone("Asia/Tokyo");
    const time_zone& newYork = *locate_zone("America/New_York");
    const std::filesystem::path none = std::filesystem::temp_directory_path() / "HostInputsTest-absent.json";
    std::filesystem::remove(none);

    const auto at = sys_days{2024y / March / 1} + 12h + 30min + 45s;
    const scene::ColdInputs defaults = app::hostInputs({}, at, none, tokyo);
    CHECK(!defaults.pal && defaults.language == 1 && defaults.aspect == 0 && defaults.timeZone == 540 && !defaults.summerTime && defaults.dateFormat == 0 && defaults.timeFormat == 0);
    CHECK(defaults.randState == 1 && !defaults.wide && defaults.screenCode == 0x64);
    CHECK(defaults.screenWidth == 640 && defaults.screenHeight == 224);
    CHECK(defaults.rtc.year == 2024 && defaults.rtc.month == 3 && defaults.rtc.day == 1 && defaults.rtc.hour == 21 && defaults.rtc.minute == 30 && defaults.rtc.second == 45);

    const scene::ColdInputs pal = app::hostInputs({true, std::nullopt, std::nullopt}, at, none, tokyo);
    CHECK(pal.pal && pal.screenHeight == 256 && pal.screenWidth == 640);

    const scene::ColdInputs flags = app::hostInputs({false, 4, 2}, at, none, tokyo);
    CHECK(flags.language == 4 && flags.aspect == 2);

    const std::filesystem::path file = write("full", R"({"language":3,"aspect":1,"timeZone":-180,"summerTime":true,"dateFormat":2,"timeFormat":1})");
    const scene::ColdInputs set = app::hostInputs({}, at, file, newYork);
    CHECK(set.language == 3 && set.aspect == 1 && set.timeZone == -180 && set.summerTime && set.dateFormat == 2 && set.timeFormat == 1);
    const scene::ColdInputs overridden = app::hostInputs({false, 5, std::nullopt}, at, file, newYork);
    CHECK(overridden.language == 5 && overridden.aspect == 1);

    const std::filesystem::path partial = write("partial", R"({"summerTime":0})");
    const scene::ColdInputs half = app::hostInputs({}, at, partial, newYork);
    CHECK(half.language == 1 && !half.summerTime && half.timeZone == -300);

    CHECK(rejects({}, write("lang0", R"({"language":0})"), tokyo));
    CHECK(rejects({}, write("lang8", R"({"language":8})"), tokyo));
    CHECK(rejects({}, write("aspect3", R"({"aspect":3})"), tokyo));
    CHECK(rejects({}, write("zone", R"({"timeZone":1024})"), tokyo));
    CHECK(rejects({}, write("date", R"({"dateFormat":3})"), tokyo));
    CHECK(rejects({}, write("time", R"({"timeFormat":2})"), tokyo));
    CHECK(rejects({}, write("summer", R"({"summerTime":2})"), tokyo));
    CHECK(rejects({}, write("type", R"({"language":"en"})"), tokyo));
    CHECK(rejects({}, write("unknown", R"({"languages":1})"), tokyo));
    CHECK(rejects({}, write("broken", "{"), tokyo));
    CHECK(rejects({}, write("array", "[]"), tokyo));
    CHECK(rejects({false, 9, std::nullopt}, none, tokyo));
    CHECK(rejects({false, std::nullopt, 3}, none, tokyo));

    const auto before = sys_days{2024y / March / 10} + 6h + 59min + 59s;
    const scene::ColdInputs winter = app::hostInputs({}, before, none, newYork);
    const scene::ColdInputs summer = app::hostInputs({}, before + 1s, none, newYork);
    CHECK(winter.timeZone == -300 && summer.timeZone == -300 && !winter.summerTime && summer.summerTime);
    CHECK(winter.rtc.day == 10 && winter.rtc.hour == 15 && winter.rtc.minute == 59 && winter.rtc.second == 59);
    CHECK(summer.rtc.day == 10 && summer.rtc.hour == 16 && summer.rtc.minute == 0 && summer.rtc.second == 0);

    CHECK(defaults.timeZone == 540 && !defaults.summerTime);
    const scene::ColdInputs forcedSummer = app::hostInputs({}, before + 1s, write("zoneOnly", R"({"timeZone":60})"), newYork);
    CHECK(forcedSummer.timeZone == 60 && forcedSummer.summerTime);
    const scene::ColdInputs forcedZone = app::hostInputs({}, before + 1s, write("summerOnly", R"({"summerTime":false})"), newYork);
    CHECK(forcedZone.timeZone == -300 && !forcedZone.summerTime);

    const auto edge = sys_days{2023y / December / 31} + 15h + 0min + 0s;
    const scene::ColdInputs year = app::hostInputs({}, edge, none, tokyo);
    CHECK(year.rtc.year == 2024 && year.rtc.month == 1 && year.rtc.day == 1 && year.rtc.hour == 0);

    const std::filesystem::path stored = std::filesystem::temp_directory_path() / "HostInputsTest-store" / "settings.json";
    std::filesystem::remove_all(stored.parent_path());
    app::StoredSettings all;
    all.language = 3, all.aspect = 2, all.timeZone = -180, all.dateFormat = 1, all.timeFormat = 1, all.summerTime = true, all.clockOffset = -31536000;
    app::writeStored(stored, all);
    const app::StoredSettings back = app::readStored(stored);
    CHECK(back.language == all.language && back.aspect == all.aspect && back.timeZone == all.timeZone && back.dateFormat == all.dateFormat);
    CHECK(back.timeFormat == all.timeFormat && back.summerTime == all.summerTime && back.clockOffset == all.clockOffset);
    CHECK(!std::filesystem::exists(stored.string() + ".tmp"));
    app::StoredSettings onlyOffset;
    onlyOffset.clockOffset = 3600;
    app::writeStored(stored, onlyOffset);
    const app::StoredSettings sparse = app::readStored(stored);
    CHECK(!sparse.language && !sparse.summerTime && sparse.clockOffset == 3600);
    const scene::ColdInputs shifted = app::hostInputs({}, at, stored, tokyo);
    CHECK(shifted.clockOffset == 3600 && shifted.rtc.hour == 22 && shifted.rtc.minute == 30);
    CHECK(!app::readStored(none).clockOffset);
    CHECK(rejects({}, write("offsetText", R"({"clockOffset":"1"})"), tokyo));
    CHECK(rejects({}, write("offsetHuge", R"({"clockOffset":900000000000})"), tokyo));
    CHECK(rejects({}, write("offsetUnsigned", R"({"clockOffset":18446744073709551615})"), tokyo));
    CHECK(rejects({}, write("languageWrap", R"({"language":4294967297})"), tokyo));
    CHECK(rejects({}, write("languageUnsigned", R"({"language":18446744073709551615})"), tokyo));
    const scene::ColdInputs dropped = app::hostInputs({}, at, write("offsetYear", R"({"clockOffset":3000000000})"), tokyo);
    CHECK(!dropped.clockOffset && dropped.rtc.year == 2024 && dropped.rtc.hour == 21);
    const scene::ColdInputs kept = app::hostInputs({}, at, write("offsetKept", R"({"clockOffset":86400})"), tokyo);
    CHECK(kept.clockOffset == 86400 && kept.rtc.day == 2);
    const std::filesystem::path blocked = stored.parent_path() / "blocked.json";
    std::filesystem::create_directories(blocked / "inside");
    bool failed = false;
    try {
        app::writeStored(blocked, onlyOffset);
    } catch (const std::exception&) {
        failed = true;
    }
    CHECK(failed);
    for (const auto& entry : std::filesystem::directory_iterator(stored.parent_path())) CHECK(entry.path().extension() != ".tmp");
    CHECK(rejects({}, write("offsetKey", R"({"clockoffset":1})"), tokyo));

    std::printf("HostInputsTest: defaults, settings, flags, rejections, DST edge\n");
    return 0;
}
