#pragma once
#include <array>
#include <cstdint>

#include "Scene/ClockState.hpp"
#include "Scene/ColdRamps.hpp"
#include "Scene/Orbs.hpp"
#include "Scene/ProgramImage.hpp"

namespace scene {

struct ColdStateOut {
    RodsState rods;
    EasedAngles eased;
    ClockColours colours;
    CycleCounters cycle;
    CycleTables cycleTables;
    LogicConstants logicConstants;
    Ramp appearance;
    std::array<int32_t, kOrbCount> orbRandom{};
    uint32_t randState = 0;
    std::array<OrbRing, kOrbCount> rings{};
    Ramp spriteFade;
};

std::array<int32_t, kOrbCount> randAngles(uint32_t& state);
uint32_t advanceRand(uint32_t state, uint32_t calls);

template <class A>
ColdStateOut coldState(const ProgramImage& program, const ColdLengths& lengths, const ClockTime& time, uint32_t randState);

}
