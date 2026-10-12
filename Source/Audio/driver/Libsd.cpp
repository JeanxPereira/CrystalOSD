#include <array>
#include <stdexcept>
#include <string>

#include "Audio/driver/State.hpp"

namespace audio::driver {

namespace {

constexpr int64_t kSizeTable = 0x8f7e8;
constexpr int64_t kPresetTable = 0x8f810;
constexpr int64_t kPresetSize = 0x44;

struct PresetField {
    uint32_t at;
    uint32_t address;
    int volume;
};

constexpr int kNoVolume = -1;

constexpr std::array<PresetField, 32> makeFields() {
    std::array<PresetField, 32> f{};
    f[0] = {0x04, 0x172, kNoVolume};
    f[1] = {0x06, 0x174, kNoVolume};
    const int volumes[8] = {reg::IirVol, reg::Comb1Vol, reg::Comb2Vol, reg::Comb3Vol, reg::Comb4Vol, reg::WallVol, reg::Apf1Vol, reg::Apf2Vol};
    for (uint32_t k = 0; k < 8; ++k) f[2 + k] = {0x08 + 2 * k, 0, volumes[k]};
    for (uint32_t k = 0; k < 20; ++k) f[10 + k] = {0x18 + 2 * k, 0x176 + 2 * k, kNoVolume};
    f[30] = {0x40, 0, reg::InCoefL};
    f[31] = {0x42, 0, reg::InCoefR};
    return f;
}

constexpr auto kFields = makeFields();

}

EffectAttr Driver::State::getEffectAttr(int64_t core) const {
    reg::checkCore(core);
    EffectAttr a;
    a.core = uint32_t(core);
    a.mode = int32_t(lib.u32(kLibsdState + 0x24 + 20 * core));
    a.depthL = regs.read(reg::volume(core, reg::Evoll));
    a.depthR = regs.read(reg::volume(core, reg::Evolr));
    a.delay = lib.u32(kLibsdState + 0x2c + 20 * core);
    a.feedback = lib.u32(kLibsdState + 0x30 + 20 * core);
    return a;
}

int Driver::State::setEffectAttr(const EffectAttr& attr) {
    const int64_t core = attr.core;
    int32_t mode = attr.mode;
    bool clear = false;
    uint32_t saved = 0;
    if (mode & 0x100) {
        mode &= ~0x100;
        clear = true;
        saved = lib.u32(kLibsdState + 0x24 + 20 * core);
    }
    if (mode >= 10) return -1;
    if (mode >= 7) throw std::runtime_error("effect mode " + std::to_string(mode) + " (echo, delay, pipe) is not modelled");
    if (mode < 0) throw std::runtime_error("effect mode " + std::to_string(mode) + " is not modelled");
    lib.write32(kLibsdState + 0x24 + 20 * core, uint32_t(mode));
    const uint32_t end = (uint32_t(regs.read(reg::core(core, reg::Eea))) << 17) | 0x1ffff;
    const auto size = [&](uint32_t m) { return uint64_t(lib.u32(kSizeTable + 4 * int64_t(m))) * 8; };
    const auto startOf = [&](uint32_t m) { return uint32_t(uint64_t(end) - (size(m) - 1)); };
    const uint32_t start = startOf(uint32_t(mode));
    lib.write32(kLibsdState + 0xc0 + 4 * core, start);
    const assets::View preset = lib.slice(kPresetTable + kPresetSize * mode, kPresetSize);
    const auto attrOf = [&] { return regs.read(reg::core(core, reg::Attr)); };
    const bool enabled = (attrOf() & 0x80) != 0;
    const auto fill = [&](uint32_t m) {
        if (m == 0) return;
        const uint64_t bytes = size(m);
        fills.push_back({uint32_t(core), startOf(m), bytes, (bytes + 63) / 64 * 64});
    };
    if (enabled) {
        regs.write(reg::core(core, reg::Attr), attrOf() & 0xff7f);
        if (clear) fill(saved);
    }
    regs.write(reg::volume(core, reg::Evoll), attr.depthL);
    regs.write(reg::volume(core, reg::Evolr), attr.depthR);
    const uint32_t flags = assets::le32(preset, 0);
    for (uint32_t bit = 0; bit < kFields.size(); ++bit) {
        if (flags != 0 && !((flags >> bit) & 1)) continue;
        const PresetField& field = kFields[bit];
        const uint16_t value = assets::le16(preset, field.at);
        if (field.volume != kNoVolume) {
            regs.write(reg::volume(core, uint32_t(field.volume)), value);
        } else {
            const uint32_t wide = uint32_t(value) << 2;
            regs.write(reg::core(core, 2 * field.address), wide >> 16);
            regs.write(reg::core(core, 2 * field.address + 2), wide & 0xffff);
        }
    }
    regs.write(reg::core(core, reg::Esah), (start >> 17) & 0xffff);
    regs.write(reg::core(core, reg::Esal), (start >> 1) & 0xffff);
    if (clear) fill(uint32_t(mode));
    if (enabled) regs.write(reg::core(core, reg::Attr), attrOf() | 0x80);
    return 0;
}

}
