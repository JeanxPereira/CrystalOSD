#include <cstdio>
#include <memory>

#include "../Check.hpp"
#include "ColdCompare.hpp"
#include "Scene/Arithmetic.hpp"
#include "Scene/ClockDate.hpp"
#include "Scene/ColdStart.hpp"
#include "Scene/SceneInputs.hpp"

namespace {

using nlohmann::json;

constexpr uint32_t kRandAfterOpening = 0x60440537;
constexpr uint32_t kHandoffCode = 0x64;

scene::ColdInputs inputsOf(const json& boot) {
    const json& items = boot.at("configItems");
    scene::ColdInputs in;
    in.pal = false;
    in.aspect = items.at(0);
    in.language = items.at(3);
    in.timeFormat = items.at(13);
    in.dateFormat = items.at(14);
    in.city = items.at(15);
    in.summerTime = items.at(16).get<int>() != 0;
    in.timeZone = scene::kBaseZone;
    in.rtc = {items.at(6), items.at(7), items.at(8), items.at(9), items.at(10), items.at(11)};
    in.randState = kRandAfterOpening;
    in.screenWidth = boot.at("screen").at("width");
    in.screenHeight = boot.at("screen").at("height");
    in.wide = boot.at("wide").get<int>() != 0;
    in.screenCode = kHandoffCode;
    in.field = boot.at("scene").at("field");
    return in;
}

template <class A>
int run(const std::shared_ptr<const scene::ProgramImage>& program, const json& boot) {
    scene::ColdAssets assets;
    assets.program = program;
    const scene::ColdInputs in = inputsOf(boot);
    const scene::ColdStartOut out = scene::coldStart<A>(assets, in);

    std::vector<Exempt> stale;
    const std::vector<FieldDiff> diffs = compareStart(out.clock, boot, {}, &stale);
    for (const FieldDiff& d : diffs) std::fprintf(stderr, "ColdBootTest: %s%s got 0x%08x want 0x%08x\n", d.piece.c_str(), d.leaf.c_str(), d.got, d.want);
    CHECK(diffs.empty());
    CHECK(stale.empty());

    scene::ColdInputs direct = in;
    direct.randState = 1;
    CHECK(scene::coldStart<A>(assets, direct).clock.orbRandom != out.clock.orbRandom);

    const json& items = boot.at("configItems");
    CHECK(out.clock.menus.has_value());
    for (size_t i = 0; i < 20; ++i) CHECK(out.clock.menus->items[i] == items.at(i).get<int32_t>());
    CHECK(out.frame.item0 == boot.at("item0").get<int32_t>());
    CHECK(out.frame.displayIndex == boot.at("index").get<int32_t>());
    CHECK(out.frame.field == boot.at("scene").at("field").get<int32_t>());
    CHECK(out.clock.text.settings.timeFormat == items.at(13).get<int32_t>());
    CHECK(out.clock.text.settings.dateFormat == items.at(14).get<int32_t>());
    return 0;
}

}

int main(int argc, char** argv) {
    CHECK(argc == 3);
    const auto program = std::make_shared<const scene::ProgramImage>(scene::ProgramImage::load(argv[1]));
    const json boot = scene::firstInput(argv[2]);
    if (run<scene::EeArithmetic>(program, boot)) return 1;
    if (run<scene::NativeArithmetic>(program, boot)) return 1;
    const std::vector<StartLeaf> leaves = startLeaves(scene::clockInputs(boot, scene::RodMesh{}));
    std::printf("ColdBootTest: %zu leaves of the boot frame equal, 0 exempt, plus the 20 configuration items\n", leaves.size());
    return 0;
}
