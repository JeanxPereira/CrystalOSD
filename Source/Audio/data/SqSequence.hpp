#pragma once
#include <array>
#include <cstdint>
#include <vector>

#include "Assets/Bytes.hpp"

namespace audio::data {

struct SqChannel {
    uint8_t channel = 0, program = 0, volume = 0, pan = 0;
};

struct SqEvent {
    uint32_t tick = 0;
    uint8_t status = 0, data1 = 0, data2 = 0;
    bool hasData2 = false;
    uint32_t tempo = 0;
};

struct SqSequence {
    uint16_t volume = 0, resolution = 0;
    uint32_t tempo = 0;
    std::vector<SqChannel> channels;
    std::vector<SqEvent> events;
    static SqSequence parse(assets::View data);
};

}
