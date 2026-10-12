#pragma once
#include <array>
#include <cstdint>

namespace scene {

using DateWords = std::array<int32_t, 6>;

struct ConsoleZone {
    int32_t minutes = 0;
    bool summer = false;
};

ConsoleZone zoneOf(uint32_t settingsWord);
DateWords localOf(const DateWords& rtc, ConsoleZone zone);
DateWords rtcOf(const DateWords& local, ConsoleZone zone);
DateWords rtcAt(int64_t hostUtcSeconds);
int64_t unixOf(const DateWords& rtc);

}
