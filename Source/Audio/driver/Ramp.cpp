#include "Audio/driver/State.hpp"

namespace audio::driver {

void Driver::State::ramp(const DriverCommand& command) {
    const int64_t core = s16(command.words[0]);
    const uint32_t a = u16(command.words[1]);
    const uint32_t b = u16(command.words[2]);
    if (command.id == 0x6120) {
        regs.write(reg::volume(core, reg::Mvoll), a);
        regs.write(reg::volume(core, reg::Mvolr), b);
    } else if (command.id == 0x60d0) {
        EffectAttr attr = getEffectAttr(core);
        attr.depthL = uint16_t(a);
        attr.depthR = uint16_t(b);
        attr.mode |= 0x100;
        setEffectAttr(attr);
    }
}

}
