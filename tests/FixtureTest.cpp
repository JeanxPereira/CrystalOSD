#include "Check.hpp"
#include "Parity/Fixture.hpp"
#include <nlohmann/json.hpp>
#include <algorithm>
#include <filesystem>
#include <fstream>
#include <set>

int main(int argc, char** argv) {
    CHECK(argc == 2);
    const parity::Fixture fixture = parity::loadFixture(argv[1]);
    const auto& frame = fixture.frame;

    CHECK(frame.passes.size() == 188);
    CHECK(fixture.oracle.size() == 188);
    CHECK(frame.targets.size() == 3);
    for (const auto& target : frame.targets) {
        CHECK(target.width == 640 && target.height == 224);
        CHECK(fixture.targetStart.at(target.id).rgba.size() == 640u * 224u * 4u);
    }

    const parity::GsPass& copy = frame.passes[2];
    CHECK(copy.primitive == parity::GsPrimitive::Sprites);
    CHECK(copy.target == "fb1a40");
    CHECK(copy.texture && copy.texture->sourceIsTarget && copy.texture->source == "fb0000");
    CHECK(copy.texture->alpha.constant && copy.texture->alpha.value == 127 && copy.texture->alpha.zeroWhenBlack);
    CHECK(copy.texture->addressU.mode == parity::GsAddressMode::RegionClamp && copy.texture->addressU.max == 639);
    CHECK(copy.texture->filter == parity::GsFilter::Bilinear);
    CHECK(!copy.blend);
    CHECK(copy.vertices.size() == 2 && copy.vertices[1].x == 640.0f && copy.vertices[1].y == 224.0f);

    CHECK(std::count_if(frame.passes.begin(), frame.passes.end(), [](const parity::GsPass& p) { return !p.skip.empty(); }) == 26);

    const parity::Image afterCopy = fixture.oracleColour(2);
    CHECK(afterCopy.width == 640 && afterCopy.height == 224);
    std::set<uint8_t> alphas;
    for (size_t i = 3; i < afterCopy.rgba.size(); i += 4) alphas.insert(afterCopy.rgba[i]);
    for (uint8_t a : alphas) CHECK(a == 0 || a == 127);

    const parity::DepthImage depth = fixture.oracleDepth(1);
    CHECK(depth.depth.size() == 640u * 224u);
    const uint32_t deepest = *std::max_element(depth.depth.begin(), depth.depth.end());
    CHECK(deepest > 0 && deepest < (1u << 24));

    const std::filesystem::path scratch = std::filesystem::temp_directory_path() / "fixture-alpha-mode";
    std::filesystem::create_directories(scratch);
    nlohmann::json pass = {{"index", 1}, {"name", "draw-001"}, {"target", "t"}, {"primitive", "Sprites"}, {"scissor", {0, 0, 1, 1}}, {"blend", nullptr}, {"antialias", false},
        {"depth", {{"test", "Always"}, {"write", true}}}, {"skip", nullptr}, {"vertices", nlohmann::json::array()}, {"oracle", {{"colour", "c"}, {"depth", "d"}}},
        {"texture", {{"source", {{"image", "x"}}}, {"width", 1}, {"height", 1}, {"coordinates", "Texel"}, {"addressU", {{"mode", "Clamp"}, {"min", 0}, {"max", 0}}},
            {"addressV", {{"mode", "Clamp"}, {"min", 0}, {"max", 0}}}, {"filter", "Nearest"}, {"alpha", {{"mode", "Palette"}}}}}};
    std::ofstream(scratch / "frame.json") << nlohmann::json{{"field", 0}, {"depthStart", "d"}, {"targets", nlohmann::json::array()}, {"textures", nlohmann::json::array()}, {"passes", {pass}}}.dump();
    bool threw = false;
    try { parity::loadFixture(scratch); } catch (const std::exception&) { threw = true; }
    CHECK(threw);
    pass["texture"]["alpha"] = {{"mode", "Texel"}};
    std::ofstream(scratch / "frame.json") << nlohmann::json{{"field", 0}, {"depthStart", "d"}, {"targets", nlohmann::json::array()}, {"textures", nlohmann::json::array()}, {"passes", {pass}}}.dump();
    CHECK(parity::loadFixture(scratch).frame.passes.size() == 1);

    // The opening's formats: the depth format, the two per-draw flags and a 16-bit texture's TEXA survive a read and a write; a frame.json
    // without them (the clock's) reads as Z32, no flags, no 16-bit alpha.
    CHECK(!copy.depth.z24 && !copy.perPixelAlpha && !copy.alphaCorrection && !copy.texture->alpha.sixteen);
    pass["depth"]["format"] = "Z24";
    pass["perPixelAlpha"] = true;
    pass["alphaCorrection"] = true;
    pass["texture"]["alpha"] = {{"mode", "Texel16"}, {"value", 127}, {"valueHigh", 129}, {"zeroWhenBlack", true}};
    const parity::GsPass opening = parity::readPass(pass);
    CHECK(opening.depth.z24 && opening.perPixelAlpha && opening.alphaCorrection);
    CHECK(opening.texture->alpha.sixteen && !opening.texture->alpha.constant && opening.texture->alpha.value == 127 && opening.texture->alpha.valueHigh == 129 && opening.texture->alpha.zeroWhenBlack);
    const nlohmann::json written = parity::writePass(opening);
    CHECK(written["depth"]["format"] == "Z24" && written["perPixelAlpha"] == true && written["alphaCorrection"] == true);
    CHECK(written["texture"]["alpha"]["mode"] == "Texel16" && written["texture"]["alpha"]["valueHigh"] == 129);
    const parity::GsPass again = parity::readPass(written);
    CHECK(again.depth.z24 && again.perPixelAlpha && again.alphaCorrection && again.texture->alpha.sixteen && again.texture->alpha.valueHigh == 129);

    parity::GsFrame scene{};
    scene.depthFormat = 1;
    scene.passes = {again, again};
    scene.passes[1].depth.z24 = false;
    parity::applyDepthFormat(scene);
    CHECK(scene.passes[0].depth.z24 && scene.passes[1].depth.z24);
    scene.depthFormat = 0;
    parity::applyDepthFormat(scene);
    CHECK(!scene.passes[0].depth.z24 && !scene.passes[1].depth.z24);

    std::filesystem::remove_all(scratch);
    return 0;
}
