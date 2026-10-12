#pragma once
#include <cstdint>
#include <filesystem>
#include <string>
#include <vector>

namespace scene {

// The program's own data, read from its ELF by EE address (References/model/clock_text.mjs elfImage): the
// loadable segments as the EE holds them when the program starts.
class ProgramImage {
public:
    explicit ProgramImage(std::vector<uint8_t> elf);
    static ProgramImage load(const std::filesystem::path& path);

    uint32_t word(uint32_t address) const;
    int32_t integer(uint32_t address) const { return static_cast<int32_t>(word(address)); }
    float single(uint32_t address) const;
    double doubleAt(uint32_t address) const;
    // The bytes from `address` to the first zero.
    std::string string(uint32_t address) const;

private:
    struct Segment {
        uint32_t offset, address, size;
    };
    size_t offsetOf(uint32_t address, uint32_t length) const;

    std::vector<uint8_t> m_elf;
    std::vector<Segment> m_segments;
};

}
