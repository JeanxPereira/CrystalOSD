#pragma once
#include <cstdint>

#include "Scene/ClockState.hpp"
#include "Scene/FrameHead.hpp"
#include "Scene/ProgramImage.hpp"

namespace scene {

struct ColdCameraOut {
    float scale = 0;
    Proportions proportions;
    float cameraOffset = 0;
    int32_t mode = 0, overlayLevel = 0;
    Rect fade;
    bool leaving = false;
    int32_t field = 0;
};

ColdCameraOut coldCamera(const ProgramImage& program, bool pal, uint32_t screenWidth, uint32_t screenHeight, uint32_t evenOddField);

}
