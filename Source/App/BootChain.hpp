#pragma once
#include <memory>

#include "App/Screen.hpp"

namespace app {

enum class BootPhase { Opening, Gap, Clock };

class BootChain : public FrameSource {
public:
    BootChain(std::unique_ptr<FrameSource> opening, std::unique_ptr<FrameSource> clock, int gapFrames);
    BootChain(const BootChain&) = delete;
    BootChain& operator=(const BootChain&) = delete;

    void step() override;
    scene::Frame& frame() override { return *m_active; }
    bool done() const override { return false; }

    BootPhase phase() const { return m_phase; }
    const char* name() const;
    FrameSource& opening() { return *m_opening; }
    FrameSource& clock() { return *m_clock; }

private:
    std::unique_ptr<FrameSource> m_opening, m_clock;
    int m_gap = 0, m_gapLeft = 0, m_display = 0;
    BootPhase m_phase = BootPhase::Opening;
    scene::Frame m_frame;
    scene::Frame* m_active = &m_frame;
};

}
