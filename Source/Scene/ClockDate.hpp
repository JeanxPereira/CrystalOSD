#pragma once
#include <array>
#include <cstdint>

namespace scene {

int64_t secondsOf(int32_t year, int32_t month, int32_t day, int32_t hour, int32_t minute, int32_t second);
std::array<int32_t, 6> dateOf(int64_t seconds);
constexpr int32_t kBaseZone = 540;
struct DateCheck {
    std::array<int32_t, 6> items{};
    std::array<std::array<int32_t, 2>, 6> ranges{};
};
DateCheck dateCheck(const std::array<int32_t, 6>& items, uint32_t settings);

}
