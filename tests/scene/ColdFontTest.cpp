#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <memory>

#include "../Check.hpp"
#include "ColdCompare.hpp"
#include "Scene/Arithmetic.hpp"
#include "Scene/ColdFont.hpp"

namespace {

using nlohmann::json;

template <class A>
int run(const std::shared_ptr<const scene::ProgramImage>& program, const std::shared_ptr<const scene::Font>& font, const json& j, bool pal) {
    for (const json& c : j.at("cases")) {
        const uint32_t allocator = c.at("allocator");
        const scene::ColdFontOut out = scene::coldFont<A>(program, font, pal, allocator);
        CHECK(out.cache.memory == c.at("memory").get<uint32_t>());
        CHECK(out.cache.texture == c.at("texture").get<uint32_t>());
        CHECK(out.cache.table == c.at("table").get<uint32_t>());
        CHECK(out.cache.list.size() == c.at("entries").get<size_t>());
        CHECK(out.cache.format == 0 && out.cache.cells == 0 && out.cache.cellW == 0 && out.cache.cellH == 0 && out.cache.setUp == 0 && out.cache.block == 0);
        CHECK(scene::floatBits(out.state.tv) == c.at("tv").get<uint32_t>());
        CHECK(scene::floatBits(out.state.ratio) == c.at("ratio").get<uint32_t>());
        CHECK(out.state.blank == c.at("blank").get<int32_t>());
        CHECK(out.state.ascent == c.at("ascent").get<int32_t>());
        CHECK(out.state.lineHeight == 0 && out.state.fixed == 0 && out.state.percent == 0 && out.state.pitch == 0 && out.state.decoration == 0 && out.state.clip == 0);
        CHECK(out.state.locate[0] == 0.0f && out.state.locate[1] == 0.0f);
        for (const float v : out.state.colour) CHECK(v == 1.0f);
    }
    const scene::ColdFontOut out = scene::coldFont<A>(program, font, pal, j.at("cases").at(0).at("allocator"));
    const json& widths = j.at("widths");
    for (size_t i = 0; i < 8; ++i) {
        const int32_t want = widths.at(i).get<int32_t>();
        CHECK(out.widths[i] == want);
    }
    const json& after = j.at("after");
    CHECK(out.state.dirty == after.at("dirty").get<int32_t>());
    for (size_t r = 0; r < 4; ++r)
            for (size_t k = 0; k < 4; ++k) CHECK(scene::floatBits(out.state.matrix[r][k]) == after.at("matrix").at(r * 4 + k).get<uint32_t>());
    const json& list = j.at("list");
    CHECK(out.cache.list.size() == list.size());
    for (size_t i = 0; i < list.size(); ++i) {
        CHECK(out.cache.list[i].code == list[i].at("code").get<int32_t>());
        CHECK(out.cache.list[i].loaded == list[i].at("loaded").get<int32_t>());
        CHECK(out.cache.list[i].cell == list[i].at("cell").get<int32_t>());
        CHECK(out.cache.list[i].block == list[i].at("block").get<uint32_t>());
    }
    return 0;
}

int both(const std::shared_ptr<const scene::ProgramImage>& program, const std::shared_ptr<const scene::Font>& font, const char* path, bool pal) {
    std::ifstream in(path);
    CHECK(in.good());
    const json j = json::parse(in);
    CHECK(j.at("pal").get<bool>() == pal);
    if (run<scene::EeArithmetic>(program, font, j, pal)) return 1;
    if (run<scene::NativeArithmetic>(program, font, j, pal)) return 1;
    std::printf("ColdFontTest %s: %zu cases, widths %d %d, %zu cache entries\n", pal ? "PAL" : "NTSC", j.at("cases").size(), j.at("widths").at(0).get<int>(), j.at("widths").at(7).get<int>(), j.at("list").size());
    return 0;
}

}

int main(int argc, char** argv) {
    CHECK(argc == 5);
    const auto program = std::make_shared<const scene::ProgramImage>(scene::ProgramImage::load(argv[1]));
    const auto font = std::make_shared<const scene::Font>(scene::Font::load(argv[2]));
    if (both(program, font, argv[3], false)) return 1;
    if (both(program, font, argv[4], true)) return 1;
    return 0;
}
