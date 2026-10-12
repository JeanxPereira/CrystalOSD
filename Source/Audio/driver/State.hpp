#pragma once
#include <cstdint>

#include "Audio/driver/Driver.hpp"
#include "Audio/driver/IopClock.hpp"
#include "Audio/driver/Memory.hpp"
#include "Audio/driver/Registers.hpp"

namespace audio::driver {

inline constexpr int64_t M(int64_t offset) { return kOsdsndBase + offset; }

inline constexpr int64_t kSlots = M(0x9ed0);
inline constexpr int64_t kCtx = M(0xa530);
inline constexpr int64_t kVoices = M(0x9330);
inline constexpr int64_t kBanks = M(0x98d4);
inline constexpr int64_t kBankFlags = M(0x98d0);
inline constexpr int64_t kLibsdState = 0x90000;

inline int32_t s16(int64_t v) { return int32_t(int16_t(uint16_t(uint64_t(v)))); }
inline uint32_t u16(int64_t v) { return uint32_t(uint16_t(uint64_t(v))); }
inline int32_t i32(int64_t v) { return int32_t(uint32_t(uint64_t(v))); }
inline int32_t mulHi(int64_t a, int64_t b) { return int32_t((int64_t(i32(a)) * int64_t(i32(b))) >> 32); }
inline int32_t div60(int64_t x) {
    const int32_t v = i32(x);
    const int32_t hi = mulHi(v, 0x88888889);
    return ((hi + v) >> 5) - (v >> 31);
}

int32_t voiceVolumeOf(const IopMemory& mem, int voice, int side);

struct EffectAttr {
    uint32_t core = 0;
    int32_t mode = 0;
    uint16_t depthL = 0;
    uint16_t depthR = 0;
    uint32_t delay = 0;
    uint32_t feedback = 0;
};

struct Driver::State {
    State(const Snapshot& snapshot, assets::Bytes libsdImage, EnvxFeed envx, bool coldStart);
    IopMemory mem;
    LibsdImage lib;
    Registers regs;
    EnvxFeed feed;
    std::vector<FillEvent> fills;
    Snapshot snapshot;
    assets::Bytes libsdStart;
    std::unique_ptr<IopClock> clock;
    std::vector<EnvxRead> envxLog;
    bool started = false;

    uint32_t getSwitch(int64_t core, uint32_t offset0) const;
    void setSwitch(int64_t core, uint32_t offset0, uint32_t bits);
    void setParam(int64_t core, int64_t voice, uint32_t param, int64_t value) { regs.write(reg::voice(core, voice, param), value); }
    void setAddr(int64_t core, int64_t voice, uint32_t byteAddress);

    EffectAttr getEffectAttr(int64_t core) const;
    int setEffectAttr(const EffectAttr& attr);

    void init(const DriverCommand& command);
    void effect(const DriverCommand& command);
    void ramp(const DriverCommand& command);
    void tick();
};

}
