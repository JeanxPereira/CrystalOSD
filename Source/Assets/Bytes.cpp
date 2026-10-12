#include "Assets/Bytes.hpp"

#include <fstream>

namespace assets {

Bytes readFile(const std::filesystem::path& path) {
    std::ifstream file(path, std::ios::binary | std::ios::ate);
    if (!file) throw std::runtime_error("cannot open " + path.string());
    Bytes data(static_cast<size_t>(file.tellg()));
    file.seekg(0);
    file.read(reinterpret_cast<char*>(data.data()), static_cast<std::streamsize>(data.size()));
    if (!file) throw std::runtime_error("cannot read " + path.string());
    return data;
}

void writeFile(const std::filesystem::path& path, View data) {
    if (path.has_parent_path()) std::filesystem::create_directories(path.parent_path());
    const std::filesystem::path partial = path.string() + ".partial";
    {
        std::ofstream file(partial, std::ios::binary | std::ios::trunc);
        if (!file) throw std::runtime_error("cannot write " + partial.string());
        file.write(reinterpret_cast<const char*>(data.data()), static_cast<std::streamsize>(data.size()));
        if (!file) throw std::runtime_error("cannot write " + partial.string());
    }
    std::filesystem::rename(partial, path);
}

uint64_t hashOf(View data) {
    uint64_t hash = 0xcbf29ce484222325ull;
    for (uint8_t byte : data) hash = (hash ^ byte) * 0x100000001b3ull;
    return hash;
}

}
