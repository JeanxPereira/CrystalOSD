#include "Scene/ColdRamps.hpp"

namespace scene {

Ramp rampReset(Ramp ramp) {
    ramp.counter = 0;
    ramp.changed = 0;
    ramp.state = 0;
    return ramp;
}

Ramp rampStart(Ramp ramp) {
    if (ramp.state == 0) {
        ramp.counter = 0;
        ramp.changed = 1;
        ramp.state = 1;
    }
    return ramp;
}

Ramp rampReverse(Ramp ramp) {
    if (ramp.state == 2) {
        ramp.counter = ramp.length;
        ramp.changed = 1;
        ramp.state = 3;
    }
    return ramp;
}

Ramp rampSet(Ramp ramp, int32_t length) {
    ramp.length = length;
    return ramp;
}

bool rampIs(const Ramp& ramp, int32_t state) {
    return ramp.state == state;
}

int32_t rampScaled(const Ramp& ramp, int32_t scale) {
    return ramp.counter * scale / ramp.length;
}

ColdLengths coldLengths(bool pal) {
    const int32_t fps = pal ? 50 : 60;
    ColdLengths out;
    out.menuShort = fps * 40 / 60;  // HDD OSD 1.10U 0x234B88 verify_cold_ramps.mjs
    out.menuLong = fps * 80 / 60;
    out.one = 1;
    out.vignetteLength = out.menuLong;
    out.vignette = rampReset(rampSet({}, out.menuLong));
    out.spriteFade = rampStart(rampReset(rampSet({}, fps * 256 / 60)));  // 0x238F20
    out.body = fps * 40 / 60;  // 0x2324C8
    out.tail = fps / 6;
    out.cube = rampSet({}, out.body);
    out.menu = rampSet({}, out.body + out.tail);
    out.config = rampSet({}, out.menuShort + out.body + out.tail);
    out.mainMenu = rampReset(rampSet({}, out.tail));
    out.version = rampSet({}, out.tail);  // 0x22A9C0
    out.grey = rampSet({}, out.menuShort);  // 0x232858
    return out;
}

}
