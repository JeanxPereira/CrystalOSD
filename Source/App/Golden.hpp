#pragma once
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <optional>
#include <span>
#include <string>
#include <vector>

#include "Scene/Frame.hpp"

namespace app {

uint64_t hashBytes(std::span<const uint8_t> bytes, uint64_t seed = 0xcbf29ce484222325ull);
uint64_t hashFrame(const scene::Frame& frame);

struct GoldenLine {
    uint64_t frame = 0;
    std::string phase, screen;
    uint64_t scene = 0, pixels = 0, sound = 0;
};

std::string formatLine(const GoldenLine& line);
std::optional<GoldenLine> parseLine(const std::string& text);

class GoldenWriter {
public:
    explicit GoldenWriter(std::filesystem::path path);
    void add(const GoldenLine& line);

private:
    std::ofstream m_out;
};

class GoldenChecker {
public:
    explicit GoldenChecker(std::filesystem::path path);
    bool check(const GoldenLine& line);
    const std::string& report() const { return m_report; }
    uint64_t compared() const { return m_compared; }
    uint64_t size() const { return m_lines.size(); }

private:
    std::vector<GoldenLine> m_lines;
    std::string m_report;
    uint64_t m_compared = 0;
};

}
