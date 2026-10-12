#include <cstdio>
#include <string>

#include "../Check.hpp"
#include "SceneFixture.hpp"
#include "SceneGate.hpp"
#include "StringCompare.hpp"
#include "Scene/SceneInputs.hpp"

using nlohmann::json;
using scenetest::EeClock;

namespace {

// The clock alone runs no menus, so the capture must hold them idle: no button pressed, the menu and cube ramps still,
// no entry entered. System Configuration may stand open behind Square (its ramp full), its selected entry's glow moving.
int menusIdle(const json& frame, const std::string& at) {
    const json& input = frame.at("input");
    const json& after = frame.at("expect").at("after");
    const auto busy = [&](const char* why) {
        std::fprintf(stderr, "%s: %s: the menus are not idle\n", at.c_str(), why);
        return 1;
    };
    if (input.contains("pad") && input.at("pad").at("pressed") != 0) return busy("a button is pressed");
    if (after.at("menuRamp") != input.at("menuRamp") || after.at("cubeRamp") != input.at("cubeRamp")) return busy("the menu or cube ramp moved");
    if (input.contains("configPage")) {
        json page = input.at("configPage"), pageAfter = after.at("configPage");
        if (page.at("level") != 0 || pageAfter.at("level") != 0 || input.at("entryActive") != 0 || after.at("entryActive") != 0) return busy("an entry is entered");
        page.erase("glow");
        pageAfter.erase("glow");
        if (page != pageAfter) return busy("System Configuration's page moved");
        if (after.at("mainMenu") != input.at("mainMenu") || after.at("screenCode") != input.at("screenCode")) return busy("the main menu or the screen moved");
    }
    return 0;
}

}

int main(int argc, char** argv) {
    return scenetest::run(argc, argv, [](int argc, char** argv) {
        if (argc != 8) {
            std::fprintf(stderr, "usage: ClockParityTest <scene.json> <rod-mesh.json> <passes.json> <parity fixture f0> <scene fixture out> <FNTOSD> <hddosd.elf>\n");
            return 1;
        }
        const json sceneJson = scenetest::loadScene(argv[1]);
        const scene::RodMesh mesh = scene::loadRodMesh(argv[2]);
        const json dump = scenetest::loadScene(argv[3]);
        const json& frames = sceneJson.at("frames");
        const json& dumpFrames = dump.at("frames");
        CHECK(!frames.empty());
        const auto font = std::make_shared<const scene::Font>(scene::Font::load(argv[6]));
        const auto program = std::make_shared<const scene::ProgramImage>(scene::ProgramImage::load(argv[7]));
        const auto inputs = [&](const json& input) {
            scene::ClockInputs c = scene::clockInputs(input, mesh);
            c.font = font;
            c.program = program;
            return c;
        };

        EeClock clock(inputs(frames.at(0).at("input")));
        size_t compared = 0, passes = 0, strings = 0;
        for (const json& frame : frames) {
            const int index = frame.at("index");
            const std::string at = "frame " + std::to_string(index);
            if (menusIdle(frame, at)) return 1;
            const json& input = frame.at("input");
            // The menus' words the text's alpha reads stand still, and items 9 to 0xB are the time record's hour,
            // minute and second.
            CHECK(input.at("textRamps") == frames.at(0).at("input").at("textRamps"));
            const json& items = input.at("configItems");
            CHECK(items.at(9) == input.at("time").at("hours") && items.at(10) == input.at("time").at("minutes") && items.at(11) == input.at("time").at("seconds"));
            CHECK(input.at("textRamps").at("weight") == input.at("overlayLevel") && input.at("textRamps").at("tail") == input.at("tail") &&
                  input.at("textRamps").at("menu") == input.at("menuRamp") && input.at("textRamps").at("body") == input.at("body"));
            if (index > 0 && scenetest::compareCache(clock.text()->cache(), input.at("font"), at + " start")) return 1;
            const scene::FrameInputs in = scene::frameInputs(input);
            const scene::Frame out = clock.frame(in);
            if (scenetest::compareAfter(clock, frame.at("expect").at("after"), at)) return 1;
            if (scenetest::compareStrings(clock.strings(), frame.at("expect").at("text"), {"text", "hint"}, at)) return 1;
            strings += clock.strings().size();
            CHECK(out.field == in.field && out.displayIndex == in.displayIndex);
            const parity::GsFrame gs = parity::fromScene(out, parity::clockLayout(out.width, out.height, out.displayIndex));
            CHECK(gs.passes.size() == out.passes.size());
            if (static_cast<size_t>(index) >= dumpFrames.size()) {
                std::printf("%s: %zu passes; the dump has no frame %d (state and strings compared only)\n", at.c_str(), out.passes.size(), index);
                continue;
            }
            const json& dumpFrame = dumpFrames.at(static_cast<size_t>(index));
            CHECK(dumpFrame.at("frame") == index);
            scenetest::TextCount count;
            if (scenetest::compareFrame(gs, dumpFrame, count, at)) return 1;
            CHECK(count.font == 26 && count.hint == 1);
            ++compared;
            passes += gs.passes.size();
            std::printf("%s: %zu scene passes equal to the dump's, %zu of them glyphs and %zu the hint's picture\n", at.c_str(), gs.passes.size(), count.font, count.hint);
        }
        std::printf("geometry: %zu frames carried, %zu scene passes equal to the dump, every dump pass a scene pass; %zu strings equal\n", compared, passes, strings);

        EeClock first(inputs(frames.at(0).at("input")));
        const scene::Frame zero = first.frame(scene::frameInputs(frames.at(0).at("input")));
        if (scenetest::writeSceneFixture(parity::fromScene(zero, parity::clockLayout(zero.width, zero.height, zero.displayIndex)), zero, font.get(), argv[4], argv[5])) return 1;

        scene::Clock<scene::NativeArithmetic> native(inputs(frames.at(0).at("input")));
        const scene::Frame plain = native.frame(scene::frameInputs(frames.at(0).at("input")));
        CHECK(!plain.passes.empty());
        CHECK(plain.glyphs == zero.glyphs);
        std::printf("native: frame 0 has %zu passes (Ee %zu)\n", plain.passes.size(), zero.passes.size());

        // The ramps this capture holds still, rising: each frame ticks the grey ramp once (background) and the
        // vignette ramp once (overlay), and the vignette is drawn.
        scene::ClockInputs rising = inputs(frames.at(0).at("input"));
        rising.head.greyRamp = {40, 10, 0, 1};
        rising.state.vignetteRamp = {80, 10, 0, 1};
        EeClock ramps(rising);
        const scene::Frame drawn = ramps.frame(scene::frameInputs(frames.at(0).at("input")));
        CHECK(ramps.head().greyRamp.counter == 11 && ramps.state().vignetteRamp.counter == 11);
        bool vignette = false;
        for (const scene::Pass& pass : drawn.passes) vignette = vignette || pass.name == "vignette";
        CHECK(vignette);
        std::printf("ramps: grey and vignette ramps ticked once each\n");
        return 0;
    });
}
