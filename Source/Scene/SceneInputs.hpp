#pragma once
#include <cstdint>
#include <string>

#include <nlohmann/json.hpp>

#include "Scene/Clock.hpp"
#include "Scene/Matrix.hpp"
#include "Scene/MenuTypes.hpp"

namespace scene {

// The exporter's float patterns ("0x3f800000") read back bit for bit.
uint32_t hexBits(const nlohmann::json& hex);
float hexFloat(const nlohmann::json& hex);
Vec4 hexVec4(const nlohmann::json& hex);
Mat4 hexMat4(const nlohmann::json& hex);

// A frame's `input` of scene.json (tools/scene/export_fixture.mjs) as the clock's state, and its external inputs.
ClockInputs clockInputs(const nlohmann::json& input, const RodMesh& mesh, const RodMesh* cubeMesh = nullptr);
FrameInputs frameInputs(const nlohmann::json& input);
// The program's font state as instrument.mjs fontState writes it.
FontState fontState(const nlohmann::json& state);
// The input a clock starts from: frames[0].input of a scene.json, parsed alone (the whole file is tens of
// megabytes), or a file that holds one input.
nlohmann::json firstInput(const std::string& path);

// The menus' and cubes' pieces of a frame's `input` (tools/scene/instrument.mjs PIECES).
bool hasMenus(const nlohmann::json& input);
MenusState menusState(const nlohmann::json& input);
VersionPage versionPage(const nlohmann::json& page);
VersionRow versionRow(const nlohmann::json& row);
CubeState cubeState(const nlohmann::json& input);
MenuExternals menuExternals(const nlohmann::json& input);
ConfigItems configItems(const nlohmann::json& input);
PadWords padWords(const nlohmann::json& pad);
ListFade listFade(const nlohmann::json& fade);

}
