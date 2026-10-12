#include "Scene/ColdTime.hpp"

#include <stdexcept>

#include "Scene/Arithmetic.hpp"
#include "Scene/ClockDate.hpp"

namespace scene {

namespace {

constexpr uint32_t kZoneTable = 0x2AD988;
constexpr uint32_t kZoneCount = 0x2AE5A0;
constexpr uint32_t kFrameRateNtsc = 0x36FC34;
constexpr int32_t kBaseCity = 0x33;

int32_t byteAt(const ProgramImage& program, uint32_t address) {
    return static_cast<int32_t>((program.word(address & ~3u) >> (8 * (address & 3u))) & 0xFF);
}

int32_t baseZone(const ProgramImage& program) {
    const int32_t count = program.integer(kZoneCount);
    for (int32_t i = 0; i < count; ++i) {
        const uint32_t entry = kZoneTable + static_cast<uint32_t>(i) * 0x18;
        if (byteAt(program, entry + 2) == kBaseCity) return static_cast<int16_t>(program.word(entry) & 0xFFFF);
    }
    throw std::runtime_error("no time zone entry for the base city");
}

}

// HDD OSD 1.10U 0x235848, 0x2358F8, 0x235A68 verify_cold_time.mjs
template <class A>
ColdTimeOut coldTime(const ProgramImage& program, const RtcTime& rtc, int timeZone, bool summer, bool pal) {
    const int64_t minutes = (summer ? 60 : 0) + static_cast<int64_t>(timeZone) - baseZone(program);
    const int64_t seconds = secondsOf(rtc.year, rtc.month, rtc.day, rtc.hour, rtc.minute, rtc.second) + minutes * 60;
    const std::array<int32_t, 6> date = dateOf(seconds);
    ColdTimeOut out;
    out.year = date[0];
    out.month = date[1];
    out.day = date[2];
    out.time.hours = date[3];
    out.time.minutes = date[4];
    out.time.seconds = date[5];
    out.time.milliseconds = 0;
    out.timeFilled = false;
    out.zone[0] = timeZone;
    out.zone[1] = summer ? 1 : 0;
    const float rate = pal ? 50.0f : program.single(kFrameRateNtsc);
    out.framePeriod = A::div(1000.0f, rate);
    return out;
}

#ifndef SCENE_NATIVE_ONLY
template ColdTimeOut coldTime<EeArithmetic>(const ProgramImage&, const RtcTime&, int, bool, bool);
#endif
template ColdTimeOut coldTime<NativeArithmetic>(const ProgramImage&, const RtcTime&, int, bool, bool);

}
