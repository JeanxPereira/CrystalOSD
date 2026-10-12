#include "App/SettingsStore.hpp"

#include <process.h>

#include <cstdint>
#include <fstream>
#include <stdexcept>
#include <string>

#include <nlohmann/json.hpp>

namespace app {

namespace {

using nlohmann::json;

// An overflow guard for the date arithmetic only; the clock's year range decides what is accepted.
constexpr int64_t kOffsetGuard = 100LL * 366 * 86400;

int64_t wholeNumber(const json& v, const char* key) {
    if (!v.is_number_integer()) throw std::runtime_error(std::string("settings.json: ") + key + " is not an integer");
    if (v.is_number_unsigned() && v.get<uint64_t>() > uint64_t(INT64_MAX)) throw std::runtime_error(std::string("settings.json: ") + key + " is out of range");
    return v.get<int64_t>();
}

int integer(const json& j, const char* key, Range range) {
    const int64_t value = wholeNumber(j.at(key), key);
    if (value < range.low || value > range.high)
        throw std::runtime_error(std::string("settings.json: ") + key + " " + std::to_string(value) + " is outside " + std::to_string(range.low) + ".." + std::to_string(range.high));
    return static_cast<int>(value);
}

}

StoredSettings readStored(const std::filesystem::path& path) {
    StoredSettings out;
    std::ifstream in(path);
    if (!in.good()) return out;
    json j;
    try {
        j = json::parse(in);
    } catch (const json::exception& e) {
        throw std::runtime_error("settings.json: " + std::string(e.what()));
    }
    if (!j.is_object()) throw std::runtime_error("settings.json: not an object");
    for (const auto& [key, value] : j.items()) {
        (void)value;
        if (key != "language" && key != "aspect" && key != "timeZone" && key != "summerTime" && key != "dateFormat" && key != "timeFormat" && key != "clockOffset")
            throw std::runtime_error("settings.json: unknown key " + key);
    }
    if (j.contains("language")) out.language = integer(j, "language", kLanguage);
    if (j.contains("aspect")) out.aspect = integer(j, "aspect", kAspect);
    if (j.contains("timeZone")) out.timeZone = integer(j, "timeZone", kTimeZone);
    if (j.contains("summerTime")) {
        const json& v = j.at("summerTime");
        if (v.is_boolean()) out.summerTime = v.get<bool>();
        else if (v.is_number_integer() && (v.get<int>() == 0 || v.get<int>() == 1)) out.summerTime = v.get<int>() == 1;
        else throw std::runtime_error("settings.json: summerTime is not a boolean");
    }
    if (j.contains("dateFormat")) out.dateFormat = integer(j, "dateFormat", kDateFormat);
    if (j.contains("timeFormat")) out.timeFormat = integer(j, "timeFormat", kTimeFormat);
    if (j.contains("clockOffset")) {
        const int64_t value = wholeNumber(j.at("clockOffset"), "clockOffset");
        if (value < -kOffsetGuard || value > kOffsetGuard) throw std::runtime_error("settings.json: clockOffset " + std::to_string(value) + " is out of range");
        out.clockOffset = value;
    }
    return out;
}

void writeStored(const std::filesystem::path& path, const StoredSettings& settings) {
    json j = json::object();
    if (settings.language) j["language"] = *settings.language;
    if (settings.aspect) j["aspect"] = *settings.aspect;
    if (settings.timeZone) j["timeZone"] = *settings.timeZone;
    if (settings.summerTime) j["summerTime"] = *settings.summerTime;
    if (settings.dateFormat) j["dateFormat"] = *settings.dateFormat;
    if (settings.timeFormat) j["timeFormat"] = *settings.timeFormat;
    if (settings.clockOffset) j["clockOffset"] = *settings.clockOffset;
    if (path.has_parent_path()) std::filesystem::create_directories(path.parent_path());
    std::filesystem::path temporary = path;
    temporary += "." + std::to_string(_getpid()) + ".tmp";
    {
        std::ofstream out(temporary, std::ios::trunc);
        out << j.dump(2) << '\n';
        out.flush();
        if (!out.good()) {
            out.close();
            std::error_code ignored;
            std::filesystem::remove(temporary, ignored);
            throw std::runtime_error("settings.json: cannot write " + temporary.string());
        }
    }
    std::error_code error;
    std::filesystem::rename(temporary, path, error);
    if (error) {
        std::error_code ignored;
        std::filesystem::remove(temporary, ignored);
        throw std::runtime_error("settings.json: cannot replace " + path.string() + ": " + error.message());
    }
}

}
