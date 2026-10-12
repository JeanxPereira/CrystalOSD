#pragma once
#include <atomic>
#include <cstdint>
#include <cstdio>
#include <filesystem>
#include <format>
#include <fstream>
#include <mutex>
#include <string>
#include <string_view>

namespace core {

enum class Level { Error, Warn, Info, Debug };
enum class Subsystem { Boot, Opening, Clock, Menus, Audio, Assets, Render, App };

inline const char* levelName(Level level) {
    switch (level) {
    case Level::Error: return "error";
    case Level::Warn: return "warn";
    case Level::Info: return "info";
    case Level::Debug: return "debug";
    }
    return "";
}

inline const char* subsystemName(Subsystem subsystem) {
    switch (subsystem) {
    case Subsystem::Boot: return "boot";
    case Subsystem::Opening: return "opening";
    case Subsystem::Clock: return "clock";
    case Subsystem::Menus: return "menus";
    case Subsystem::Audio: return "audio";
    case Subsystem::Assets: return "assets";
    case Subsystem::Render: return "render";
    case Subsystem::App: return "app";
    }
    return "";
}

class Log {
public:
    static Log& get() {
        static Log log;
        return log;
    }

    void open(const std::filesystem::path& path) {
        std::lock_guard lock(m_mutex);
        m_file.open(path, std::ios::trunc);
    }

    void setFrame(uint64_t frame) { m_frame = frame; }

    void write(Level level, Subsystem subsystem, std::string_view message) {
        std::lock_guard lock(m_mutex);
        const std::string line = std::format("[f{} {} {}] {}", m_frame.load(), subsystemName(subsystem), levelName(level), message);
        if (level == Level::Error || level == Level::Warn) {
            std::fprintf(stderr, "%s\n", line.c_str());
            if (level == Level::Error) m_lastError = line;
        }
        if (m_file.is_open()) m_file << line << '\n' << std::flush;
    }

    std::string lastError() {
        std::lock_guard lock(m_mutex);
        return m_lastError;
    }

private:
    std::mutex m_mutex;
    std::ofstream m_file;
    std::atomic<uint64_t> m_frame{0};
    std::string m_lastError;
};

template <class... Args> void log(Level level, Subsystem subsystem, std::format_string<Args...> format, Args&&... args) {
    Log::get().write(level, subsystem, std::format(format, std::forward<Args>(args)...));
}

}
