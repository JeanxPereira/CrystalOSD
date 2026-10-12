#include <cstdio>
#include <memory>

#include "../../Check.hpp"
#include "Scene/opening/Opening.hpp"

namespace {

constexpr uint32_t kCallsThroughTheOpening = 27314;
constexpr uint32_t kStateAfterTheOpening = 0x60440537;
constexpr int kDrawnFrames = 246;
constexpr int kFirstLogoFrame = 51;
constexpr int kFirstLogoAlpha = 4;

template <class A>
int run(const std::shared_ptr<const scene::ProgramImage>& program) {
    scene::opening::Opening<A> opening({}, program);
    int32_t display = 0;
    int frames = 0, firstLogo = 0, firstLogoAlpha = 0;
    while (!opening.ended()) {
        const scene::Frame frame = opening.frame(display, 0);
        if (!firstLogo)
            for (const scene::Pass& pass : frame.passes)
                if (pass.name == "logo") {
                    firstLogo = frames + 1;
                    firstLogoAlpha = pass.material.blendConstant;
                }
        display ^= 1;
        CHECK(++frames < 100000);
    }
    std::printf("OpeningRandTest: %d frames, %u rand calls, state 0x%08x\n", frames, opening.randCalls(), opening.randState());
    CHECK(frames == kDrawnFrames);
    CHECK(firstLogo == kFirstLogoFrame);
    CHECK(firstLogoAlpha == kFirstLogoAlpha);
    CHECK(opening.randCalls() == kCallsThroughTheOpening);
    CHECK(opening.randState() == kStateAfterTheOpening);
    return 0;
}

}

int main(int argc, char** argv) {
    CHECK(argc == 2);
    const auto program = std::make_shared<const scene::ProgramImage>(scene::ProgramImage::load(argv[1]));
    if (run<scene::EeArithmetic>(program)) return 1;
    return run<scene::NativeArithmetic>(program);
}
