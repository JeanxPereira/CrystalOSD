#pragma once
#include <cstdint>
#include <filesystem>
#include <string>
#include <vector>

#include "Assets/Bytes.hpp"

namespace audio::driver {

inline constexpr int64_t kOsdsndBase = 0x90130;
inline constexpr size_t kOsdsndSize = 0xb000;
inline constexpr int64_t kSoundIopBase = 0xeb000;
inline constexpr int64_t kLibsdBase = 0x80000;

class IopMemory {
public:
    static constexpr size_t kSize = 0x200000;
    IopMemory() : m_ram(kSize, 0) {}

    void load(int64_t at, assets::View data);
    uint8_t u8(int64_t at) const { return m_ram[check(at, 1)]; }
    uint16_t u16(int64_t at) const { return assets::le16(m_ram, check(at, 2)); }
    uint32_t u32(int64_t at) const { return assets::le32(m_ram, check(at, 4)); }
    int32_t s32(int64_t at) const { return int32_t(u32(at)); }
    void write8(int64_t at, int64_t value) { m_ram[check(at, 1)] = uint8_t(value); }
    void write16(int64_t at, int64_t value);
    void write32(int64_t at, int64_t value);
    void fill(int64_t at, int64_t length);
    assets::View bytes() const { return m_ram; }

private:
    size_t check(int64_t at, int64_t length) const;
    assets::Bytes m_ram;
};

class LibsdImage {
public:
    explicit LibsdImage(assets::Bytes image) : m_image(std::move(image)) {}
    uint32_t u32(int64_t address) const { return assets::le32(m_image, check(address, 4)); }
    uint16_t u16(int64_t address) const { return assets::le16(m_image, check(address, 2)); }
    void write32(int64_t address, uint32_t value);
    assets::View slice(int64_t address, int64_t length) const;
    assets::View bytes() const { return m_image; }

private:
    size_t check(int64_t address, int64_t length) const;
    assets::Bytes m_image;
};

struct Snapshot {
    assets::Bytes osdsnd;
    assets::Bytes iop;
};

Snapshot loadSnapshot(const std::filesystem::path& stem);

}
