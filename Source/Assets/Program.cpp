#include "Assets/Program.hpp"

#include <array>
#include <algorithm>
#include <utility>

namespace assets {

namespace {

// programDigest of HDD OSD 1.10U's hddosd.elf (SHA-1 e932f350...) and of its host copy alike.
constexpr uint64_t kHddOsd110U = 0xe0eae235376170d2ull;
constexpr std::array<std::pair<uint32_t, uint32_t>, 2> kHostChanges{{{0x002ad240, 0x002ad970}, {0x003486b8, 0x003486be}}};

uint64_t mix(uint64_t hash, uint32_t value) {
    for (int i = 0; i < 4; ++i) hash = (hash ^ uint8_t(value >> (8 * i))) * 0x100000001b3ull;
    return hash;
}

}  // namespace

uint64_t programDigest(const ElfImage& program) {
    uint64_t hash = mix(0xcbf29ce484222325ull, program.entry());
    hash = mix(hash, uint32_t(program.segments().size()));
    for (const ElfImage::Segment& s : program.segments()) {
        hash = mix(mix(hash, s.address), s.size);
        uint32_t at = s.address;
        const uint32_t end = s.address + s.size;
        while (at < end) {
            uint32_t next = end;
            for (const auto& [from, to] : kHostChanges) {
                if (at >= from && at < to) next = std::min(end, to);
                else if (from > at && from < next) next = from;
            }
            bool skipped = false;
            for (const auto& [from, to] : kHostChanges) skipped |= at >= from && at < to;
            if (!skipped)
                for (const uint8_t byte : program.bytes(at, next - at)) hash = (hash ^ byte) * 0x100000001b3ull;
            at = next;
        }
    }
    return hash;
}

bool isHddOsd110U(const ElfImage& program) {
    try {
        return programDigest(program) == kHddOsd110U;
    } catch (const std::runtime_error&) {
        return false;
    }
}

}
