#pragma once
#include <array>
#include <cstdint>

#include "Scene/ColdRamps.hpp"
#include "Scene/ColdTime.hpp"
#include "Scene/ColdTypes.hpp"
#include "Scene/MenuTypes.hpp"
#include "Scene/ProgramImage.hpp"

namespace scene {

struct ColdSettingsWords {
    uint32_t param = 0;
    uint32_t date = 0;
    uint32_t keyboard = 0;
};

struct ColdConfigOut {
    ConfigItems items{};
    std::array<ConfigEntry, 9> entries{};
    ConfigPage page;
    MainMenu menu;
    std::array<int32_t, 5> pages{};
    uint32_t param = 0;
};

ColdSettingsWords coldSettingsWords(const ProgramImage& program, const ColdInputs& inputs);

template <class A>
ColdConfigOut coldConfig(const ProgramImage& program, const ColdSettingsWords& words, int videoMode, const ColdLengths& lengths, const ColdTimeOut& time, int selected = 0);

template <class A>
ColdConfigOut coldConfig(const ProgramImage& program, const ColdInputs& inputs, const ColdLengths& lengths, const ColdTimeOut& time);

}
