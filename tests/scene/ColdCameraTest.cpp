#include <cstdio>
#include <fstream>

#include "../Check.hpp"
#include "ColdCompare.hpp"
#include "Scene/Arithmetic.hpp"
#include "Scene/ColdCamera.hpp"
#include "Scene/ProgramImage.hpp"
#include "Scene/SceneInputs.hpp"

namespace {

using nlohmann::json;

int exported(const scene::ProgramImage& program, const char* path, bool pal) {
    std::ifstream in(path);
    CHECK(in.good());
    const json j = json::parse(in);
    CHECK(j.at("pal").get<bool>() == pal);
    size_t checked = 0;
    for (const json& f : j.at("fade")) {
        const uint32_t w = f.at("width"), h = f.at("height");
        const scene::ColdCameraOut out = scene::coldCamera(program, pal, w, h, 0);
        CHECK(scene::floatBits(out.scale) == j.at("scale").get<uint32_t>());
        CHECK(scene::floatBits(out.proportions.ax) == j.at("ax").get<uint32_t>());
        CHECK(scene::floatBits(out.proportions.ay) == j.at("ay").get<uint32_t>());
        CHECK(scene::floatBits(out.cameraOffset) == j.at("cameraOffset").get<uint32_t>());
        CHECK(out.mode == j.at("mode").get<int32_t>());
        CHECK(out.overlayLevel == j.at("overlayLevel").get<int32_t>());
        CHECK(static_cast<uint32_t>(out.fade.colour[0]) == f.at("colour").at(0).get<uint32_t>());
        CHECK(static_cast<uint32_t>(out.fade.colour[1]) == f.at("colour").at(1).get<uint32_t>());
        CHECK(static_cast<uint32_t>(out.fade.colour[2]) == f.at("colour").at(2).get<uint32_t>());
        CHECK(static_cast<uint32_t>(out.fade.x1) == f.at("x1").get<uint32_t>());
        CHECK(static_cast<uint32_t>(out.fade.y1) == f.at("y1").get<uint32_t>());
        ++checked;
    }
    for (const json& c : j.at("handler")) {
        const scene::ColdCameraOut out = scene::coldCamera(program, pal, 640, 224, c.at("field"));
        CHECK(out.leaving == (c.at("leaving").get<int32_t>() != 0));
        CHECK(out.field == c.at("field").get<int32_t>());
        ++checked;
    }
    std::printf("ColdCameraTest %s: %zu cases\n", pal ? "PAL" : "NTSC", checked);
    return 0;
}

int bootOracle(const scene::ProgramImage& program, const char* path) {
    const json input = scene::firstInput(path);
    const scene::ClockInputs boot = scene::clockInputs(input, scene::RodMesh{});
    const scene::ColdCameraOut out = scene::coldCamera(program, false, static_cast<uint32_t>(boot.width), static_cast<uint32_t>(boot.height), static_cast<uint32_t>(boot.state.scene.field));
    CHECK(scene::floatBits(out.scale) == scene::floatBits(boot.state.scene.scale));
    CHECK(out.leaving == (boot.state.scene.leaving != 0));
    CHECK(out.field == boot.state.scene.field);
    CHECK(scene::floatBits(out.proportions.ax) == scene::floatBits(boot.state.proportions.ax));
    CHECK(scene::floatBits(out.proportions.ay) == scene::floatBits(boot.state.proportions.ay));
    CHECK(scene::floatBits(out.cameraOffset) == scene::floatBits(boot.state.cameraOffset));
    CHECK(out.mode == boot.state.mode);
    CHECK(out.overlayLevel == boot.state.overlayLevel);
    const scene::Rect& w = boot.head.fade;
    CHECK(out.fade.colour[0] == w.colour[0] && out.fade.colour[1] == w.colour[1] && out.fade.colour[2] == w.colour[2]);
    CHECK(out.fade.x1 == w.x1 && out.fade.y1 == w.y1);
    CHECK(out.fade.x0 == w.x0 && out.fade.y0 == w.y0 && out.fade.u0 == w.u0 && out.fade.v0 == w.v0);
    CHECK(out.fade.u1 == w.u1 && out.fade.v1 == w.v1 && out.fade.z == w.z && out.fade.blend == w.blend && out.fade.textured == w.textured);
    std::printf("ColdCameraTest start-boot.json: the camera and mode init equal the oracle\n");
    return 0;
}

}

int main(int argc, char** argv) {
    CHECK(argc == 5);
    const scene::ProgramImage program = scene::ProgramImage::load(argv[1]);
    if (exported(program, argv[2], false)) return 1;
    if (exported(program, argv[3], true)) return 1;
    if (bootOracle(program, argv[4])) return 1;
    return 0;
}
