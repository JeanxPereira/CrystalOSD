#include "Scene/ProgramImage.hpp"

#include <cstring>
#include <fstream>
#include <iterator>
#include <stdexcept>

namespace scene {

namespace {

uint32_t read32(const std::vector<uint8_t>& d, size_t at) {
    if (at + 4 > d.size()) throw std::runtime_error("program image: read past the end");
    return uint32_t(d[at]) | uint32_t(d[at + 1]) << 8 | uint32_t(d[at + 2]) << 16 | uint32_t(d[at + 3]) << 24;
}
uint32_t read16(const std::vector<uint8_t>& d, size_t at) {
    if (at + 2 > d.size()) throw std::runtime_error("program image: read past the end");
    return uint32_t(d[at]) | uint32_t(d[at + 1]) << 8;
}

}

ProgramImage::ProgramImage(std::vector<uint8_t> elf) : m_elf(std::move(elf)) {
    if (m_elf.size() < 52 || std::memcmp(m_elf.data(), "\x7f" "ELF", 4) != 0) throw std::runtime_error("program image: not an ELF");
    const uint32_t phoff = read32(m_elf, 28), size = read16(m_elf, 42), count = read16(m_elf, 44);
    for (uint32_t i = 0; i < count; ++i) {
        const size_t at = phoff + size_t(i) * size;
        if (read32(m_elf, at) == 1) m_segments.push_back({read32(m_elf, at + 4), read32(m_elf, at + 8), read32(m_elf, at + 16)});
    }
}

ProgramImage ProgramImage::load(const std::filesystem::path& path) {
    std::ifstream file(path, std::ios::binary);
    if (!file) throw std::runtime_error("cannot open the program " + path.string());
    return ProgramImage(std::vector<uint8_t>((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>()));
}

size_t ProgramImage::offsetOf(uint32_t address, uint32_t length) const {
    for (const Segment& s : m_segments)
        if (address >= s.address && uint64_t(address) + length <= uint64_t(s.address) + s.size) return s.offset + (address - s.address);
    throw std::runtime_error("program image: no segment holds the address " + std::to_string(address));
}

uint32_t ProgramImage::word(uint32_t address) const { return read32(m_elf, offsetOf(address, 4)); }

float ProgramImage::single(uint32_t address) const {
    const uint32_t bits = word(address);
    float value;
    std::memcpy(&value, &bits, 4);
    return value;
}

double ProgramImage::doubleAt(uint32_t address) const {
    const uint64_t bits = uint64_t(word(address)) | uint64_t(word(address + 4)) << 32;
    double value;
    std::memcpy(&value, &bits, 8);
    return value;
}

std::string ProgramImage::string(uint32_t address) const {
    const size_t start = offsetOf(address, 1);
    size_t end = start;
    while (end < m_elf.size() && m_elf[end] != 0) ++end;
    return std::string(m_elf.begin() + static_cast<std::ptrdiff_t>(start), m_elf.begin() + static_cast<std::ptrdiff_t>(end));
}

}
