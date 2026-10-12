#pragma once
#include <cstdint>

#include "Scene/ClockState.hpp"
#include "Scene/FrameHead.hpp"
#include "Scene/Matrix.hpp"
#include "Scene/ProgramImage.hpp"
#include "Scene/Ramp.hpp"
#include "Scene/Rods.hpp"

namespace scene {

inline Colour colourAt(const ProgramImage& p, uint32_t a) { return {p.integer(a), p.integer(a + 4), p.integer(a + 8), p.integer(a + 12)}; }
inline Ramp rampAt(const ProgramImage& p, uint32_t a) { return {p.integer(a), p.integer(a + 4), p.integer(a + 8), p.integer(a + 12)}; }
inline Vec4 vec4At(const ProgramImage& p, uint32_t a) { return {p.single(a), p.single(a + 4), p.single(a + 8), p.single(a + 12)}; }
inline Mat4 mat4At(const ProgramImage& p, uint32_t a) { return {vec4At(p, a), vec4At(p, a + 16), vec4At(p, a + 32), vec4At(p, a + 48)}; }

inline Rect rectAt(const ProgramImage& p, uint32_t a) {
    Rect r;
    r.colour = colourAt(p, a);
    r.x0 = p.integer(a + 0x10);
    r.y0 = p.integer(a + 0x14);
    r.u0 = p.integer(a + 0x18);
    r.v0 = p.integer(a + 0x1C);
    r.x1 = p.integer(a + 0x20);
    r.y1 = p.integer(a + 0x24);
    r.u1 = p.integer(a + 0x28);
    r.v1 = p.integer(a + 0x2C);
    r.z = p.integer(a + 0x30);
    r.blend = p.integer(a + 0x34);
    r.textured = p.integer(a + 0x38);
    return r;
}

inline RodRecord rodRecordAt(const ProgramImage& p, uint32_t a) {
    RodRecord r;
    r.number = p.integer(a);
    r.faces = p.integer(a + 4);
    r.local = mat4At(p, a + 0x20);
    r.sx = p.single(a + 0x68);
    r.sy = p.single(a + 0x6C);
    r.sz = p.single(a + 0x70);
    r.base = colourAt(p, a + 0x80);
    r.strength = p.single(a + 0x90);
    r.textured = colourAt(p, a + 0xA0);
    r.pair = {p.single(a + 0xB0), p.single(a + 0xB4)};
    r.refraction = p.single(a + 0xB8);
    r.reflection = colourAt(p, a + 0xC0);
    r.extra = colourAt(p, a + 0xD0);
    return r;
}

}
