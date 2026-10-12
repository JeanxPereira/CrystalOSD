#pragma once
#include <cstdint>

#include "Scene/opening/Types.hpp"

namespace scene::opening {

struct HandOffInputs {
    uint32_t snapshot = 0;
    bool clockForced = false, hddReady = false;
    int32_t hddExec = 0;
    int32_t cdda = 0;
};

HandOff decide(const HandOffInputs&);

constexpr int32_t kFramesToClock = 34;

}
