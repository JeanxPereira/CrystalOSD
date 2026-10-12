#include "Audio/spu2/Envelope.hpp"

#include <algorithm>

namespace audio::spu2 {

namespace {

constexpr int32_t kTop = 0x7FFF;
constexpr uint32_t kCounterFull = 0x8000;

struct Ramp {
    int shift = 0;
    int step = 0;
    bool exponential = false;
    bool decrease = false;
};

int field(uint32_t reg, int low, int width) { return int((reg >> low) & ((1u << width) - 1)); }

int signedStep(int code, bool decrease) { return decrease ? code - 8 : 7 - code; }

// psx-spx "Envelope Operation": a wait of 1 << max(0, shift - 11) cycles is kept as a counter filling to 0x8000.
int32_t rampDelta(uint32_t& counter, int32_t magnitude, const Ramp& ramp) {
    int slowdown = std::max(0, ramp.shift - 11);
    if (ramp.exponential && !ramp.decrease && magnitude > 0x6000) slowdown += 2;
    counter += std::max<uint32_t>(1, kCounterFull >> slowdown);
    if (counter < kCounterFull) return 0;
    counter = 0;
    int32_t delta = ramp.step * (1 << std::max(0, 11 - ramp.shift));
    if (ramp.exponential && ramp.decrease) delta = delta * magnitude >> 15;
    return delta;
}

Ramp attackRamp(uint16_t reg1) { return {field(reg1, 10, 5), signedStep(field(reg1, 8, 2), false), bool(reg1 >> 15), false}; }

Ramp decayRamp(uint16_t reg1) { return {field(reg1, 4, 4), -8, true, true}; }

Ramp sustainRamp(uint16_t reg2) {
    const bool decrease = (reg2 >> 14) & 1;
    return {field(reg2, 8, 5), signedStep(field(reg2, 6, 2), decrease), bool(reg2 >> 15), decrease};
}

Ramp releaseRamp(uint16_t reg2) { return {field(reg2, 0, 5), -8, bool((reg2 >> 5) & 1), true}; }

}

void Envelope::keyOn() {
    phase = Phase::Attack;
    level = 0;
    counter = 0;
}

void Envelope::keyOff() {
    if (phase == Phase::Off) return;
    phase = Phase::Release;
    counter = 0;
}

bool Envelope::step() {
    switch (phase) {
    case Phase::Off:
        return false;
    case Phase::Attack:
        level = std::min(kTop, level + rampDelta(counter, level, attackRamp(reg1)));
        if (level == kTop) phase = Phase::Decay;
        break;
    case Phase::Decay:
        level = std::max(0, level + rampDelta(counter, level, decayRamp(reg1)));
        if (level <= ((field(reg1, 0, 4) + 1) << 11)) phase = Phase::Sustain;
        break;
    case Phase::Sustain:
        level = std::clamp(level + rampDelta(counter, level, sustainRamp(reg2)), 0, kTop);
        break;
    case Phase::Release:
        level = std::max(0, level + rampDelta(counter, level, releaseRamp(reg2)));
        break;
    }
    if ((phase == Phase::Sustain || phase == Phase::Release) && level == 0) phase = Phase::Off;
    return phase != Phase::Off;
}

bool Envelope::step(uint16_t adsr1, uint16_t adsr2) {
    reg1 = adsr1;
    reg2 = adsr2;
    return step();
}

void VolumeSweep::write(uint16_t value) {
    reg = value;
    if (!(value & 0x8000)) level = int16_t(uint16_t(value << 1));
}

void VolumeSweep::step() {
    if (!(reg & 0x8000)) return;
    const bool decrease = (reg >> 13) & 1;
    const int32_t sign = (reg >> 12) & 1 ? -1 : 1;
    const Ramp ramp{field(reg, 2, 5), signedStep(field(reg, 0, 2), decrease), bool((reg >> 14) & 1), decrease};
    const int32_t magnitude = sign * level;
    level = sign * std::clamp(magnitude + rampDelta(counter, magnitude, ramp), 0, kTop);
}

void VolumeSweep::step(uint16_t value) {
    write(value);
    step();
}

}
