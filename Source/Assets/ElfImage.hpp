#pragma once
#include <vector>

#include "Assets/Bytes.hpp"

namespace assets {

// The loadable segments of an EE ELF, read by EE address.
class ElfImage {
public:
    struct Segment {
        uint32_t offset, address, size;
    };
    explicit ElfImage(View elf);
    View bytes(uint32_t address, uint32_t length) const;
    uint32_t entry() const { return m_entry; }
    const std::vector<Segment>& segments() const { return m_segments; }

private:
    uint32_t m_entry = 0;
    View m_elf;
    std::vector<Segment> m_segments;
};

}
