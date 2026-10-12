#pragma once
#include <filesystem>

#include "Assets/Bytes.hpp"
#include "Audio/SpuWrite.hpp"

inline audio::WriteStream readWrites(const std::filesystem::path& path) {
    const assets::Bytes b = assets::readFile(path);
    if (b.size() % 16 != 0) throw std::runtime_error(path.string() + ": not 16-byte records");
    audio::WriteStream out;
    for (size_t at = 0; at < b.size(); at += 16)
        out.push_back({assets::le32(b, at), assets::le32(b, at + 4), assets::le32(b, at + 8), uint16_t(assets::le32(b, at + 12))});
    return out;
}

inline std::vector<audio::DriverCommand> readCommands(const std::filesystem::path& path) {
    const assets::Bytes b = assets::readFile(path);
    if (b.size() % 32 != 0) throw std::runtime_error(path.string() + ": not 32-byte records");
    std::vector<audio::DriverCommand> out;
    for (size_t at = 0; at < b.size(); at += 32) {
        audio::DriverCommand c;
        c.frame = assets::le32(b, at);
        c.sample = assets::le32(b, at + 4);
        c.id = assets::le32(b, at + 8);
        for (size_t k = 0; k < 5; ++k) c.words[k] = assets::le32(b, at + 12 + 4 * k);
        out.push_back(c);
    }
    return out;
}
