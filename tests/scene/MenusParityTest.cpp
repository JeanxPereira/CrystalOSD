#include <algorithm>
#include <cstdio>
#include <filesystem>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "SceneFixture.hpp"
#include "SceneGate.hpp"
#include "StageCompare.hpp"
#include "StringCompare.hpp"
#include "Parity/FromScene.hpp"
#include "Scene/Clock.hpp"
#include "Scene/SceneInputs.hpp"

namespace {

using nlohmann::json;
using scenetest::EeClock;

struct Arguments {
    std::string scene, rodMesh, cubeMesh, passes, font, program, f0, out;
    bool noText = false;
};

Arguments parse(int count, char** a) {
    Arguments r{a[1], a[2], a[3], a[4], a[5], a[6]};
    for (int i = 7; i < count; ++i) {
        const std::string arg = a[i];
        if (arg == "--f0" && i + 1 < count) r.f0 = a[++i];
        else if (arg == "--out" && i + 1 < count) r.out = a[++i];
        else if (arg == "--no-text") r.noText = true;
    }
    return r;
}

int run(const Arguments& args) {
    const json scene = scenetest::loadScene(args.scene);
    const json dump = scenetest::loadScene(args.passes);
    const scene::RodMesh rods = scene::loadRodMesh(args.rodMesh), cubes = scene::loadRodMesh(args.cubeMesh);
    const json& frames = scene.at("frames");
    scene::ClockInputs inputs = scene::clockInputs(frames.at(0).at("input"), rods, &cubes);
    if (!inputs.menus) { std::fprintf(stderr, "%s holds no menus\n", args.scene.c_str()); return 1; }
    std::shared_ptr<const scene::Font> font;
    if (!args.noText) {
        font = std::make_shared<const scene::Font>(scene::Font::load(args.font));
        inputs.font = font;
        const json& firstPages = frames.at(0).at("expect").at("text").at("pages");
        if (!firstPages.empty()) inputs.text.font = scene::fontState(firstPages.at(0).at("own"));
        inputs.program = std::make_shared<const scene::ProgramImage>(scene::ProgramImage::load(args.program));
    }
    EeClock clock(inputs);
    const size_t compared = std::min(frames.size(), dump.at("frames").size());
    size_t passes = 0, strings = 0;
    scenetest::TextCount absorbed;
    std::optional<scene::Frame> zero;
    for (size_t k = 0; k < frames.size(); ++k) {
        const json& frame = frames.at(k);
        const std::string at = "frame " + std::to_string(k);
        scene::FrameInputs in = scene::frameInputs(frame.at("input"));
        in.threadStep = k > 0;
        const scene::Frame out = clock.frame(in);
        if (k == 0) zero = out;
        if (scenetest::compareAfter(clock, frame.at("expect").at("after"), at)) return 1;
        auto menus = stageDifferences(StagePieces::of(clock), frame.at("expect").at("stages").at("endOfFrame").at("after"));
        std::erase_if(menus, [](const std::string& line) { return line.starts_with("configPage.titleWidth"); });
        if (!menus.empty()) { std::fprintf(stderr, "%s: %s\n", at.c_str(), menus.front().c_str()); return 1; }
        if (!args.noText) {
            if (scenetest::compareStrings(clock.strings(), frame.at("expect").at("text"), {"pages", "text", "hint"}, at)) return 1;
            strings += clock.strings().size();
            if (k + 1 < frames.size()) {
                const json& next = frames.at(k + 1).at("input");
                if (scenetest::compareCache(clock.text()->cache(), next.at("font"), at + " cache")) return 1;
                // The title's width is measured by its drawing, after the stage the console's probe took: the next frame's input holds it.
                const int32_t width = next.at("configPage").at("titleWidth").get<int32_t>();
                if (clock.menus()->page.titleWidth != width) { std::fprintf(stderr, "%s: title width %d, the console %d\n", at.c_str(), clock.menus()->page.titleWidth, width); return 1; }
            }
        }
        if (k < compared) {
            const parity::GsFrame gs = parity::fromScene(out, parity::clockLayout(out.width, out.height, out.displayIndex));
            if (scenetest::compareFrame(gs, dump.at("frames").at(k), absorbed, at, args.noText)) return 1;
            passes += gs.passes.size();
        }
    }
    if (!args.f0.empty())
        if (scenetest::writeSceneFixture(parity::fromScene(*zero, parity::clockLayout(zero->width, zero->height, zero->displayIndex)), *zero, font.get(), args.f0, args.out, args.noText)) return 1;
    std::printf("%s: %zu frames carried, %zu compared with the dump, %zu passes equal, %zu strings equal, %zu text passes absorbed\n", args.scene.c_str(), frames.size(), compared,
                passes, strings, absorbed.absorbed);
    return 0;
}

}

int main(int argc, char** argv) {
    return scenetest::run(argc, argv, [](int count, char** arguments) {
        if (count < 7) {
            std::fprintf(stderr, "usage: MenusParityTest <scene.json> <rod-mesh.json> <cube-mesh.json> <passes.json> <FNTOSD> <hddosd.elf> [--f0 dir --out dir] [--no-text]\n");
            return 1;
        }
        return run(parse(count, arguments));
    });
}
