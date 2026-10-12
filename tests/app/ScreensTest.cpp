#include <cstdio>
#include <string>

#include "App/Screens.hpp"

#define CHECK(condition)                                                         \
    do {                                                                         \
        if (!(condition)) {                                                      \
            std::fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #condition); \
            return 1;                                                            \
        }                                                                        \
    } while (0)

int main() {
    scene::MenusState m;
    scene::Ramp menu;
    CHECK(app::screenOf(m, menu) == app::Screen::MainMenu);
    m.page.ramp.state = 1;
    CHECK(app::screenOf(m, menu) == app::Screen::OpeningConfiguration);
    m.page.ramp.state = 2;
    CHECK(app::screenOf(m, menu) == app::Screen::Configuration);
    m.page.level = 1;
    CHECK(app::screenOf(m, menu) == app::Screen::InsideEntry);
    m.page.level = 0;
    menu.state = 1;
    CHECK(app::screenOf(m, menu) == app::Screen::HidingMenu);
    menu.state = 2;
    CHECK(app::screenOf(m, menu) == app::Screen::ClockAlone);
    menu.state = 3;
    CHECK(app::screenOf(m, menu) == app::Screen::ShowingMenu);
    menu.state = 0;
    m.page.ramp.state = 3;
    CHECK(app::screenOf(m, menu) == app::Screen::ClosingConfiguration);
    m.page.ramp.state = 0;
    m.versionRamp.state = 1;
    CHECK(app::screenOf(m, menu) == app::Screen::Version);
    CHECK(std::string(app::screenName(app::Screen::Version)) == "version");
    m.versionRamp.state = 3;
    CHECK(app::screenOf(m, menu) == app::Screen::Version);
    m.versionRamp.state = 0;
    CHECK(app::screenOf(m, menu) == app::Screen::MainMenu);
    std::printf("screens: all equal\n");
    return 0;
}
