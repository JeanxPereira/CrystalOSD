#include <cstdio>
#include <string>
#include <vector>

#include "SceneFixture.hpp"
#include "Scene/Menus.hpp"
#include "Scene/SceneInputs.hpp"

namespace {

using nlohmann::json;

int scenario(const std::string& path, const std::string& name, const json& s) {
    scene::MenusState m;
    m.versionRamp = {10, 0, 0, 0};
    m.version.count = 3;
    m.version.shown = s.at("shown");
    m.videoMode = 1;
    for (const json& row : s.at("list")) m.versionList.push_back(scene::versionRow(row));
    size_t k = 0;
    for (const json& frame : s.at("frames")) {
        const std::string at = path + " " + name + " frame " + std::to_string(k++);
        const uint32_t pressed = frame.at("pressed");
        std::vector<std::string> notes;
        scene::Menus::versionStep(m, pressed, notes);
        if ((pressed & scene::pad::Triangle) && !(pressed & (scene::pad::Up | scene::pad::Down | scene::pad::Cross))) scene::Menus::versionOpen(m);
        const scene::VersionPage& v = m.version;
        const json& r = frame.at("ramp");
        const bool same = v.count == frame.at("count") && v.selected == frame.at("selected") && v.first == frame.at("first") &&
                          m.versionRamp == scene::Ramp{r.at("length"), r.at("counter"), r.at("changed"), r.at("state")} && v.job == frame.at("job") &&
                          v.panelOn == frame.at("panelOn") && v.panelAlpha == frame.at("panelAlpha") && v.arrows == frame.at("arrows") &&
                          v.hints == std::array<int32_t, 4>{frame.at("hints").at(0), frame.at("hints").at(1), frame.at("hints").at(2), frame.at("hints").at(3)};
        if (!same) {
            std::fprintf(stderr, "%s: count %d selected %d first %d ramp %d/%d/%d/%d job %d panel %d/%d arrows %d, the model %s\n", at.c_str(), v.count, v.selected, v.first,
                         m.versionRamp.length, m.versionRamp.counter, m.versionRamp.changed, m.versionRamp.state, v.job, v.panelOn, v.panelAlpha, v.arrows,
                         frame.dump().substr(0, 400).c_str());
            return 1;
        }
        for (size_t i = 0; i < scene::kVersionRows; ++i) {
            const json& row = frame.at("rows").at(i);
            const scene::VersionRow& ours = v.rows[i];
            const bool filled = row.at("value").get<std::string>() == "" ? ours.value.empty() : true;
            if (ours.label != row.at("label").get<int32_t>() || ours.subRows != row.at("subRows").get<int32_t>() || ours.id != row.at("id").get<int32_t>() || !filled ||
                (!ours.value.empty() && ours.value != s.at("list").at(i).at("value").get<std::string>())) {
                std::fprintf(stderr, "%s: row %zu is %d/%s/%d/%d, the model %s\n", at.c_str(), i, ours.label, ours.value.c_str(), ours.subRows, ours.id, row.dump().c_str());
                return 1;
            }
        }
        if (!notes.empty()) {
            std::fprintf(stderr, "%s: a note: %s\n", at.c_str(), notes.front().c_str());
            return 1;
        }
    }
    return 0;
}

}

int main(int argc, char** argv) {
    return scenetest::run(argc, argv, [](int count, char** arguments) {
        if (count < 2) {
            std::fprintf(stderr, "usage: MenuVersionTest <scenarios.json>\n");
            return 1;
        }
        const json all = scenetest::loadScene(arguments[1]);
        size_t frames = 0;
        for (const auto& [name, s] : all.items()) {
            if (int failed = scenario(arguments[1], name, s)) return failed;
            frames += s.at("frames").size();
        }
        std::printf("%s: %zu scenarios, %zu frames equal\n", arguments[1], all.size(), frames);
        return 0;
    });
}
