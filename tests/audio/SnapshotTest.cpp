#include <cstdio>
#include <filesystem>
#include <fstream>
#include <map>
#include <set>
#include <sstream>
#include <string>
#include <vector>

#include "../Check.hpp"
#include "DriverFixtures.hpp"
#include "Audio/driver/Driver.hpp"
#include "Audio/driver/SnapshotBuilder.hpp"

namespace fs = std::filesystem;
using namespace audio::driver;

namespace {

struct Class {
    std::string name;
    int64_t from = 0, to = 0;
    uint64_t bytes = 0;
};

std::vector<Class> readBudget(const fs::path& file) {
    std::ifstream in(file);
    std::vector<Class> classes;
    std::string line;
    while (std::getline(in, line)) {
        if (line.empty() || line[0] == '#') continue;
        std::istringstream s(line);
        Class c;
        std::string from, to;
        s >> c.name >> from >> to >> c.bytes;
        c.from = std::stoll(from, nullptr, 16);
        c.to = std::stoll(to, nullptr, 16);
        classes.push_back(c);
    }
    return classes;
}

struct Region {
    const char* name;
    int64_t base;
    assets::View built, captured;
};

int imageMode(const fs::path& dumps, const fs::path& captures, const fs::path& budgetFile) {
    const SoundImages images = buildSoundImages(dumps);
    const Snapshot warm = loadSnapshot(captures / "hddosd-110U-sound-boot-b");
    const assets::Bytes libsd = assets::readFile(captures / "hddosd-110U-sound-libsd.bin");
    CHECK(images.snapshot.osdsnd.size() == warm.osdsnd.size());
    CHECK(images.snapshot.iop.size() == warm.iop.size());
    CHECK(images.libsd.size() == libsd.size());
    const Region regions[] = {{"libsd", kLibsdBase, images.libsd, libsd}, {"osdsnd", kOsdsndBase, images.snapshot.osdsnd, warm.osdsnd}, {"iop", kSoundIopBase, images.snapshot.iop, warm.iop}};
    std::vector<Class> classes = readBudget(budgetFile);
    CHECK(!classes.empty());
    std::map<std::string, uint64_t> seen;
    uint64_t equal = 0, differ = 0;
    for (const Region& r : regions) {
        for (size_t i = 0; i < r.built.size(); ++i) {
            if (r.built[i] == r.captured[i]) {
                ++equal;
                continue;
            }
            ++differ;
            const int64_t address = r.base + int64_t(i);
            const Class* owner = nullptr;
            for (const Class& c : classes)
                if (address >= c.from && address < c.to) {
                    owner = &c;
                    break;
                }
            if (!owner) {
                std::fprintf(stderr, "%s: byte %llx differs and no class owns it\n", r.name, (unsigned long long)address);
                return 1;
            }
            ++seen[owner->name + " " + std::to_string(owner->from)];
        }
    }
    for (const Class& c : classes) {
        const uint64_t got = seen[c.name + " " + std::to_string(c.from)];
        std::printf("%-26s %06llx..%06llx %6llu bytes\n", c.name.c_str(), (unsigned long long)c.from, (unsigned long long)c.to, (unsigned long long)got);
        if (got != c.bytes) {
            std::fprintf(stderr, "class %s at %llx: %llu bytes differ, the budget says %llu\n", c.name.c_str(), (unsigned long long)c.from, (unsigned long long)got,
                         (unsigned long long)c.bytes);
            return 1;
        }
    }
    std::printf("image: %llu bytes equal the capture, %llu differ, every difference in a class\n", (unsigned long long)equal, (unsigned long long)differ);
    return 0;
}

int runsMode(const fs::path& dumps, const fs::path& captures) {
    const SoundImages images = buildSoundImages(dumps);
    const Snapshot warm = loadSnapshot(captures / "hddosd-110U-sound-boot-b");
    const assets::Bytes libsd = assets::readFile(captures / "hddosd-110U-sound-libsd.bin");
    const Region regions[] = {{"libsd", kLibsdBase, images.libsd, libsd}, {"osdsnd", kOsdsndBase, images.snapshot.osdsnd, warm.osdsnd}, {"iop", kSoundIopBase, images.snapshot.iop, warm.iop}};
    for (const Region& r : regions) {
        size_t i = 0;
        while (i < r.built.size()) {
            if (r.built[i] == r.captured[i]) {
                ++i;
                continue;
            }
            const size_t start = i;
            while (i < r.built.size() && r.built[i] != r.captured[i]) ++i;
            std::printf("%s %llx %zu\n", r.name, (unsigned long long)(r.base + int64_t(start)), i - start);
        }
    }
    return 0;
}

int dumpMode(const fs::path& dumps, const fs::path& out) {
    const SoundImages images = buildSoundImages(dumps);
    fs::create_directories(out);
    assets::writeFile(out / "built.osdsnd.bin", images.snapshot.osdsnd);
    assets::writeFile(out / "built.iopsound.bin", images.snapshot.iop);
    assets::writeFile(out / "built.libsd.bin", images.libsd);
    std::printf("dump: built images written to %s\n", out.string().c_str());
    return 0;
}

int scenarioMode(const fs::path& fixtures, const fs::path& dumps) {
    const SoundImages images = buildSoundImages(dumps);
    const driverfix::Scenario s = driverfix::load(fixtures, "boot");
    size_t tickIndex = 0;
    int allocationCalls = -1;
    EnvxFeed feed;
    feed.tick = [&](uint32_t, uint32_t voice) -> uint16_t {
        if (voice == 0) ++tickIndex;
        return tickIndex >= 1 && tickIndex <= s.tickEnvx.size() ? s.tickEnvx[tickIndex - 1][voice] : uint16_t(0);
    };
    feed.allocation = [&](uint32_t, uint32_t voice) -> uint16_t {
        if (voice == 0) ++allocationCalls;
        const auto& list = s.allocation[voice];
        return allocationCalls >= 0 && size_t(allocationCalls) < list.size() ? list[size_t(allocationCalls)] : uint16_t(0);
    };
    Driver driver(images.snapshot, images.libsd, feed, true);
    std::vector<driverfix::Row> got;
    std::vector<driverfix::Fill> fills;
    for (const driverfix::Event& e : s.events) {
        driver.beginFrame(e.frame);
        uint32_t tag = 0;
        if (e.kind == 0) {
            driver.tick();
        } else {
            audio::DriverCommand c;
            c.frame = e.frame;
            c.id = e.id;
            c.words = e.words;
            driver.command(c);
            tag = e.id;
        }
        for (const audio::SpuWrite& w : driver.takeWrites()) got.push_back({w.frame, tag, w.address, w.value});
        for (const FillEvent& f : driver.takeFills()) fills.push_back({tag, f.core, f.start, uint32_t(f.bytes), uint32_t(f.transferred)});
    }
    CHECK(!s.model.empty());
    CHECK(got.size() == s.model.size());
    for (size_t i = 0; i < got.size(); ++i) {
        const driverfix::Row &a = got[i], &b = s.model[i];
        if (a.frame != b.frame || a.id != b.id || a.address != b.address || a.value != b.value) {
            std::fprintf(stderr, "write %zu differs: derived %x=%x id %x frame %u, capture %x=%x id %x frame %u\n", i, a.address, a.value, a.id, a.frame, b.address, b.value, b.id,
                         b.frame);
            return 1;
        }
    }
    CHECK(fills == s.fills);
    std::printf("scenario: %zu writes and %zu transfer events of the boot capture equal from the user's files alone (no capture bytes)\n", got.size(), fills.size());
    return 0;
}

int stagingMode(const fs::path& fixtures) {
    const driverfix::Scenario s = driverfix::load(fixtures, "boot");
    std::set<int64_t> heads, queues;
    for (const driverfix::Event& e : s.events) {
        if (e.kind != 1) continue;
        if (e.id == 0x6060) heads.insert(e.words[0]);
        if (e.id == 0x6090) queues.insert(e.words[1]);
    }
    std::set<int64_t> stagedHeads, stagedQueues;
    for (const StagedMember& m : kStagedMembers) (m.name.back() == 'H' ? stagedHeads : stagedQueues).insert(m.address);
    CHECK(!heads.empty() && !queues.empty());
    CHECK(heads == stagedHeads);
    CHECK(queues == stagedQueues);
    std::printf("staging: %zu head and %zu sequence addresses of the boot commands equal the staged members\n", heads.size(), queues.size());
    return 0;
}

int refuseMode(const fs::path& dumps) {
    const audio::data::SndImage sound = audio::data::SndImage::fromFolder(dumps);
    assets::Bytes program = assets::readFile(dumps / "hddosd.elf");
    CHECK(buildSoundImages(program, sound).libsd.size() == kLibsdImageSize);
    program[program.size() / 2] ^= 0xff;
    try {
        buildSoundImages(program, sound);
    } catch (const std::runtime_error&) {
        std::printf("refuse: a changed program is refused\n");
        return 0;
    }
    std::fprintf(stderr, "a changed program was accepted\n");
    return 1;
}

}

int main(int argc, char** argv) {
    if (argc >= 3 && std::string(argv[1]) == "skip") {
        std::printf("SKIPPED: %s\n", argv[2]);
        return 77;
    }
    if (argc < 3) return 2;
    const std::string mode = argv[1];
    if (mode == "image" && argc >= 5) return imageMode(argv[2], argv[3], argv[4]);
    if (mode == "runs" && argc >= 4) return runsMode(argv[2], argv[3]);
    if (mode == "dump" && argc >= 4) return dumpMode(argv[2], argv[3]);
    if (mode == "scenario" && argc >= 4) return scenarioMode(argv[2], argv[3]);
    if (mode == "staging") return stagingMode(argv[2]);
    if (mode == "refuse") return refuseMode(argv[2]);
    return 2;
}
