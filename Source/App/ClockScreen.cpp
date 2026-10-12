#include "App/ClockScreen.hpp"

#include "App/NativeFrames.hpp"
#include "Scene/ColdStart.hpp"

namespace app {

ClockScreen::ClockScreen(const scene::ClockInputs& inputs, const scene::FrameInputs& frame) : m_clock(inputs), m_inputs(frame) {
    firstFrame(m_inputs);
    m_inputs.threadStep = false;
}

void ClockScreen::setTime(const scene::ClockTime& time, const scene::ClockItems& items) {
    m_inputs.time = time;
    m_inputs.items = items;
}

void ClockScreen::step() {
    m_frame = m_clock.frame(m_inputs);
    scene::fillTime(m_inputs);
    m_inputs.threadStep = true;
    nextFrame(m_inputs);
}

}
