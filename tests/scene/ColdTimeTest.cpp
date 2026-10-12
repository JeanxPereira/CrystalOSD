#include <cstdio>
#include <cstring>
#include <fstream>

#include "../Check.hpp"
#include "ColdCompare.hpp"
#include "Scene/Arithmetic.hpp"
#include "Scene/ClockDate.hpp"
#include "Scene/ColdTime.hpp"
#include "Scene/ProgramImage.hpp"

namespace {

using nlohmann::json;

int run(const scene::ProgramImage& program, const char* path, bool pal) {
    std::ifstream in(path);
    CHECK(in.good());
    const json j = json::parse(in);
    CHECK(j.at("pal").get<bool>() == pal);
    const uint32_t period = j.at("framePeriod").get<uint32_t>();
    size_t cases = 0;
    for (const json& c : j.at("cases")) {
        const json& r = c.at("rtc");
        const scene::RtcTime rtc{r.at(0), r.at(1), r.at(2), r.at(3), r.at(4), r.at(5)};
        const uint32_t param = c.at("param").get<uint32_t>();
        const int zone = static_cast<int32_t>(param << 12) >> 21;
        const bool summer = ((param >> 29) & 1) != 0;
        const scene::ColdTimeOut ee = scene::coldTime<scene::EeArithmetic>(program, rtc, zone, summer, pal);
        const json& t = c.at("time");
        CHECK(ee.year == t.at(0).get<int32_t>());
        CHECK(ee.month == t.at(1).get<int32_t>());
        CHECK(ee.day == t.at(2).get<int32_t>());
        CHECK(ee.time.hours == t.at(3).get<int32_t>());
        CHECK(ee.time.minutes == t.at(4).get<int32_t>());
        CHECK(ee.time.seconds == t.at(5).get<int32_t>());
        CHECK(ee.time.milliseconds == 0.0f);
        CHECK(!ee.timeFilled);
        CHECK(ee.zone[0] == c.at("zone").get<int32_t>());
        CHECK(ee.zone[1] == c.at("summer").get<int32_t>());
        CHECK(scene::floatBits(ee.framePeriod) == period);
        const scene::ColdTimeOut native = scene::coldTime<scene::NativeArithmetic>(program, rtc, zone, summer, pal);
        CHECK(native.time.seconds == ee.time.seconds && native.time.minutes == ee.time.minutes && native.time.hours == ee.time.hours);
        const int64_t apart = static_cast<int64_t>(scene::floatBits(native.framePeriod)) - static_cast<int64_t>(period);
        CHECK(apart >= -1 && apart <= 1);
        ++cases;
    }
    CHECK(j.at("base").get<int32_t>() == scene::kBaseZone);
    CHECK(cases > 100);
    std::printf("ColdTimeTest %s: %zu cases\n", pal ? "PAL" : "NTSC", cases);
    return 0;
}

}

int main(int argc, char** argv) {
    CHECK(argc == 4);
    const scene::ProgramImage program = scene::ProgramImage::load(argv[1]);
    if (run(program, argv[2], false)) return 1;
    if (run(program, argv[3], true)) return 1;
    return 0;
}
