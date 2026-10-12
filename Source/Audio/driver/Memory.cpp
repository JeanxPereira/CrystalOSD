#include "Audio/driver/Memory.hpp"

#include <algorithm>

namespace audio::driver {

size_t IopMemory::check(int64_t at, int64_t length) const {
    if (at < 0 || at + length > int64_t(m_ram.size())) throw std::runtime_error("IOP RAM access out of range: " + std::to_string(at));
    return size_t(at);
}

void IopMemory::load(int64_t at, assets::View data) {
    const size_t start = check(at, int64_t(data.size()));
    std::copy(data.begin(), data.end(), m_ram.begin() + std::ptrdiff_t(start));
}

void IopMemory::write16(int64_t at, int64_t value) {
    const size_t i = check(at, 2);
    m_ram[i] = uint8_t(value);
    m_ram[i + 1] = uint8_t(value >> 8);
}

void IopMemory::write32(int64_t at, int64_t value) {
    const size_t i = check(at, 4);
    for (size_t k = 0; k < 4; ++k) m_ram[i + k] = uint8_t(value >> (8 * k));
}

void IopMemory::fill(int64_t at, int64_t length) {
    const size_t start = check(at, length);
    std::fill_n(m_ram.begin() + std::ptrdiff_t(start), length, uint8_t(0));
}

size_t LibsdImage::check(int64_t address, int64_t length) const {
    const int64_t at = address - kLibsdBase;
    if (at < 0 || at + length > int64_t(m_image.size())) throw std::runtime_error("libsd image access out of range: " + std::to_string(address));
    return size_t(at);
}

void LibsdImage::write32(int64_t address, uint32_t value) {
    const size_t i = check(address, 4);
    for (size_t k = 0; k < 4; ++k) m_image[i + k] = uint8_t(value >> (8 * k));
}

assets::View LibsdImage::slice(int64_t address, int64_t length) const {
    const size_t i = check(address, length);
    return assets::View(m_image).subspan(i, size_t(length));
}

Snapshot loadSnapshot(const std::filesystem::path& stem) {
    Snapshot s;
    s.osdsnd = assets::readFile(stem.string() + ".start.osdsnd.bin");
    const std::filesystem::path iop = stem.string() + ".start.iopsound.bin";
    if (std::filesystem::exists(iop)) s.iop = assets::readFile(iop);
    if (s.osdsnd.size() > kOsdsndSize) throw std::runtime_error(stem.string() + ": OSDSND snapshot larger than its region");
    return s;
}

}
