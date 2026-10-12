#pragma once
#include <array>
#include <cstdint>

#include "Scene/Frame.hpp"

namespace scene::opening {

// facts/opening.md 5.1: the chain func_002214F8 starts for one tower, 0x840 bytes at 0x002A4EE0.
struct TowerChain {
    std::array<uint8_t, 0x840> bytes{};
};

constexpr uint32_t kTowerChainAddress = 0x002A4EE0;
// The GS offset the tower draws run under, in pixels.
constexpr float kTowerOffsetX = 1728.0f, kTowerOffsetY = 1936.0f;

// Vertices as the GS receives them (z is the packed XYZ2's Z, bits 4 up); six faces of four vertices as strips; kicked[i] is false when the microprogram wrote the vertex without the
// drawing kick (ADC); alpha is the ALPHA register value of the blend packet it kicked first.
struct TowerVertices {
    std::array<Vertex, 24> vertices{};
    std::array<bool, 24> kicked{};
    uint64_t alpha = 0;
};

// facts/opening.md 5.1 verify_opening_vu1_v2.mjs run: the three parts of the microprogram, 0..25, 33..96 and the
// vertex rule of instructions 77 and 142.
template <class A>
struct TowerVu1 {
    static TowerVertices run(const TowerChain& chain);
};

}
