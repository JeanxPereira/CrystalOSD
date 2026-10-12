#include <cstdio>
#include <stdexcept>
#include <string>

#include "Audio/driver/State.hpp"

namespace audio::driver {

namespace {

constexpr int64_t kEffectTablePointer = M(0x921c);
constexpr int64_t kEffectRecordPointer = M(0x9210);
constexpr int64_t kParamBases = 0x8f690;

struct Table {
    int64_t at;
    int64_t length;
};
constexpr Table kTables[4] = {{kSlots, 0x660}, {kCtx, 0x10}, {kVoices, 0x5a0}, {kBankFlags, 0x600}};

uint32_t paramAddress(const LibsdImage& lib, uint32_t entry) {
    const uint32_t core = entry & 1;
    const uint32_t stride = (entry & 0x80) != 0 ? 0x28 : 0x400;
    const uint32_t base = lib.u32(kParamBases + ((entry >> 6) & 0x3fc));
    return (base + core * stride + ((entry & 0x3e) << 3)) & 0x1fffffff;
}

}

void Driver::State::init(const DriverCommand& command) {
    const uint32_t a = command.words[0];
    const uint32_t b = command.words[1];
    const uint32_t c = command.words[2];
    const auto w = [&](uint32_t address, int64_t value) { regs.write(address, value); };
    const auto sdInit = [&] {
        using namespace reg;
        w(kSpdifMode, 0x900);
        w(kSpdifMedia, 0x200);
        w(kSpdif7ca, 0x8);
        w(kSpdifOut, 0);
        w(kSpdifOut, 0x8000);
        for (int core : {0, 1}) { w(volume(core, Mvoll), 0); w(volume(core, Mvolr), 0); }
        for (int core : {0, 1}) w(reg::core(core, Admas), 0);
        for (int core : {0, 1}) w(reg::core(core, Attr), 0);
        for (int core : {0, 1}) w(reg::core(core, Attr), 0x8000);
        for (int core : {0, 1}) { w(volume(core, Mvoll), 0); w(volume(core, Mvolr), 0); }
        for (int core : {0, 1}) { w(reg::core(core, Koff0), 0xffff); w(reg::core(core, Koff1), 0xff); }
        for (uint32_t base : {uint32_t(Pmon0), uint32_t(Non0)})
            for (int core : {0, 1}) { w(reg::core(core, base), 0); w(reg::core(core, base + 2), 0); }
        w(reg::core(0, Esah), 0xe); w(reg::core(0, Esal), 0xfff8); w(reg::core(1, Esah), 0xf); w(reg::core(1, Esal), 0xfff8);
        w(reg::core(0, Tsah), 0); w(reg::core(0, Tsal), 0x2800);
        for (int value : {0x707, 0}) for (int k = 0; k < 8; ++k) w(reg::core(0, Data), value);
        w(reg::core(0, Attr), 0x8010);
        w(reg::core(0, Attr), 0x8000);
        for (int v = 0; v < 24; ++v) {
            const std::pair<uint32_t, int> params[5] = {{Voll, 0}, {Volr, 0}, {Pitch, 0x3fff}, {Adsr1, 0}, {Adsr2, 0}};
            for (const auto& [param, value] : params) for (int core : {1, 0}) w(voice(core, v, param), value);
            for (bool low : {false, true}) for (int core : {1, 0}) w(voiceStart(core, v, low), low ? 0x2800 : 0);
        }
        for (int core : {1, 0}) w(reg::core(core, Kon0), 0xffff);
        for (int core : {1, 0}) w(reg::core(core, Kon1), 0xff);
        for (int core : {1, 0}) w(reg::core(core, Koff0), 0xffff);
        for (int core : {1, 0}) w(reg::core(core, Koff1), 0xff);
        w(reg::core(0, Endx1), 0);
        w(reg::core(0, Endx0), 0);
        w(kSpdifOut, 0xc032);
        w(reg::core(0, Attr), 0xc000);
        w(reg::core(1, Attr), 0xc001);
        for (int core : {0, 1})
            for (uint32_t base : {uint32_t(Vmixl0), uint32_t(Vmixr0), uint32_t(Vmixel0), uint32_t(Vmixer0)}) {
                w(reg::core(core, base), 0xffff);
                w(reg::core(core, base + 2), 0xff);
            }
        w(reg::core(0, Mmix), 0xff0);
        w(reg::core(1, Mmix), 0xffc);
        for (int core : {0, 1}) { w(volume(core, Mvoll), 0); w(volume(core, Mvolr), 0); }
        for (int core : {0, 1}) { w(volume(core, Evoll), 0); w(volume(core, Evolr), 0); }
        w(reg::core(0, Eea), 0xe);
        w(reg::core(1, Eea), 0xf);
        w(volume(0, Avoll), 0); w(volume(0, Avolr), 0); w(volume(1, Avoll), 0x7fff); w(volume(1, Avolr), 0x7fff);
        w(volume(0, Bvoll), 0); w(volume(0, Bvolr), 0); w(volume(1, Bvoll), 0); w(volume(1, Bvolr), 0);
    };

    switch (command.id) {
        case 0x6010: {
            for (const Table& t : kTables) mem.fill(t.at, t.length);
            for (int64_t pointer : {kEffectTablePointer, kEffectRecordPointer}) {
                const int64_t target = mem.u32(pointer);
                if (target != 0) mem.fill(target, 4);
            }
            for (int j = 0; j < 24; ++j) mem.write16(kVoices + 0x3c * j + 6, 0xffff);
            sdInit();
            for (int core : {0, 1}) {
                regs.write(reg::core(core, reg::Eea), ((0x1fffffu - (uint32_t(core) << 17)) >> 17) & 0xffff);
                EffectAttr attr = getEffectAttr(core);
                attr.depthL = 0;
                attr.depthR = 0;
                attr.mode |= 0x100;
                setEffectAttr(attr);
            }
            break;
        }
        case 0x6060: {
            if (mem.u32(int64_t(a) + 0xc) != 0x64685353) return;
            for (int k = 0; k < 0x7f; ++k) {
                if (mem.u32(kBankFlags + 12 * k) == 0) {
                    mem.write32(kBankFlags + 12 * k, 1);
                    mem.write32(kBankFlags + 12 * k + 4, a);
                    mem.write32(kBankFlags + 12 * k + 8, b >> 3);
                    return;
                }
            }
            return;
        }
        case 0x6090: {
            const int64_t bank = s16(a);
            if (bank >= 0x80 || mem.u32(int64_t(b) + 0xc) != 0x71735353) return;
            if (mem.u32(kBankFlags + 12 * bank) != 1) return;
            for (int i = 0; i < 24; ++i) {
                const int64_t slot = kSlots + 0x44 * i;
                if (mem.u16(slot + 0x26) != 0 || mem.u16(slot + 0x28) != 0) continue;
                mem.write16(slot + 0x26, 1);
                mem.write16(slot + 0x28, 0);
                mem.write32(slot + 4, 0);
                mem.write32(slot + 0x18, b);
                mem.write32(slot + 0x14, 0x110);
                mem.write8(slot, mem.u8(int64_t(b) + 0x110));
                mem.write8(slot + 2, mem.u8(int64_t(b) + 0x111));
                mem.write8(slot + 3, mem.u8(int64_t(b) + 0x112));
                mem.write8(slot + 1, mem.u8(slot));
                mem.write16(slot + 0x24, bank);
                mem.write16(slot + 0x40, mem.u16(int64_t(b) + 2));
                mem.write16(slot + 0x3e, mem.u16(int64_t(b) + 4));
                const int32_t product = int32_t((uint32_t(mem.u16(slot + 0x40)) * uint32_t(mem.u16(slot + 0x3e))) << 12);
                const uint32_t hz = mem.u16(kCtx + 0xe);
                const int32_t divided = hz == 0 ? 0 : product / int32_t(hz);
                mem.write32(slot + 8, div60(divided));
                return;
            }
            return;
        }
        case 0x60a0:
            mem.write16(kCtx + 0xe, u16(a));
            break;
        case 0x60c0: {
            EffectAttr attr = getEffectAttr(s16(a));
            attr.mode = int32_t(u16(b) | 0x100);
            setEffectAttr(attr);
            break;
        }
        case 0x6130: {
            const int64_t slot = kSlots + 0x44 * int64_t(s16(a));
            if (s16(a) < 0x18 && s16(b) < 0x80 && mem.u16(slot + 0x26) == 1) {
                const int64_t sq = mem.u32(slot + 0x18);
                mem.write32(M(0x9218), sq);
                mem.write8(sq, b);
                mem.write32(M(0x9214), sq + 0x10);
                for (int j = 0; j < 24; ++j) {
                    const int64_t v = kVoices + 0x3c * j;
                    if (mem.u16(v) == 1 && int64_t(mem.u16(v + 6)) == int64_t(s16(a)) && mem.u16(v + 0x1c) == mem.u16(slot + 0x24)) {
                        mem.write16(v + 0x2a, mem.u8(sq));
                        setParam(1, j, reg::Voll, voiceVolumeOf(mem, j, 0));
                        setParam(1, j, reg::Volr, voiceVolumeOf(mem, j, 1));
                    }
                }
            }
            break;
        }
        case 0x6140: {
            const int64_t slot = kSlots + 0x44 * int64_t(s16(a));
            const uint32_t bankIndex = mem.u16(slot + 0x24);
            const int64_t hd = mem.u32(kBanks + 12 * int64_t(bankIndex));
            if (mem.u16(slot + 0x26) == 1 && mem.u32(kBankFlags + 12 * int64_t(bankIndex)) == 1 && mem.u32(hd + 0x10) != 0xffffffffu) {
                mem.write16(slot + 0x28, 1);
                mem.write16(slot + 0x3c, 0);
            }
            mem.write32(slot + 0x20, 0);
            break;
        }
        case 0x6150: {
            const int32_t index = s16(a);
            const int64_t slot = kSlots + 0x44 * int64_t(index);
            const int32_t mode = s16(b);
            const uint32_t bankIndex = mem.u16(slot + 0x24);
            const int64_t hd = mem.u32(kBanks + 12 * int64_t(bankIndex));
            if (!(mem.u16(slot + 0x26) == 1 && mem.u32(kBankFlags + 12 * int64_t(bankIndex)) == 1 && mem.u32(hd + 0x10) != 0xffffffffu)) break;
            int silence = 0;
            bool proceed = true;
            if (mode == 0 || mode == 1) {
                mem.write32(slot + 0x14, 0x110);
                mem.write16(slot + 0x28, 0);
                mem.write32(slot + 0x20, 1);
                mem.write16(slot + 0x3c, 0);
                mem.write16(slot + 0x2a, 0);
                mem.write32(slot + 4, 0);
                if (mode == 1) silence = 1;
            } else if (mode == 2 || mode == 3) {
                if (mem.u16(slot + 0x28) == 1) {
                    mem.write16(slot + 0x28, 0);
                    mem.write16(slot + 0x3c, 1);
                    if (mode == 3) proceed = false;
                } else if (mem.u32(slot + 0x20) == 0) {
                    mem.write16(slot + 0x28, 1);
                    mem.write16(slot + 0x3c, 0);
                    proceed = false;
                } else if (mode == 3) {
                    proceed = false;
                }
            } else {
                proceed = false;
            }
            if (!proceed) break;
            for (int j = 0; j < 24; ++j) {
                const int64_t v = kVoices + 0x3c * j;
                if (int64_t(mem.u16(v + 6)) != int64_t(index)) continue;
                mem.write16(v, 0);
                mem.write16(v + 8, 1);
                mem.write16(v + 0x2e, 0x40);
                mem.write16(v + 0x14, 0);
                mem.write16(v + 0x16, 0);
                mem.write32(slot + 0x10, mem.u32(slot + 0x10) | (uint32_t(1) << j));
                if (silence == 1) {
                    setParam(1, j, reg::Adsr1, 0);
                    setParam(1, j, reg::Adsr2, 0);
                } else if (c != 0) {
                    const uint16_t adsr2 = regs.read(reg::voice(1, j, reg::Adsr2));
                    setParam(1, j, reg::Adsr2, (adsr2 & 0xffc0) | u16(c));
                }
            }
            const int64_t channels = int64_t(mem.u32(slot + 0x18)) + 0x10;
            for (int k = 0; k < 16; ++k) mem.write8(channels + 16 * k + 9, 0);
            setSwitch(1, reg::Koff0, mem.u32(slot + 0x10));
            mem.write32(slot + 0x10, 0);
            break;
        }
        case 0x8010:
            regs.write(paramAddress(lib, u16(a)), u16(b));
            break;
        case 0x8070: {
            const uint32_t entry = u16(a);
            const uint32_t value = u16(b);
            const int core = int(entry & 1);
            const uint32_t attrAddress = reg::core(core, reg::Attr);
            const uint32_t attr = regs.read(attrAddress);
            const uint32_t kind = entry & ~1u;
            if (kind == 0xa) {
                if (value != 0) throw std::runtime_error("SPDIF mode " + std::to_string(value) + " is not modelled");
                regs.write(reg::kSpdifMedia, 0x200);
                regs.write(reg::kSpdifOut, 0xc032);
                regs.write(reg::kSpdifMode, 0x900);
            } else if (kind == 8) {
                regs.write(attrAddress, (attr & 0xc0ff) | ((value & 0x3f) << 8));
            } else {
                const uint32_t bit = lib.u16(kLibsdState + 0x12 + (entry & 0xe)) & 31;
                regs.write(attrAddress, ((attr & ~(uint32_t(1) << bit)) | ((value & 1) << bit)) & 0xffff);
            }
            break;
        }
        case 0x61a0:
        case 0x6070:
        case 0x6200:
        case 0x6310:
            if (command.id == 0x6310) {
                const int64_t bank = s16(a);
                const int64_t hd = mem.u32(kBanks + 12 * bank);
                mem.write32(hd + mem.u32(hd + 0x2c), int64_t(s16(b)));
            }
            break;
        default: {
            char text[48];
            std::snprintf(text, sizeof text, "command 0x%x is not modelled", command.id);
            throw std::runtime_error(text);
        }
    }
}

}
