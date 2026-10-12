#include "Scene/opening/Handoff.hpp"

namespace scene::opening {

namespace {

constexpr int32_t kOpeningModule = 1;

}

// facts/opening.md section 8, verify_opening3_handoff.mjs verify() and byDisc()
HandOff decide(const HandOffInputs& in) {
    if (in.clockForced && !in.hddReady && in.hddExec != 1) return {2, -1, true};

    HandOff out{kOpeningModule, -1, false};
    switch (in.snapshot) {
        case 0x6A:
        case 0x6B: out.executeAppType = 2; break;
        case 0x6C:
        case 0x6D: out.executeAppType = 1; break;
        case 0x6E: out.executeAppType = 0; break;
        case 0x6F: out.executeAppType = 5; break;
        case 0x70: out.executeAppType = 4; break;
        case 0x72: out.module = in.cdda > 0 ? 5 : 2; break;
        case 0x73: out.executeAppType = 3; break;
        case 0x74: out.module = 4; break;
        default: out.module = 2; break;
    }
    if (in.hddReady && in.hddExec == 1) out = {0, 6, true};
    if (out.executeAppType == -1) out.previousWasOpening = true;
    return out;
}

}
