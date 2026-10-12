#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <map>

#include "../../Check.hpp"
#include "../SceneFixture.hpp"
#include "OpeningFixture.hpp"
#include "Scene/Arithmetic.hpp"
#include "Parity/FromScene.hpp"
#include "Scene/opening/Flat.hpp"

namespace {

using scene::EeArithmetic;
using scene::NativeArithmetic;
using scene::Pass;
using scene::PassTopology;
using scene::Vertex;
using Bytes = openingtest::Bytes;
using Ee = scene::opening::Flat<EeArithmetic>;
using Native = scene::opening::Flat<NativeArithmetic>;
using scene::opening::FlatInputs;

int32_t word(const Bytes& bytes, size_t at) {
    int32_t v;
    std::memcpy(&v, bytes.data() + at, 4);
    return v;
}

bool near(float a, float b) { return a == b; }

constexpr int32_t kBlocks = 640 * 224 / 64;

int run(const std::string& path, const std::string& fullPath) {
    const openingtest::OpeningFixture fixture = openingtest::OpeningFixture::load(path);
    std::map<int, int> calls;
    std::map<int, int> blurLevels;
    int64_t packets = 0;
    size_t logos = 0;
    int32_t lastCopyCounter = 0;
    std::vector<int32_t> blurSequence, fadeSequence;

    for (size_t k = 0; k < fixture.frameCount(); ++k) {
        for (const openingtest::Probe& record : fixture.records(k, "flat")) {
            const Bytes& screen = record.k == 2 ? record.mem[2] : record.mem[1];
            const int32_t width = word(screen, 0x14), height = word(screen, 0x18);
            CHECK(width == 640 && height == 224);
            std::vector<Pass> passes;
            ++calls[record.k];
            if (record.k == 0) {
                FlatInputs in;
                in.blurLevel = static_cast<int32_t>(record.a0);
                in.counter = lastCopyCounter;
                in.field = static_cast<int32_t>(record.a2);
                CHECK(in.blurLevel >= 1 && in.blurLevel <= 3);
                ++blurLevels[in.blurLevel];
                blurSequence.push_back(in.blurLevel);
                Ee::blur(in, passes);
                CHECK(passes.size() == static_cast<size_t>(in.blurLevel) * 2);
                CHECK(Ee::blurWhich(in) == static_cast<int32_t>(record.a1));
                CHECK(Ee::page(in) == (record.a1 ? 0 : kBlocks));
                for (int32_t i = 0; i < in.blurLevel; ++i) {
                    const Pass& into = passes[static_cast<size_t>(i) * 2];
                    const Pass& back = passes[static_cast<size_t>(i) * 2 + 1];
                    CHECK(into.target == scene::TargetName::Extra && into.material.sourceTarget == scene::TargetName::Display);
                    CHECK(back.target == scene::TargetName::Display && back.material.sourceTarget == scene::TargetName::Extra);
                    CHECK(into.topology == PassTopology::Sprites && into.vertices.size() == 2 && back.vertices.size() == 2);
                    const int32_t shrink = i * (in.blurLevel - 1);
                    const float w = static_cast<float>(((width * 7) >> 3) - 1 - shrink), h = static_cast<float>(((height * 7) >> 3) - 1 - shrink);
                    CHECK(near(into.vertices[1].x, w - 0.5f) && near(into.vertices[1].y, h - 0.5f));
                    CHECK(near(into.vertices[1].u, 640.0f) && near(into.vertices[1].v, 224.0f));
                    CHECK(near(back.vertices[1].x, 639.5f) && near(back.vertices[1].y, 223.5f));
                    CHECK(near(back.vertices[1].u, w) && near(back.vertices[1].v, h));
                    CHECK(!into.halfLine && !back.halfLine);
                }
                packets += 9 + 3 * static_cast<int64_t>(passes.size());
            } else if (record.k == 1) {
                const int32_t counter = word(record.mem[3], 0);
                FlatInputs in;
                in.counter = counter;
                lastCopyCounter = counter;
                Ee::copyToStore(in, passes);
                CHECK(passes.size() == 1);
                const Pass& p = passes[0];
                CHECK(p.target == scene::TargetName::Store && p.material.sourceTarget == scene::TargetName::Display && !p.material.colourOnly);
                CHECK(p.vertices.size() == 2 && near(p.vertices[1].x, 319.5f) && near(p.vertices[1].y, 223.5f) && near(p.vertices[1].u, 640.0f));
                CHECK(p.vertices[0].r == word(record.mem[0], 0));
                packets += 10 * static_cast<int64_t>(passes.size());
            } else if (record.k == 2) {
                CHECK(record.mem[0].at(0) == 0x42);
                CHECK(word(record.mem[1], 0) == 0 && word(record.mem[1], 4) == 0);
                FlatInputs in;
                in.fadeAlpha = static_cast<int32_t>(record.a1);
                fadeSequence.push_back(in.fadeAlpha);
                Ee::fade(in, passes);
                CHECK(passes.size() == 1 && passes[0].vertices.size() == 2);
                const uint32_t capped = record.a1 < 0x81u ? record.a1 : 0x80u;
                CHECK(passes[0].vertices[0].a == capped && passes[0].vertices[1].a == capped);
                CHECK(passes[0].material.blend == scene::BlendOp::AlphaOver);
                CHECK(near(passes[0].vertices[1].x, 639.9375f) && near(passes[0].vertices[1].y, 223.9375f));
                packets += 6 * static_cast<int64_t>(passes.size());
            } else {
                CHECK(record.k == 3);
                const float ax = scene::asFloat(static_cast<uint32_t>(word(record.mem[2], 0))), ay = scene::asFloat(static_cast<uint32_t>(word(record.mem[2], 4)));
                const int32_t open = EeArithmetic::toInt(EeArithmetic::div(EeArithmetic::mul(EeArithmetic::mul(static_cast<float>(width), 9.0f), ay), EeArithmetic::mul(ax, 16.0f)));
                const int32_t x = height - open + 1;
                const int32_t bar = (x + static_cast<int32_t>(static_cast<uint32_t>(x) >> 31)) >> 1;
                CHECK(open == 164 && bar == 30);
                CHECK(Ee::pictureHeight() == open && Ee::barRows() == bar);
                Ee::bars({}, passes);
                CHECK(passes.size() == 1 && passes[0].vertices.size() == 4);
                const std::vector<Vertex>& v = passes[0].vertices;
                CHECK(near(v[0].y, 0.0f) && near(v[1].y, static_cast<float>(bar) - 0.0625f));
                CHECK(near(v[2].y, static_cast<float>(bar + open)) && near(v[3].y, static_cast<float>(height) - 0.0625f));
                CHECK(near(v[1].x, 639.9375f) && near(v[3].x, 639.9375f));
                for (const Vertex& vertex : v)
                    CHECK(vertex.r == word(record.mem[0], 0) && vertex.g == word(record.mem[0], 4) && vertex.b == word(record.mem[0], 8) && vertex.a == word(record.mem[0], 12));
                CHECK(passes[0].material.blend == scene::BlendOp::SubtractFixed && passes[0].material.blendConstant == 0x80);
                packets += 8 * static_cast<int64_t>(passes.size());
            }
        }
    }

    const openingtest::OpeningFixture full = openingtest::OpeningFixture::load(fullPath);
    std::vector<int32_t> fullBlur, fullFade;
    for (size_t k = 0; k < full.frameCount(); ++k) {
        const auto timeline = full.timeline(k);
        if (!timeline) continue;
        if (timeline->blur) fullBlur.push_back(static_cast<int32_t>(*timeline->blur));
        if (timeline->fade) fullFade.push_back(static_cast<int32_t>(*timeline->fade));
        if (timeline->logo) {
            FlatInputs in;
            in.logoAlpha = static_cast<int32_t>(*timeline->logo);
            std::vector<Pass> passes;
            Ee::logo(in, passes);
            CHECK(passes.size() == 1 && passes[0].vertices.size() == 4);
            const std::vector<Vertex>& v = passes[0].vertices;
            for (const Vertex& vertex : v) CHECK(vertex.a == *timeline->logo && vertex.r == 0x80);
            CHECK(passes[0].material.source == scene::SourceKind::Texture && passes[0].material.texture == 0);
            CHECK(near(v[0].x, 120) && near(v[0].y, 105) && near(v[0].v, 1.5f) && near(v[1].u, 256) && near(v[1].v, 31) && near(v[1].x, 375.5f) && near(v[1].y, 120.5f));
            CHECK(near(v[2].x, 326) && near(v[2].v, 33.5f) && near(v[3].v, 63) && near(v[3].x, 581.5f));
            ++logos;
        }
    }
    CHECK(fullBlur == blurSequence && fullFade == fadeSequence);

    {
        const std::filesystem::path passesPath = std::filesystem::path(fullPath).parent_path() / "passes.json";
        std::ifstream in(passesPath, std::ios::binary);
        CHECK(static_cast<bool>(in));
        const nlohmann::json dump = nlohmann::json::parse(in);
        size_t copies = 0;
        for (size_t n = 0; n < dump.at("frames").size(); ++n) {
            const nlohmann::json& frame = dump.at("frames").at(n);
            if (frame.is_null() || n < 6) continue;
            for (const nlohmann::json& p : frame.at("passes")) {
                if (p.at("target") != "fb2300" || p.at("texture").is_null() || !p.at("texture").at("source").contains("target") || p.at("primitive") != "Sprites" || p.at("blend").is_object()) continue;
                const std::string source = p.at("texture").at("source").at("target");
                FlatInputs input;
                input.counter = static_cast<int32_t>(n) - 5;
                CHECK(Ee::page(input) == static_cast<int32_t>(std::stoul(source.substr(2), nullptr, 16)));
                ++copies;
                break;
            }
        }
        CHECK(copies >= 240);
        std::printf("flat: page checked against %zu dump copies\n", copies);
    }

    {
        scene::Frame frame;
        Ee::scissor(frame.passes);
        Ee::ghost({}, frame.passes);
        Ee::copyToStore({}, frame.passes);
        const parity::GsFrame gs = parity::fromScene(frame, parity::openingLayout(0));
        CHECK(gs.passes.size() == 3);
        CHECK(gs.passes[0].scissor.x0 == 0 && gs.passes[0].scissor.x1 == 639 && gs.passes[0].scissor.y1 == 223);
        CHECK(gs.passes[1].scissor.x0 == 1 && gs.passes[1].scissor.y0 == 1 && gs.passes[1].scissor.x1 == 638 && gs.passes[1].scissor.y1 == 222);
        CHECK(gs.passes[2].scissor.x0 == 0 && gs.passes[2].scissor.x1 == 639);
    }

    std::vector<Pass> passes;
    Ee::scissor(passes);
    Ee::ghost({}, passes);
    CHECK(passes.size() == 2 && passes[0].vertices.size() == 4 && passes[1].vertices.size() == 2);
    CHECK(passes[0].material.depthWrite && passes[0].material.blend == scene::BlendOp::Opaque);
    CHECK(passes[1].material.blend == scene::BlendOp::FixedOver && passes[1].material.blendConstant == 0x50 && passes[1].material.sourceTarget == scene::TargetName::Store);
    CHECK(passes[1].material.colourOnly && near(passes[1].vertices[1].x, 639.5f) && near(passes[1].vertices[1].u, 320.0f) && near(passes[1].vertices[1].v, 224.0f));

    std::vector<Pass> native;
    Native::scissor(native);
    Native::ghost({}, native);
    Native::bars({}, native);
    CHECK(Native::pictureHeight() == 164 && native.size() == 3);

    std::printf("flat: copy %d, bars %d, fade %d, blur %d (levels 1: %d, 2: %d, 3: %d), %lld packets, %zu logos\n", calls[1], calls[3], calls[2], calls[0], blurLevels[1],
                blurLevels[2], blurLevels[3], static_cast<long long>(packets), logos);
    CHECK(calls[1] == 247 && calls[3] == 247 && calls[2] == 30 && calls[0] == 33);
    CHECK(calls[0] + calls[1] + calls[2] + calls[3] == 557);
    CHECK(packets == 5313);
    CHECK(logos == 120);
    return 0;
}

}

int main(int argc, char** argv) {
    return scenetest::run(argc, argv, [](int count, char** arguments) {
        if (count < 2) {
            std::fprintf(stderr, "usage: FlatTest <opening2-flat opening.json> <opening-full opening.json>\n");
            return 2;
        }
        if (!std::filesystem::exists(arguments[1])) {
            std::fprintf(stderr, "no fixture at %s\n", arguments[1]);
            return 2;
        }
        if (count < 3 || !std::filesystem::exists(arguments[2])) {
            std::fprintf(stderr, "no opening-full fixture\n");
            return 2;
        }
        return run(arguments[1], arguments[2]);
    });
}
