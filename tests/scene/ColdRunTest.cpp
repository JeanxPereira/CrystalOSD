#include <bit>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <map>
#include <memory>
#include <stdexcept>
#include <typeinfo>
#include <string>

#include "../Check.hpp"
#include "ColdCompare.hpp"
#include "Scene/Arithmetic.hpp"
#include "Scene/ClockDate.hpp"
#include "Scene/ColdStart.hpp"
#include "Scene/ColdTime.hpp"
#include "Scene/SceneInputs.hpp"

namespace {

using nlohmann::json;
using Clock = scene::Clock<scene::EeArithmetic>;

constexpr uint32_t kClockTexturesEnd = (0x2EC0 + 0x40) << 6;

json readJson(const char* path) {
    std::ifstream in(path);
    if (!in.good()) throw std::runtime_error(std::string("cannot open ") + path);
    return json::parse(in);
}

scene::ColdInputs inputsOf(const json& first, const json& frame0) {
    const json& words = first.at("mechaconParam");
    const uint32_t param = words.at(0), date = words.at(1);
    scene::ColdInputs in;
    in.pal = first.at("videoMode").get<int>() == 2;
    in.aspect = static_cast<int>((param >> 1) & 3);
    in.language = static_cast<int>((param >> 4) & 0x1F);
    in.timeZone = static_cast<int32_t>(param << 12) >> 21;
    in.city = static_cast<int>((param >> 20) & 0x1FF);
    in.summerTime = ((param >> 29) & 1) != 0;
    in.timeFormat = static_cast<int>((param >> 30) & 1);
    in.dateFormat = static_cast<int>(date & 3);
    const json& rtc = first.at("rtcMirror");
    in.rtc = {rtc.at(0), rtc.at(1), rtc.at(2), rtc.at(3), rtc.at(4), rtc.at(5)};
    in.randState = first.at("randState");
    in.screenWidth = 640;
    in.screenHeight = in.pal ? 256 : 224;
    in.wide = false;
    in.screenCode = frame0.at("screenCode");
    in.field = frame0.at("field");
    in.gsAllocator = kClockTexturesEnd;
    return in;
}

scene::ClockTime timeOf(const json& t) { return {scene::asFloat(scene::hexBits(t.at("ms"))), t.at("seconds"), t.at("minutes"), t.at("hours")}; }

scene::ClockInputs snapshot(const scene::ClockInputs& start, const Clock& clock) {
    scene::ClockInputs now = start;
    now.state = clock.state();
    now.head = clock.head();
    now.orbs = clock.orbs();
    now.rodTemplate = clock.rodTemplate();
    if (now.menus) {
        now.menus->menus = *clock.menus();
        now.menus->cubes = *clock.cubes();
        now.menus->items = clock.items();
    }
    return now;
}

}

int run(int argc, char** argv) {
    CHECK(argc == 9);
    const auto program = std::make_shared<const scene::ProgramImage>(scene::ProgramImage::load(argv[1]));
    const auto font = std::make_shared<const scene::Font>(scene::Font::load(argv[2]));
    const json log = readJson(argv[3]);
    const json fresh = scene::firstInput(argv[4]);
    const std::string oldPath = argv[5];
    const size_t frames = std::strtoull(argv[6], nullptr, 10);
    const json& first = log.at("first");
    const json& entries = log.at("log");
    CHECK(entries.size() > frames);
    CHECK(fresh.at("counter").get<size_t>() == frames);

    scene::ColdAssets assets;
    assets.program = program;
    assets.font = font;
    assets.mesh = scene::loadRodMesh(argv[7]);
    assets.cubeMesh = scene::loadRodMesh(argv[8]);
    const scene::ColdInputs in = inputsOf(first, entries.at(0));
    const scene::ColdStartOut start = scene::coldStart<scene::EeArithmetic>(assets, in);
    Clock clock(start.clock);
    scene::FrameInputs frame = start.frame;
    scene::ColdTimeOut zone;

    size_t firstDivergence = frames + 1;
    for (size_t k = 0; k < frames; ++k) {
        const json& e = entries.at(k);
        if (clock.state().mode != e.at("mode").get<int32_t>() && firstDivergence > frames) firstDivergence = k;
        frame.time = timeOf(e.at("time"));
        frame.field = e.at("field");
        frame.menu.pad = scene::padWords(e.at("pad"));
        frame.menu.disc = e.at("screenCode");
        const json& rtc = e.at("rtcMirror");
        frame.menu.rtcMirror = std::array<int32_t, 6>{rtc.at(0), rtc.at(1), rtc.at(2), rtc.at(3), rtc.at(4), rtc.at(5)};
        zone = scene::coldTime<scene::EeArithmetic>(*program, {rtc.at(0), rtc.at(1), rtc.at(2), rtc.at(3), rtc.at(4), rtc.at(5)}, in.timeZone, in.summerTime, in.pal);
        scene::ConfigItems items = clock.items();
        items[6] = zone.year;
        items[7] = zone.month;
        items[8] = zone.day;
        items[9] = zone.time.hours;
        items[10] = zone.time.minutes;
        items[11] = zone.time.seconds;
        frame.configItems = items;
        frame.items = {items[6], items[7], items[8], items[9], items[10], items[11]};
        frame.threadStep = k != 0;
        if (k != 0) scene::fillTime(frame);
        try {
            clock.frame(frame);
        } catch (const std::exception& error) {
            std::fprintf(stderr, "ColdRunTest: frame %zu: %s (%s)\n", k, error.what(), typeid(error).name());
            throw;
        }
        frame.displayIndex ^= 1;
    }
    if (firstDivergence <= frames) std::fprintf(stderr, "ColdRunTest: the mode first differs from the capture's at frame %zu\n", firstDivergence);

    scene::ClockInputs now = snapshot(start.clock, clock);
    now.state.time = timeOf(entries.at(frames).at("time"));
    now.state.scene.field = entries.at(frames).at("field");
    const std::vector<FieldDiff> diffs = compareStart(now, fresh, {});
    std::map<std::string, size_t> perPiece;
    for (const FieldDiff& d : diffs) ++perPiece[d.piece];
    for (const auto& [piece, count] : perPiece) std::fprintf(stderr, "ColdRunTest: %s differs in %zu leaves\n", piece.c_str(), count);
    for (size_t i = 0; i < diffs.size() && i < 12; ++i) std::fprintf(stderr, "  %s%s got 0x%08x want 0x%08x\n", diffs[i].piece.c_str(), diffs[i].leaf.c_str(), diffs[i].got, diffs[i].want);
    size_t leaves = 0;
    {
        const scene::RodMesh cubeMesh;
        leaves = startLeaves(scene::clockInputs(fresh, scene::RodMesh{}, &cubeMesh)).size();
    }
    if (oldPath != "-") {
        const json old = scene::firstInput(oldPath);
        const std::vector<FieldDiff> against = compareStart(now, old, {});
        std::map<std::string, size_t> pieces;
        for (const FieldDiff& d : against) ++pieces[d.piece];
        std::string list;
        for (const auto& [piece, count] : pieces) list += " " + piece + " " + std::to_string(count) + ";";
        std::printf("ColdRunTest: against the old JSON %s: %zu leaves differ:%s\n", oldPath.c_str(), against.size(), list.c_str());
    }
    CHECK(diffs.empty());
    std::printf("ColdRunTest: %zu frames, %zu leaves equal the new JSON, 0 exempt\n", frames, leaves);
    return 0;
}

int main(int argc, char** argv) {
    try {
        return run(argc, argv);
    } catch (const std::exception& error) {
        std::fprintf(stderr, "ColdRunTest: %s\n", error.what());
        return 2;
    }
}
