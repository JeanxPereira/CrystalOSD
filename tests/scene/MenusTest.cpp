#include <array>
#include <cstdio>
#include <string>
#include <vector>

#include "SceneFixture.hpp"
#include "StageCompare.hpp"
#include "Scene/ClockDate.hpp"
#include "Scene/Menus.hpp"
#include "Scene/SceneInputs.hpp"

namespace {

using nlohmann::json;

int report(const std::string& at, const std::vector<std::string>& differences) {
    if (differences.empty()) return 0;
    std::fprintf(stderr, "%s: %zu differences, first: %s\n", at.c_str(), differences.size(), differences.front().c_str());
    for (size_t i = 1; i < differences.size() && i < 6; ++i) std::fprintf(stderr, "  %s\n", differences[i].substr(0, 300).c_str());
    return 1;
}

int stages(const std::string& path, const scene::Menus& menus) {
    const json scene = scenetest::loadScene(path);
    size_t frames = 0;
    const json& start = scene.at("frames").at(0).at("input");
    scene::ListFade fade = start.contains("listFade") ? scene::listFade(start.at("listFade")) : scene::ListFade{};
    for (const json& frame : scene.at("frames")) {
        const std::string at = path + " frame " + std::to_string(frame.at("index").get<int>());
        scene::MenuExternals ext = scene::menuExternals(frame.at("input"));
        const json& s = frame.at("expect").at("stages");
        std::vector<std::string> notes;
        if (!frame.at("between").is_null()) {
            StagePieces p = stagePieces(frame.at("between").at("before"));
            auto world = p.world();
            scene::Menus::between(world, ext, notes);
            if (report(at + " between", stageDifferences(p, frame.at("between").at("after")))) return 1;
        }
        if (!s.at("menuStep").is_null()) {
            StagePieces p = stagePieces(s.at("menuStep").at("before"));
            auto world = p.world();
            scene::Menus::menuStep(world, ext);
            if (report(at + " menuStep", stageDifferences(p, s.at("menuStep").at("after")))) return 1;
        }
        {
            StagePieces p = stagePieces(s.at("menus").at("before"));
            p.menus.listFade = fade;
            if (frame.at("expect").contains("listFade")) {
                StagePieces probe = p;
                scene::MenuExternals masked = ext;
                masked.pad.pressed &= ~(scene::pad::Up | scene::pad::Down);
                auto probeWorld = probe.world();
                std::vector<std::string> probeNotes;
                menus.step(probeWorld, masked, probeNotes);
                if (!(probe.menus.listFade == scene::listFade(frame.at("expect").at("listFade")))) {
                    std::fprintf(stderr, "%s: list fade %d %d %d, the console %s\n", at.c_str(), probe.menus.listFade.first, probe.menus.listFade.second,
                                 probe.menus.listFade.secondIndex, frame.at("expect").at("listFade").dump().c_str());
                    return 1;
                }
            }
            auto world = p.world();
            notes.clear();
            menus.step(world, p.externals, notes);
            if (report(at + " menus", stageDifferences(p, s.at("menus").at("after")))) return 1;
            if (notes.size() != s.at("menus").at("notes").size()) { std::fprintf(stderr, "%s: %zu notes, the model %zu\n", at.c_str(), notes.size(), s.at("menus").at("notes").size()); return 1; }
            fade = p.menus.listFade;
        }
        {
            StagePieces p = stagePieces(s.at("endOfFrame").at("before"));
            auto world = p.world();
            scene::Menus::endOfFrame(world, ext);
            if (report(at + " endOfFrame", stageDifferences(p, s.at("endOfFrame").at("after")))) return 1;
        }
        ++frames;
    }
    std::printf("%s: %zu frames, every stage equal\n", path.c_str(), frames);
    return 0;
}

int browserSuppressed(const std::string& path) {
    const json scene = scenetest::loadScene(path);
    const scene::Menus app({false});
    const json& first = scene.at("frames").at(0);
    StagePieces p = stagePieces(first.at("expect").at("stages").at("menus").at("before"));
    for (const json& frame : scene.at("frames")) {
        auto world = p.world();
        std::vector<std::string> notes;
        scene::MenuExternals ext = scene::menuExternals(frame.at("input"));
        if (frame.at("index").get<int>() > 0) scene::Menus::between(world, ext, notes);
        app.step(world, ext, notes);
        if (p.clock.mode == 3 || p.clock.scene.leaving != 0 || p.menus.screenCode == 9999 || p.menus.mainMenu.ramp.state == 3) {
            std::fprintf(stderr, "%s frame %d: Browser entered (mode %d, leaving %d, screen code %d, menu ramp %d)\n", path.c_str(), frame.at("index").get<int>(),
                         p.clock.mode, p.clock.scene.leaving, p.menus.screenCode, p.menus.mainMenu.ramp.state);
            return 1;
        }
    }
    std::printf("%s: Browser not entered with the option off\n", path.c_str());
    return 0;
}

int keptCode() {
    for (int32_t code : {0x74, 100}) {
        StagePieces p;
        p.menus.screenCode = code;
        p.menus.mainMenu.ramp = {50, 1, 1, 3};
        scene::MenuExternals ext;
        ext.disc = code;
        auto world = p.world();
        std::vector<std::string> notes;
        scene::Menus::between(world, ext, notes);
        const int32_t expected = code == 0x74 ? 0x74 : 9999;
        if (p.menus.screenCode != expected || p.clock.scene.leaving != 1) {
            std::fprintf(stderr, "between with disc %d: screen code %d, leaving %d\n", code, p.menus.screenCode, p.clock.scene.leaving);
            return 1;
        }
    }
    return 0;
}

int aspectConfirm() {
    StagePieces p;
    p.menus.page.entries = 0x002b2bf0;
    p.menus.page.level = 1;
    p.menus.page.ramp = {90, 90, 0, 2};
    p.menus.entries[0].confirm = 0x00227d30;
    p.clock.tail = 20;
    p.items[0] = 1;
    p.menus.configGate = 0;
    scene::MenuExternals ext;
    ext.pad.pressed = scene::pad::Cross;
    ext.configDirty = std::array<int32_t, 3>{0, 0, 0};
    ext.mechaconParam = std::array<uint32_t, 2>{0, 0};
    auto world = p.world();
    std::vector<std::string> notes;
    scene::Menus().step(world, ext, notes);
    if ((*ext.configDirty)[0] != 1 || p.menus.page.level != 2 || p.menus.configGate != 1) {
        std::fprintf(stderr, "aspect confirm: dirty %d, level %d\n", (*ext.configDirty)[0], p.menus.page.level);
        return 1;
    }
    scene::Menus::endOfFrame(world, ext);
    if (p.items[0] != 1) { std::fprintf(stderr, "aspect confirm: item 0 reloaded to %d\n", p.items[0]); return 1; }
    return 0;
}

int dates() {
    const int64_t s = scene::secondsOf(2026, 10, 3, 23, 59, 59);
    const auto back = scene::dateOf(s + 1);
    if (back != std::array<int32_t, 6>{2026, 10, 4, 0, 0, 0}) { std::fprintf(stderr, "dateOf\n"); return 1; }
    const scene::DateCheck c = scene::dateCheck({2024, 2, 31, 0, 0, 0}, 0x07000010u);
    if (c.items[2] != 29 || c.ranges[2][1] != 29) { std::fprintf(stderr, "dateCheck: day %d, range %d\n", c.items[2], c.ranges[2][1]); return 1; }
    return 0;
}

}

int main(int argc, char** argv) {
    return scenetest::run(argc, argv, [](int count, char** arguments) {
        if (int failed = dates()) return failed;
        if (int failed = keptCode()) return failed;
        if (int failed = aspectConfirm()) return failed;
        const scene::Menus model;
        for (int i = 1; i < count; ++i) {
            const std::string path = arguments[i];
            if (int failed = stages(path, model)) return failed;
            if (path.find("synthetic-menus/browser") != std::string::npos || path.find("synthetic-menus\\browser") != std::string::npos)
                if (int failed = browserSuppressed(path)) return failed;
        }
        return 0;
    });
}
