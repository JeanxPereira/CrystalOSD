#pragma once
#include <array>
#include <cstdint>
#include <filesystem>
#include <optional>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "Scene/opening/Types.hpp"

namespace openingtest {

using Bytes = std::vector<uint8_t>;

// One probe record of tools/scene/export_opening.mjs: k is the index in the group's table, mem[i] the bytes of
// the table's range i (empty when it was not readable). Floats are bit patterns.
struct Probe {
    int32_t k = 0;
    uint32_t pc = 0;
    uint32_t v0 = 0, a0 = 0, a1 = 0, a2 = 0, a3 = 0, s0 = 0;
    std::optional<uint32_t> fpr0;
    std::vector<Bytes> mem;
};

struct Pose {
    int32_t stage = 0, go = 0, pending = 0;
    std::array<uint32_t, 3> camera{};
    std::array<uint32_t, 2> up{};
    uint32_t roll = 0;
    std::array<uint32_t, 15> block{};
};

struct Timeline {
    Pose before, after;
    int32_t scene = 0, snapshot = 0, discState = 0;
    std::array<int32_t, 8> thresholds{};
    std::optional<bool> forcedClock;
    std::optional<std::string> matricesHex;
    uint32_t result = 0;
    std::optional<uint32_t> fade, blur, logo;
};

struct Fog {
    std::array<uint32_t, 6> offsets{};
    Probe record;
};

struct Lights {
    int32_t phase = 0, head = 0, tail = 0;
    std::vector<Probe> records;
    std::vector<uint32_t> cosines, sines;
};

struct Externals {
    std::optional<int32_t> firstCounter, phase;
    std::vector<std::array<int32_t, 2>> discAtCounter;
    std::optional<scene::opening::History> history;
    std::optional<std::string> emptyName;
    std::optional<bool> clockForced;
    std::optional<int32_t> hddReady, hddExec;
};

// opening.json of one capture. Block accessors return nothing when the capture has no probe for the block.
class OpeningFixture {
public:
    static OpeningFixture load(const std::filesystem::path& path);

    const std::string& capture() const { return m_capture; }
    const Externals& externals() const { return m_externals; }
    size_t frameCount() const { return m_frames.size(); }
    int32_t index(size_t k) const { return m_frames.at(k).at("index").get<int32_t>(); }
    std::optional<int32_t> counter(size_t k) const;

    std::optional<Timeline> timeline(size_t k) const;
    std::optional<Fog> fog(size_t k) const;
    std::optional<Lights> lights(size_t k) const;
    // The records of a group block (cubes, overlays, flat, inputs, towers, handoff, stages3) of frame k.
    std::vector<Probe> records(size_t k, const std::string& group) const;
    // The group's probe table: pc and range strings, as the verifier declares them.
    std::vector<std::pair<uint32_t, std::vector<std::string>>> table(const std::string& group) const;

private:
    std::string m_capture;
    Externals m_externals;
    nlohmann::json m_probes;
    std::vector<nlohmann::json> m_frames;
};

Bytes fromHex(const std::string& text);

}
