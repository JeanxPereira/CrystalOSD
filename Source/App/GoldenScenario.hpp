#pragma once
#include <cstdint>
#include <span>

#include "App/Input.hpp"

namespace app {

struct ScenarioPress {
    uint64_t afterClock;
    PadButton button;
};

std::span<const ScenarioPress> goldenScenario();
uint64_t goldenFrames();

}
