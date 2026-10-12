#pragma once
#include <cstdint>

#include "Scene/Ramp.hpp"

namespace scene {

struct ColdLengths {
    int32_t menuShort = 0, menuLong = 0, one = 0;
    Ramp vignette, grey, cube, menu, config, version, spriteFade, mainMenu;
    int32_t body = 0, tail = 0, vignetteLength = 0;
};

ColdLengths coldLengths(bool pal);

Ramp rampReset(Ramp ramp);
Ramp rampStart(Ramp ramp);
Ramp rampReverse(Ramp ramp);
Ramp rampSet(Ramp ramp, int32_t length);
bool rampIs(const Ramp& ramp, int32_t state);
int32_t rampScaled(const Ramp& ramp, int32_t scale);

}
