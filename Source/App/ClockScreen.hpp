#pragma once
#include "App/Screen.hpp"
#include "Scene/Clock.hpp"

namespace app {

class ClockScreen : public FrameSource {
public:
    ClockScreen(const scene::ClockInputs& inputs, const scene::FrameInputs& frame);

    void setTime(const scene::ClockTime& time, const scene::ClockItems& items);
    void step() override;
    scene::Frame& frame() override { return m_frame; }
    bool done() const override { return false; }

    const scene::ClockState& state() const { return m_clock.state(); }

private:
    scene::Clock<scene::NativeArithmetic> m_clock;
    scene::FrameInputs m_inputs;
    scene::Frame m_frame;
};

}
