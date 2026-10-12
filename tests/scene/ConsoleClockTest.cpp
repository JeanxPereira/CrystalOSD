#include <fstream>
#include <string>

#include <nlohmann/json.hpp>

#include "../Check.hpp"
#include "Scene/ClockDate.hpp"
#include "Scene/ConsoleClock.hpp"

int main(int argc, char** argv) {
    CHECK(argc == 2);
    std::ifstream in(argv[1]);
    CHECK(in.good());
    const nlohmann::json pairs = nlohmann::json::parse(in);
    CHECK(pairs.size() >= 6);
    for (const auto& p : pairs) {
        const scene::DateWords items = p.at("items").get<scene::DateWords>();
        const scene::DateWords rtc = p.at("rtc").get<scene::DateWords>();
        const scene::ConsoleZone zone = scene::zoneOf(p.at("word").get<uint32_t>());
        CHECK(scene::rtcOf(items, zone) == rtc);
        CHECK(scene::localOf(rtc, zone) == items);
    }

    CHECK(scene::zoneOf(0x07000010).minutes == 0 && !scene::zoneOf(0x07000010).summer);
    CHECK(scene::zoneOf(0x27000010).summer);
    CHECK(scene::zoneOf(0x400u << 9).minutes == -1024);
    CHECK(scene::zoneOf(0x3FFu << 9).minutes == 1023);

    const scene::DateWords epoch = scene::rtcAt(0);
    CHECK((epoch == scene::DateWords{1970, 1, 1, 9, 0, 0}));
    CHECK(scene::unixOf(scene::rtcAt(1700000000)) == 1700000000 + scene::kBaseZone * 60);
    CHECK((scene::rtcOf({-1, 1, 1, 0, 0, 0}, {}) == scene::DateWords{-1, 1, 1, 0, 0, 0}));

    const scene::ConsoleZone zones[] = {{-720, false}, {-720, true}, {0, false}, {0, true}, {540, false}, {540, true}, {1023, false}, {1023, true}};
    const int64_t first = scene::secondsOf(2000, 1, 1, 0, 0, 0), last = scene::secondsOf(2099, 12, 31, 23, 0, 0);
    int64_t count = 0;
    for (const scene::ConsoleZone zone : zones)
        for (int64_t t = first; t <= last; t += 3600) {
            const scene::DateWords local = scene::dateOf(t);
            CHECK(scene::localOf(scene::rtcOf(local, zone), zone) == local);
            ++count;
        }
    std::printf("ConsoleClockTest: %zu captured confirms, %lld round trips\n", pairs.size(), static_cast<long long>(count));
    return 0;
}
