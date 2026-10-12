#include <cstdio>

#include "../../Check.hpp"
#include "App/ClockScreen.hpp"
#include "Scene/SceneInputs.hpp"

int main(int argc, char** argv) {
    if (argc < 3) return 1;
    const nlohmann::json input = scene::firstInput(argv[1]);
    app::ClockScreen screen(scene::clockInputs(input, scene::loadRodMesh(argv[2])), scene::frameInputs(input));
    app::FrameSource& base = screen;
    CHECK(!base.done());
    base.step();
    CHECK(screen.state().scene.scale == 0.0f);
    base.step();
    CHECK(screen.state().scene.scale > 0.0f);
    for (int i = 2; i < 40; ++i) base.step();
    CHECK(screen.state().scene.scale > 0.0f);
    CHECK(!base.frame().passes.empty());
    CHECK(screen.state().counter == 40 && screen.state().mode == 2 && screen.state().overlayLevel == 40);
    std::printf("ClockScreenTest passed\n");
    return 0;
}
