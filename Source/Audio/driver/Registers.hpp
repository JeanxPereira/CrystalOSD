#pragma once
#include <cstdint>
#include <stdexcept>
#include <string>
#include <unordered_map>

#include "Audio/SpuWrite.hpp"

namespace audio::driver {

namespace reg {

inline constexpr uint32_t kBase = 0x1f900000;

enum VoiceParam : uint32_t { Voll, Volr, Pitch, Adsr1, Adsr2 };

enum CoreOffset : uint32_t {
    Pmon0 = 0x180, Pmon1 = 0x182, Non0 = 0x184, Non1 = 0x186,
    Vmixl0 = 0x188, Vmixl1 = 0x18a, Vmixel0 = 0x18c, Vmixel1 = 0x18e,
    Vmixr0 = 0x190, Vmixr1 = 0x192, Vmixer0 = 0x194, Vmixer1 = 0x196,
    Mmix = 0x198, Attr = 0x19a, Kon0 = 0x1a0, Kon1 = 0x1a2, Koff0 = 0x1a4, Koff1 = 0x1a6,
    Tsah = 0x1a8, Tsal = 0x1aa, Data = 0x1ac, Admas = 0x1b0,
    Esah = 0x2e0, Esal = 0x2e2, Eea = 0x33c, Endx0 = 0x340, Endx1 = 0x342,
};

enum CoreVolume : uint32_t {
    Mvoll, Mvolr, Evoll, Evolr, Avoll, Avolr, Bvoll, Bvolr, Mvolxl, Mvolxr,
    IirVol, Comb1Vol, Comb2Vol, Comb3Vol, Comb4Vol, WallVol, Apf1Vol, Apf2Vol, InCoefL, InCoefR,
};

inline constexpr uint32_t kSpdifOut = kBase + 0x7c0;
inline constexpr uint32_t kSpdifMode = kBase + 0x7c6;
inline constexpr uint32_t kSpdifMedia = kBase + 0x7c8;
inline constexpr uint32_t kSpdif7ca = kBase + 0x7ca;

inline void checkCore(int64_t core) {
    if (core != 0 && core != 1) throw std::runtime_error("no SPU2 core " + std::to_string(core));
}
inline void checkVoice(int64_t voice) {
    if (voice < 0 || voice >= 24) throw std::runtime_error("no SPU2 voice " + std::to_string(voice));
}

inline uint32_t voice(int64_t core, int64_t v, uint32_t param) {
    checkCore(core);
    checkVoice(v);
    return kBase + uint32_t(core) * 0x400 + uint32_t(v) * 16 + param * 2;
}
inline uint32_t voiceStart(int64_t core, int64_t v, bool low) {
    checkCore(core);
    checkVoice(v);
    return kBase + uint32_t(core) * 0x400 + 0x1c0 + uint32_t(v) * 12 + (low ? 2 : 0);
}
inline uint32_t core(int64_t c, uint32_t offset) {
    checkCore(c);
    return kBase + uint32_t(c) * 0x400 + offset;
}
inline uint32_t volume(int64_t c, uint32_t index) {
    checkCore(c);
    return kBase + 0x760 + uint32_t(c) * 0x28 + index * 2;
}

}

struct Registers {
    std::unordered_map<uint32_t, uint16_t> values;
    WriteStream log;
    uint32_t frame = 0;

    void write(uint32_t address, int64_t value);
    uint16_t read(uint32_t address) const;
    void seed(uint32_t address, uint16_t value) { values[address] = value; }
};

}
