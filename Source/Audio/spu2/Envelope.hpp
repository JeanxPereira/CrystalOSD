#pragma once
#include <array>
#include <cstdint>

namespace audio::spu2 {

enum class Phase : uint8_t { Off, Attack, Decay, Sustain, Release };

struct Envelope {
    Phase phase = Phase::Off;
    int32_t level = 0;
    uint32_t counter = 0;
    uint16_t reg1 = 0;
    uint16_t reg2 = 0;

    void keyOn();
    void keyOff();
    bool step();
    bool step(uint16_t adsr1, uint16_t adsr2);
};

struct VolumeSweep {
    uint16_t reg = 0;
    int32_t level = 0;
    uint32_t counter = 0;

    void write(uint16_t value);
    void step();
    void step(uint16_t value);
};

}
