#include "App/BootChain.hpp"

#include "Scene/opening/Flat.hpp"

namespace app {

BootChain::BootChain(std::unique_ptr<FrameSource> opening, std::unique_ptr<FrameSource> clock, int gapFrames)
    : m_opening(std::move(opening)), m_clock(std::move(clock)), m_gap(gapFrames), m_gapLeft(gapFrames) {}

const char* BootChain::name() const {
    switch (m_phase) {
    case BootPhase::Opening: return "opening";
    case BootPhase::Gap: return "black gap";
    case BootPhase::Clock: return "clock";
    }
    return "";
}

void BootChain::step() {
    if (m_phase == BootPhase::Opening) {
        m_opening->step();
        m_active = &m_opening->frame();
        if (m_opening->done()) m_phase = m_gap > 0 ? BootPhase::Gap : BootPhase::Clock;
        return;
    }
    if (m_phase == BootPhase::Gap) {
        m_active = &m_frame;
        m_frame = {};
        m_frame.displayIndex = m_display;
        m_frame.textureSet = scene::TextureSet::Opening;
        m_frame.depthBits = 24;
        scene::opening::Flat<scene::NativeArithmetic>::scissor(m_frame.passes);
        m_display ^= 1;
        if (--m_gapLeft == 0) m_phase = BootPhase::Clock;
        return;
    }
    m_clock->step();
    m_active = &m_clock->frame();
}

}
