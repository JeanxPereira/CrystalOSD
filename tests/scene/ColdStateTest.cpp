#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <fstream>

#include "../Check.hpp"
#include "ColdCompare.hpp"
#include "Scene/Arithmetic.hpp"
#include "Scene/ColdRamps.hpp"
#include "Scene/ColdState.hpp"
#include "Scene/ProgramImage.hpp"
#include "Scene/SceneInputs.hpp"

namespace {

using nlohmann::json;
using scene::floatBits;

uint32_t half(int16_t low, int16_t high) { return static_cast<uint16_t>(low) | static_cast<uint32_t>(static_cast<uint16_t>(high)) << 16; }
uint32_t word(const json& words, size_t i) { return words.at(i).get<uint32_t>(); }

bool colour(const json& words, size_t at, const scene::Colour& c) {
    for (size_t k = 0; k < 4; ++k) if (word(words, at + k) != static_cast<uint32_t>(c[k])) return false;
    return true;
}

bool nearAngle(int16_t a, int16_t b) { const int d = static_cast<int16_t>(a - b); return d >= -1 && d <= 1; }

int exact(const scene::ProgramImage& program, const json& c) {
    scene::ClockTime time;
    time.milliseconds = scene::asFloat(c.at("ms").get<uint32_t>());
    time.seconds = c.at("seconds");
    time.minutes = c.at("minutes");
    time.hours = c.at("hours");
    scene::ColdLengths lengths = scene::coldLengths(false);
    lengths.one = c.at("one");
    const scene::ColdStateOut o = scene::coldState<scene::EeArithmetic>(program, lengths, time, c.at("seed"));
    const json& s = c.at("state");
    CHECK(word(s, 0) == static_cast<uint32_t>(o.rods.currentRod));
    CHECK(word(s, 1) == half(o.rods.secondsAngle, o.rods.rodAngle));
    for (size_t i = 0; i < 12; ++i) {
        const size_t at = (0x10 + 0x30 * i) / 4;
        CHECK(word(s, at) == floatBits(o.rods.rods[i].appearance));
        CHECK(word(s, at + 1) == floatBits(o.rods.rods[i].progress));
        CHECK(colour(s, at + 4, o.rods.rods[i].base));
        CHECK(colour(s, at + 8, o.rods.rods[i].reflection));
    }
    CHECK(colour(s, 0x250 / 4, o.rods.accent));
    CHECK(colour(s, 0x260 / 4, o.rods.fourth));
    CHECK(word(s, 0x270 / 4) == floatBits(o.rods.progressTarget));
    CHECK(colour(s, 0x280 / 4, o.rods.accentFrame));
    CHECK(colour(s, 0x290 / 4, o.rods.currentTarget));
    const json& e = c.at("eased");
    CHECK(word(e, 0) == half(o.eased.secondHand, o.eased.hourHand));
    CHECK(word(e, 1) == floatBits(o.eased.progress));
    CHECK(word(e, 2) == floatBits(o.eased.fraction));
    const json& a = c.at("appearance");
    CHECK(word(a, 0) == static_cast<uint32_t>(o.appearance.length) && word(a, 1) == static_cast<uint32_t>(o.appearance.counter));
    CHECK(word(a, 2) == static_cast<uint32_t>(o.appearance.changed) && word(a, 3) == static_cast<uint32_t>(o.appearance.state));
    const json& k = c.at("colours");
    CHECK(colour(k, 0, o.colours.base) && colour(k, 4, o.colours.reflection) && colour(k, 8, o.colours.fourth) && colour(k, 12, o.colours.currentReflection));
    const json& n = c.at("cycleCounters");
    CHECK(word(n, 0) == static_cast<uint32_t>(o.cycle.base.index) && word(n, 1) == static_cast<uint32_t>(o.cycle.base.wait));
    CHECK(word(n, 2) == static_cast<uint32_t>(o.cycle.accent.index) && word(n, 3) == static_cast<uint32_t>(o.cycle.accent.wait));
    CHECK(word(n, 4) == static_cast<uint32_t>(o.cycle.last));
    for (size_t i = 0; i < 7; ++i) CHECK(word(c.at("orbRandom"), i) == static_cast<uint32_t>(o.orbRandom[i]));
    CHECK(o.randState == c.at("endState").get<uint32_t>());
    CHECK(o.spriteFade == lengths.spriteFade);
    for (const scene::OrbRing& r : o.rings) CHECK(r.head == 0 && r.count == 0 && r.full == 0);

    const scene::ColdStateOut native = scene::coldState<scene::NativeArithmetic>(program, lengths, time, c.at("seed"));
    CHECK(native.orbRandom == o.orbRandom && native.randState == o.randState);
    if (time.minutes == 59 && time.seconds == 59) return 0;
    CHECK(native.rods.currentRod == o.rods.currentRod);
    CHECK(nearAngle(native.rods.rodAngle, o.rods.rodAngle) && nearAngle(native.rods.secondsAngle, o.rods.secondsAngle));
    CHECK(nearAngle(native.eased.secondHand, o.eased.secondHand) && nearAngle(native.eased.hourHand, o.eased.hourHand));
    CHECK(std::abs(native.rods.progressTarget - o.rods.progressTarget) < 1e-6f);
    CHECK(native.rods.rods[0].base == o.rods.rods[0].base && native.colours.base == o.colours.base && native.cycle.base.wait == o.cycle.base.wait);
    return 0;
}

int bootOracle(const scene::ProgramImage& program, const char* path) {
    const json input = scene::firstInput(path);
    const scene::ClockInputs boot = scene::clockInputs(input, scene::RodMesh{});
    const scene::ColdStateOut o = scene::coldState<scene::EeArithmetic>(program, scene::coldLengths(false), boot.state.time, 0x60440537u);
    CHECK(o.rods.currentRod == boot.state.state.currentRod);
    CHECK(o.rods.secondsAngle == boot.state.state.secondsAngle && o.rods.rodAngle == boot.state.state.rodAngle);
    for (size_t i = 0; i < 12; ++i) {
        CHECK(floatBits(o.rods.rods[i].appearance) == floatBits(boot.state.state.rods[i].appearance));
        CHECK(floatBits(o.rods.rods[i].progress) == floatBits(boot.state.state.rods[i].progress));
        CHECK(o.rods.rods[i].base == boot.state.state.rods[i].base && o.rods.rods[i].reflection == boot.state.state.rods[i].reflection);
    }
    CHECK(o.rods.accent == boot.state.state.accent && o.rods.fourth == boot.state.state.fourth);
    CHECK(floatBits(o.rods.progressTarget) == floatBits(boot.state.state.progressTarget));
    CHECK(o.rods.accentFrame == boot.state.state.accentFrame && o.rods.currentTarget == boot.state.state.currentTarget);
    CHECK(o.eased.secondHand == boot.state.eased.secondHand && o.eased.hourHand == boot.state.eased.hourHand);
    CHECK(floatBits(o.eased.progress) == floatBits(boot.state.eased.progress) && floatBits(o.eased.fraction) == floatBits(boot.state.eased.fraction));
    CHECK(o.colours.base == boot.state.colours.base && o.colours.reflection == boot.state.colours.reflection);
    CHECK(o.colours.fourth == boot.state.colours.fourth && o.colours.currentReflection == boot.state.colours.currentReflection);
    CHECK(o.cycle.base.index == boot.state.cycleCounters.base.index && o.cycle.base.wait == boot.state.cycleCounters.base.wait);
    CHECK(o.cycle.accent.index == boot.state.cycleCounters.accent.index && o.cycle.accent.wait == boot.state.cycleCounters.accent.wait);
    CHECK(o.cycle.last == boot.state.cycleCounters.last);
    CHECK(o.appearance == boot.state.appearance);
    CHECK(o.orbRandom == boot.orbRandom);
    CHECK(o.spriteFade == boot.orbs.spriteFade);
    return 0;
}

}

int main(int argc, char** argv) {
    CHECK(argc == 4);
    const scene::ProgramImage program = scene::ProgramImage::load(argv[1]);
    std::ifstream in(argv[2]);
    CHECK(in.good());
    const json j = json::parse(in);
    size_t cases = 0;
    for (const json& c : j.at("cases")) {
        if (exact(program, c)) return 1;
        ++cases;
    }
    CHECK(cases == 66);
    if (bootOracle(program, argv[3])) return 1;
    std::printf("ColdStateTest: %zu cases\n", cases);
    return 0;
}
