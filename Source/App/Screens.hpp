#pragma once

#include "Scene/MenuTypes.hpp"
#include "Scene/Ramp.hpp"

namespace app {
enum class Screen { MainMenu, OpeningConfiguration, Configuration, InsideEntry, ClosingConfiguration, HidingMenu, ClockAlone, ShowingMenu, Version };
Screen screenOf(const scene::MenusState& menus, const scene::Ramp& menuRamp);
const char* screenName(Screen screen);
}
