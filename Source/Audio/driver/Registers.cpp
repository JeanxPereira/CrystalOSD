#include "Audio/driver/Registers.hpp"

namespace audio::driver {

void Registers::write(uint32_t address, int64_t value) {
    const uint16_t v = uint16_t(value);
    values[address] = v;
    log.push_back({frame, 0, address, v});
}

uint16_t Registers::read(uint32_t address) const {
    const auto it = values.find(address);
    return it == values.end() ? uint16_t(0) : it->second;
}

}
