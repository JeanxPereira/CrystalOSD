#pragma once
#include <cstdint>

namespace scene {

// The clock's ramp record (References/model/clock_math.mjs tickRamp; facts/clock-state.md).
struct Ramp {
    int32_t length = 0;
    int32_t counter = 0;
    int32_t changed = 0;
    int32_t state = 0;
    bool operator==(const Ramp&) const = default;
};

inline void tickRamp(Ramp& ramp) {
    ramp.changed = 0;
    if (ramp.state == 1) {
        ramp.counter += 1;
        if (ramp.counter == ramp.length) { ramp.changed = 1; ramp.state = 2; }
    } else if (ramp.state == 3) {
        ramp.counter -= 1;
        if (ramp.counter == 0) { ramp.changed = 1; ramp.state = 0; }
    }
}

}
