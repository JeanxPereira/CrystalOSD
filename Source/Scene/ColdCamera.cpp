#include "Scene/ColdCamera.hpp"

#include <bit>

namespace scene {

namespace {

constexpr uint32_t kFadeRecord = 0x2B5F30;
constexpr uint32_t kProportionPal = 0x36FB84;
constexpr uint32_t kProportionNtsc = 0x36FB88;
constexpr uint32_t kCameraOffsetBits = 0xC2C80000;
constexpr float kUnit = 1.0f;
constexpr int32_t kMode = 2;

Rect rectAt(const ProgramImage& program, uint32_t address) {
    Rect r;
    for (uint32_t i = 0; i < 4; ++i) r.colour[i] = program.integer(address + 4 * i);
    r.x0 = program.integer(address + 0x10);
    r.y0 = program.integer(address + 0x14);
    r.u0 = program.integer(address + 0x18);
    r.v0 = program.integer(address + 0x1C);
    r.x1 = program.integer(address + 0x20);
    r.y1 = program.integer(address + 0x24);
    r.u1 = program.integer(address + 0x28);
    r.v1 = program.integer(address + 0x2C);
    r.z = program.integer(address + 0x30);
    r.blend = program.integer(address + 0x34);
    r.textured = program.integer(address + 0x38);
    return r;
}

}

// HDD OSD 1.10U 0x225D98, 0x225950, 0x234C28(2), 0x225DB0, 0x2259B8 verify_cold_camera.mjs
ColdCameraOut coldCamera(const ProgramImage& program, bool pal, uint32_t screenWidth, uint32_t screenHeight, uint32_t evenOddField) {
    ColdCameraOut out;
    out.scale = kUnit;
    out.proportions.ax = kUnit;
    out.proportions.ay = program.single(pal ? kProportionPal : kProportionNtsc);
    out.cameraOffset = std::bit_cast<float>(kCameraOffsetBits);
    out.mode = kMode;
    out.overlayLevel = 0;
    out.fade = rectAt(program, kFadeRecord);
    out.fade.colour[0] = 0;
    out.fade.colour[1] = 0;
    out.fade.colour[2] = 0;
    out.fade.x1 = static_cast<int32_t>(screenWidth << 4);
    out.fade.y1 = static_cast<int32_t>(screenHeight << 4);
    out.leaving = false;
    out.field = static_cast<int32_t>(evenOddField);
    return out;
}

}
