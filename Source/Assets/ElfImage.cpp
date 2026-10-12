#include "Assets/ElfImage.hpp"

#include <cstring>
#include <string>

namespace assets {

ElfImage::ElfImage(View elf) : m_elf(elf) {
    if (elf.size() < 52 || std::memcmp(elf.data(), "\x7f" "ELF", 4) != 0) throw std::runtime_error("not an ELF");
    m_entry = le32(elf, 24);
    const uint32_t phoff = le32(elf, 28), size = le16(elf, 42), count = le16(elf, 44);
    for (uint32_t i = 0; i < count; ++i) {
        const size_t at = phoff + size_t(i) * size;
        if (le32(elf, at) == 1) m_segments.push_back({le32(elf, at + 4), le32(elf, at + 8), le32(elf, at + 16)});
    }
}

View ElfImage::bytes(uint32_t address, uint32_t length) const {
    for (const Segment& s : m_segments)
        if (address >= s.address && uint64_t(address) + length <= uint64_t(s.address) + s.size && size_t(s.offset) + (address - s.address) + length <= m_elf.size())
            return m_elf.subspan(s.offset + (address - s.address), length);
    throw std::runtime_error("ELF: no segment holds the address " + std::to_string(address));
}

}
