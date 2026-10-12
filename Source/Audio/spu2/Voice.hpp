#pragma once
#include <array>
#include <cstdint>

#include "Audio/spu2/Envelope.hpp"

namespace audio::spu2 {

struct Voice {
    VolumeSweep left, right;
    Envelope envelope;
    uint16_t pitch = 0x3FFF;
    uint32_t startAddress = 0x2800;
    uint32_t loopAddress = 0x2800;
    uint32_t nextAddress = 0x2801;
    int32_t prev1 = 0, prev2 = 0;
    bool modulated = false;
    bool noise = false;
    int8_t loopMode = 0;
    int8_t loopFlags = 0;
    int32_t phase = 0;
    int32_t outX = 0;
    std::array<int32_t, 32> fifo{};
    uint32_t fifoWrite = 0, fifoRead = 0;
    std::array<int16_t, 28> block{};
    bool blockPending = false;
    int32_t dryL = -1, dryR = -1, wetL = -1, wetR = -1;
};

}
