#pragma once
#include <array>
#include <cstdint>
#include <optional>

#include "Scene/Arithmetic.hpp"
#include "Scene/Matrix.hpp"
#include "Scene/Ramp.hpp"

namespace scene {

using Colour = std::array<int32_t, 4>;

struct ClockTime {
    float milliseconds = 0;
    int32_t seconds = 0;
    int32_t minutes = 0;
    int32_t hours = 0;
};

struct EasedAngles {
    int16_t secondHand = 0;
    int16_t hourHand = 0;
    float progress = 0;
    float fraction = 0;
};

struct RodState {
    float appearance = 0;
    float progress = 0;
    Colour base{};
    Colour reflection{};
};

struct RodsState {
    int32_t currentRod = 0;
    int16_t secondsAngle = 0;
    int16_t rodAngle = 0;
    std::array<RodState, 12> rods{};
    Colour accent{};
    Colour fourth{};
    float progressTarget = 0;
    Colour accentFrame{};
    Colour currentTarget{};
};

struct ClockColours {
    Colour base{};
    Colour reflection{};
    Colour fourth{};
    Colour currentReflection{};
};

struct CycleCounter {
    int32_t index = 0;
    int32_t wait = 0;
};

struct CycleCounters {
    CycleCounter base{};
    CycleCounter accent{};
    int32_t last = 0;
};

struct CycleTables {
    std::array<Colour, 6> base{};
    std::array<Colour, 3> accent{};
};

struct LogicConstants {
    float rodEasing = 0;
    float secondsEasing = 0;
    float progressStep = 0;
};

struct SceneScale {
    float scale = 0;
    int32_t leaving = 0;
    int32_t field = 0;
};

struct Proportions {
    float ax = 0;
    float ay = 0;
};

// The named state the clock's logic and camera read and write (facts/clock-state.md, facts/clock-camera.md).
// time, scene.field and eased.fraction come from outside the logic: the time keeper, the field flag
// and the orbs.
struct ClockState {
    ClockTime time{};
    EasedAngles eased{};
    RodsState state{};
    Ramp appearance{};
    ClockColours colours{};
    CycleCounters cycleCounters{};
    CycleTables cycleTables{};
    LogicConstants logicConstants{};

    SceneScale scene{};
    float scaleTarget = 0;
    float scaleFactor = 0;
    int32_t timeFilled = 0;
    std::optional<uint16_t> spin;

    int32_t mode = 0;
    int32_t level = 0;
    int32_t overlayLevel = 0;
    Ramp vignetteRamp{};
    int32_t vignetteLength = 0;
    Ramp menuRamp{};
    int32_t tail = 0;
    int32_t counter = 0;

    Proportions proportions{};
    Vec4 position{};
    Vec4 direction{};
    Vec4 up{};
    Vec4 rotation{};
    float cameraOffset = 0;
    float zmax = 0;
    float cameraFactor = 0;
};

// Per-frame state the frame touches outside step(), in the model's order (clock_frame.mjs frame):
//   1. menuStep (clock_rest.mjs, menus) ticks menuRamp; blurLevel reads menuRamp.counter, so it runs before step.
//   2. Camera::matrices, then the head: the background draw ticks greyRamp (clock_rest.mjs background()).
//   3. The overlay draw ticks vignetteRamp (tickRamp) before step; overlayStep reads its state.
//   4. step().
// between/endOfFrame belong to the menus and are not part of the clock screen.
// spin (the cubes' angle) is present only when the capture has it; step() advances it by 0x1e.
// What the frame function does to the state after everything is drawn: logic, scale, blurLevel,
// the frame counter, overlayStep (HDD build).
template <class A>
struct ClockLogic {
    static void step(ClockState& clock);
    static void logic(ClockState& clock);
    static float seconds(const ClockTime& time);
    static float hours(const ClockTime& time);
    static void angles(ClockState& clock);
    static void colours(ClockState& clock);
    static void scale(ClockState& clock);
    static void blurLevel(ClockState& clock);
    static void overlayStep(ClockState& clock);
};

extern template struct ClockLogic<EeArithmetic>;
extern template struct ClockLogic<NativeArithmetic>;

}
