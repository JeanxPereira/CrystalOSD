#pragma once
#include <array>
#include <cstdint>
#include <vector>

#include "Scene/Matrix.hpp"
#include "Scene/opening/Types.hpp"

namespace scene::opening {

// facts/opening.md section 3: block B at 0x003DB800, in the order of its offsets.
using Block = std::array<float, 15>;
namespace BlockAt {
constexpr int Ax = 0, Ay = 1, Az = 2, Vx = 3, Vy = 4, Vz = 5, Px = 6, Py = 7, Pz = 8, Wx = 9, Wy = 10, RollAcc = 11, Qx = 12, Qy = 13, RollVel = 14;
}

namespace TimelineConstant {
constexpr float HddRollVelocity = 0.0004f, HddWaitVz = -0.00014f, HddLateVz = 2.5e-5f, HddExecVz = 0.003f, StageOneAz = 4e-7f, HddAz = 4e-4f,
                HddRollAcc = 8e-5f, PlainVz = 0.0099f, PlainRollAcc = 0.000195f, Pi = 3.14159274101257324f, TwoPi = 6.28318548202514648f;
}

// verify_opening_camera_v2.mjs read(probe), verify_opening3_stages.mjs read(probe), the logo of func_0021DB50.
struct TimelineState {
    int32_t counter = 1, stage = 0;
    Block block{};
    Vec4 camera{}, direction{}, up{};
    float roll = 0.0f;
    bool go = false;
    int32_t pending = 1;
    int32_t scene = 0, snapshot = 0;
    std::array<Vec4, 3> lights{};
    int32_t logoState = 0, logoValue = 0, logoStep = 4;
};

struct Matrices {
    Mat4 camera{}, viewScreen{}, worldToScreen{}, normalLight{};
};

// result: 0 while the intro runs, 1 (scene + 1) on the call that ends it. fadeAlpha, blurLevel, logoAlpha: the arguments of the
// draw functions of the frame, -1 (blurLevel 0) when the frame does not call them.
struct TimelineStep {
    int32_t result = 0;
    Matrices matrices;
    int32_t fadeAlpha = -1, blurLevel = 0, logoAlpha = -1, logoValue = 0;
    std::vector<SoundEvent> sounds;
};

template <class A>
class Timeline {
public:
    Timeline(const BootOptions& options, const TimelineState& initial);

    // The state of the module's first call: OpeningInitAnimation 0x0021EE48 (step z 0.04, roll velocity 0.001), nothing placed yet.
    static TimelineState initialState(int32_t counter = 1);

    // OpeningInitOpeningScene 0x00221BB8, run between the first and the second call.
    void sceneSetUp();

    // OpeningProcessInner 0x0021EF00 once, then the matrices; the frame counter moves on afterwards.
    TimelineStep step(uint32_t discState);

    const TimelineState& state() const { return m_state; }

private:
    BootOptions m_options;
    TimelineState m_state;
};

}
