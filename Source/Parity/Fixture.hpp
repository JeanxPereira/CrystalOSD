#pragma once
#include "Parity/GsFrame.hpp"
#include <filesystem>
#include <map>
#include <nlohmann/json_fwd.hpp>

namespace parity {
struct Image { uint32_t width{0}, height{0}; std::vector<uint8_t> rgba; };
struct DepthImage { uint32_t width{0}, height{0}; std::vector<uint32_t> depth; };
struct OracleStep { std::string colour, depth; };
struct Fixture {
    std::filesystem::path root;
    parity::GsFrame frame;
    std::map<std::string, Image> targetStart, textures;
    std::vector<OracleStep> oracle;
    std::string depthStart;
    Image oracleColour(size_t pass) const;
    DepthImage oracleDepth(size_t pass) const;
    DepthImage startDepth() const;
};
Fixture loadFixture(const std::filesystem::path& directory);
Image loadPngPair(const std::filesystem::path& prefix);
// One pass of frame.json, read and written (index, name, target, primitive, scissor, blend, antialias, depth, texture, skip, vertices).
GsPass readPass(const nlohmann::json& pass);
nlohmann::json writePass(const GsPass& pass);
}
