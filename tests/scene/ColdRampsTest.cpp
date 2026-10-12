#include <cstdio>
#include <fstream>

#include "../Check.hpp"
#include "ColdCompare.hpp"
#include "Scene/ColdRamps.hpp"
#include "Scene/SceneInputs.hpp"

namespace {

using nlohmann::json;
using scene::Ramp;

Ramp ramp(const json& j) {
    return {j.at("length").get<int32_t>(), j.at("counter").get<int32_t>(), j.at("changed").get<int32_t>(), j.at("state").get<int32_t>()};
}

Ramp ramp(const json& array, int) {
    return {array.at(0).get<int32_t>(), array.at(1).get<int32_t>(), array.at(2).get<int32_t>(), array.at(3).get<int32_t>()};
}

int exported(const char* path, bool pal) {
    std::ifstream in(path);
    CHECK(in.good());
    const json j = json::parse(in);
    CHECK(j.at("pal").get<bool>() == pal);
    const scene::ColdLengths got = scene::coldLengths(pal);
    CHECK(got.menuShort == j.at("menuShort").get<int32_t>());
    CHECK(got.menuLong == j.at("menuLong").get<int32_t>());
    CHECK(got.one == j.at("one").get<int32_t>());
    CHECK(got.body == j.at("body").get<int32_t>());
    CHECK(got.tail == j.at("tail").get<int32_t>());
    CHECK(got.vignetteLength == j.at("vignetteLength").get<int32_t>());
    CHECK(got.vignette == ramp(j.at("vignette"), 0));
    CHECK(got.spriteFade == ramp(j.at("spriteFade"), 0));
    CHECK(got.mainMenu == ramp(j.at("mainMenu"), 0));
    CHECK(got.cube.length == j.at("cube").get<int32_t>());
    CHECK(got.menu.length == j.at("menu").get<int32_t>());
    CHECK(got.config.length == j.at("config").get<int32_t>());
    CHECK(got.version.length == j.at("version").get<int32_t>());
    CHECK(got.grey.length == j.at("grey").get<int32_t>());
    CHECK(got.cube.state == 0 && got.menu.counter == 0 && got.config.changed == 0 && got.version.counter == 0 && got.grey.state == 0);

    size_t helpers = 0;
    for (const json& h : j.at("helpers")) {
        const std::string fn = h.at("fn");
        const Ramp in = ramp(h.at("in"));
        if (fn == "reset") CHECK(scene::rampReset(in) == ramp(h.at("out")));
        else if (fn == "start") CHECK(scene::rampStart(in) == ramp(h.at("out")));
        else if (fn == "reverse") CHECK(scene::rampReverse(in) == ramp(h.at("out")));
        else if (fn == "tick") {
            Ramp t = in;
            scene::tickRamp(t);
            CHECK(t == ramp(h.at("out")));
        } else if (fn == "isState") CHECK(scene::rampIs(in, h.at("arg").get<int32_t>()) == (h.at("ret").get<int32_t>() != 0));
        else if (fn == "scaled") CHECK(scene::rampScaled(in, h.at("arg").get<int32_t>()) == h.at("ret").get<int32_t>());
        else CHECK(false);
        ++helpers;
    }
    CHECK(helpers > 400);
    std::printf("ColdRampsTest %s: %zu helper cases\n", pal ? "PAL" : "NTSC", helpers);
    return 0;
}

int bootOracle(const char* path) {
    const json input = scene::firstInput(path);
    const scene::ClockInputs boot = scene::clockInputs(input, scene::RodMesh{});
    const scene::ColdLengths got = scene::coldLengths(false);
    CHECK(boot.state.vignetteRamp == got.vignette);
    CHECK(boot.state.vignetteLength == got.vignetteLength);
    CHECK(boot.state.menuRamp == got.menu);
    CHECK(boot.state.tail == got.tail);
    CHECK(boot.head.greyRamp == got.grey);
    CHECK(boot.orbs.spriteFade == got.spriteFade);
    return 0;
}

}

int main(int argc, char** argv) {
    CHECK(argc == 4);
    if (exported(argv[1], false)) return 1;
    if (exported(argv[2], true)) return 1;
    if (bootOracle(argv[3])) return 1;
    std::printf("ColdRampsTest start-boot.json: the lengths and ramps equal the oracle\n");
    return 0;
}
