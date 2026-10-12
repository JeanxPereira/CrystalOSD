#include "Scene/ConsoleClock.hpp"

#include "Scene/ClockDate.hpp"

namespace scene {

namespace {

int64_t secondsOfWords(const DateWords& d) { return secondsOf(d[0], d[1], d[2], d[3], d[4], d[5]); }

int64_t unixEpoch() { return secondsOf(1970, 1, 1, 0, 0, 0); }

}

// config_get_timezone_offset and config_get_daylight_saving: bits 9..19 signed, bit 29
ConsoleZone zoneOf(uint32_t settingsWord) {
    return {static_cast<int32_t>(settingsWord << 12) >> 21, ((settingsWord >> 29) & 1) != 0};
}

// func_00214728: from the base zone to the configured one, an hour more with summer time
DateWords localOf(const DateWords& rtc, ConsoleZone zone) {
    const int64_t t = secondsOfWords(rtc) - int64_t(kBaseZone) * 60 + int64_t(zone.minutes) * 60;
    return dateOf(zone.summer ? t + 3600 : t);
}

// func_00214788 via func_002148B8: the inverse of func_00214728; a negative year or hour leaves the items
DateWords rtcOf(const DateWords& local, ConsoleZone zone) {
    if (local[3] < 0 || local[0] < 0) return local;
    const int64_t t = secondsOfWords(local);
    return dateOf((zone.summer ? t - 3600 : t) - int64_t(zone.minutes) * 60 + int64_t(kBaseZone) * 60);
}

// the console RTC runs in the base zone: UTC plus the zone of city 0x33
DateWords rtcAt(int64_t hostUtcSeconds) { return dateOf(unixEpoch() + hostUtcSeconds + int64_t(kBaseZone) * 60); }

int64_t unixOf(const DateWords& rtc) { return secondsOfWords(rtc) - unixEpoch(); }

}
