#include "Audio/driver/State.hpp"

namespace audio::driver {

namespace {

constexpr int64_t kBankTable = M(0x98d4);
constexpr int64_t kBusyMask = M(0x9184);
constexpr int64_t kPriorities = M(0x9188);
constexpr int kEffectVoices = 24;

int32_t effectPitch(uint32_t u) {
    const int32_t x = int32_t(uint32_t(44100u * u));
    const int32_t hi = int32_t((int64_t(x) * 0x057619f1) >> 32);
    return (hi >> 10) + (x < 0 ? 1 : 0);
}

}

void Driver::State::effect(const DriverCommand& command) {
    const int64_t bankIndex = s16(command.words[0]);
    const int32_t effect = s16(command.words[1]);
    const int64_t at = kBankTable + 12 * bankIndex;
    const int64_t hd = mem.u32(at);
    const int64_t bdBase = mem.u32(at + 4);
    const int64_t table = hd + mem.u32(hd + 0x2c);
    if (mem.u32(table + 4) < uint32_t(effect)) return;
    const int64_t record = table + 0x20 + (int64_t(effect) << 6);

    const auto priority = [&](int i) { return kPriorities + 4 * i; };
    int voice = -1;
    {
        int steal = -1;
        int free = -1;
        uint32_t released = 0;
        uint32_t lowest = 0x7fff;
        for (int i = 0; i < kEffectVoices; ++i) {
            const uint32_t e = feed.allocation(0, uint32_t(i)) & 0xffffu;
            if (((~mem.u32(kBusyMask)) >> i) & 1) free = i;
            if (e < lowest && mem.u32(priority(i)) == 0) {
                lowest = e;
                steal = i;
            }
            if (e < 2) {
                released |= uint32_t(1) << i;
                mem.write32(priority(i), 0);
            }
        }
        int chosen;
        if (free == -1) {
            if (steal == -1) return;
            mem.write32(priority(steal), 0);
            chosen = steal;
        } else {
            mem.write32(priority(free), 0);
            chosen = free;
        }
        mem.write32(kBusyMask, (mem.u32(kBusyMask) & ~released) | (uint32_t(1) << chosen));
        voice = chosen;
    }

    const uint32_t master = mem.u32(table);
    const uint32_t left = (uint32_t(mem.u16(record)) * master) >> 7;
    const uint32_t right = (uint32_t(mem.u16(record + 2)) * master) >> 7;
    const int32_t pitch = effectPitch(mem.u16(record + 4));
    const uint32_t address = (uint32_t(bdBase) << 3) + mem.u32(record + 0x10);
    const bool wet = (mem.u16(record + 0xe) & 0x80) != 0;
    const uint32_t bit = uint32_t(1) << voice;
    setParam(0, voice, reg::Voll, left);
    setParam(0, voice, reg::Volr, right);
    setParam(0, voice, reg::Pitch, pitch);
    setAddr(0, voice, address);
    setParam(0, voice, reg::Adsr1, mem.u16(record + 8));
    setParam(0, voice, reg::Adsr2, mem.u16(record + 10));
    setSwitch(0, reg::Vmixel0, getSwitch(0, reg::Vmixel0) | (wet ? bit : 0));
    setSwitch(0, reg::Vmixer0, getSwitch(0, reg::Vmixer0) | (wet ? bit : 0));
    setSwitch(0, reg::Vmixel0, getSwitch(0, reg::Vmixel0) ^ (wet ? 0 : bit));
    setSwitch(0, reg::Vmixer0, getSwitch(0, reg::Vmixer0) ^ (wet ? 0 : bit));
    setSwitch(0, reg::Kon0, bit);
}

}
