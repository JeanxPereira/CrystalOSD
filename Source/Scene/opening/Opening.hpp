#pragma once
#include <cstdint>
#include <memory>
#include <vector>

#include "Scene/Arithmetic.hpp"
#include "Scene/Frame.hpp"
#include "Scene/Sound.hpp"
#include "Scene/ProgramImage.hpp"
#include "Scene/opening/Cubes.hpp"
#include "Scene/opening/Flat.hpp"
#include "Scene/opening/Fog.hpp"
#include "Scene/opening/Handoff.hpp"
#include "Scene/opening/Lights.hpp"
#include "Scene/opening/Timeline.hpp"
#include "Scene/opening/Towers.hpp"
#include "Scene/opening/Types.hpp"

namespace scene::opening {

// facts/opening.md section 2: the intro as the OSD sends it. The timeline's call of a frame runs before the frame is drawn, so the
// call of the next frame has run when frame() returns: ended() and handOff() are known after the last drawn frame.
template <class A>
class Opening {
public:
    Opening(const BootOptions& options, std::shared_ptr<const ProgramImage> program);

    // One module frame in the OSD's order: scissor, towers, ghost, copy, fog, lights, cubes, blur, fade, logo, bars. The towers stand
    // where the options' history puts them; lights and cubes are drawn while the camera is nearer than 73.
    Frame frame(int32_t displayIndex, int32_t field);

    bool ended() const { return m_ended; }
    uint32_t randCalls() const { return m_randCalls; }
    uint32_t randState() const;
    // The counter of the frame frame() draws next.
    int32_t counter() const { return m_counter; }
    const std::vector<SoundEvent>& sounds() const { return m_sounds; }
    const std::vector<SoundCommand>& commands() const { return m_commands; }
    std::vector<SoundCommand> startCommands() const;
    const HandOff* handOff() const { return m_ended ? &m_handOff : nullptr; }

    const Timeline<A>& timeline() const { return m_timeline; }
    const Fog<A>& fog() const { return m_fog; }
    const Lights<A>& lights() const { return m_lights; }
    // What the cubes drew in the last frame.
    const std::vector<CubeWork>& cubeWork() const { return m_work; }

private:
    void advance();

    BootOptions m_options;
    Timeline<A> m_timeline;
    Towers<A> m_towers;
    Fog<A> m_fog;
    Lights<A> m_lights;
    Cubes<A> m_cubes;
    TimelineStep m_step;
    Vec4 m_camera{};
    int32_t m_counter = 1;
    bool m_ended = false;
    uint32_t m_randCalls = 0;
    HandOff m_handOff;
    std::vector<SoundEvent> m_sounds;
    std::vector<SoundCommand> m_commands;
    std::vector<CubeWork> m_work;
};

extern template class Opening<EeArithmetic>;
extern template class Opening<NativeArithmetic>;

}
