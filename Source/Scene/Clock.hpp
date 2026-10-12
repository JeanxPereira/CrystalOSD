#pragma once
#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "Scene/ClockState.hpp"
#include "Scene/Cubes.hpp"
#include "Scene/Frame.hpp"
#include "Scene/FrameHead.hpp"
#include "Scene/MenuTypes.hpp"
#include "Scene/Menus.hpp"
#include "Scene/Orbs.hpp"
#include "Scene/Rods.hpp"
#include "Scene/Sound.hpp"
#include "Scene/Text.hpp"

namespace scene {

// What the menus add to the clock screen: their state, the cubes' state and mesh, the configuration items (item 0 is
// items[0]) and the options.
struct MenusInputs {
    MenusState menus;
    CubeState cubes;
    RodMesh cubeMesh;
    ConfigItems items{};
    MenusOptions options;
};

// The clock's state at a frame's entry: what the logic, the head, the rods and the orbs carry,
// and what stays constant (clear colours, tube constants, orb constants and colour, screen size).
// ClockState owns eased.fraction and vignetteRamp; the copies in OrbState and HeadState are not read.
// The display clear (clock_frame.mjs stateWriters display): the clock writes `clearColour` into the clear of
// display environment 1 only; a frame drawn to buffer 0 is cleared with environment 0's own colour, set when
// the buffers were set up (`firstDisplayClear`).
struct ClockInputs {
    ClockState state;
    HeadState head;
    RodRecord rodTemplate;
    OrbState orbs;
    RodMesh mesh;
    Colour clearColour{};
    Colour firstDisplayClear{};
    TubeConstants tube;
    float minuteFactor = 0;
    float fractionEasing = 0;
    Colour orbColour{};
    bool hasEntryData = false;
    int32_t wide = 0;
    std::array<int32_t, kOrbCount> orbRandom{};
    std::array<Colour, kOrbCount> orbColours{};
    int32_t width = 640, height = 224;
    // The text (facts/text.md): the font file FNTOSD and the program's ELF, and the font state carried. Without the
    // two files the frame has no text.
    std::shared_ptr<const Font> font;
    std::shared_ptr<const ProgramImage> program;
    TextInputs text;
    std::optional<MenusInputs> menus;            // absent: the clock screen alone, as before
    bool passNames = true;                       // false: the passes carry no names (labels, trace and parity read them)
};

// What comes from outside the clock each frame: the time keeper, the field flag, the display buffer
// drawn to, configuration item 0, and configuration items 6 to 0xB (the date and time the text shows).
struct FrameInputs {
    ClockTime time;
    int32_t field = 0;
    int32_t displayIndex = 0;
    int32_t item0 = 0;
    ClockItems items;
    MenuExternals menu;                          // pad, disc, configDirty, rtcMirror, mechaconParam
    std::optional<ConfigItems> configItems;      // items 1..0x13 external; item 0 the model's when the gate is modelled
    std::optional<int32_t> timeFilled;           // the time keeper's word (verify_frame.mjs EXTERNAL)
    std::optional<TextRamps> textRamps;          // the words of the text's alpha rules the menus' unmodelled code writes (panel flags, the dialog ramp)
    bool threadStep = true;                      // run between() first; false for a frame recorded after it (frame 0)
};

// facts/clock-frame.md "Order of a frame", the clock screen's parts: camera; head; rods, orbs and the
// two extra passes; overlay; trips after the rods; bars; text (date and time, button hint); column; then the state step.
// With menus: the externals in, between(), then after the trips the cubes, the menu ramp step, the menus and the pages' text,
// and endOfFrame last (clock_frame.mjs frame()).
template <class A>
class Clock {
public:
    explicit Clock(const ClockInputs& inputs);
    Frame frame(const FrameInputs& in);

    const ClockState& state() const { return m_state; }
    const HeadState& head() const { return m_head.state(); }
    const OrbState& orbs() const { return m_orbs; }
    const RodRecord& rodTemplate() const { return m_rods.rodTemplate(); }
    const Text<A>* text() const { return m_text ? &*m_text : nullptr; }
    // The strings of the last frame, as handed to the font code.
    const std::vector<StringRun>& strings() const { return m_strings; }
    const MenusState* menus() const { return m_menus ? &m_menusState : nullptr; }
    const CubeState* cubes() const { return m_menus ? &m_cubeState : nullptr; }
    const ConfigItems& items() const { return m_items; }
    int32_t width() const { return m_width; }
    int32_t height() const { return m_height; }
    const MenuExternals& externals() const { return m_external; }
    // The model's notes of the last frame (what it does not cover).
    const std::vector<std::string>& notes() const { return m_notes; }
    const std::vector<SoundCommand>& sounds() const { return m_sounds; }
    const std::optional<DateWords>& rtcWrite() const { return m_rtcWrite; }

private:
    MenuWorld menuWorld();
    ClockState m_state;
    FrameHead<A> m_head;
    Rods<A> m_rods;
    OrbState m_orbs;
    Colour m_clearColour, m_firstDisplayClear;
    TubeConstants m_tube;
    float m_minuteFactor, m_fractionEasing;
    Colour m_orbColour;
    bool m_hasEntryData;
    int32_t m_wide;
    std::array<int32_t, kOrbCount> m_orbRandom;
    std::array<Colour, kOrbCount> m_orbColours;
    int32_t m_width, m_height;
    std::optional<Text<A>> m_text;
    std::vector<StringRun> m_strings;
    std::optional<Menus> m_menus;
    std::optional<Cubes<A>> m_cubes;
    MenusState m_menusState;
    CubeState m_cubeState;
    ConfigItems m_items{};
    MenuExternals m_external;
    TextRamps m_textRamps;
    bool m_passNames;
    std::vector<std::string> m_notes;
    std::vector<uint32_t> m_unmodelled;
    std::vector<SoundCommand> m_sounds;
    std::optional<DateWords> m_rtcWrite;
};

extern template class Clock<EeArithmetic>;
extern template class Clock<NativeArithmetic>;

}
