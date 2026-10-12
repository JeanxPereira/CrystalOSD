#pragma once
#include <array>
#include <cstdint>
#include <utility>
#include <vector>

#include "Assets/Bytes.hpp"
#include "Audio/spu2/Core.hpp"
#include "Audio/spu2/Reverb.hpp"
#include "Audio/spu2/Snapshot.hpp"

namespace audio::spu2 {

enum class Kind { Voice, VoiceAddress, Core, Reverb, Unknown };

struct Where {
    uint8_t core;
    Kind kind;
    uint8_t voice;
    uint16_t reg;
};

Where decode(uint32_t address);
bool isStatus(uint32_t address);

struct StageSample {
    std::array<int32_t, 24> field{};
};

class Spu2 {
public:
    Spu2();
    void restore(const Snapshot& snapshot);
    void restoreHistory(const assets::Bytes& history);
    void write(uint32_t address, uint16_t value);
    uint16_t read(uint32_t address) const;
    const assets::Bytes& ram() const { return m_ram; }
    void upload(uint32_t wordAddress, const uint16_t* words, size_t count);
    void loadRam(const assets::Bytes& image);
    void clearRam(uint32_t byteAddress, uint64_t bytes);
    const Core& core(int index) const { return m_core[index]; }
    const Voice& voice(int core, int voice) const { return m_core[core].voices[voice]; }
    uint32_t ticks() const { return m_ticks; }
    void setTicks(uint32_t ticks) { m_ticks = ticks; }
    void setReverbPath(ReverbPath path) { m_reverbPath = path; }
    StageSample mix();
    void advance(uint32_t samples);
    int16_t finalLeft() const;
    int16_t finalRight() const;
    void render(int16_t* interleaved, size_t frames);

private:
    friend struct Mixer;
    uint8_t* slot(uint32_t offset) const;
    void writeRegister(uint32_t offset, uint16_t value);
    void dataPort(Core& core, uint16_t value);
    void writeRamWord(uint32_t wordAddress, uint16_t value);

    assets::Bytes m_ram;
    std::array<uint8_t, kRegBytes> m_raw{};
    std::array<Core, 2> m_core;
    std::array<uint16_t, 8> m_spdif{};
    uint16_t m_outPos = 0;
    uint32_t m_ticks = 0;
    int m_playMode = 0;
    ReverbPath m_reverbPath = ReverbPath::Avx;
    std::pair<int16_t, int16_t> m_final{0, 0};
};

}
