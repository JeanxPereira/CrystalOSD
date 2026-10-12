#include "SceneFixture.hpp"

#include <cstdio>
#include <fstream>
#include <stdexcept>

namespace scenetest {

int run(int argc, char** argv, const std::function<int(int, char**)>& body) {
    try {
        return body(argc, argv);
    } catch (const std::exception& e) {
        std::fprintf(stderr, "exception: %s\n", e.what());
        return 1;
    }
}

nlohmann::json loadScene(const std::string& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) throw std::runtime_error("cannot open " + path);
    return nlohmann::json::parse(in);
}

std::string bitsText(uint32_t bits) {
    char text[11];
    std::snprintf(text, sizeof text, "0x%08x", bits);
    return text;
}

bool sameBits(float value, uint32_t expected, std::string_view what) {
    const uint32_t got = scene::floatBits(value);
    if (got == expected) return true;
    std::fprintf(stderr, "%.*s: got %s, expected %s\n", static_cast<int>(what.size()), what.data(), bitsText(got).c_str(), bitsText(expected).c_str());
    return false;
}

namespace {

bool sizeIs(const nlohmann::json& hex, size_t size, std::string_view what) {
    if (hex.is_array() && hex.size() == size) return true;
    std::fprintf(stderr, "%.*s: expected an array of %zu, the fixture holds %s\n", static_cast<int>(what.size()), what.data(), size, hex.dump().substr(0, 80).c_str());
    return false;
}

}

bool sameBits(float value, const nlohmann::json& hex, std::string_view what) { return sameBits(value, hexBits(hex), what); }

bool sameBits(const scene::Vec4& value, const nlohmann::json& hex, std::string_view what) {
    if (!sizeIs(hex, 4, what)) return false;
    bool same = true;
    for (size_t i = 0; same && i < 4; ++i) same = sameBits(value[i], hex.at(i), std::string(what) + "[" + std::to_string(i) + "]");
    return same;
}

bool sameBits(const scene::Mat4& value, const nlohmann::json& hex, std::string_view what) {
    if (!sizeIs(hex, 4, what)) return false;
    bool same = true;
    for (size_t r = 0; same && r < 4; ++r) same = sameBits(value[r], hex.at(r), std::string(what) + "[" + std::to_string(r) + "]");
    return same;
}

uint32_t fnv(const float* values, size_t count) {
    uint32_t h = 0x811c9dc5u;
    for (size_t i = 0; i < count; ++i) {
        uint32_t u = scene::floatBits(values[i]);
        for (int k = 0; k < 4; ++k) {
            h ^= u & 0xffu;
            h *= 0x01000193u;
            u >>= 8;
        }
    }
    return h;
}

}
