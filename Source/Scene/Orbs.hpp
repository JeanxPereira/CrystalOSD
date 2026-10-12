#pragma once
#include <array>
#include <cstdint>
#include <vector>

#include "Scene/Matrix.hpp"
#include "Scene/Ramp.hpp"

namespace scene {

constexpr int kOrbCount = 7;
constexpr int kRingLength = 50;

// One ring entry: the orb's screen position relative to the screen centre (x, y) and its depth,
// then its colour as the OSD holds it (0..255 ints, alpha 0x80 = 1).
struct OrbEntry {
    float x = 0, y = 0, z = 0;
    std::array<int32_t, 4> colour{};
};

struct OrbRing {
    int32_t head = 0;
    int32_t count = 0;
    int32_t full = 0;
    std::array<OrbEntry, kRingLength> entries{};
};

// What the orbs carry from frame to frame.
struct OrbState {
    std::array<OrbRing, kOrbCount> rings{};
    Ramp spriteFade{};
    float fraction = 0;
};

// What the orbs read of the rest of the clock at the frame's start.
struct OrbInputs {
    float milliseconds = 0;
    int32_t seconds = 0;
    int32_t minutes = 0;
    int32_t secondHand = 0;
    int32_t hourHand = 0;
    float progress = 0;
    float minuteFactor = 0;
    float fractionEasing = 0;
    float sceneScale = 0;
    std::array<int32_t, 4> colour{};
    int32_t width = 640;
    int32_t height = 224;
    int32_t mode = 0;
    int32_t overlayLevel = 0;
    bool hasEntryData = false;
    int32_t wide = 0;
    std::array<int32_t, kOrbCount> random{};
    std::array<std::array<int32_t, 4>, kOrbCount> colours{};
};

// Native units: x, y in pixels from the screen's top-left corner (the GS value less the screen
// corner's offset, over 16); z in the screen matrix's depth units (the GS z over 16); u, v
// normalized; trail colour 0..1 (over 255), sprite colour a texture multiplier (over 128), alpha
// over 128.
struct OrbVertex {
    float x = 0, y = 0, z = 0;
    float u = 0, v = 0, q = 1;
    float r = 0, g = 0, b = 0, a = 0;
};

struct OrbTrail {
    std::vector<OrbVertex> points;
    float headerAlpha = 0;
};

struct OrbSprite {
    OrbVertex first;
    OrbVertex second;
};

struct OrbSend {
    OrbTrail trail;
    OrbSprite glow;
    OrbSprite disc;
};

struct OrbDraw {
    int k = 0;
    int drawn = 0;
    float depthKey = 0;
    Mat4 local{};
    float cx = 0, cy = 0, cz = 0;
    std::array<OrbSend, 2> sends{};
};

struct OrbFrame {
    std::array<OrbDraw, kOrbCount> orbs{};
    std::array<int, kOrbCount> order{};
};

// facts/clock-orbs.md, facts/clock-camera.md: the orbits, the rings, the trails and the sprites.
template <class A>
struct Orbs {
    static Mat4 orbitMatrix(int k, int32_t hourHand, int32_t secondHand, float minuteTurn, float secondsTurn, float factor, float radius);
    static OrbFrame frame(OrbState& state, const OrbInputs& in, const Mat4& view, const Mat4& screen);
};

extern template struct Orbs<EeArithmetic>;
extern template struct Orbs<NativeArithmetic>;

}
