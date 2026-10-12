#include "Scene/ColdState.hpp"

#include "Scene/Arithmetic.hpp"

namespace scene {

namespace {

constexpr uint32_t kState = 0x404F70;
constexpr uint32_t kEased = 0x370A98;
constexpr uint32_t kAppearance = 0x2B5640;
constexpr uint32_t kColours = 0x2B5600;
constexpr uint32_t kCounters = 0x370268;
constexpr uint32_t kTables = 0x2B5570;
constexpr uint32_t kConstants = 0x36FBCC;
constexpr uint32_t kColourOthers = 0x2B5650;
constexpr uint32_t kColourCurrent = 0x2B5660;
constexpr uint32_t kRodStride = 0x30;
constexpr uint32_t kAccent = 0x250;
constexpr uint32_t kFourth = 0x260;
constexpr uint32_t kProgressTarget = 0x270;
constexpr uint32_t kAccentFrame = 0x280;
constexpr uint32_t kCurrentTarget = 0x290;
constexpr int32_t kRods = 12;

Colour colourAt(const ProgramImage& program, uint32_t address) {
    return {program.integer(address), program.integer(address + 4), program.integer(address + 8), program.integer(address + 12)};
}

}

uint32_t advanceRand(uint32_t state, uint32_t calls) {
    for (uint32_t i = 0; i < calls; ++i) state = state * 0x41C64E6Du + 12345u;  // HDD OSD 1.10U rand 0x29C6E8 facts/clock-rand-chain.md
    return state;
}

std::array<int32_t, kOrbCount> randAngles(uint32_t& state) {
    std::array<int32_t, kOrbCount> out{};
    for (int32_t& angle : out) {
        state = state * 0x41C64E6Du + 12345u;  // HDD OSD 1.10U rand 0x29C6E8 verify_cold_state.mjs
        angle = static_cast<int32_t>((state & 0x7FFFFFFFu) % 65536u);
    }
    return out;
}

// HDD OSD 1.10U 0x22EF40, 0x22E9C8, 0x22EF20 verify_cold_state.mjs
template <class A>
ColdStateOut coldState(const ProgramImage& program, const ColdLengths& lengths, const ClockTime& time, uint32_t randState) {
    ClockState clock;
    clock.time = time;
    clock.logicConstants = {program.single(kConstants), program.single(kConstants + 4), program.single(kConstants + 8)};
    for (uint32_t i = 0; i < 6; ++i) clock.cycleTables.base[i] = colourAt(program, kTables + 16 * i);
    for (uint32_t i = 0; i < 3; ++i) clock.cycleTables.accent[i] = colourAt(program, kTables + 0x60 + 16 * i);
    clock.colours = {colourAt(program, kColours), colourAt(program, kColours + 0x10), colourAt(program, kColours + 0x20), colourAt(program, kColours + 0x30)};
    clock.cycleCounters = {{program.integer(kCounters), program.integer(kCounters + 4)}, {program.integer(kCounters + 8), program.integer(kCounters + 12)}, program.integer(kCounters + 16)};
    clock.eased.progress = program.single(kEased + 4);
    clock.eased.fraction = program.single(kEased + 8);
    for (int32_t i = 0; i < kRods; ++i) {
        const uint32_t at = kState + 0x10 + kRodStride * static_cast<uint32_t>(i);
        clock.state.rods[i] = {program.single(at), program.single(at + 4), colourAt(program, at + 0x10), colourAt(program, at + 0x20)};
    }
    clock.state.accent = colourAt(program, kState + kAccent);
    clock.state.fourth = colourAt(program, kState + kFourth);
    clock.state.progressTarget = program.single(kState + kProgressTarget);
    clock.state.accentFrame = colourAt(program, kState + kAccentFrame);
    clock.state.currentTarget = colourAt(program, kState + kCurrentTarget);
    clock.appearance = {lengths.one, program.integer(kAppearance + 4), program.integer(kAppearance + 8), program.integer(kAppearance + 12)};

    clock.state.accent = colourAt(program, kColourCurrent);
    clock.state.fourth = colourAt(program, kColourCurrent);
    const float hours = ClockLogic<A>::hours(time), seconds = ClockLogic<A>::seconds(time);
    const int32_t current = A::toInt(hours) % kRods;
    const uint32_t turn = (static_cast<uint32_t>(current) << 16) / kRods;
    const int32_t secondsTurn = A::toInt(A::div(A::mul(seconds, 65536.0f), 60.0f));
    clock.state.currentRod = current;
    clock.state.rodAngle = static_cast<int16_t>(turn);
    clock.state.secondsAngle = static_cast<int16_t>(secondsTurn);
    clock.eased.secondHand = static_cast<int16_t>(secondsTurn);
    clock.eased.hourHand = static_cast<int16_t>(A::toInt(A::div(A::mul(hours, 65536.0f), 12.0f)));

    ClockLogic<A>::angles(clock);
    ClockLogic<A>::colours(clock);
    for (int32_t i = 0; i < kRods; ++i) {
        clock.state.rods[i].appearance = 0;
        clock.state.rods[i].progress = 0;
        clock.state.rods[i].base = colourAt(program, i == current ? kColourCurrent : kColourOthers);
    }

    ColdStateOut out;
    out.rods = clock.state;
    out.eased = clock.eased;
    out.colours = clock.colours;
    out.cycle = clock.cycleCounters;
    out.cycleTables = clock.cycleTables;
    out.logicConstants = clock.logicConstants;
    out.appearance = clock.appearance;
    out.randState = randState;
    out.orbRandom = randAngles(out.randState);
    out.spriteFade = lengths.spriteFade;
    return out;
}

#ifndef SCENE_NATIVE_ONLY
template ColdStateOut coldState<EeArithmetic>(const ProgramImage&, const ColdLengths&, const ClockTime&, uint32_t);
#endif
template ColdStateOut coldState<NativeArithmetic>(const ProgramImage&, const ColdLengths&, const ClockTime&, uint32_t);

}
