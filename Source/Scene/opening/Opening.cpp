#include "Scene/opening/Opening.hpp"

#include "Scene/ColdState.hpp"

#include <stdexcept>

namespace scene::opening {

namespace {

constexpr float kNearEnough = 73.0f;
constexpr uint32_t kElfRandSeed = 1;
constexpr uint32_t kGhostRandCalls = 385;
constexpr uint32_t kSetUpRandCalls = kGhostRandCalls + 1;
constexpr uint32_t kPhaseModulus = 0x929;
constexpr uint32_t kPhaseBase = 0xD80;
constexpr uint32_t kRandCallsPerQuad = 4;

uint32_t drawnPhase() {
    const uint32_t state = advanceRand(advanceRand(kElfRandSeed, kGhostRandCalls), 1);
    return (state & 0x7FFFFFFFu) % kPhaseModulus + kPhaseBase;  // InitLightsCubes 0x220CB0
}

TowerMatrices towerMatrices(const Matrices& m) {
    Mat4 identity{};
    for (size_t i = 0; i < 4; ++i) identity[i][i] = 1.0f;
    return {identity, m.worldToScreen, m.normalLight};
}

}

template <class A>
Opening<A>::Opening(const BootOptions& options, std::shared_ptr<const ProgramImage> program)
    : m_options(options),
      m_timeline(options, Timeline<A>::initialState(1)),
      m_towers(options.history.value_or(History{}), *program),
      m_lights(options.lightsPhase.value_or(drawnPhase())),
      m_cubes(*program) {
    m_randCalls = kSetUpRandCalls;
    m_step = m_timeline.step(options.disc.first);
    m_timeline.sceneSetUp();
    m_camera = m_timeline.state().camera;
    if (!options.coldStart) m_step.matrices = Matrices{};
}

template <class A>
uint32_t Opening<A>::randState() const {
    return advanceRand(kElfRandSeed, m_randCalls);
}

template <class A>
void Opening<A>::advance() {
    m_counter = m_timeline.state().counter;
    m_step = m_timeline.step(m_options.disc.later);
    m_camera = m_timeline.state().camera;
    if (m_step.result == 0) return;
    m_ended = true;
    HandOffInputs in;
    in.snapshot = static_cast<uint32_t>(m_timeline.state().snapshot);
    in.clockForced = m_options.clockForced;
    in.hddReady = m_options.hddReady;
    in.hddExec = m_options.hddExec;
    m_handOff = decide(in);
}

// opening_thread_set_vars_2 0x0021AE78 (jal 0x0021ABF0, before OpeningInit): module 4 queues 0x6150 then 0x6140 on the ring temporaries;
// module 1 queues 0x6140, 0 with the registers it was entered with (measured 0 and 0).
template <class A>
std::vector<SoundCommand> Opening<A>::startCommands() const {
    if (m_options.module == 4) return {{0x6150, 2, 0, 0}, {0x6140, 6, 0, 0, true, true}};
    if (m_options.module == 1) return {{0x6140, 0, 0, 0}};
    return {};
}

template <class A>
Frame Opening<A>::frame(int32_t displayIndex, int32_t field) {
    if (m_ended) throw std::logic_error("the opening has ended");
    Frame out;
    out.field = field;
    out.displayIndex = displayIndex;
    out.textureSet = TextureSet::Opening;
    out.depthBits = 24;

    const Matrices& m = m_step.matrices;
    const int32_t counter = m_counter;
    FlatInputs flat;
    flat.counter = counter;
    flat.displayIndex = displayIndex;
    flat.field = field;
    flat.logoAlpha = m_step.logoAlpha;
    flat.fadeAlpha = m_step.fadeAlpha;
    flat.blurLevel = m_step.blurLevel;
    flat.fillSprites = counter < 2 && m_options.coldStart ? 1 : 2;

    std::vector<Pass>& passes = out.passes;
    Flat<A>::scissor(flat, passes);
    const size_t towers = passes.size();
    m_towers.draw(counter, towerMatrices(m), m_camera, passes);
    for (size_t i = towers; i < passes.size(); ++i) passes[i].scissor = kProcessScissor;
    Flat<A>::ghost(flat, passes);
    Flat<A>::copyToStore(flat, passes);
    m_fog.draw(m.worldToScreen, passes);
    m_work.clear();
    if (m_camera[2] < kNearEnough) {
        m_lights.draw(counter, m.worldToScreen, passes);
        m_randCalls += kRandCallsPerQuad * static_cast<uint32_t>(m_lights.stats().quadsDrawn);
        m_cubes.draw(m, m_camera, passes, &m_work, counter & 1);
    }
    if (m_step.blurLevel > 0) Flat<A>::blur(flat, passes);
    if (m_step.fadeAlpha >= 0) Flat<A>::fade(flat, passes);
    if (m_step.logoAlpha >= 0) Flat<A>::logo(flat, passes);
    Flat<A>::bars(flat, passes);

    m_sounds = m_step.sounds;
    m_commands.clear();
    // Stage 2 handler 0x0021F0F8: a 0x6140 carries a2 = low 16 bits of D_003DB800 (0x0021EF44) and a3 as entered (measured 0x8000).
    for (const SoundEvent& e : m_sounds) {
        if (e.id == 0x6140) m_commands.push_back({0x6140, static_cast<uint16_t>(e.argument), 0xB800, 0x8000});
        else if (e.id == 0x6150) m_commands.push_back({0x6150, 0, 0, static_cast<uint16_t>(e.argument)});
    }
    advance();
    return out;
}

#ifndef SCENE_NATIVE_ONLY
template class Opening<EeArithmetic>;
#endif
template class Opening<NativeArithmetic>;

}
