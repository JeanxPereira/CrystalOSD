#pragma once
#include <array>
#include <cstdint>

#include "Audio/spu2/Voice.hpp"

namespace audio::spu2 {

struct ReverbRegs {
    int16_t inCoefL = 0, inCoefR = 0;
    uint32_t apf1Size = 0, apf2Size = 0;
    int16_t apf1Vol = 0, apf2Vol = 0;
    uint32_t sameLSrc = 0, sameRSrc = 0, diffLSrc = 0, diffRSrc = 0;
    uint32_t sameLDst = 0, sameRDst = 0, diffLDst = 0, diffRDst = 0;
    int16_t iirVol = 0, wallVol = 0;
    uint32_t comb1LSrc = 0, comb1RSrc = 0, comb2LSrc = 0, comb2RSrc = 0;
    uint32_t comb3LSrc = 0, comb3RSrc = 0, comb4LSrc = 0, comb4RSrc = 0;
    int16_t comb1Vol = 0, comb2Vol = 0, comb3Vol = 0, comb4Vol = 0;
    uint32_t apf1LDst = 0, apf1RDst = 0, apf2LDst = 0, apf2RDst = 0;
};

struct CoreGates {
    int32_t inpL = -1, inpR = -1, sndL = -1, sndR = -1, extL = 0, extR = 0;
};

struct StereoVolume {
    int32_t left = 0, right = 0;
};

struct Core {
    uint32_t index = 0;
    std::array<Voice, 24> voices{};
    CoreGates dryGate, wetGate;
    VolumeSweep masterLeft, masterRight;
    StereoVolume extVol{0x7FFF, 0x7FFF}, inpVol{0x7FFF, 0x7FFF}, fxVol;
    uint32_t irqAddress = 0x800;
    uint32_t transferAddress = 0;
    uint32_t activeTransferAddress = 0;
    bool irqEnable = false, fxEnable = false, mute = false, autoDmaActive = false;
    int8_t dmaBits = 0;
    uint8_t noiseClock = 0;
    uint32_t noiseCounter = 0, noiseOut = 0;
    uint16_t autoDmaControl = 0;
    uint8_t dmaMode = 0, attrBit0 = 0;
    uint32_t pmon = 0, non = 0, vmixl = 0xFFFFFF, vmixr = 0xFFFFFF, vmixel = 0xFFFFFF, vmixer = 0xFFFFFF, endx = 0xFFFFFF;
    uint16_t mmix = 0, statx = 0, attr = 0;
    uint32_t keyOn = 0, keyOff = 0;
    uint32_t effectsStart = 0, effectsEnd = 0xFFFFF;
    uint32_t reverbPosition = 0;
    ReverbRegs reverb;
    std::array<std::array<int16_t, 128>, 2> down{}, up{};
};

}
