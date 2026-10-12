// The commands the native scene queues, frame by frame, against the commands the console's EE queued in the Task 2-4 captures
// (enqueue probe 0x00200C00, exported by export_command_probes.mjs). Exact: a difference is printed and fails the run.
#include <algorithm>
#include <filesystem>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <map>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "Audio/EeSoundQueue.hpp"
#include "Audio/LiveAudio.hpp"
#include "Scene/Arithmetic.hpp"
#include "Scene/Clock.hpp"
#include "Scene/ColdStart.hpp"
#include "Scene/SceneInputs.hpp"
#include "Scene/Sound.hpp"
#include "Scene/opening/Opening.hpp"

namespace {

using nlohmann::json;
using Clock = scene::Clock<scene::EeArithmetic>;
using Opening = scene::opening::Opening<scene::EeArithmetic>;

constexpr int kRampFrames = 40;
constexpr uint32_t kClockTexturesEnd = (0x2EC0 + 0x40) << 6;

struct Command {
    uint16_t id = 0, a1 = 0, a2 = 0, a3 = 0;
    bool carriedA2 = false, carriedA3 = false;
};

struct Probe {
    long frame = 0;
    Command command;
    long head = 0;
};

struct Words {
    uint32_t held = 0, pressed = 0, released = 0, repeating = 0;
    bool seen = false;
};

struct Capture {
    std::string name, kind, pad;
    std::map<long, Words> words;
    std::vector<Probe> queued;
    std::vector<std::string> state;
    std::vector<std::string> openingRows;
    long first = 0, last = 0;
};

Capture readCapture(const std::string& path) {
    std::ifstream in(path);
    if (!in.good()) throw std::runtime_error("cannot open " + path);
    Capture c;
    std::string row;
    bool any = false;
    while (std::getline(in, row)) {
        std::istringstream line(row);
        std::string tag;
        line >> tag;
        if (tag == "capture") line >> c.name;
        else if (tag == "kind") line >> c.kind;
        else if (tag == "pad") std::getline(line >> std::ws, c.pad);
        else if (tag == "F") {
            long frame;
            Words w;
            line >> frame >> w.held >> w.pressed >> w.released >> w.repeating;
            std::string flag;
            line >> flag;
            w.seen = flag != "nopad";
            c.words[frame] = w;
            if (!any) c.first = frame;
            c.last = std::max(c.last, frame);
            any = true;
        } else if (tag == "Q") {
            Probe p;
            long emu, ra;
            unsigned a0, a1, a2, a3;
            line >> emu >> p.frame >> a0 >> a1 >> a2 >> a3 >> p.head >> ra;
            p.command = {static_cast<uint16_t>(a0), static_cast<uint16_t>(a1), static_cast<uint16_t>(a2), static_cast<uint16_t>(a3)};
            c.queued.push_back(p);
            if (!any) { c.first = p.frame; any = true; }
            c.last = std::max(c.last, p.frame);
        } else if (tag == "T" || tag == "M") c.state.push_back(row);
        else if (tag == "O" || tag == "START" || tag == "STAGE2") c.openingRows.push_back(row);
    }
    return c;
}

std::string text(const Command& c) {
    char buffer[96];
    std::snprintf(buffer, sizeof buffer, "%04x(%u,%u,%u)", c.id, c.a1, c.a2, c.a3);
    return buffer;
}

// The native stream rendered by the app's own audio path (LiveAudio, no device): the WAV and the command log SoundLab replays.
struct Render {
    std::string directory, resources, name;
    std::unique_ptr<audio::LiveAudio> audio;

    bool active() const { return !directory.empty(); }
    void begin(const std::string& capture, bool pal = false) {
        if (!active()) return;
        name = capture;
        std::filesystem::create_directories(directory);
        audio::LiveAudioOptions options;
        options.device = false;
        options.wav = std::filesystem::path(directory) / (capture + ".native.wav");
        options.commandLog = std::filesystem::path(directory) / (capture + ".native.commands.txt");
        options.video = pal ? audio::Video::Pal : audio::Video::Ntsc;
        audio = std::make_unique<audio::LiveAudio>(audio::clockSoundSources(std::filesystem::path(resources)), options);
    }
    void queue(const std::vector<scene::SoundCommand>& list) {
        if (!audio) return;
        for (const scene::SoundCommand& c : list) audio->queue({c.id, c.a1, c.a2, c.a3}, c.carriedA2, c.carriedA3);
    }
    void queue(const std::vector<Command>& list) {
        if (!audio) return;
        for (const Command& c : list) audio->queue({c.id, c.a1, c.a2, c.a3}, c.carriedA2, c.carriedA3);
    }
    void drain() { if (audio) audio->drain(); }
    void step() { if (audio) audio->step(); }
    void end() {
        if (!audio) return;
        std::printf("  render: %s\n", audio->finish().c_str());
        audio.reset();
    }
};

struct Result {
    size_t frames = 0, commands = 0, equal = 0, countDiffers = 0, fieldDiffers = 0, a3Differs = 0, a3Equal = 0;
    std::vector<std::string> notes;
};

struct Stream {
    std::map<long, std::vector<Command>> native;
};

audio::EeSoundQueue alignedQueue(const Capture& capture, bool rampDone) {
    audio::EeSoundQueue queue(rampDone ? audio::EeSoundQueue::kRampSteps : 0);
    const long head = capture.queued.empty() ? 0 : capture.queued.front().head;
    for (long i = 0; i < (head & 127); ++i) queue.enqueue({1, 0, 0, 0});
    if (head != 0) queue.drain();
    return queue;
}

Result compare(const Capture& capture, const Stream& stream, bool rampDone) {
    Result r;
    audio::EeSoundQueue queue = alignedQueue(capture, rampDone);
    std::map<long, std::vector<Probe>> wanted;
    for (const Probe& p : capture.queued) if (p.command.id != 0x60D0) wanted[p.frame].push_back(p);
    std::vector<long> frames;
    for (const auto& [frame, list] : wanted) frames.push_back(frame);
    for (const auto& [frame, list] : stream.native) frames.push_back(frame);
    std::sort(frames.begin(), frames.end());
    frames.erase(std::unique(frames.begin(), frames.end()), frames.end());
    for (long frame : frames) {
        const std::vector<Probe> want = wanted.count(frame) ? wanted[frame] : std::vector<Probe>{};
        std::vector<Command> got = stream.native.count(frame) ? stream.native.at(frame) : std::vector<Command>{};
        for (Command& c : got) {
            const uint16_t a2 = c.carriedA2 ? queue.carriedA2() : c.a2, a3 = c.carriedA3 ? queue.carriedA3() : c.a3;
            queue.enqueue({c.id, c.a1, a2, a3});
            c.a2 = a2;
            c.a3 = a3;
        }
        queue.drain();
        ++r.frames;
        r.commands += want.size();
        if (want.size() != got.size()) {
            ++r.countDiffers;
            std::string line = "frame " + std::to_string(frame) + ": console";
            for (const Probe& p : want) line += " " + text(p.command);
            line += "; native";
            for (const Command& c : got) line += " " + text(c);
            r.notes.push_back(line);
            continue;
        }
        for (size_t i = 0; i < want.size(); ++i) {
            const Command& w = want[i].command;
            const Command& g = got[i];
            if (w.id != g.id || w.a1 != g.a1 || w.a2 != g.a2) {
                ++r.fieldDiffers;
                r.notes.push_back("frame " + std::to_string(frame) + ": console " + text(w) + ", native " + text(g));
            } else if (w.a3 != g.a3) {
                ++r.a3Differs;
                r.notes.push_back("frame " + std::to_string(frame) + ": a3 only: console " + text(w) + ", native " + text(g) + (g.carriedA3 ? " (carried)" : " (a3 is ignored by the driver)"));
            } else {
                ++r.equal;
                ++r.a3Equal;
            }
        }
    }
    return r;
}

json readJson(const std::string& path) {
    std::ifstream in(path);
    if (!in.good()) throw std::runtime_error("cannot open " + path);
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

struct Driver {
    scene::ColdAssets assets;
    scene::ColdInputs cold;
    std::unique_ptr<Clock> clock;
    scene::FrameInputs inputs;

    void start() {
        scene::ColdStartOut out = scene::coldStart<scene::EeArithmetic>(assets, cold);
        clock = std::make_unique<Clock>(out.clock);
        inputs = out.frame;
        inputs.field = 0;
        inputs.threadStep = false;
    }

    void step(const Words& w) {
        inputs.menu.pad = {w.held, w.pressed, w.released, w.repeating};
        if (clock->menus()) inputs.configItems = clock->items();
        clock->frame(inputs);
        scene::fillTime(inputs);
        inputs.threadStep = true;
        inputs.field = 0;
        inputs.displayIndex ^= 1;
    }

    template <class Done>
    bool settle(const Done& done, const Words& idle) {
        for (int n = 0; n < 2000; ++n) {
            if (done()) return true;
            step(idle);
        }
        return false;
    }

    void tap(uint32_t bit, const Words& idle) {
        for (int i = 0; i < 6; ++i) {
            Words w = idle;
            w.held = idle.held & ~bit;
            if (i == 0) w.pressed = bit;
            step(w);
        }
        step(idle);
    }
};

// The state the console's sender probes saw at the first frame, and the native one, for the report.
std::string nativeState(const Clock& clock) {
    const scene::MenusState* m = clock.menus();
    char buffer[200];
    if (!m) return "no menus";
    std::snprintf(buffer, sizeof buffer, "mode %d, main ramp %d, config list ramp %d, version ramp %d, menu ramp %d, selected %d", clock.state().mode,
                  m->mainMenu.ramp.state, m->page.ramp.state, m->versionRamp.state, clock.state().menuRamp.state, m->mainMenu.selected);
    return buffer;
}

int runMenu(Driver& driver, const Capture& capture, Result& result, std::string& startNote, Render& render) {
    const bool configStart = capture.name.find("-menu-config-") != std::string::npos || capture.name.find("square-config") != std::string::npos;
    Words idle;
    idle.held = 0;
    driver.start();
    Clock& clock = *driver.clock;
    if (!driver.settle([&] { return clock.state().mode == 0 && clock.menus()->mainMenu.ramp.state == 2; }, idle)) throw std::runtime_error("the main menu never settled");
    if (configStart) {
        driver.tap(scene::pad::Down, idle);
        driver.tap(scene::pad::Cross, idle);
        if (!driver.settle([&] { return clock.menus()->page.ramp.state == 2; }, idle)) throw std::runtime_error("System Configuration never settled");
    }
    startNote = nativeState(clock);
    render.begin(capture.name);
    {
        std::vector<scene::SoundCommand> start;
        scene::clockThreadStart(start);
        scene::clockSetUp(start);
        render.queue(start);
        for (int frame = 0; frame < kRampFrames; ++frame) {
            render.drain();
            render.step();
        }
    }
    for (const std::string& row : capture.state) {
        if (row.rfind("T ", 0) == 0) { startNote += "; console first frame: " + row.substr(2); break; }
    }
    Stream stream;
    Words last;
    for (long frame = capture.first; frame <= capture.last; ++frame) {
        auto at = capture.words.find(frame);
        Words w = at == capture.words.end() ? last : at->second;
        if (at != capture.words.end() && at->second.seen) last = at->second;
        else {
            w.pressed = w.released = w.repeating = 0;
        }
        render.drain();
        driver.step(w);
        std::vector<Command> list;
        for (const scene::SoundCommand& c : clock.sounds()) list.push_back({c.id, c.a1, c.a2, c.a3, c.carriedA2, c.carriedA3});
        if (!list.empty()) stream.native[frame] = list;
        render.queue(list);
        render.step();
    }
    render.end();
    result = compare(capture, stream, true);
    return 0;
}

int runOpening(const std::shared_ptr<const scene::ProgramImage>& program, const Capture& capture, Result& result, std::string& startNote, Render& render) {
    scene::opening::BootOptions options;
    long module = 1;
    long stage2Counter = -1;
    for (const std::string& row : capture.openingRows) {
        std::istringstream line(row);
        std::string tag, word;
        long frame, emu;
        line >> tag >> frame >> emu;
        if (tag == "START") {
            line >> word >> module;
        } else if (tag == "STAGE2" && stage2Counter < 0) {
            long counter, pending, go;
            unsigned forced, ready, disc;
            long exec;
            std::string k;
            line >> k >> counter >> k >> pending >> k >> go >> k >> forced >> k >> ready >> k >> exec >> k >> disc;
            options.clockForced = forced == 0;
            options.hddReady = ready != 0;
            options.hddExec = static_cast<int32_t>(exec);
            options.disc = {0x65, disc};
            stage2Counter = counter;
        }
    }
    options.module = static_cast<int32_t>(module);
    startNote = "module " + std::to_string(module) + ", forced " + std::to_string(options.clockForced) + ", ready " + std::to_string(options.hddReady) + ", exec " + std::to_string(options.hddExec) + ", disc 0x" + [&] { char b[16]; std::snprintf(b, sizeof b, "%x", options.disc.later); return std::string(b); }();
    Opening opening(options, program);
    Stream stream;
    long entry = -1;
    long emuOfCounter1 = -1;
    for (const std::string& row : capture.openingRows) {
        std::istringstream line(row);
        std::string tag;
        long frame, emu, counter;
        line >> tag >> frame >> emu;
        if (tag == "START") entry = emu;
        if (tag == "O") { line >> counter; if (emuOfCounter1 < 0) emuOfCounter1 = emu - counter + 1; }
    }
    if (entry < 0) entry = 127;
    std::vector<Command> start;
    for (const scene::SoundCommand& c : opening.startCommands()) start.push_back({c.id, c.a1, c.a2, c.a3, c.carriedA2, c.carriedA3});
    stream.native[entry] = start;
    render.begin(capture.name);
    render.queue(start);
    // The counter D_00370000 at the entry of OpeningProcessInner is the frame's counter; the capture's emulator frame is counter + 127.
    const long limit = capture.last - 127 + 4;
    std::string trail;
    for (long i = 0; i < limit && !opening.ended(); ++i) {
        const int32_t before = opening.counter();
        render.drain();
        opening.frame(0, 0);
        std::vector<Command> list;
        for (const scene::SoundCommand& c : opening.commands()) list.push_back({c.id, c.a1, c.a2, c.a3, c.carriedA2, c.carriedA3});
        if (!list.empty()) {
            const long frame = before + 127;
            auto& slot = stream.native[frame];
            slot.insert(slot.end(), list.begin(), list.end());
        }
        render.queue(list);
        render.step();
    }
    render.end();
    if (opening.ended()) startNote += "; the native opening ended at counter " + std::to_string(opening.counter());
    result = compare(capture, stream, true);
    return 0;
}

// The clock-first boot (hddosd-110U-sound-boot-a): the thread start is queued before the first drain, which also starts the ramp, and the set-up pair follows kClockInitFrames drains later.
void renderBoot(const Capture& capture, Render& render) {
    if (!render.active() || capture.name.find("sound-clock-boot") == std::string::npos) return;
    const bool forced = capture.name.find("forced") != std::string::npos;
    render.begin(capture.name);
    constexpr int kEnd = 260;
    std::vector<scene::SoundCommand> start;
    scene::clockThreadStart(start);
    render.queue(start);
    for (int frame = 0; frame < kEnd; ++frame) {
        render.drain();
        std::vector<scene::SoundCommand> list;
        if (frame == static_cast<int>(scene::kClockInitFrames) - 1 && !forced) scene::clockSetUp(list);
        render.queue(list);
        render.step();
    }
    render.end();
}

// A clock thread start and set-up: the senders of Source/Scene/Sound.hpp, placed at the capture's own frames (the scene does not place them: the app does).
int runClock(const Capture& capture, Result& result, std::string& startNote, Render& render) {
    Stream stream;
    startNote = "senders of Sound.hpp placed at the capture's frames";
    bool started = false, paired = false;
    for (const Probe& p : capture.queued) {
        if (p.command.id == 0x6150 && p.command.a1 == 1 && !started) {
            std::vector<scene::SoundCommand> out;
            scene::clockThreadStart(out);
            for (const scene::SoundCommand& c : out) stream.native[p.frame].push_back({c.id, c.a1, c.a2, c.a3, c.carriedA2, c.carriedA3});
            started = true;
        } else if (p.command.id == 0x6150 && p.command.a1 == 6 && !paired) {
            std::vector<scene::SoundCommand> out;
            scene::clockSetUp(out);
            for (const scene::SoundCommand& c : out) stream.native[p.frame].push_back({c.id, c.a1, c.a2, c.a3, c.carriedA2, c.carriedA3});
            paired = true;
        }
    }
    // The ring: the thread start, the fifteen ramp entries the drain queues, then the pair.
    audio::EeSoundQueue queue(0);
    const long head = capture.queued.empty() ? 0 : capture.queued.front().head;
    for (long i = 0; i < (head & 127); ++i) queue.enqueue({1, 0, 0, 0});
    std::map<long, std::vector<Probe>> wanted;
    for (const Probe& p : capture.queued) wanted[p.frame].push_back(p);
    result = {};
    renderBoot(capture, render);
    std::vector<long> frames;
    for (const auto& [frame, list] : wanted) frames.push_back(frame);
    for (const auto& [frame, list] : stream.native) frames.push_back(frame);
    std::sort(frames.begin(), frames.end());
    frames.erase(std::unique(frames.begin(), frames.end()), frames.end());
    for (long frame = frames.front(); frame <= frames.back(); ++frame) {
        std::vector<Command> got = stream.native.count(frame) ? stream.native[frame] : std::vector<Command>{};
        for (Command& c : got) {
            const uint16_t a2 = c.carriedA2 ? queue.carriedA2() : c.a2, a3 = c.carriedA3 ? queue.carriedA3() : c.a3;
            queue.enqueue({c.id, c.a1, a2, a3});
            c.a2 = a2;
            c.a3 = a3;
        }
        // The drain after this frame's commands: its ramp enqueue is the console's 0x60D0, compared as the capture's entry of that id.
        for (const audio::SoundCommand& sent : queue.drain()) (void)sent;
        const std::vector<Probe> want = wanted.count(frame) ? wanted[frame] : std::vector<Probe>{};
        std::vector<Probe> wantMine;
        for (const Probe& p : want) if (p.command.id != 0x60D0) wantMine.push_back(p);
        if (wantMine.empty() && got.empty()) continue;
        ++result.frames;
        result.commands += wantMine.size();
        if (wantMine.size() != got.size()) {
            ++result.countDiffers;
            result.notes.push_back("frame " + std::to_string(frame) + ": the counts differ");
            continue;
        }
        for (size_t i = 0; i < wantMine.size(); ++i) {
            const Command& w = wantMine[i].command;
            const Command& g = got[i];
            if (w.id != g.id || w.a1 != g.a1 || w.a2 != g.a2) {
                ++result.fieldDiffers;
                result.notes.push_back("frame " + std::to_string(frame) + ": console " + text(w) + ", native " + text(g));
            } else if (w.a3 != g.a3) {
                ++result.a3Differs;
                result.notes.push_back("frame " + std::to_string(frame) + ": a3 only: console " + text(w) + ", native " + text(g));
            } else ++result.equal;
        }
    }
    return 0;
}

int run(int argc, char** argv) {
    if (argc < 8) {
        std::fprintf(stderr, "usage: SoundCommandsTest program font rod-mesh cube-mesh cold-log commands-dir capture...\n");
        return 2;
    }
    const auto program = std::make_shared<const scene::ProgramImage>(scene::ProgramImage::load(argv[1]));
    Driver driver;
    driver.assets.program = program;
    driver.assets.font = std::make_shared<const scene::Font>(scene::Font::load(argv[2]));
    driver.assets.mesh = scene::loadRodMesh(argv[3]);
    driver.assets.cubeMesh = scene::loadRodMesh(argv[4]);
    const json log = readJson(argv[5]);
    driver.cold = inputsOf(log.at("first"), log.at("log").at(0));
    int failures = 0, errors = 0;
    std::vector<std::string> differences;
    Render render;
    if (const char* directory = std::getenv("SOUND_RENDER_DIR")) render.directory = directory;
    if (const char* resources = std::getenv("SOUND_RESOURCES")) render.resources = resources;
    if (render.active() && render.resources.empty()) throw std::runtime_error("SOUND_RENDER_DIR needs SOUND_RESOURCES (a folder with SNDIMAGE and hddosd.elf)");
    for (int i = 7; i < argc; ++i) {
        const Capture capture = readCapture(std::string(argv[6]) + "/" + argv[i] + ".commands.txt");
        Result result;
        std::string note;
        std::string verdict;
        try {
            if (capture.kind == "menu") runMenu(driver, capture, result, note, render);
            else if (capture.kind == "opening") runOpening(program, capture, result, note, render);
            else runClock(capture, result, note, render);
        } catch (const std::exception& error) {
            std::printf("%s: error: %s\n", argv[i], error.what());
            ++failures;
            ++errors;
            continue;
        }
        const bool same = result.countDiffers == 0 && result.fieldDiffers == 0 && result.a3Differs == 0;
        std::printf("%s [%s]: %s\n", argv[i], capture.kind.c_str(), note.c_str());
        std::printf("  frames compared %zu, console commands %zu, equal (id a1 a2 a3) %zu, count differs in %zu frames, id/a1/a2 differ %zu, a3 only differs %zu: %s\n",
                    result.frames, result.commands, result.equal, result.countDiffers, result.fieldDiffers, result.a3Differs, same ? "EQUAL" : "DIFFERENT");
        for (const std::string& n : result.notes) {
            std::printf("    %s\n", n.c_str());
            differences.push_back(std::string(argv[i]) + "|" + n);
        }
        if (!same) ++failures;
    }
    // The differences the report lists, pinned: a new one or a vanished one fails (SOUND_EXPECTED names the file, SOUND_WRITE_EXPECTED writes it).
    if (const char* expected = std::getenv("SOUND_EXPECTED")) {
        if (std::getenv("SOUND_WRITE_EXPECTED")) {
            std::ofstream out(expected);
            for (const std::string& d : differences) out << d << "\n";
            std::printf("wrote %zu expected differences to %s\n", differences.size(), expected);
            return 0;
        }
        std::ifstream in(expected);
        std::vector<std::string> listed;
        for (std::string line; std::getline(in, line);)
            if (!line.empty()) listed.push_back(line);
        int unexpected = 0;
        for (const std::string& d : differences)
            if (std::find(listed.begin(), listed.end(), d) == listed.end()) {
                std::printf("NEW difference: %s\n", d.c_str());
                ++unexpected;
            }
        for (const std::string& l : listed)
            if (std::find(differences.begin(), differences.end(), l) == differences.end()) {
                std::printf("LISTED difference gone: %s\n", l.c_str());
                ++unexpected;
            }
        std::printf("%zu differences, all listed in %s: %s\n", differences.size(), expected, unexpected == 0 ? "yes" : "NO");
        if (errors != 0) std::printf("%d captures failed with an error\n", errors);
        return unexpected == 0 && errors == 0 ? 0 : 1;
    }
    return failures == 0 ? 0 : 1;
}

}

int main(int argc, char** argv) {
    try {
        return run(argc, argv);
    } catch (const std::exception& error) {
        std::fprintf(stderr, "SoundCommandsTest: %s\n", error.what());
        return 2;
    }
}
