#pragma once
#include "Scene/ClockState.hpp"
#include "Scene/Matrix.hpp"

namespace scene {

struct CameraMatrices {
    Mat4 view{};
    Mat4 screen{};
};

// facts/clock-camera.md: the frame's two matrices; the approach offset is added to the position's z and then decays.
template <class A>
struct Camera {
    static CameraMatrices matrices(ClockState& clock);
};

extern template struct Camera<EeArithmetic>;
extern template struct Camera<NativeArithmetic>;

}
