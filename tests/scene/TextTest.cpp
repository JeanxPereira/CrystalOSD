#include <cstdio>
#include <memory>
#include <stdexcept>
#include <string>

#include "../Check.hpp"
#include "SceneFixture.hpp"
#include "Scene/Text.hpp"

namespace {

using EeText = scene::Text<scene::EeArithmetic>;

// A cache laid out for block 0 (cells of 40 x 44 in 384 x 384, facts/text.md section 2), nothing loaded, and the
// program's font state at size 1 with the pen at (22, 14).
scene::TextInputs synthetic(const scene::Font& font) {
    scene::TextInputs t;
    for (int32_t i = 0; i < 99; ++i) t.cache.list.push_back({0, 0, i < 72 ? i : -1, 0});
    t.cache.format = 0x14;
    t.cache.cellW = 40;
    t.cache.cellH = 44;
    t.cache.cells = 72;
    t.cache.width = t.cache.height = 384;
    t.cache.logW = t.cache.logH = 9;
    t.cache.setUp = 1;
    t.cache.block = font.blocks().at(0).at;
    t.cache.memory = 0x4800;
    t.cache.texture = 0xbc100;
    t.cache.table = 0xbc000;
    t.font.tv = 0.5f;
    t.font.ratio = 1.0f;
    t.font.locate = {22, 14};
    t.font.colour = {0.75f, 0.75f, 0.75f, 1.0f};
    t.font.blank = 56;
    t.font.ascent = 33;
    t.font.dirty = 1;
    t.settings.settingsWord = 0x07000010;
    t.settings.videoMode = 1;
    return t;
}

// _scePFontSetupTexCache: a glyph of a block of another cell size lays the cache out again and deals the cells out in
// list order; the entry just moved to the head takes cell 0. References/model/clock_text.mjs putString on the same
// state (the cache of 'A', then U+FF61 of block 1, 26 x 26) uploads it to cell 0 and draws it with the region clamp
// 0..27 x 0..27, cells now 32 x 28, the list's head ff61/0/1 then 41/1/0.
int relayout(const std::shared_ptr<const scene::Font>& font, const std::shared_ptr<const scene::ProgramImage>& program) {
    EeText text(font, program, synthetic(*font));
    const scene::TextFrame first = text.drawString("A");
    CHECK(first.draws.size() == 1 && first.glyphs.cells.at(0) == 'A');
    const scene::TextFrame second = text.drawString("\xef\xbd\xa1");
    CHECK(second.draws.size() == 1);
    const std::array<int32_t, 4> region = second.draws[0].glyph.region;
    std::printf("relayout: region %d %d %d %d, cells %d x %d, head %x/%d/%d, then %x/%d/%d\n", region[0], region[1], region[2], region[3], second.glyphs.cellWidth,
                second.glyphs.cellHeight, text.cache().list[0].code, text.cache().list[0].cell, text.cache().list[0].loaded, text.cache().list[1].code, text.cache().list[1].cell,
                text.cache().list[1].loaded);
    CHECK((region == std::array<int32_t, 4>{0, 27, 0, 27}));
    CHECK(second.glyphs.cellWidth == 32 && second.glyphs.cellHeight == 28);
    CHECK(second.glyphs.cells.at(0) == 0xff61 && second.glyphs.cells.at(1) == 0);
    CHECK(text.cache().list[0] == (scene::FontCacheEntry{0xff61, 1, 0, font->glyph(0xff61)->block->at}));
    CHECK(text.cache().list[1] == (scene::FontCacheEntry{'A', 0, 1, font->blocks().at(0).at}));
    return 0;
}

// A text without a cache list cannot draw: the constructor says so instead of reading an empty list; a list not laid out yet (the cold start) is laid out at its first draw.
int emptyCache(const std::shared_ptr<const scene::Font>& font, const std::shared_ptr<const scene::ProgramImage>& program) {
    const auto refuses = [&](const scene::TextInputs& inputs) {
        try {
            EeText text(font, program, inputs);
        } catch (const std::runtime_error& e) {
            std::printf("refused: %s\n", e.what());
            return true;
        }
        return false;
    };
    CHECK(refuses(scene::TextInputs{}));
    scene::TextInputs noCells = synthetic(*font);
    noCells.cache.cells = 0;
    CHECK(!refuses(noCells));
    return 0;
}

// _scePFont_Putc (0x00291894..0x00291978): a code without a glyph still takes the entry it walked to (moved to the head,
// the code written, not loaded, no block), then the character is given up (-2): nothing is drawn, the frame goes on.
int missingGlyph(const std::shared_ptr<const scene::Font>& font, const std::shared_ptr<const scene::ProgramImage>& program) {
    CHECK(!font->glyph(0x500));
    EeText with(font, program, synthetic(*font)), plain(font, program, synthetic(*font));
    const scene::TextFrame given = with.drawString("A\xd4\x80" "B");
    const scene::TextFrame reference = plain.drawString("AB");
    CHECK(given.draws.size() == 2);
    for (size_t k = 0; k < 12; ++k) CHECK(given.draws[1].glyph.fan[k].x == reference.draws[1].glyph.fan[k].x);
    const std::vector<scene::FontCacheEntry>& list = with.cache().list;
    std::printf("missing glyph: head %x/%d/%d, %x/%d/%d block %u, %x/%d/%d\n", list[0].code, list[0].cell, list[0].loaded, list[1].code, list[1].cell, list[1].loaded,
                list[1].block, list[2].code, list[2].cell, list[2].loaded);
    CHECK(list[0].code == 'B' && list[0].loaded == 1);
    CHECK((list[1] == scene::FontCacheEntry{0x500, 0, 1, 0}));
    CHECK(list[2].code == 'A' && list[2].loaded == 1);
    return 0;
}

}

int main(int argc, char** argv) {
    return scenetest::run(argc, argv, [](int argc, char** argv) {
        if (argc != 3) {
            std::fprintf(stderr, "usage: TextTest <FNTOSD> <hddosd.elf>\n");
            return 1;
        }
        const auto font = std::make_shared<const scene::Font>(scene::Font::load(argv[1]));
        const auto program = std::make_shared<const scene::ProgramImage>(scene::ProgramImage::load(argv[2]));
        CHECK(relayout(font, program) == 0);
        CHECK(emptyCache(font, program) == 0);
        CHECK(missingGlyph(font, program) == 0);
        return 0;
    });
}
