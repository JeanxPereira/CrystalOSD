#pragma once
#include "Scene/Clock.hpp"

namespace app {

// The window draws whole progressive frames, so every frame is field 0: on the OSD the odd field moves the
// refraction's v by half a line (scene/Rods.cpp, refracted), which a progressive picture shows as a shake. The
// display buffer index keeps alternating as the OSD's double buffer does.
inline void firstFrame(scene::FrameInputs& in) { in.field = 0; }
inline void nextFrame(scene::FrameInputs& in) {
    in.field = 0;
    in.displayIndex ^= 1;
}

}  // namespace app
