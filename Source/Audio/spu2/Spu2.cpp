#include "Audio/spu2/Spu2.hpp"

#include <algorithm>
#include <cstring>
#include <stdexcept>

namespace audio::spu2 {

namespace {

constexpr uint32_t kWindow = 0x800;

template <typename T>
uint8_t* half(T& field, int index) {
    return reinterpret_cast<uint8_t*>(&field) + 2 * index;
}

uint32_t offsetOf(uint32_t address) {
    if (address < kBase || address >= kBase + kRegBytes) throw std::out_of_range("not an SPU2 register address");
    return address - kBase;
}

bool statusOffset(uint32_t offset) {
    if (offset >= 0x760 && offset < 0x7B0) {
        const uint32_t i = (offset - 0x760) % 0x28 / 2;
        return i == 8 || i == 9;
    }
    if (offset >= 0x800) return false;
    const uint32_t o = offset & 0x3FF;
    if (o < 0x180) return (o % 16) / 2 >= 5;
    if (o >= 0x1C0 && o < 0x2E0) return ((o - 0x1C0) % 12) / 2 >= 4;
    return (o >= 0x1A0 && o < 0x1A8) || (o >= 0x340 && o < 0x346);
}

}

Where decode(uint32_t address) {
    const uint32_t offset = offsetOf(address) & 0x7FF;
    if (offset >= 0x760) return {uint8_t(offset >= 0x788 && offset < 0x7B0 ? 1 : 0), offset < 0x7B0 ? Kind::Reverb : Kind::Unknown, 0, uint16_t(offset)};
    const uint8_t core = offset >= 0x400 ? 1 : 0;
    const uint32_t o = offset & 0x3FF;
    if (o < 0x180) return {core, Kind::Voice, uint8_t(o / 16), uint16_t(o % 16)};
    if (o >= 0x1C0 && o < 0x2E0) return {core, Kind::VoiceAddress, uint8_t((o - 0x1C0) / 12), uint16_t((o - 0x1C0) % 12)};
    if (o >= 0x2E0 && o < 0x340) return {core, Kind::Reverb, 0, uint16_t(o)};
    if (o < 0x346) return {core, Kind::Core, 0, uint16_t(o)};
    return {core, Kind::Unknown, 0, uint16_t(o)};
}

bool isStatus(uint32_t address) { return statusOffset(offsetOf(address) & 0x7FF); }

Spu2::Spu2() : m_ram(kRamBytes) {
    for (uint32_t i = 0; i < 2; ++i) m_core[i].index = i;
}

uint8_t* Spu2::slot(uint32_t off) const {
    Spu2* self = const_cast<Spu2*>(this);
    if (off >= kWindow) return &self->m_raw[off & 0x1FFF];
    if (off >= 0x760 && off < 0x7B0) {
        const int c = off >= 0x788 ? 1 : 0;
        Core& k = self->m_core[c];
        switch ((off - 0x760 - (c ? 0x28 : 0)) / 2) {
        case 0: return half(k.masterLeft.reg, 0);
        case 1: return half(k.masterRight.reg, 0);
        case 2: return half(k.fxVol.left, 0);
        case 3: return half(k.fxVol.right, 0);
        case 4: return half(k.extVol.left, 0);
        case 5: return half(k.extVol.right, 0);
        case 6: return half(k.inpVol.left, 0);
        case 7: return half(k.inpVol.right, 0);
        case 8: return half(k.masterLeft.level, 0);
        case 9: return half(k.masterRight.level, 0);
        case 10: return half(k.reverb.iirVol, 0);
        case 11: return half(k.reverb.comb1Vol, 0);
        case 12: return half(k.reverb.comb2Vol, 0);
        case 13: return half(k.reverb.comb3Vol, 0);
        case 14: return half(k.reverb.comb4Vol, 0);
        case 15: return half(k.reverb.wallVol, 0);
        case 16: return half(k.reverb.apf1Vol, 0);
        case 17: return half(k.reverb.apf2Vol, 0);
        case 18: return half(k.reverb.inCoefL, 0);
        default: return half(k.reverb.inCoefR, 0);
        }
    }
    if (off >= 0x7C0 && off <= 0x7CC) return reinterpret_cast<uint8_t*>(&self->m_spdif[(off - 0x7C0) / 2]);
    if (off >= 0x7B0) return &self->m_raw[off];
    const int c = off >= 0x400 ? 1 : 0;
    Core& k = self->m_core[c];
    const uint32_t o = off & 0x3FF;
    if (o < 0x180) {
        Voice& v = k.voices[o / 16];
        switch ((o % 16) / 2) {
        case 0: return half(v.left.reg, 0);
        case 1: return half(v.right.reg, 0);
        case 2: return half(v.pitch, 0);
        case 3: return half(v.envelope.reg1, 0);
        case 4: return half(v.envelope.reg2, 0);
        case 5: return half(v.envelope.level, 0);
        case 6: return half(v.left.level, 0);
        default: return half(v.right.level, 0);
        }
    }
    const int lowFirst = (o >> 1) & 1;
    const int highFirst = 1 - lowFirst;
    if (o < 0x1C0) {
        switch (o) {
        case 0x180: case 0x182: return half(k.pmon, lowFirst);
        case 0x184: case 0x186: return half(k.non, lowFirst);
        case 0x188: case 0x18A: return half(k.vmixl, lowFirst);
        case 0x18C: case 0x18E: return half(k.vmixel, lowFirst);
        case 0x190: case 0x192: return half(k.vmixr, lowFirst);
        case 0x194: case 0x196: return half(k.vmixer, lowFirst);
        case 0x198: return half(k.mmix, 0);
        case 0x19A: return half(k.attr, 0);
        case 0x19C: case 0x19E: return half(k.irqAddress, highFirst);
        case 0x1A0: case 0x1A2: return half(k.keyOn, lowFirst);
        case 0x1A4: case 0x1A6: return half(k.keyOff, lowFirst);
        case 0x1A8: case 0x1AA: return half(k.transferAddress, highFirst);
        case 0x1B0: return half(k.autoDmaControl, 0);
        default: return &self->m_raw[off];
        }
    }
    if (o < 0x2E0) {
        Voice& v = k.voices[(o - 0x1C0) / 12];
        switch (((o - 0x1C0) % 12) / 2) {
        case 0: return half(v.startAddress, 1);
        case 1: return half(v.startAddress, 0);
        case 2: return half(v.loopAddress, 1);
        case 3: return half(v.loopAddress, 0);
        case 4: return half(v.nextAddress, 1);
        default: return half(v.nextAddress, 0);
        }
    }
    if (o < 0x2E4) return half(k.effectsStart, highFirst);
    if (o < 0x33C) {
        ReverbRegs& r = k.reverb;
        uint32_t* fields[] = {&r.apf1Size, &r.apf2Size, &r.sameLDst, &r.sameRDst, &r.comb1LSrc, &r.comb1RSrc, &r.comb2LSrc, &r.comb2RSrc, &r.sameLSrc, &r.sameRSrc,
            &r.diffLDst, &r.diffRDst, &r.comb3LSrc, &r.comb3RSrc, &r.comb4LSrc, &r.comb4RSrc, &r.diffLSrc, &r.diffRSrc, &r.apf1LDst, &r.apf1RDst, &r.apf2LDst, &r.apf2RDst};
        return half(*fields[(o - 0x2E4) / 4], highFirst);
    }
    switch (o) {
    case 0x33C: case 0x33E: return half(k.effectsEnd, highFirst);
    case 0x340: return half(k.endx, 0);
    case 0x342: return half(k.endx, 1);
    case 0x344: return half(k.statx, 0);
    default: return &self->m_raw[off];
    }
}

uint16_t Spu2::read(uint32_t address) const {
    uint16_t v;
    std::memcpy(&v, slot(offsetOf(address)), 2);
    return v;
}

void Spu2::writeRamWord(uint32_t wordAddress, uint16_t value) {
    const uint32_t at = (wordAddress & 0xFFFFF) * 2;
    m_ram[at] = uint8_t(value);
    m_ram[at + 1] = uint8_t(value >> 8);
}

void Spu2::upload(uint32_t wordAddress, const uint16_t* words, size_t count) {
    for (size_t i = 0; i < count; ++i) writeRamWord(uint32_t(wordAddress + i), words[i]);
}

void Spu2::loadRam(const assets::Bytes& image) {
    if (image.size() != m_ram.size()) throw std::runtime_error("the RAM image is not the size of the SPU2 RAM");
    m_ram = image;
}

void Spu2::clearRam(uint32_t byteAddress, uint64_t bytes) {
    for (uint64_t i = 0; i < bytes && byteAddress + i < m_ram.size(); ++i) m_ram[byteAddress + i] = 0;
}

void Spu2::dataPort(Core& core, uint16_t value) {
    core.activeTransferAddress = core.transferAddress;
    writeRamWord(core.activeTransferAddress, value);
    core.activeTransferAddress = (core.activeTransferAddress + 1) & 0xFFFFF;
    core.transferAddress = core.activeTransferAddress;
}

void Spu2::write(uint32_t address, uint16_t value) { writeRegister(offsetOf(address) & 0x7FF, value); }

void Spu2::writeRegister(uint32_t off, uint16_t value) {
    auto store = [&](uint32_t at) { std::memcpy(slot(at), &value, 2); };
    if (off >= 0x760 && off < 0x7B0) {
        const int c = off >= 0x788 ? 1 : 0;
        Core& k = m_core[c];
        switch ((off - 0x760 - (c ? 0x28 : 0)) / 2) {
        case 0: k.masterLeft.write(value); break;
        case 1: k.masterRight.write(value); break;
        case 2: k.fxVol.left = int16_t(value); break;
        case 3: k.fxVol.right = int16_t(value); break;
        case 4: k.extVol.left = int16_t(value); break;
        case 5: k.extVol.right = int16_t(value); break;
        case 6: k.inpVol.left = int16_t(value); break;
        case 7: k.inpVol.right = int16_t(value); break;
        case 8: case 9: break;
        default: store(off); break;
        }
        return;
    }
    if (off >= 0x7B0 || (off & 0x3FF) >= 0x346) {
        store(off);
        return;
    }
    const int c = off >= 0x400 ? 1 : 0;
    Core& k = m_core[c];
    const uint32_t o = off & 0x3FF;
    if (o < 0x180) {
        Voice& v = k.voices[o / 16];
        switch ((o % 16) / 2) {
        case 0: v.left.write(value); break;
        case 1: v.right.write(value); break;
        case 2: v.pitch = value; break;
        case 3: v.envelope.reg1 = value; break;
        case 4: v.envelope.reg2 = value; break;
        case 5: store(off); break;
        default: break;
        }
        return;
    }
    if (o >= 0x1C0 && o < 0x2E0) {
        Voice& v = k.voices[(o - 0x1C0) / 12];
        switch (((o - 0x1C0) % 12) / 2) {
        case 0: v.startAddress = (uint32_t(value & 0x0F) << 16) | (v.startAddress & 0xFFF8); break;
        case 1: v.startAddress = (v.startAddress & 0x0F0000) | (value & 0xFFF8); break;
        case 2: v.loopMode = 1; v.loopAddress = (uint32_t(value & 0x0F) << 16) | (v.loopAddress & 0xFFF8); break;
        case 3: v.loopMode = 1; v.loopAddress = (v.loopAddress & 0x0F0000) | (value & 0xFFF8); break;
        case 4: v.nextAddress = (uint32_t(value & 0x0F) << 16) | (v.nextAddress & 0xFFF8) | 1; break;
        default: v.nextAddress = (v.nextAddress & 0x0F0000) | (value & 0xFFF8) | 1; break;
        }
        return;
    }
    auto setGates = [&](uint32_t& reg, int32_t Voice::*gate, bool high) {
        const uint32_t before = reg;
        std::memcpy(half(reg, high ? 1 : 0), &value, 2);
        if (before == reg) return;
        const int first = high ? 16 : 0, last = high ? 24 : 16;
        for (int vc = first, bit = 1; vc < last; ++vc, bit <<= 1) k.voices[vc].*gate = (value & bit) ? -1 : 0;
    };
    switch (o) {
    case 0x1AC:
        dataPort(k, value);
        return;
    case 0x19A: {
        const bool irqWas = k.irqEnable;
        const uint8_t dmaWas = k.dmaMode;
        k.attrBit0 = value & 1;
        k.dmaBits = int8_t((value >> 1) & 7);
        k.dmaMode = (value >> 4) & 3;
        k.irqEnable = (value >> 6) & 1;
        k.fxEnable = (value >> 7) & 1;
        k.noiseClock = (value >> 8) & 0x3F;
        k.mute = false;
        k.attr = value;
        if (!k.dmaMode && !(k.statx & 0x400)) k.statx &= ~0x80;
        else if (!dmaWas && k.dmaMode) k.statx |= 0x80;
        k.activeTransferAddress = k.transferAddress;
        if (irqWas != k.irqEnable && !k.irqEnable) m_spdif[1] &= ~(4 << k.index);
        return;
    }
    case 0x180:
        for (int vc = 1; vc < 16; ++vc) k.voices[vc].modulated = (value >> vc) & 1;
        std::memcpy(half(k.pmon, 0), &value, 2);
        return;
    case 0x182:
        for (int vc = 0; vc < 8; ++vc) k.voices[vc + 16].modulated = (value >> vc) & 1;
        std::memcpy(half(k.pmon, 1), &value, 2);
        return;
    case 0x184:
        for (int vc = 0; vc < 16; ++vc) k.voices[vc].noise = (value >> vc) & 1;
        std::memcpy(half(k.non, 0), &value, 2);
        return;
    case 0x186:
        for (int vc = 0; vc < 8; ++vc) k.voices[vc + 16].noise = (value >> vc) & 1;
        std::memcpy(half(k.non, 1), &value, 2);
        return;
    case 0x188: setGates(k.vmixl, &Voice::dryL, false); return;
    case 0x18A: setGates(k.vmixl, &Voice::dryL, true); return;
    case 0x18C: setGates(k.vmixel, &Voice::wetL, false); return;
    case 0x18E: setGates(k.vmixel, &Voice::wetL, true); return;
    case 0x190: setGates(k.vmixr, &Voice::dryR, false); return;
    case 0x192: setGates(k.vmixr, &Voice::dryR, true); return;
    case 0x194: setGates(k.vmixer, &Voice::wetR, false); return;
    case 0x196: setGates(k.vmixer, &Voice::wetR, true); return;
    case 0x198: {
        const int vx = value & (c == 0 ? 0xFF0 : 0xFFF);
        k.wetGate.extR = (vx & 0x001) ? -1 : 0;
        k.wetGate.extL = (vx & 0x002) ? -1 : 0;
        k.dryGate.extR = (vx & 0x004) ? -1 : 0;
        k.dryGate.extL = (vx & 0x008) ? -1 : 0;
        k.wetGate.inpR = (vx & 0x010) ? -1 : 0;
        k.wetGate.inpL = (vx & 0x020) ? -1 : 0;
        k.dryGate.inpR = (vx & 0x040) ? -1 : 0;
        k.dryGate.inpL = (vx & 0x080) ? -1 : 0;
        k.wetGate.sndR = (vx & 0x100) ? -1 : 0;
        k.wetGate.sndL = (vx & 0x200) ? -1 : 0;
        k.dryGate.sndR = (vx & 0x400) ? -1 : 0;
        k.dryGate.sndL = (vx & 0x800) ? -1 : 0;
        k.mmix = value;
        return;
    }
    case 0x1B0:
        k.autoDmaControl = value;
        if (!(value & 3) && k.autoDmaActive) {
            k.autoDmaActive = false;
            for (uint32_t i = 0; i < 0x200; ++i) {
                writeRamWord(0x2000 + (k.index << 10) + i, 0);
                writeRamWord(0x2200 + (k.index << 10) + i, 0);
            }
        }
        return;
    case 0x33C:
        k.effectsEnd = ((uint32_t(value) & 0xF) << 16) | 0xFFFF;
        return;
    case 0x33E: return;
    case 0x324: case 0x326:
        if (c == 1) {
            std::memcpy(half(k.reverb.diffRSrc, 1 - ((o >> 1) & 1)), &value, 2);
            return;
        }
        break;
    case 0x328: case 0x32A:
        if (c == 1) {
            std::memcpy(half(k.reverb.diffLSrc, 1 - ((o >> 1) & 1)), &value, 2);
            return;
        }
        break;
    default: break;
    }
    store(off);
}

void Spu2::advance(uint32_t samples) {
    for (uint32_t i = 0; i < samples; ++i) mix();
}

void Spu2::render(int16_t* interleaved, size_t frames) {
    for (size_t i = 0; i < frames; ++i) {
        mix();
        interleaved[2 * i] = finalLeft();
        interleaved[2 * i + 1] = finalRight();
    }
}

}
