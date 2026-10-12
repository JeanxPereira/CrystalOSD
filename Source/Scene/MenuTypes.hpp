#pragma once
#include <array>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "Scene/ClockState.hpp"
#include "Scene/ConsoleClock.hpp"
#include "Scene/FrameHead.hpp"
#include "Scene/Matrix.hpp"
#include "Scene/Ramp.hpp"
#include "Scene/Rods.hpp"
#include "Scene/Sound.hpp"

namespace scene {

// The pad words the pad reader (HDD func_00235EB0) leaves at 0x00370330: held, pressed, released, repeating.
struct PadWords {
    uint32_t held = 0, pressed = 0, released = 0, repeating = 0;
    bool operator==(const PadWords&) const = default;
};
// The bits the menus' code tests (References/model/clock_menus.mjs).
namespace pad {
constexpr uint32_t Triangle = 0x10, Cross = 0x20, Circle = 0x40, Square = 0x80;
constexpr uint32_t Up = 0x1000, Right = 0x2000, Down = 0x4000, Left = 0x8000;
}

// clock_memory.mjs configEntries: one entry of System Configuration's list, 0x38 bytes; callbacks are EE addresses.
struct ConfigEntry {
    int32_t id = 0, valueCount = 0, valueIndex = 0, item = 0;
    uint32_t valueTable = 0, enter = 0, stringCallback = 0, frameCallback = 0, confirm = 0, cancel = 0, focus = 0;
    std::array<int32_t, 3> rest{};
    bool operator==(const ConfigEntry&) const = default;
};
// clock_memory.mjs configPage (HDD 0x002B2DE8): level 0 the list, 1 inside an entry, 2 waiting for the save.
struct ConfigPage {
    int32_t word0 = 0;
    uint32_t entries = 0;
    int32_t count = 0, titleWidth = 0, selected = 0, word14 = 0, level = 0;
    Ramp ramp;
    int32_t word2c = 0, word30 = 0, glow = 0;
    bool operator==(const ConfigPage&) const = default;
};
// clock_memory.mjs mainMenu (HDD 0x002B2E60).
struct MainMenu {
    int32_t word0 = 0;
    uint32_t items = 0;
    int32_t count = 0, word0c = 0, selected = 0, word14 = 0;
    Ramp ramp;
    bool operator==(const MainMenu&) const = default;
};
struct AdjustField {
    int32_t item = 0, lowest = 0, highest = 0;
    bool operator==(const AdjustField&) const = default;
};
// clock_memory.mjs listConstants: the frame rate, the arrow's divisor, the ring's pulse, the standing cube's pulse.
struct ListConstants { float rate = 0, divisor = 0, pulse = 0, standing = 0; };
// D_0037029C, D_003702A0, D_003702A4 (R4): the list entries' crossfade.
struct ListFade {
    int32_t first = 128, second = 0, secondIndex = 0;
    bool operator==(const ListFade&) const = default;
};
using ConfigItems = std::array<int32_t, 20>;

// clock_version.mjs: one row of the Version page's table (HDD 0x00404D48, 0x10 a row): the module's name as a language string id,
// its version string, the module's sub-row count (func_002086A8) and its id in the module table.
struct VersionRow {
    int32_t label = 0;
    std::string value;
    int32_t subRows = 0, id = 0;
    bool operator==(const VersionRow&) const = default;
};
constexpr size_t kVersionRows = 0x20;
// clock_version.mjs V.record and the words the page writes: the record (title, count, shown rows, selected, first shown), the job
// handle, the button panel words (func_002266C0, func_002266C8, func_002266E0, func_002266D0) and how long the job has been asked.
struct VersionPage {
    int32_t title = 0x59, count = 0, shown = 6, selected = 0, first = 0;
    std::array<VersionRow, kVersionRows> rows{};
    int32_t job = 0;
    int32_t panelOn = 0, panelAlpha = 0, arrows = 0;
    std::array<int32_t, 4> hints{1, 1, 1, 1};
    int32_t polls = 0;
    bool operator==(const VersionPage&) const = default;
};

// What the menus own (clock_menus.mjs); the clock owns the rest of what they write (MenuWorld).
struct MenusState {
    ConfigPage page;
    std::array<ConfigEntry, 9> entries{};
    MainMenu mainMenu;
    Ramp versionRamp, dialogRamp, firstRunRamp;
    VersionPage version;
    std::vector<VersionRow> versionList;
    VersionPage versionDrawn;
    Ramp versionRampDrawn;
    bool versionDrawnValid = false;
    std::array<int32_t, 5> pagePointers{};
    int32_t entryActive = 0;
    std::array<int32_t, 3> menuLengths{};
    ListConstants listConstants;
    int32_t screenCode = 0;
    std::array<AdjustField, 6> adjustFields{};
    std::optional<int32_t> configGate;
    ListFade listFade;
    int32_t body = 0;
    int32_t videoMode = 0;
};

// clock_memory.mjs cubeList: pulse, pulsed place, position, left to go, speed, slowing.
struct CubeList { float pulse = 0; int32_t pulsed = 0, position = 0, left = 0, speed = 0, slowing = 0; };
struct CubeColours { Colour selected{}, plain{}, live{}; };
// The cubes' state (clock_cubes.mjs); the spin is ClockState::spin.
struct CubeState {
    Ramp ramp;
    CubeList list;
    CubeColours colours;
    RodRecord record;
    std::array<float, 6> constants{};
    std::array<float, 2> centreFactors{};
    Mat4 view{}, screen{};
    Colour layerClear{};
    Rect added, half, chain;
};

// verify_frame.mjs EXTERNAL, the menus' part: taken from outside every frame.
struct MenuExternals {
    PadWords pad;
    int32_t disc = 0;
    std::optional<std::array<int32_t, 3>> configDirty;
    std::optional<std::array<int32_t, 6>> rtcMirror;
    std::optional<std::array<uint32_t, 2>> mechaconParam;
};

// Everything the menus' code reads and writes; configuration item 0 is items[0] (the same word, 0x00409130).
struct MenuWorld {
    ClockState& clock;
    HeadState& head;
    Ramp& spriteFade;
    MenusState& menus;
    CubeState& cubes;
    ConfigItems& items;
    int32_t width = 640, height = 224;
    std::vector<SoundCommand>* sounds = nullptr;
    std::optional<DateWords>* rtcWrite = nullptr;
};

}
