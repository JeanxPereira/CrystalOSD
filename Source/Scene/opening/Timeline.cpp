#include "Scene/opening/Timeline.hpp"

#include "Scene/opening/Vu0.hpp"

namespace scene::opening {

namespace {

constexpr int32_t kFps = 60;

}

template <class A>
Timeline<A>::Timeline(const BootOptions& options, const TimelineState& initial) : m_options(options), m_state(initial) {}

template <class A>
TimelineState Timeline<A>::initialState(int32_t counter) {
    TimelineState s;
    s.counter = counter;
    s.block[BlockAt::Pz] = 0.04f;
    s.block[BlockAt::RollVel] = 0.001f;
    return s;
}

template <class A>
void Timeline<A>::sceneSetUp() {
    m_state.camera = {0.0f, 0.0f, 16.0f, 0.0f};
    m_state.direction = {0.0f, 0.0f, 1.0f, 0.0f};
    m_state.up = {0.0f, 1.0f, 0.0f, 1.0f};
    m_state.roll = -0.12f;
    m_state.lights = {{{0.0f, 0.0f, -1.0f, 0.0f}, {0.5f, 0.5f, 0.0f, 0.0f}, {-0.5f, -0.5f, 0.0f, 0.0f}}};
}

template <class A>
TimelineStep Timeline<A>::step(uint32_t discState) {
    using V = Vu0<A>;
    TimelineState& s = m_state;
    Block& b = s.block;
    TimelineStep out;
    out.result = s.scene;

    // facts/opening.md 3 stage selection (0x0021EF4C): threshold[stage] < camera.z
    constexpr int32_t kThresholds[8] = {16, 56, 104, 320, 672, 800, 1160, 1160};
    if (s.stage < 8 && static_cast<float>(kThresholds[s.stage]) < s.camera[2]) s.stage += 1;

    // facts/opening.md 3 stages 1 to 3 (verify_opening3_stages.mjs stages)
    if (s.stage == 1) {
        if (m_options.hddReady) {
            b[BlockAt::RollVel] = TimelineConstant::HddRollVelocity;
            b[BlockAt::Vz] = s.counter < kFps * 20 / 6 ? TimelineConstant::HddWaitVz : TimelineConstant::HddLateVz;
            if (m_options.hddExec != 0) {
                b[BlockAt::Vz] = TimelineConstant::HddExecVz;
                s.go = true;
                s.stage += 1;
            } else if (kFps * 20 < s.counter) {
                m_options.hddReady = false;
            }
        } else {
            b[BlockAt::Az] = TimelineConstant::StageOneAz;
            const uint32_t index = discState - 0x64u;
            const bool releases = index < 17 && ((0x1DFC1u >> index) & 1u) != 0;
            if (releases && 2 * kFps < s.counter) {
                s.go = true;
                s.stage += 1;
            }
        }
    } else if (s.stage == 2) {
        if (kFps * 10 < s.counter) s.go = true;
        if (s.go) {
            if (s.pending == 1) {
                const auto queue = [&](uint32_t id, int32_t argument) { out.sounds.push_back({id, argument, s.counter}); };
                if (m_options.clockForced) {
                    queue(0x6140, 1);
                } else if (m_options.hddReady && m_options.hddExec == 1) {
                    queue(0x6150, 0xF);
                } else {
                    s.snapshot = static_cast<int32_t>(discState);
                    const uint32_t index = discState - 0x6Au;
                    if (index == 0 || index == 1 || index == 8 || index == 9) {
                        queue(0x6150, 0xF);
                    } else if (index >= 2 && index <= 4) {
                        queue(0x6140, 7);
                        queue(0x6150, 0x11);
                    } else {
                        queue(0x6140, 1);
                    }
                }
                s.pending = -1;
            }
            if (m_options.hddReady || m_options.hddExec != 0) {
                b[BlockAt::Az] = TimelineConstant::HddAz;
                b[BlockAt::RollAcc] = TimelineConstant::HddRollAcc;
            } else {
                b[BlockAt::Vz] = TimelineConstant::PlainVz;
                b[BlockAt::RollAcc] = TimelineConstant::PlainRollAcc;
            }
            b[BlockAt::Vx] = b[BlockAt::Vy] = b[BlockAt::Wx] = b[BlockAt::Wy] = 0.0f;
        }
    } else if (s.stage == 3) {
        out.result = s.scene + 1;
    }

    // facts/opening.md 3 integrator (0x0021F37C..0x0021F508, verify_opening_camera_v2.mjs integrate), NTSC k = 1
    const float k = 1.0f;
    const auto advance = [&](float twice, float add) { return A::mul(A::mul(A::addExact(A::addExact(twice, twice), add), 0.5f), k); };
    const Block in = b;
    b[BlockAt::RollVel] = A::addExact(in[BlockAt::RollVel], advance(in[BlockAt::RollAcc], 0.0f));
    b[BlockAt::Px] = A::addExact(in[BlockAt::Px], advance(in[BlockAt::Vx], in[BlockAt::Ax]));
    b[BlockAt::Py] = A::addExact(in[BlockAt::Py], advance(in[BlockAt::Vy], in[BlockAt::Ay]));
    b[BlockAt::Pz] = A::addExact(in[BlockAt::Pz], advance(in[BlockAt::Vz], in[BlockAt::Az]));
    b[BlockAt::Vz] = A::addExact(in[BlockAt::Vz], A::mul(in[BlockAt::Az], k));
    float roll = A::addExact(s.roll, advance(b[BlockAt::RollVel], in[BlockAt::RollAcc]));
    b[BlockAt::Qx] = A::addExact(in[BlockAt::Qx], advance(in[BlockAt::Wx], 0.0f));
    b[BlockAt::Qy] = A::addExact(in[BlockAt::Qy], advance(in[BlockAt::Wy], 0.0f));
    s.camera[0] = A::addExact(s.camera[0], advance(b[BlockAt::Px], in[BlockAt::Vx]));
    s.camera[1] = A::addExact(s.camera[1], advance(b[BlockAt::Py], in[BlockAt::Vy]));
    s.camera[2] = A::addExact(s.camera[2], advance(b[BlockAt::Pz], b[BlockAt::Vz]));
    constexpr float kPi = TimelineConstant::Pi, kTwoPi = TimelineConstant::TwoPi;
    if (kPi < roll) roll = A::subExact(roll, kTwoPi);
    if (roll < -kPi) roll = A::addExact(roll, kTwoPi);
    s.roll = roll;
    s.up[0] = A::sinf(roll);
    s.up[1] = A::cosf(roll);

    // facts/opening.md 3 matrices (0x0021F528..0x0021F5C0, verify_opening_inputs.mjs): ay is D_0036F984, z range 1 .. D_0036FA08
    Matrices& m = out.matrices;
    m.normalLight = V::normalLightMatrix(s.lights[0], s.lights[1], s.lights[2]);
    m.camera = V::cameraMatrix(s.camera, s.direction, s.up);
    m.viewScreen = V::viewScreenMatrix(1024.0f, 1.0f, asFloat(0x3eea4e16u), 2048.0f, 2048.0f, 1.0f, asFloat(0x4b7fffffu), 1.0f, 65536.0f);
    m.worldToScreen = V::mulMatrix(m.viewScreen, m.camera);

    if (out.result == s.scene) {
        // func_00221B00 fade, func_00221A50 blur level, func_0021DB50 logo (verify_opening_camera_v2.mjs): the camera after the integrator
        const float z = s.camera[2];
        if (s.counter < 2) out.fadeAlpha = 0x80;
        if (72.0f < z) out.fadeAlpha = A::toInt(A::mul(A::mul(A::subExact(z, 72.0f), 128.0f), 0.03125f));
        if (320.0f <= z) out.fadeAlpha = 0x80;
        if (56.0f < z) {
            int32_t level = A::toInt(A::quotientExact(A::subExact(z, 56.0f), 12.0f));
            if (level >= 4) level = 3;
            if (level < 0) level = 0;
            out.blurLevel = level;
        }
        if (s.logoState == 1 || (s.logoState == 0 && 18.0f < z)) {
            s.logoState = 1;
            s.logoValue += s.logoStep;
            out.logoAlpha = s.logoValue < 0x70 ? s.logoValue : 0x70;
            if (s.logoValue >= 0xF0) s.logoStep = -4;
            if (s.logoValue <= 0) {
                s.logoState = -1;
                s.logoStep = 4;
            }
        }
        out.logoValue = s.logoValue;
    }
    s.counter += 1;
    return out;
}

#ifndef SCENE_NATIVE_ONLY
template class Timeline<EeArithmetic>;
#endif
template class Timeline<NativeArithmetic>;

}
