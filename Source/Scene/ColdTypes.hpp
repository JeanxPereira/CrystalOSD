#pragma once
#include <cstdint>
#include <optional>

namespace scene {

struct RtcTime {
    int32_t year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0;
};

struct ColdInputs {
    bool pal = false;
    int language = 0;
    int city = 0x33;
    int aspect = 0;
    int timeZone = 0;
    bool summerTime = false;
    int dateFormat = 0;
    int timeFormat = 0;
    RtcTime rtc;
    std::optional<int64_t> clockOffset;
    uint32_t randState = 1;
    uint32_t screenWidth = 640, screenHeight = 224;
    bool wide = false;
    uint32_t screenCode = 0;
    uint32_t field = 0;
    uint32_t gsAllocator = 0;
};

}
