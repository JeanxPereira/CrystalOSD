#pragma once
#include <cstdint>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "Scene/Clock.hpp"
#include "Scene/MenuTypes.hpp"

// A stage of scene.json (tools/scene/instrument.mjs STAGE_PIECES) as owned values; keys absent from the stage keep
// their defaults. `world()` refers to the members; `externals` holds what the menus take from outside.
struct StagePieces {
    scene::ClockState clock;
    scene::HeadState head;
    scene::Ramp spriteFade;
    scene::MenusState menus;
    scene::CubeState cubes;
    scene::ConfigItems items{};
    int32_t width = 640, height = 224;
    scene::MenuExternals externals;
    scene::MenuWorld world() { return {clock, head, spriteFade, menus, cubes, items, width, height}; }
    // What a clock with menus holds after a frame, as a stage's pieces.
    static StagePieces of(const scene::Clock<scene::EeArithmetic>& clock);
};
StagePieces stagePieces(const nlohmann::json& stage);
// Every key of `expected` compared with `ours`, floats by their bits; one line per difference ("cubeList.position: 3000 vs 6000").
std::vector<std::string> stageDifferences(const StagePieces& ours, const nlohmann::json& expected);
