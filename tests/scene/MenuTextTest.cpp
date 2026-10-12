#include <cstdio>
#include <memory>
#include <optional>
#include <string>
#include <utility>

#include "SceneFixture.hpp"
#include "StageCompare.hpp"
#include "StringCompare.hpp"
#include "Scene/SceneInputs.hpp"
#include "Scene/Text.hpp"

namespace {

using nlohmann::json;

json withRamps(const json& input) {
    if (input.contains("textRamps")) return input;
    const json rest = {{"length", 10}, {"counter", 0}, {"changed", 0}, {"state", 0}};
    json copy = input;
    copy["textRamps"] = {{"config", rest}, {"mainMenu", rest}, {"version", rest}, {"dialogClosing", rest}, {"firstRun", rest}, {"dialog", rest}, {"lead", 0}, {"body", 0},
                         {"panel7", 0}, {"panel8On", 0}, {"panel8", 0}, {"adjustRow", 0}};
    return copy;
}

int sceneFile(const std::string& path, const std::shared_ptr<const scene::Font>& font, const std::shared_ptr<const scene::ProgramImage>& program, const scene::RodMesh& mesh) {
    const json scene = scenetest::loadScene(path);
    const json& frames = scene.at("frames");
    scene::ClockInputs first = scene::clockInputs(frames.at(0).at("input"), mesh);
    const json& firstPages = frames.at(0).at("expect").at("text").at("pages");
    if (!firstPages.empty()) first.text.font = scene::fontState(firstPages.at(0).at("own"));
    scene::Text<scene::EeArithmetic> text(font, program, first.text);
    size_t strings = 0;
    for (size_t k = 0; k < frames.size(); ++k) {
        const json& frame = frames.at(k);
        const std::string at = path + " frame " + std::to_string(k);
        const json& input = frame.at("input");
        const scene::ClockInputs here = scene::clockInputs(withRamps(input), mesh);
        const json& stages = frame.at("expect").at("stages");
        scene::MenusState before = scene::menusState(stages.at("menus").at("before"));
        if (frame.at("expect").contains("listFade")) before.listFade = scene::listFade(frame.at("expect").at("listFade"));
        const scene::MenusState after = scene::menusState(stages.at("menus").at("after"));
        const scene::MenusState atPages = scene::menusAtPages(before, after);
        const scene::ConfigItems items = scene::configItems(input);
        const scene::TextRamps pageRamps = scene::textRampsOf(atPages, here.text.ramps);
        const scene::TextRamps ramps = scene::textRampsOf(after, here.text.ramps);
        scene::ClockState clock = here.state;
        clock.menuRamp = stagePieces(stages.at("menuStep").at("after")).clock.menuRamp;
        const scene::PagesFrame pages = text.pages(scene::pagesOf(atPages, clock, items, pageRamps, here.width, here.height));
        const json& menusAfter = stages.at("menus").at("after");
        const scene::ConfigItems itemsAfter = menusAfter.contains("configItems") ? scene::configItems(menusAfter) : items;
        if (!pages.unmodelled.empty()) {
            std::fprintf(stderr, "%s: entry callback 0x%x is not modelled\n", at.c_str(), pages.unmodelled.front());
            return 1;
        }
        scene::TextFrameInputs in;
        in.items = {itemsAfter[6], itemsAfter[7], itemsAfter[8], itemsAfter[9], itemsAfter[10], itemsAfter[11]};
        in.item0 = itemsAfter[0];
        in.overlayLevel = clock.overlayLevel;
        in.tail = clock.tail;
        in.menu = clock.menuRamp;
        in.width = here.width;
        in.height = here.height;
        in.ramps = ramps;
        const scene::TextFrame rest = text.frame(in);
        std::vector<scene::StringRun> all = pages.text.strings;
        all.insert(all.end(), rest.strings.begin(), rest.strings.end());
        if (scenetest::compareStrings(all, frame.at("expect").at("text"), {"pages", "text", "hint"}, at)) return 1;
        strings += all.size();
        if (k + 1 < frames.size()) {
            const json& next = frames.at(k + 1).at("input");
            if (scenetest::compareCache(text.cache(), next.at("font"), at + " cache")) return 1;
            if (pages.titleWidth && *pages.titleWidth != next.at("configPage").at("titleWidth").get<int32_t>()) {
                std::fprintf(stderr, "%s: title width %d, the console %d\n", at.c_str(), *pages.titleWidth, next.at("configPage").at("titleWidth").get<int32_t>());
                return 1;
            }
        }
    }
    std::printf("%s: %zu frames, %zu strings equal\n", path.c_str(), frames.size(), strings);
    return 0;
}

}

int main(int argc, char** argv) {
    return scenetest::run(argc, argv, [](int count, char** arguments) {
        const auto font = std::make_shared<const scene::Font>(scene::Font::load(arguments[1]));
        const auto program = std::make_shared<const scene::ProgramImage>(scene::ProgramImage::load(arguments[2]));
        const scene::RodMesh mesh = scene::loadRodMesh(arguments[3]);
        for (int i = 4; i < count; ++i)
            if (int failed = sceneFile(arguments[i], font, program, mesh)) return failed;
        return 0;
    });
}
