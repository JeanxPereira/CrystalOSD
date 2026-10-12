#include <array>
#include <cstdio>
#include <fstream>

#include "../Check.hpp"
#include "ColdCompare.hpp"
#include "Scene/Arithmetic.hpp"
#include "Scene/ColdConfig.hpp"
#include "Scene/ColdRamps.hpp"
#include "Scene/ColdTime.hpp"
#include "Scene/ProgramImage.hpp"
#include "Scene/SceneInputs.hpp"

namespace {

using nlohmann::json;

std::array<uint32_t, 14> words(const scene::ConfigEntry& e) {
    return {static_cast<uint32_t>(e.id), static_cast<uint32_t>(e.valueCount), static_cast<uint32_t>(e.valueIndex), static_cast<uint32_t>(e.item), e.valueTable,
            e.enter, e.stringCallback, e.frameCallback, e.confirm, e.cancel, e.focus, static_cast<uint32_t>(e.rest[0]), static_cast<uint32_t>(e.rest[1]), static_cast<uint32_t>(e.rest[2])};
}

template <class A>
int run(const scene::ProgramImage& program, const json& c, int base) {
    const json& r = c.at("rtc");
    const scene::RtcTime rtc{r.at(0), r.at(1), r.at(2), r.at(3), r.at(4), r.at(5)};
    const uint32_t param = c.at("param");
    const int zone = static_cast<int32_t>(param << 12) >> 21;
    const scene::ColdTimeOut time = scene::coldTime<A>(program, rtc, zone, ((param >> 29) & 1) != 0, false);
    CHECK(time.zone[0] == zone);
    const scene::ColdLengths lengths = scene::coldLengths(false);
    const scene::ColdSettingsWords w{param, c.at("date"), c.at("keyboard")};
    const int vid = c.at("vid");
    const scene::ColdConfigOut o = scene::coldConfig<A>(program, w, vid, lengths, time, c.at("selected"));
    CHECK(o.param == c.at("newParam").get<uint32_t>());
    for (size_t i = 0; i < 20; ++i) CHECK(o.items[i] == c.at("items").at(i).get<int32_t>());
    const json& entries = c.at("entries");
    for (size_t i = 0; i < 9; ++i) {
        const auto got = words(o.entries[i]);
        for (size_t k = 0; k < 14; ++k) CHECK(got[k] == entries.at(i * 14 + k).get<uint32_t>());
    }
    const json& page = c.at("page");
    CHECK(static_cast<uint32_t>(o.page.count) == page.at(2).get<uint32_t>());
    CHECK(static_cast<uint32_t>(o.page.selected) == page.at(4).get<uint32_t>());
    CHECK(o.page.entries == page.at(1).get<uint32_t>());
    CHECK(o.page.ramp.length == lengths.config.length);
    CHECK(o.menu.selected == 0);
    (void)base;
    return 0;
}

int bootOracle(const scene::ProgramImage& program, const char* path) {
    const json j = scene::firstInput(path);
    const json& r = j.at("rtcMirror");
    const scene::RtcTime rtc{r.at(0), r.at(1), r.at(2), r.at(3), r.at(4), r.at(5)};
    const scene::ColdInputs in{.pal = false, .language = 1, .city = 112, .aspect = 0, .timeZone = 0, .summerTime = false, .dateFormat = 0, .timeFormat = 0, .rtc = rtc};
    const scene::ColdLengths lengths = scene::coldLengths(false);
    const scene::ColdTimeOut time = scene::coldTime<scene::EeArithmetic>(program, rtc, in.timeZone, in.summerTime, false);
    const scene::ColdConfigOut o = scene::coldConfig<scene::EeArithmetic>(program, in, lengths, time);
    const scene::MenusState menus = scene::menusState(j);
    const scene::ConfigItems items = scene::configItems(j);
    CHECK(j.at("mechaconParam").at(0).get<uint32_t>() == scene::coldSettingsWords(program, in).param);
    CHECK(j.at("videoMode").get<int>() == 1);
    CHECK(o.items == items);
    for (size_t i = 0; i < 9; ++i) {
        scene::ConfigEntry want = menus.entries[i], got = o.entries[i];
        if (i < 4) want.valueIndex = got.valueIndex;
        CHECK(want == got);
    }
    CHECK(o.page.count == menus.page.count && o.page.selected == menus.page.selected && o.page.entries == menus.page.entries);
    CHECK(o.page.word0 == menus.page.word0 && o.page.titleWidth == menus.page.titleWidth && o.page.level == menus.page.level);
    CHECK(o.page.ramp.length == menus.page.ramp.length);
    CHECK(o.menu.items == menus.mainMenu.items && o.menu.count == menus.mainMenu.count && o.menu.selected == menus.mainMenu.selected);
    CHECK(o.menu.ramp.length == menus.mainMenu.ramp.length);
    CHECK(o.pages[0] == menus.pagePointers[0]);
    return 0;
}

}

int main(int argc, char** argv) {
    CHECK(argc == 4);
    const scene::ProgramImage program = scene::ProgramImage::load(argv[1]);
    std::ifstream in(argv[2]);
    CHECK(in.good());
    const json j = json::parse(in);
    const int base = j.at("base");
    size_t cases = 0;
    for (const json& c : j.at("cases")) {
        if (run<scene::EeArithmetic>(program, c, base)) return 1;
        if (run<scene::NativeArithmetic>(program, c, base)) return 1;
        ++cases;
    }
    CHECK(cases == 120);
    if (bootOracle(program, argv[3])) return 1;
    std::printf("ColdConfigTest: %zu cases\n", cases);
    return 0;
}
