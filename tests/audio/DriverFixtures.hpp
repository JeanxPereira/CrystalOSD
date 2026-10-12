#pragma once
#include <array>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <string>
#include <vector>

#include "Assets/Bytes.hpp"

namespace driverfix {

struct Event {
    uint32_t kind = 0;
    uint32_t frame = 0;
    uint32_t id = 0;
    std::array<uint32_t, 5> words{};
};

struct Row {
    uint32_t frame = 0;
    uint32_t id = 0;
    uint32_t address = 0;
    uint16_t value = 0;
};

struct Fill {
    uint32_t id = 0;
    uint32_t core = 0;
    uint32_t start = 0;
    uint32_t bytes = 0;
    uint32_t transferred = 0;
    bool operator==(const Fill&) const = default;
};

struct Scenario {
    std::string name;
    std::string templateStem;
    bool warm = false;
    std::vector<Event> events;
    std::vector<std::array<uint16_t, 24>> tickEnvx;
    std::array<std::vector<uint16_t>, 24> allocation;
    std::vector<std::pair<uint32_t, uint16_t>> seed;
    std::vector<Row> model;
    std::vector<Fill> fills;
    std::vector<Row> observed;
};

inline Scenario load(const std::filesystem::path& dir, const std::string& name) {
    Scenario s;
    s.name = name;
    const auto read = [&](const char* suffix) { return assets::readFile(dir / (name + suffix)); };
    {
        const assets::Bytes b = read(".events.bin");
        for (size_t at = 0; at + 32 <= b.size(); at += 32) {
            Event e;
            e.kind = assets::le32(b, at);
            e.frame = assets::le32(b, at + 4);
            e.id = assets::le32(b, at + 8);
            for (size_t k = 0; k < 5; ++k) e.words[k] = assets::le32(b, at + 12 + 4 * k);
            s.events.push_back(e);
        }
    }
    {
        const assets::Bytes b = read(".tickenvx.bin");
        for (size_t at = 0; at + 96 <= b.size(); at += 96) {
            std::array<uint16_t, 24> g{};
            for (size_t v = 0; v < 24; ++v) g[v] = uint16_t(assets::le32(b, at + 4 * v));
            s.tickEnvx.push_back(g);
        }
    }
    {
        const assets::Bytes b = read(".allocenvx.bin");
        for (size_t at = 0; at + 8 <= b.size(); at += 8) s.allocation.at(assets::le32(b, at)).push_back(uint16_t(assets::le32(b, at + 4)));
    }
    {
        const assets::Bytes b = read(".seed.bin");
        for (size_t at = 0; at + 8 <= b.size(); at += 8) s.seed.push_back({assets::le32(b, at), uint16_t(assets::le32(b, at + 4))});
    }
    {
        const assets::Bytes b = read(".fills.bin");
        for (size_t at = 0; at + 20 <= b.size(); at += 20)
            s.fills.push_back({assets::le32(b, at), assets::le32(b, at + 4), assets::le32(b, at + 8), assets::le32(b, at + 12), assets::le32(b, at + 16)});
    }
    const auto rows = [&](const char* suffix, std::vector<Row>& out) {
        const assets::Bytes b = read(suffix);
        for (size_t at = 0; at + 16 <= b.size(); at += 16) {
            Row r;
            r.frame = assets::le32(b, at);
            r.id = assets::le32(b, at + 4);
            r.address = assets::le32(b, at + 8);
            r.value = uint16_t(assets::le32(b, at + 12));
            out.push_back(r);
        }
    };
    rows(".model.bin", s.model);
    rows(".observed.bin", s.observed);
    {
        std::ifstream in(dir / (name + ".template.txt"));
        std::string mode;
        in >> s.templateStem >> mode;
        s.warm = mode == "warm";
    }
    return s;
}

}
