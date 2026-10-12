#pragma once
#include <memory>
#include <optional>
#include <vector>

#include "App/Screen.hpp"
#include "Scene/opening/Opening.hpp"

namespace app {

class OpeningScreen : public FrameSource {
public:
    OpeningScreen(const scene::opening::BootOptions& options, std::shared_ptr<const scene::ProgramImage> program);

    void step() override;
    scene::Frame& frame() override { return m_frame; }
    bool done() const override { return m_opening.ended(); }

    int32_t counter() const { return m_opening.counter(); }
    int32_t stage() const { return m_opening.timeline().state().stage; }
    float cameraZ() const { return m_opening.timeline().state().camera[2]; }
    const scene::opening::HandOff* handOff() const { return m_opening.handOff(); }
    uint32_t randState() const { return m_opening.randState(); }
    const std::vector<scene::opening::SoundEvent>& sounds() const { return m_opening.sounds(); }
    const std::vector<scene::SoundCommand>& commands() const { return m_opening.commands(); }
    std::vector<scene::SoundCommand> startCommands() const { return m_opening.startCommands(); }

private:
    scene::opening::Opening<scene::NativeArithmetic> m_opening;
    scene::Frame m_frame;
    int32_t m_display = 0;
};

}
