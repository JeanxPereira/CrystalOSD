#include "Scene/ClockState.hpp"

#include <cstdlib>
#include <span>

namespace scene {

namespace {

template <class A>
float seconds(const ClockTime& time) { return A::add(static_cast<float>(time.seconds), A::div(time.milliseconds, 1000.0f)); }
template <class A>
float minutes(const ClockTime& time) { return A::add(static_cast<float>(time.minutes), A::div(seconds<A>(time), 60.0f)); }
template <class A>
float hours(const ClockTime& time) { return A::add(static_cast<float>(time.hours), A::div(minutes<A>(time), 60.0f)); }

// One step of an eased 16-bit angle: the difference, wrapped to 16 bits, times a factor.
template <class A>
int32_t ease(int64_t target, int32_t old, float factor) {
    const int32_t wrapped = static_cast<int16_t>(static_cast<uint16_t>(target - old));
    return u16(A::toInt(A::add(A::mul(static_cast<float>(wrapped), factor), static_cast<float>(s16(old)))));
}

// facts/clock-state.md: HDD func_0022EBD0, the time becomes the current rod, the eased angles and the progress target.
template <class A>
void timeToAngles(ClockState& clock) {
    const ClockTime& time = clock.time;
    const float k1 = clock.logicConstants.rodEasing, k2 = clock.logicConstants.secondsEasing;
    const int32_t current = A::toInt(hours<A>(time)) % 12;
    const uint32_t turn = static_cast<uint32_t>(static_cast<double>(static_cast<uint32_t>(current) << 16) / 12.0);
    const int32_t oldSeconds = clock.state.secondsAngle, oldRod = clock.state.rodAngle;
    const bool snap = std::abs(s16(oldSeconds)) < 201 || s16(oldSeconds) == -32768;
    const int32_t secondsTurn = A::toInt(A::div(A::mul(seconds<A>(time), 65536.0f), 60.0f));
    const int32_t hourOld = clock.eased.hourHand;
    const int32_t hourStep = s16(A::toInt(A::sub(A::div(A::mul(hours<A>(time), 65536.0f), 12.0f), static_cast<float>(hourOld))));
    const float progress = A::sub(1.0f, A::div(minutes<A>(time), 60.0f));
    clock.state.currentRod = current;
    clock.state.rodAngle = static_cast<int16_t>(snap ? u16(static_cast<int32_t>(turn)) : ease<A>(turn, oldRod, k1));
    clock.state.secondsAngle = static_cast<int16_t>(ease<A>(secondsTurn, oldSeconds, k2));
    const int32_t secondHand = ease<A>(secondsTurn, static_cast<uint16_t>(clock.eased.secondHand), k2);
    clock.eased.hourHand = static_cast<int16_t>(u16(A::toInt(A::add(A::mul(static_cast<float>(hourStep), k2), static_cast<float>(hourOld)))));
    clock.eased.secondHand = static_cast<int16_t>(secondHand);
    clock.state.progressTarget = progress;
    clock.eased.progress = progress;
}

// Move four ints one unit each toward a target; true when nothing had to move.
bool chase(Colour& colour, const Colour& target) {
    bool moved = false;
    for (int c = 0; c < 4; ++c) {
        if (colour[c] == target[c]) continue;
        colour[c] += colour[c] < target[c] ? 1 : -1;
        moved = true;
    }
    return !moved;
}

// A colour that walks through a table, one unit every ninth call (HDD func_0022EAD0, func_0022EB50).
void cycle(Colour& colour, CycleCounter& counter, std::span<const Colour> table) {
    if (static_cast<uint32_t>(counter.wait) < 8) {
        counter.wait += 1;
        return;
    }
    int32_t index = counter.index;
    if (chase(colour, table[index])) {
        index += 1;
        if (table[index][3] == -1) index = 0;
    }
    counter.index = index;
    counter.wait = 0;
}

// facts/clock-state.md: HDD func_0022EE20 and func_0022E8C0, the two cycling colours, their mix, and every chaser.
void cycleColours(ClockState& clock) {
    RodsState& state = clock.state;
    ClockColours& base = clock.colours;
    cycle(base.base, clock.cycleCounters.base, clock.cycleTables.base);
    state.currentTarget = base.base;
    state.accentFrame = {0xa7, 0xd9, 0xff, 0};
    cycle(state.accentFrame, clock.cycleCounters.accent, clock.cycleTables.accent);
    for (int c = 0; c < 3; ++c) state.currentTarget[c] = (state.accentFrame[c] + base.base[c]) >> 1;
    clock.cycleCounters.last = 3;

    for (int i = 0; i < 12; ++i) {
        const bool current = i == state.currentRod;
        chase(state.rods[i].base, current ? state.currentTarget : base.base);
        chase(state.rods[i].reflection, current ? base.currentReflection : base.reflection);
    }
    chase(state.accent, state.accentFrame);
    chase(state.fourth, base.fourth);
}

}

template <class A>
float ClockLogic<A>::seconds(const ClockTime& time) { return scene::seconds<A>(time); }

template <class A>
float ClockLogic<A>::hours(const ClockTime& time) { return scene::hours<A>(time); }

template <class A>
void ClockLogic<A>::angles(ClockState& clock) {
    timeToAngles<A>(clock);
}

template <class A>
void ClockLogic<A>::colours(ClockState& clock) {
    cycleColours(clock);
}

template <class A>
void ClockLogic<A>::logic(ClockState& clock) {
    tickRamp(clock.appearance);
    angles(clock);
    colours(clock);
    const float step = clock.logicConstants.progressStep;
    const int32_t current = clock.state.currentRod;
    const double quotient = static_cast<double>(clock.appearance.counter) * 128.0 / static_cast<double>(clock.appearance.length);
    const float appearance = A::cut(std::trunc(quotient) * 0.0078125);
    for (int i = 0; i < 12; ++i) {
        float progress = 0;
        if (i == current) {
            const float target = clock.state.progressTarget, old = clock.state.rods[i].progress;
            if (old < target) {
                progress = A::add(old, step);
                if (target < progress) progress = target;
            } else {
                progress = target;
            }
        }
        clock.state.rods[i].progress = progress;
        clock.state.rods[i].appearance = appearance;
    }
}

// facts/clock-state.md: first half of HDD func_00232640, the scene scale eases toward its target.
template <class A>
void ClockLogic<A>::scale(ClockState& clock) {
    if (clock.spin) clock.spin = static_cast<uint16_t>((*clock.spin + 0x1e) & 0xffff);
    const float old = clock.scene.scale;
    const bool filled = clock.timeFilled != 0;
    clock.scene.scale = filled ? A::add(A::mul(A::sub(clock.scaleTarget, old), clock.scaleFactor), old) : 0.0f;
}

// facts/clock-state.md: second half of HDD func_00232640, the blur level from the menu ramp.
template <class A>
void ClockLogic<A>::blurLevel(ClockState& clock) {
    const int64_t counter = clock.menuRamp.counter, tail = clock.tail;
    clock.level = counter < tail ? static_cast<int32_t>(10 - (counter * 10) / tail) : 0;
}

// facts/clock-state.md: HDD func_00234EA8, the overlay level's state machine.
template <class A>
void ClockLogic<A>::overlayStep(ClockState& clock) {
    const int32_t mode = clock.mode;
    if (mode <= 0) return;
    int32_t level = clock.overlayLevel;
    if (mode < 3) {
        level += 1;
        int32_t now = mode;
        if (level > 0x80) {
            level = 0x80;
            now = 0;
            clock.mode = 0;
        }
        clock.overlayLevel = level;
        if (now == 2 && level == 0x80 - clock.vignetteLength) {
            Ramp& ramp = clock.vignetteRamp;
            if (ramp.state == 0) {
                ramp.counter = 0;
                ramp.changed = 1;
                ramp.state = 1;
            }
        }
    } else if (mode == 3) {
        level -= 1;
        clock.overlayLevel = level < 0 ? 0 : level;
    }
}

template <class A>
void ClockLogic<A>::step(ClockState& clock) {
    logic(clock);
    scale(clock);
    blurLevel(clock);
    clock.counter += 1;
    overlayStep(clock);
}

#ifndef SCENE_NATIVE_ONLY
template struct ClockLogic<EeArithmetic>;
#endif
template struct ClockLogic<NativeArithmetic>;

}
