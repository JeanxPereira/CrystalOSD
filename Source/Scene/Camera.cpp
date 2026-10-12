#include "Scene/Camera.hpp"

namespace scene {

// facts/clock-camera.md: the screen matrix, the view matrix with the approach offset added to the position's z, the offset's decay.
template <class A>
CameraMatrices Camera<A>::matrices(ClockState& clock) {
    using M = Matrix<A>;
    CameraMatrices out;
    out.screen = M::viewScreen(512.0f, clock.proportions.ax, clock.proportions.ay, 2048.0f, 2048.0f, 1.0f, clock.zmax, 1.0f, 65536.0f);
    Vec4 position = clock.position;
    const float offset = clock.cameraOffset;
    position[2] = A::add(position[2], offset);
    out.view = M::viewMatrix(position, clock.direction, clock.up, clock.rotation);
    clock.cameraOffset = A::mul(offset, clock.cameraFactor);
    return out;
}

#ifndef SCENE_NATIVE_ONLY
template struct Camera<EeArithmetic>;
#endif
template struct Camera<NativeArithmetic>;

}
