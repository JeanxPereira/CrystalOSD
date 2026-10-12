#pragma once
#include <cstdint>
#include <optional>
#include <vector>

#include "Assets/Bytes.hpp"

namespace audio::data {

struct Tone {
    uint8_t keyLow = 0, keyHigh = 0, rootKey = 0;
    int8_t fineTune = 0;
    uint16_t sampleStart = 0, adsr1 = 0, adsr2 = 0;
    uint8_t pan = 0, bendRange = 0, flags = 0;
};

struct Program {
    uint8_t id = 0, head = 0, volume = 0, pan = 0;
    uint32_t offset = 0;
    std::vector<Tone> tones;
};

struct Effect {
    uint16_t left = 0, right = 0, pitch = 0, flagsA = 0, adsr1 = 0, adsr2 = 0, word12 = 0, word14 = 0;
    uint32_t bdOffset = 0;
};

struct HdBank {
    std::vector<Program> programs;
    std::vector<uint8_t> velocity;
    std::vector<Effect> effects;
    std::optional<uint32_t> effectTable;
    uint8_t effectMaster = 0;
    static HdBank parse(assets::View data);
    const Program* program(uint8_t id) const;
};

}
