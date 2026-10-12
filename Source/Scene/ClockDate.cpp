#include "Scene/ClockDate.hpp"

#include <stdexcept>

#include "Scene/ConsoleClock.hpp"

namespace scene {

namespace {

constexpr int32_t kMonths[2][12] = {{31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31}, {31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31}};

int32_t leap(int32_t y) { return y % 400 == 0 ? 1 : y % 100 == 0 ? 0 : (y & 3) == 0 ? 1 : 0; }

int32_t monthLength(int32_t row, int32_t month) {
    if (month < 0 || month > 11) throw std::out_of_range("month outside 1..12");
    return kMonths[row][month];
}

int64_t zoned(int64_t seconds, uint32_t settings) {
    const ConsoleZone zone = zoneOf(settings);
    const int64_t t = seconds - int64_t(kBaseZone) * 60 + int64_t(zone.minutes) * 60;
    return zone.summer ? t + 3600 : t;
}

int32_t daysIn(int32_t y, int32_t month) {
    if (month == 2) return y % 400 == 0 ? 29 : y % 100 == 0 ? 28 : (y & 3) == 0 ? 29 : 28;
    return monthLength(0, month - 1);
}

}

int64_t secondsOf(int32_t y, int32_t mo, int32_t d, int32_t h, int32_t mi, int32_t s) {
    const int32_t years = y - 1600;
    int32_t days = d - 1;
    const int32_t row = leap(years);
    for (int32_t i = 0; i < mo - 1; ++i) days += monthLength(row, i);
    const int32_t fours = (years + 3 > -1 ? years + 3 : years + 6) >> 2;
    days += 365 * years + fours - (years + 99) / 100 + (years + 399) / 400;
    return ((int64_t(days) * 24 + h) * 60 + mi) * 60 + s;
}

std::array<int32_t, 6> dateOf(int64_t seconds) {
    int64_t t = seconds;
    const int32_t s = static_cast<int32_t>(t % 60);
    t /= 60;
    const int32_t mi = static_cast<int32_t>(t % 60);
    t /= 60;
    const int32_t h = static_cast<int32_t>(t % 24);
    t /= 24;
    int32_t y = 1600;
    if (t > 0x23ab0) {
        t -= 0x23ab1;
        y += static_cast<int32_t>(t / 0x23ab1 + 1) * 400;
        t %= 0x23ab1;
    }
    int32_t shortYear = 0;
    if (!(t < 0x8ead)) {
        t -= 0x8ead;
        y += static_cast<int32_t>(t / 0x8eac + 1) * 100;
        t %= 0x8eac;
        shortYear = 1;
    }
    const int64_t four = 0x5b5 - shortYear;
    if (t < four) shortYear ^= 1;
    else {
        t -= four;
        y += static_cast<int32_t>(t / 0x5b5 + 1) * 4;
        t %= 0x5b5;
        shortYear = 1;
    }
    const int64_t first = shortYear + 0x16d;
    if (!(t < first)) {
        t -= first;
        y += 1 + static_cast<int32_t>(t / 0x16d);
        t %= 0x16d;
    }
    const int32_t row = leap(y);
    int32_t m = 0;
    while (!(t < monthLength(row, m))) {
        t -= monthLength(row, m);
        m += 1;
    }
    return {y, m + 1, static_cast<int32_t>(t) + 1, h, mi, s};
}

DateCheck dateCheck(const std::array<int32_t, 6>& items, uint32_t settings) {
    const auto lo = dateOf(zoned(0x2f0605980, settings));
    const auto hi = dateOf(zoned(0x3ac796cff, settings));
    const int32_t y = items[0], mo = items[1], d = items[2], h = items[3];
    const bool later = lo[0] < y, earlier = y < hi[0];
    const int32_t minMonth = later ? 1 : lo[1], maxMonth = earlier ? 12 : hi[1];
    const int32_t minDay = later || minMonth < mo ? 1 : lo[2];
    int32_t maxDay = earlier || mo < maxMonth ? 31 : hi[2];
    const int32_t minHour = later || minMonth < mo || minDay < d ? 0 : lo[3];
    const int32_t maxHour = earlier || mo < maxMonth || d < maxDay ? 23 : hi[3];
    const int32_t minMinute = later || minMonth < mo || minDay < d || minHour < h ? 0 : lo[4];
    const int32_t maxMinute = earlier || mo < maxMonth || d < maxDay || h < maxHour ? 59 : hi[4];
    std::array<int32_t, 6> out = items;
    const int64_t t = secondsOf(items[0], items[1], items[2], items[3], items[4], items[5]);
    const int64_t low = zoned(0x2f0605980, settings), high = zoned(0x3ac796cff, settings);
    if (t < low) out = dateOf(low);
    if (high < (t < low ? low : t)) out = dateOf(high);
    const int32_t dim = daysIn(out[0], out[1]);
    if (dim < maxDay) maxDay = dim;
    if (maxDay < out[2]) out[2] = maxDay;
    return {out, {{{lo[0], hi[0]}, {minMonth, maxMonth}, {minDay, maxDay}, {minHour, maxHour}, {minMinute, maxMinute}, {0, 59}}}};
}

}
