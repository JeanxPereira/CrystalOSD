#include "App/Screens.hpp"

namespace app {

Screen screenOf(const scene::MenusState& menus, const scene::Ramp& menuRamp) {
    if (menus.versionRamp.state != 0) return Screen::Version;
    switch (menus.page.ramp.state) {
    case 0: return Screen::MainMenu;
    case 1: return Screen::OpeningConfiguration;
    case 3: return Screen::ClosingConfiguration;
    default: break;
    }
    switch (menuRamp.state) {
    case 1: return Screen::HidingMenu;
    case 2: return Screen::ClockAlone;
    case 3: return Screen::ShowingMenu;
    default: return menus.page.level == 1 ? Screen::InsideEntry : Screen::Configuration;
    }
}

const char* screenName(Screen screen) {
    switch (screen) {
    case Screen::MainMenu: return "main menu";
    case Screen::OpeningConfiguration: return "opening System Configuration";
    case Screen::Configuration: return "System Configuration";
    case Screen::InsideEntry: return "inside an entry";
    case Screen::ClosingConfiguration: return "closing System Configuration";
    case Screen::HidingMenu: return "hiding the menu";
    case Screen::ClockAlone: return "clock alone";
    case Screen::ShowingMenu: return "showing the menu";
    case Screen::Version: return "version";
    }
    return "?";
}

}
