#include "App/GoldenScenario.hpp"

#include <array>

namespace app {
namespace {

constexpr std::array kPresses{
    ScenarioPress{120, PadButton::Down}, ScenarioPress{200, PadButton::Up},
    ScenarioPress{280, PadButton::Triangle}, ScenarioPress{360, PadButton::Down}, ScenarioPress{420, PadButton::Up},
    ScenarioPress{480, PadButton::Circle},
    ScenarioPress{560, PadButton::Down}, ScenarioPress{640, PadButton::Cross},
    ScenarioPress{760, PadButton::Down}, ScenarioPress{820, PadButton::Down}, ScenarioPress{880, PadButton::Up},
    ScenarioPress{940, PadButton::Cross}, ScenarioPress{1040, PadButton::Circle},
    ScenarioPress{1120, PadButton::Square}, ScenarioPress{1220, PadButton::Square},
    ScenarioPress{1320, PadButton::Circle},
};

}

std::span<const ScenarioPress> goldenScenario() { return kPresses; }

uint64_t goldenFrames() { return 1440; }

}
