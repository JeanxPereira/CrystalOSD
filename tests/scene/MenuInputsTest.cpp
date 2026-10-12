#include <cstdio>
#include <string>

#include "SceneFixture.hpp"
#include "StageCompare.hpp"
#include "Scene/SceneInputs.hpp"

namespace {

#define CHECK(condition)                                                         \
    do {                                                                         \
        if (!(condition)) {                                                      \
            std::fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #condition); \
            return 1;                                                            \
        }                                                                        \
    } while (0)

int sceneFile(const std::string& path) {
    const nlohmann::json scene = scenetest::loadScene(path);
    size_t frames = 0;
    for (const auto& frame : scene.at("frames")) {
        const std::string at = path + " frame " + std::to_string(frame.at("index").get<int>());
        const auto& input = frame.at("input");
        CHECK(scene::hasMenus(input));
        const scene::MenusState menus = scene::menusState(input);
        CHECK(menus.page.ramp.state == input.at("configRamp").at("state").get<int32_t>());
        CHECK(menus.page.ramp.counter == input.at("configRamp").at("counter").get<int32_t>());
        CHECK(menus.page.entries >= 0x002b2bf0u && (menus.page.entries - 0x002b2bf0u) % 0x38 == 0);
        CHECK(menus.mainMenu.count == 2);
        const scene::ConfigItems items = scene::configItems(input);
        CHECK(items[0] == input.at("item0").get<int32_t>());
        // A stage read and compared with itself has no difference; a changed field is found.
        for (const char* stage : {"cubes", "menuStep", "menus", "endOfFrame"}) {
            const auto& pieces = frame.at("expect").at("stages").at(stage).at("before");
            StagePieces s = stagePieces(pieces);
            const auto same = stageDifferences(s, pieces);
            if (!same.empty()) { std::fprintf(stderr, "%s %s: %s\n", at.c_str(), stage, same.front().c_str()); return 1; }
            s.cubes.list.position += 1;
            s.menus.page.glow += 1;
            CHECK(stageDifferences(s, pieces).size() == 2);
        }
        ++frames;
    }
    std::printf("%s: %zu frames read\n", path.c_str(), frames);
    return 0;
}

}

int main(int argc, char** argv) {
    return scenetest::run(argc, argv, [](int count, char** arguments) {
        for (int i = 1; i < count; ++i)
            if (int failed = sceneFile(arguments[i])) return failed;
        return 0;
    });
}
