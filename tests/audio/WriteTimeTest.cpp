#include <cstdio>
#include <deque>
#include <filesystem>
#include <map>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

#include "../Check.hpp"
#include "Audio/driver/IopClock.hpp"
#include "Audio/driver/Memory.hpp"
#include "Audio/driver/State.hpp"
#include "Audio/driver/Driver.hpp"
#include "Audio/SpuWrite.hpp"

namespace fs = std::filesystem;
using namespace audio::driver;

namespace {

void check(bool ok, const std::string& what) {
    if (!ok) throw std::runtime_error(what);
}

const std::map<std::string, std::string> kStems{
    {"boot-a", "hddosd-110U-sound-boot-b"}, {"boot-b", "hddosd-110U-sound-boot-b"}, {"bad-effect", "hddosd-110U-sound-bad-effect"},
    {"fx-steal", "hddosd-110U-sound-fx-steal"}, {"voice-steal", "hddosd-110U-sound-voice-steal"}, {"modes-1", "hddosd-110U-sound-modes-1"},
    {"modes-2", "hddosd-110U-sound-modes-2"}, {"modes-3", "hddosd-110U-sound-modes-3"}, {"modes-4", "hddosd-110U-sound-modes-4"},
    {"modes-5", "hddosd-110U-sound-modes-5"}, {"modes-6", "hddosd-110U-sound-modes-6"}, {"steady-long", "hddosd-110U-sound-steady-long"},
};

struct FixtureWrite {
    uint32_t address = 0;
    uint16_t value = 0;
    uint32_t offset = 0;
};

struct FixtureEvent {
    uint32_t kind = 0;
    uint32_t id = 0;
    std::array<uint32_t, 5> words{};
    uint32_t cycle = 0;
    std::vector<EnvxRead> envx;
    std::vector<FixtureWrite> writes;
    std::vector<uint32_t> dmaDone;
};

struct Fixture {
    bool cold = false;
    std::vector<std::pair<uint32_t, uint16_t>> seeds;
    std::vector<FixtureEvent> events;
};

Fixture loadFixture(const fs::path& path) {
    const assets::Bytes b = assets::readFile(path);
    size_t at = 0;
    const auto next = [&]() { const uint32_t v = assets::le32(b, at); at += 4; return v; };
    if (next() != 0x57544d31) throw std::runtime_error(path.string() + ": not a write-time fixture");
    Fixture f;
    f.cold = next() != 0;
    for (uint32_t n = next(), i = 0; i < n; ++i) {
        const uint32_t address = next();
        f.seeds.push_back({address, uint16_t(next())});
    }
    for (uint32_t n = next(), i = 0; i < n; ++i) {
        FixtureEvent e;
        e.kind = next();
        e.id = next();
        for (uint32_t& w : e.words) w = next();
        e.cycle = next();
        for (uint32_t m = next(), k = 0; k < m; ++k) {
            EnvxRead r;
            r.core = next();
            r.voice = next();
            r.value = uint16_t(next());
            e.envx.push_back(r);
        }
        for (uint32_t m = next(), k = 0; k < m; ++k) {
            FixtureWrite w;
            w.address = next();
            w.value = uint16_t(next());
            w.offset = next();
            e.writes.push_back(w);
        }
        for (uint32_t m = next(), k = 0; k < m; ++k) e.dmaDone.push_back(next());
        f.events.push_back(std::move(e));
    }
    return f;
}

IopClock makeClock(const fs::path& captures, const std::string& label, const Fixture& f) {
    assets::Bytes libsd = assets::readFile(captures / "hddosd-110U-sound-libsd.bin");
    if (f.cold) {
        for (int core : {0, 1})
            for (int off : {0x24, 0x2c, 0x30}) {
                const size_t at = size_t(kLibsdState + off + 20 * core - kLibsdBase);
                for (size_t k = 0; k < 4; ++k) libsd.at(at + k) = 0;
            }
    }
    const Snapshot snapshot = loadSnapshot(captures / kStems.at(label));
    IopClock clock(libsd, snapshot.osdsnd, snapshot.iop);
    for (const auto& [address, value] : f.seeds) clock.seed(address, value);
    return clock;
}

int cmdClock(int argc, char** argv) {
    const fs::path fixtures = argv[2], captures = argv[3];
    for (int a = 4; a < argc; ++a) {
        const std::string label = argv[a];
        const Fixture f = loadFixture(fixtures / (label + ".writetime.bin"));
        IopClock clock = makeClock(captures, label, f);
        uint64_t writes = 0, unmodelled = 0;
        for (size_t i = 0; i < f.events.size(); ++i) {
            const FixtureEvent& e = f.events[i];
            clock.setDmaCompletion([&e](uint32_t ordinal, uint32_t) -> std::optional<uint32_t> {
                if (ordinal < e.dmaDone.size()) return e.dmaDone[ordinal];
                return std::nullopt;
            });
            const HandlerTiming t = e.kind == 0 ? clock.tick(e.envx) : clock.command(e.id, e.words, e.envx);
            if (t.unmeasuredOps != 0) throw std::runtime_error(label + ": an unmeasured IOP operation ran");
            unmodelled += t.unmodelledStubs;
            check(t.writes.size() == e.writes.size(), label + " event " + std::to_string(i) + ": write count");
            for (size_t k = 0; k < e.writes.size(); ++k) {
                const std::string where = label + " event " + std::to_string(i) + " write " + std::to_string(k);
                check(t.writes[k].address == e.writes[k].address, where + ": address");
                check(t.writes[k].value == e.writes[k].value, where + ": value");
                check(t.writes[k].cycle == e.writes[k].offset, where + ": cycle offset " + std::to_string(t.writes[k].cycle) + " vs " + std::to_string(e.writes[k].offset));
                ++writes;
            }
        }
        std::printf("%s: %zu events, %llu write times equal the model, %llu stub calls without a measured cost\n", label.c_str(), f.events.size(), (unsigned long long)writes,
                    (unsigned long long)unmodelled);
    }
    return 0;
}

int cmdDriver(int argc, char** argv) {
    const fs::path fixtures = argv[2], captures = argv[3];
    for (int a = 4; a < argc; ++a) {
        const std::string label = argv[a];
        const Fixture f = loadFixture(fixtures / (label + ".writetime.bin"));
        assets::Bytes libsd = assets::readFile(captures / "hddosd-110U-sound-libsd.bin");
        std::map<uint32_t, std::deque<uint16_t>> queue;
        const auto pop = [&](uint32_t core, uint32_t voice) -> uint16_t {
            auto& q = queue[core << 8 | voice];
            if (q.empty()) return 0;
            const uint16_t v = q.front();
            q.pop_front();
            return v;
        };
        EnvxFeed feed;
        feed.tick = pop;
        feed.allocation = pop;
        Driver driver(loadSnapshot(captures / kStems.at(label)), std::move(libsd), feed, f.cold);
        for (const auto& [address, value] : f.seeds) driver.seedRegister(address, value);
        driver.enableTiming();
        check(driver.timing(), "timing is on");
        uint64_t writes = 0;
        for (size_t i = 0; i < f.events.size(); ++i) {
            const FixtureEvent& e = f.events[i];
            queue.clear();
            for (const EnvxRead& r : e.envx) queue[r.core << 8 | r.voice].push_back(r.value);
            driver.setDmaCompletion([&e](uint32_t ordinal, uint32_t) -> std::optional<uint32_t> {
                if (ordinal < e.dmaDone.size()) return e.dmaDone[ordinal];
                return std::nullopt;
            });
            if (e.kind == 0) {
                driver.tick();
            } else {
                audio::DriverCommand c;
                c.id = e.id;
                c.words = e.words;
                driver.command(c);
            }
            const audio::WriteStream got = driver.takeWrites();
            check(got.size() == e.writes.size(), label + " event " + std::to_string(i) + ": write count");
            for (size_t k = 0; k < got.size(); ++k) {
                const std::string where = label + " event " + std::to_string(i) + " write " + std::to_string(k);
                check(got[k].address == e.writes[k].address && got[k].value == e.writes[k].value, where + ": address and value");
                check(got[k].cycle == e.writes[k].offset, where + ": cycle offset");
                ++writes;
            }
        }
        std::printf("%s driver: %zu events, %llu stamped writes equal the model\n", label.c_str(), f.events.size(), (unsigned long long)writes);
    }
    return 0;
}

int cmdPreempt() {
    std::vector<audio::SpuWrite> w(4);
    for (size_t i = 0; i < w.size(); ++i) w[i].cycle = uint32_t(10 * (i + 1));
    const std::vector<uint64_t> frames{500, 1015, 700000};
    addVblankPreemption(w, 1000, frames);
    check(w[0].cycle == 10, "a write before the vblank keeps its time");
    check(w[1].cycle == 20 + kVblankHandlerCycles, "the first write after the vblank waits for its handler");
    check(w[2].cycle == 30 + kVblankHandlerCycles && w[3].cycle == 40 + kVblankHandlerCycles, "the writes after it wait too, once");
    std::vector<audio::SpuWrite> waited(2);
    waited[0].cycle = 10;
    waited[1].cycle = 5000;
    waited[1].resume = 4000;
    addVblankPreemption(waited, 1000, std::vector<uint64_t>{1500, 3000, 5200});
    check(waited[0].cycle == 10, "a write before the wait is untouched");
    check(waited[1].cycle == 5000 + kVblankHandlerCycles, "vblanks during a DMA wait cost nothing, the one after the resume does");
    std::vector<audio::SpuWrite> before(1);
    before[0].cycle = 5;
    addVblankPreemption(before, 1000, frames);
    check(before[0].cycle == 5, "a vblank before the handler entry does not count");
    check(sampleOfCycle(1000 + 768 * 5 + 767, 1000) == 5, "the sample is the floor of the cycles over 768");
    std::printf("preemption rule holds\n");
    return 0;
}

}

int main(int argc, char** argv) {
    try {
        if (argc >= 5 && std::string(argv[1]) == "clock") return cmdClock(argc, argv);
        if (argc >= 5 && std::string(argv[1]) == "driver") return cmdDriver(argc, argv);
        if (argc >= 2 && std::string(argv[1]) == "preempt") return cmdPreempt();
        if (argc >= 2 && std::string(argv[1]) == "skip") {
            std::printf("SKIPPED: %s\n", argc > 2 ? argv[2] : "");
            return 77;
        }
        std::fprintf(stderr, "usage: AudioWriteTimeTest clock <fixtures> <captures> <label>...\n");
        return 2;
    } catch (const std::exception& e) {
        std::fprintf(stderr, "FAIL: %s\n", e.what());
        return 1;
    }
}
