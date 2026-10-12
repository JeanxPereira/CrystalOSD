#include "Audio/Lab/WavWriter.hpp"

#include <cstring>
#include <fstream>
#include <iterator>
#include <stdexcept>

namespace audio::lab {

namespace {
void put32(uint8_t* p, uint32_t v) {
    for (int i = 0; i < 4; ++i) p[i] = uint8_t(v >> (8 * i));
}
void put16(uint8_t* p, uint16_t v) {
    p[0] = uint8_t(v);
    p[1] = uint8_t(v >> 8);
}
uint32_t get32(const uint8_t* p) { return uint32_t(p[0]) | uint32_t(p[1]) << 8 | uint32_t(p[2]) << 16 | uint32_t(p[3]) << 24; }
uint16_t get16(const uint8_t* p) { return uint16_t(p[0] | p[1] << 8); }
}

void writeWav(const std::filesystem::path& path, std::span<const int16_t> interleavedStereo, uint32_t sampleRate) {
    const uint32_t dataBytes = uint32_t(interleavedStereo.size() * 2);
    std::vector<uint8_t> out(44 + dataBytes);
    std::memcpy(&out[0], "RIFF", 4);
    put32(&out[4], 36 + dataBytes);
    std::memcpy(&out[8], "WAVEfmt ", 8);
    put32(&out[16], 16);
    put16(&out[20], 1);
    put16(&out[22], 2);
    put32(&out[24], sampleRate);
    put32(&out[28], sampleRate * 4);
    put16(&out[32], 4);
    put16(&out[34], 16);
    std::memcpy(&out[36], "data", 4);
    put32(&out[40], dataBytes);
    for (size_t i = 0; i < interleavedStereo.size(); ++i) put16(&out[44 + 2 * i], uint16_t(interleavedStereo[i]));
    if (path.has_parent_path()) std::filesystem::create_directories(path.parent_path());
    std::ofstream f(path, std::ios::binary);
    if (!f) throw std::runtime_error(path.string() + ": cannot write");
    f.write(reinterpret_cast<const char*>(out.data()), std::streamsize(out.size()));
    if (!f) throw std::runtime_error(path.string() + ": write failed");
}

std::vector<int16_t> readWav(const std::filesystem::path& path) {
    std::ifstream f(path, std::ios::binary);
    if (!f) throw std::runtime_error(path.string() + ": cannot read");
    std::vector<uint8_t> b((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
    if (b.size() < 44 || std::memcmp(&b[0], "RIFF", 4) != 0 || std::memcmp(&b[8], "WAVEfmt ", 8) != 0 || std::memcmp(&b[36], "data", 4) != 0)
        throw std::runtime_error(path.string() + ": not a canonical WAV");
    if (get32(&b[16]) != 16 || get16(&b[20]) != 1 || get16(&b[22]) != 2 || get16(&b[34]) != 16)
        throw std::runtime_error(path.string() + ": not 16-bit stereo PCM");
    const uint32_t dataBytes = get32(&b[40]);
    if (dataBytes % 2 != 0 || 44 + size_t(dataBytes) > b.size()) throw std::runtime_error(path.string() + ": data size past the end");
    std::vector<int16_t> out(dataBytes / 2);
    for (size_t i = 0; i < out.size(); ++i) out[i] = int16_t(get16(&b[44 + 2 * i]));
    return out;
}

}
