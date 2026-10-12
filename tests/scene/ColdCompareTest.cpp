#include <cstdio>

#include "../Check.hpp"
#include "ColdCompare.hpp"
#include "Scene/SceneInputs.hpp"

int main(int argc, char** argv) {
    CHECK(argc >= 2);
    for (int i = 1; i < argc; ++i) {
        nlohmann::json input = scene::firstInput(argv[i]);
        const scene::RodMesh cubeMesh;
        const scene::ClockInputs same = scene::clockInputs(input, scene::RodMesh{}, &cubeMesh);
        CHECK(startLeaves(same).size() > 1000);
        CHECK(compareStart(same, input, {}).empty());

        nlohmann::json changed = input;
        changed["counter"] = changed.at("counter").get<int>() + 1;
        const std::vector<FieldDiff> diffs = compareStart(same, changed, {});
        CHECK(diffs.size() == 1);
        CHECK(diffs[0].piece == "counter");

        std::vector<Exempt> stale;
        CHECK(compareStart(same, changed, {{"counter", "", "test"}}, &stale).empty());
        CHECK(stale.empty());
        compareStart(same, input, {{"counter", "", "test"}}, &stale);
        CHECK(stale.size() == 1);
        std::printf("ColdCompareTest %s: %zu leaves\n", argv[i], startLeaves(same).size());
    }
    return 0;
}
