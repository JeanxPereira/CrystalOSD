#pragma once
#include <cstdint>
#include <filesystem>
#include <string>

#include <nlohmann/json.hpp>

#include "Parity/Fixture.hpp"
#include "Parity/FromScene.hpp"
#include "Scene/Clock.hpp"
#include "Scene/Font.hpp"

namespace scenetest {

using EeClock = scene::Clock<scene::EeArithmetic>;

std::string vertexText(const parity::GsVertex& v);
bool regionMode(parity::GsAddressMode mode);
bool sameAddress(const parity::GsAddress& a, const parity::GsAddress& b);
bool sameVertex(const parity::GsVertex& a, const parity::GsVertex& b, bool textured);
std::string stateDifference(const parity::GsPass& ours, const parity::GsPass& theirs);
std::string passDifference(const parity::GsPass& ours, const parity::GsPass& theirs);
std::string passLabel(const parity::GsPass& pass);
bool primitivesMatch(const parity::GsPass& ours, const parity::GsPass& oracle);

// The text's passes: glyphs (triangles of the glyph cache, the paletted texture t2f04, PSM 0x14) and the hint's picture
// (the sprite of clock texture 9, t2ec0, or 8, t2e80). `absorbed`: dump passes of that kind the scene does not produce.
struct TextCount {
    size_t font = 0, hint = 0, absorbed = 0;
    static bool isText(const parity::GsPass& pass);
    void take(const parity::GsPass& pass);
};

parity::GsPass dumpPass(const nlohmann::json& p);

// The scene's passes against the dump's, in order: every dump pass is a scene pass, state and every vertex equal. With
// `absorbText`, a text pass of the dump the scene does not produce is counted, not failed (R10).
int compareFrame(const parity::GsFrame& ours, const nlohmann::json& dump, TextCount& count, const std::string& at, bool absorbText = false);

// The state the frame leaves, against the model's: every piece the clock screen steps.
int compareAfter(const EeClock& clock, const nlohmann::json& after, const std::string& at);

// Frame 0 as a fixture for ParityTool: the scene's passes, the text's among them, with the oracle's results of the draws
// they match (a pass the oracle culled whole takes the results before it), and the glyph cache's image (`font` null:
// no text). With `absorbText`, the oracle's text passes the scene does not draw stay as they are, skipped ("text from the oracle").
int writeSceneFixture(const parity::GsFrame& ours, const scene::Frame& frame, const scene::Font* font, const std::filesystem::path& f0, const std::filesystem::path& out,
                      bool absorbText = false);

}
