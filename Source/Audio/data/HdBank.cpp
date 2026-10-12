#include "Audio/data/HdBank.hpp"

#include <cstring>
#include <stdexcept>

namespace audio::data {

namespace {

constexpr size_t kMagicAt = 0xC, kProgramTableField = 0x10, kVelocityTableField = 0x14, kEffectTableField = 0x2C;
constexpr uint32_t kNoTable = 0xFFFFFFFF;
constexpr size_t kEffectsAt = 0x20, kEffectSize = 64, kEffectRead = 20, kMaxEffects = 14;
constexpr size_t kToneSize = 16, kProgramHeader = 8, kVelocityCount = 128;

uint8_t byteAt(assets::View d, size_t at) {
    if (at >= d.size()) throw std::runtime_error("read past the end");
    return d[at];
}

std::optional<uint32_t> table(assets::View d, size_t field) {
    const uint32_t at = assets::le32(d, field);
    if (at == kNoTable) return std::nullopt;
    return at;
}

}

HdBank HdBank::parse(assets::View data) {
    if (data.size() < 0x18 || std::memcmp(data.data() + kMagicAt, "SShd", 4) != 0) throw std::runtime_error("not an SShd bank");
    HdBank bank;
    const auto programTable = table(data, kProgramTableField);
    const auto velocityTable = table(data, kVelocityTableField);
    bank.effectTable = table(data, kEffectTableField);
    if (programTable) {
        const size_t base = *programTable;
        if (base + 2 > data.size()) throw std::runtime_error("program table past the end");
        const uint16_t top = assets::le16(data, base);
        for (uint32_t p = 0; p <= top; ++p) {
            const uint16_t rel = assets::le16(data, base + 2 + 2 * size_t(p));
            if (rel == 0xFFFF) continue;
            const size_t at = base + rel;
            if (at + kProgramHeader > data.size()) throw std::runtime_error("program past the end");
            Program program;
            program.id = uint8_t(p);
            program.head = data[at];
            program.volume = data[at + 1];
            program.pan = data[at + 2];
            program.offset = uint32_t(at);
            for (uint32_t t = 0; t < uint32_t((program.head & 0x7F) + 1); ++t) {
                const size_t o = at + kProgramHeader + kToneSize * t;
                if (o + kToneSize > data.size()) throw std::runtime_error("tone past the end");
                program.tones.push_back({data[o], data[o + 1], data[o + 2], int8_t(data[o + 3]), assets::le16(data, o + 4), assets::le16(data, o + 6),
                                         assets::le16(data, o + 8), data[o + 11], data[o + 13], data[o + 15]});
            }
            bank.programs.push_back(std::move(program));
        }
    }
    if (velocityTable) {
        const size_t at = size_t(*velocityTable) + 2;
        if (at + kVelocityCount > data.size()) throw std::runtime_error("velocity table past the end");
        bank.velocity.assign(data.begin() + at, data.begin() + at + kVelocityCount);
    }
    if (bank.effectTable) {
        const size_t base = *bank.effectTable;
        bank.effectMaster = byteAt(data, base);
        for (size_t n = 0; n < kMaxEffects && base + kEffectsAt + kEffectSize * n + kEffectRead <= data.size(); ++n) {
            const size_t o = base + kEffectsAt + kEffectSize * n;
            bank.effects.push_back({assets::le16(data, o), assets::le16(data, o + 2), assets::le16(data, o + 4), assets::le16(data, o + 6), assets::le16(data, o + 8),
                                    assets::le16(data, o + 10), assets::le16(data, o + 12), assets::le16(data, o + 14), assets::le32(data, o + 16)});
        }
    }
    return bank;
}

const Program* HdBank::program(uint8_t id) const {
    for (const Program& p : programs)
        if (p.id == id) return &p;
    return nullptr;
}

}
