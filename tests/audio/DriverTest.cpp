#include <cstdio>
#include <filesystem>
#include <fstream>
#include <functional>
#include <memory>
#include <stdexcept>
#include <set>
#include <string>

#include "../Check.hpp"
#include "DriverFixtures.hpp"
#include "Audio/driver/Driver.hpp"
#include "Audio/driver/Memory.hpp"

namespace fs = std::filesystem;
using audio::driver::Driver;
using audio::driver::EnvxFeed;

namespace {

struct Tagged {
    uint32_t frame = 0;
    uint32_t id = 0;
    uint32_t address = 0;
    uint16_t value = 0;
};

constexpr uint32_t kTick = 0;
const std::set<uint32_t> kInitIds{0x6010, 0x6060, 0x6090, 0x60a0, 0x60c0, 0x6130, 0x6140, 0x6200, 0x6300, 0x6310, 0x8010, 0x8070, 0x61a0, 0x6070};
const std::set<uint32_t> kRampIds{0x60d0, 0x6120};

bool sequencerClass(uint32_t address) {
    if ((address >> 16) != 0x1f90) return false;
    const uint32_t mem = address & 0xffff;
    if (mem >= 0x760) return false;
    if (((mem >> 10) & 1) != 1) return false;
    const uint32_t off = mem & 0x3ff;
    if (off < 0x180) return true;
    if (off >= 0x1c0 && off < 0x2e0) return true;
    return (off >= 0x188 && off <= 0x196) || (off >= 0x1a0 && off <= 0x1a6);
}

struct Source {
    fs::path captures;
    assets::Bytes libsd;
    explicit Source(const fs::path& dir) : captures(dir), libsd(assets::readFile(dir / "hddosd-110U-sound-libsd.bin")) {}
};

struct Result {
    std::vector<Tagged> writes;
    std::vector<driverfix::Fill> fills;
};

Result run(const Source& source, const driverfix::Scenario& s, const std::function<bool(const driverfix::Event&)>& wanted) {
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
    Driver driver(audio::driver::loadSnapshot(source.captures / s.templateStem), source.libsd, feed, !s.warm);
    if (s.warm)
        for (const auto& [address, value] : s.seed) driver.seedRegister(address, value);
    Result out;
    for (const driverfix::Event& e : s.events) {
        if (!wanted(e)) continue;
        driver.beginFrame(e.frame);
        uint32_t tag = kTick;
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
        for (const audio::SpuWrite& w : driver.takeWrites()) out.writes.push_back({w.frame, tag, w.address, w.value});
        for (const audio::driver::FillEvent& f : driver.takeFills()) out.fills.push_back({tag, f.core, f.start, uint32_t(f.bytes), uint32_t(f.transferred)});
    }
    return out;
}

bool equalRows(const std::vector<Tagged>& got, const std::vector<driverfix::Row>& want, const char* what) {
    const size_t n = std::max(got.size(), want.size());
    for (size_t i = 0; i < n; ++i) {
        const bool ok = i < got.size() && i < want.size() && got[i].frame == want[i].frame && got[i].id == want[i].id && got[i].address == want[i].address &&
                        got[i].value == want[i].value;
        if (!ok) {
            std::fprintf(stderr, "%s: first difference at write %zu of %zu (native %zu)\n", what, i, want.size(), got.size());
            if (i < got.size()) std::fprintf(stderr, "  native: frame %u id %x address %x value %x\n", got[i].frame, got[i].id, got[i].address, got[i].value);
            if (i < want.size()) std::fprintf(stderr, "  model:  frame %u id %x address %x value %x\n", want[i].frame, want[i].id, want[i].address, want[i].value);
            return false;
        }
    }
    return true;
}

using Keep = std::function<bool(const driverfix::Event&)>;

Keep initOnly() { return [](const driverfix::Event& e) { return e.kind == 1 && kInitIds.count(e.id) != 0; }; }
Keep noRamp() { return [](const driverfix::Event& e) { return !(e.kind == 1 && kRampIds.count(e.id) != 0); }; }
Keep everything() { return [](const driverfix::Event&) { return true; }; }

int modelMode(const std::string& mode, const fs::path& fixtures, const fs::path& captures, const std::vector<std::string>& names) {
    const Source source(captures);
    size_t total = 0;
    for (const std::string& name : names) {
        const driverfix::Scenario s = driverfix::load(fixtures, name);
        Keep keep = everything();
        std::function<bool(const driverfix::Row&)> keepRow = [](const driverfix::Row&) { return true; };
        std::function<bool(const driverfix::Fill&)> keepFill = [](const driverfix::Fill&) { return true; };
        if (mode == "init") {
            keep = initOnly();
            keepRow = [](const driverfix::Row& r) { return kInitIds.count(r.id) != 0; };
            keepFill = [](const driverfix::Fill& f) { return kInitIds.count(f.id) != 0; };
        } else if (mode == "sequencer") {
            keep = noRamp();
            keepRow = [](const driverfix::Row& r) { return kRampIds.count(r.id) == 0; };
            keepFill = [](const driverfix::Fill& f) { return kRampIds.count(f.id) == 0; };
        }
        std::vector<driverfix::Row> want;
        for (const driverfix::Row& r : s.model)
            if (keepRow(r)) want.push_back(r);
        const Result got = run(source, s, keep);
        CHECK(!want.empty() || mode == "init");
        if (!equalRows(got.writes, want, name.c_str())) return 1;
        std::vector<driverfix::Fill> wantFills;
        for (const driverfix::Fill& f : s.fills)
            if (keepFill(f)) wantFills.push_back(f);
        if (got.fills != wantFills) {
            std::fprintf(stderr, "%s: %zu transfer events, the model has %zu\n", name.c_str(), got.fills.size(), wantFills.size());
            return 1;
        }
        total += got.writes.size();
        std::printf("%s %s: %zu writes and %zu transfer events equal the model\n", mode.c_str(), name.c_str(), got.writes.size(), got.fills.size());
    }
    std::printf("%s: %zu writes of %zu captures equal the model\n", mode.c_str(), total, names.size());
    return 0;
}

int watsonMode(const fs::path& fixtures, const fs::path& captures, const fs::path& pinsFile, const std::vector<std::string>& names) {
    const Source source(captures);
    std::set<std::string> pinned;
    {
        std::ifstream in(pinsFile);
        CHECK(in.good());
        std::string set, cls, index;
        while (in >> set >> cls >> index) pinned.insert(set + " " + cls + " " + index);
    }
    std::set<std::string> found;
    size_t total = 0;
    for (const std::string& name : names) {
        const driverfix::Scenario s = driverfix::load(fixtures, name);
        const std::vector<Tagged> got = run(source, s, everything()).writes;
        for (uint32_t cls : {0u, 1u}) {
            std::vector<Tagged> native;
            for (const Tagged& w : got)
                if ((sequencerClass(w.address) ? 0u : 1u) == cls) native.push_back(w);
            std::vector<driverfix::Row> watson;
            for (const driverfix::Row& r : s.observed) {
                CHECK((sequencerClass(r.address) ? 0u : 1u) == r.id);
                if (r.id == cls) watson.push_back(r);
            }
            CHECK(native.size() == watson.size());
            for (size_t i = 0; i < native.size(); ++i) {
                if (native[i].address != watson[i].address || native[i].value != watson[i].value) {
                    std::fprintf(stderr, "%s class %u: write %zu differs: native %x=%x frame %u, Watson %x=%x frame %u\n", name.c_str(), cls, i, native[i].address,
                                 native[i].value, native[i].frame, watson[i].address, watson[i].value, watson[i].frame);
                    return 1;
                }
                if (native[i].frame == watson[i].frame) continue;
                if (native[i].frame + 1 != watson[i].frame) {
                    std::fprintf(stderr, "%s class %u: write %zu: native frame %u, Watson frame %u (only native one frame behind is a known shift)\n", name.c_str(), cls, i,
                                 native[i].frame, watson[i].frame);
                    return 1;
                }
                found.insert(name + " " + std::to_string(cls) + " " + std::to_string(i));
            }
            total += native.size();
        }
    }
    for (const std::string& f : found)
        if (!pinned.count(f)) {
            std::fprintf(stderr, "unpinned frame shift: %s\n", f.c_str());
            return 1;
        }
    for (const std::string& p : pinned)
        if (!found.count(p)) {
            std::fprintf(stderr, "stale frame shift pin: %s\n", p.c_str());
            return 1;
        }
    std::printf("scenario: %zu writes of %zu captures equal Watson's in address, value and order; %zu pinned writes sit one frame behind (a frame boundary between the handler entry and the write)\n",
                total, names.size(), found.size());
    return 0;
}

bool throws(const std::function<void()>& f) {
    try {
        f();
    } catch (const std::runtime_error&) {
        return true;
    }
    return false;
}

audio::DriverCommand command(uint32_t id, std::array<uint32_t, 5> words) {
    audio::DriverCommand c;
    c.frame = 1;
    c.id = id;
    c.words = words;
    return c;
}

std::unique_ptr<Driver> idleDriver(const Source& source, const audio::driver::Snapshot& snapshot) {
    EnvxFeed feed;
    feed.tick = [](uint32_t, uint32_t) -> uint16_t { return 0x7fff; };
    feed.allocation = [](uint32_t, uint32_t) -> uint16_t { return 0; };
    auto driver = std::make_unique<Driver>(snapshot, source.libsd, feed);
    driver->beginFrame(1);
    return driver;
}

int refusals(const fs::path& captures) {
    const Source source(captures);
    const audio::driver::Snapshot warm = audio::driver::loadSnapshot(captures / "hddosd-110U-sound-boot-b");
    {
        auto d = idleDriver(source, warm);
        CHECK(throws([&] { d->command(command(0x6ff0, {})); }));
        CHECK(throws([&] { d->command(command(0x1234, {})); }));
        CHECK(throws([&] { d->command(command(0x60c0, {0, 7, 0, 0, 0})); }));
        CHECK(throws([&] { d->command(command(0x60c0, {1, 9, 0, 0, 0})); }));
        CHECK(throws([&] { d->command(command(0x8070, {0xa, 1, 0, 0, 0})); }));
        CHECK(throws([&] { d->command(command(0x6120, {2, 1, 1, 0, 0})); }));
        CHECK(throws([&] { d->command(command(0x60d0, {0xffff, 1, 1, 0, 0})); }));
    }
    {
        auto d = idleDriver(source, warm);
        d->command(command(0x60c0, {0, 10, 0, 0, 0}));
        CHECK(d->takeWrites().empty());
        d->command(command(0x8070, {0xa, 0, 0, 0, 0}));
        CHECK(d->takeWrites().size() == 3);
    }
    {
        auto clean = idleDriver(source, warm);
        auto after = idleDriver(source, warm);
        after->command(command(0x6300, {1, 0x7fff, 0, 0, 0}));
        after->command(command(0x6300, {1, 0xffff, 0, 0, 0}));
        CHECK(after->takeWrites().empty());
        clean->command(command(0x6300, {1, 0, 0, 0, 0}));
        after->command(command(0x6300, {1, 0, 0, 0, 0}));
        const audio::WriteStream a = clean->takeWrites();
        const audio::WriteStream b = after->takeWrites();
        CHECK(!a.empty());
        CHECK(!audio::firstDifference(a, b).has_value());
    }
    std::printf("refusals: unknown ids, effect modes 7 to 9, SPDIF mode 1 and bad cores are refused; an out-of-range effect writes nothing and changes nothing\n");
    return 0;
}

int tickRefusals(const fs::path& captures) {
    const Source source(captures);
    const audio::driver::Snapshot warm = audio::driver::loadSnapshot(captures / "hddosd-110U-sound-boot-b");
    constexpr int64_t slotsOffset = 0x9ed0;
    int playing = -1;
    for (int i = 0; i < 24 && playing < 0; ++i) {
        const size_t slot = size_t(slotsOffset + 0x44 * i);
        if (assets::le16(warm.osdsnd, slot + 0x26) == 1 && assets::le16(warm.osdsnd, slot + 0x28) == 1) playing = i;
    }
    CHECK(playing >= 0);
    for (const auto& [status, data1] : {std::pair<uint8_t, uint8_t>{0xe0, 0}, std::pair<uint8_t, uint8_t>{0xb0, 11}}) {
        audio::driver::Snapshot patched = warm;
        const size_t slot = size_t(slotsOffset + 0x44 * playing);
        for (size_t k = 0; k < 4; ++k) patched.osdsnd[slot + 4 + k] = 0;
        const int64_t event = int64_t(assets::le32(patched.osdsnd, slot + 0x18)) + assets::le32(patched.osdsnd, slot + 0x14) - audio::driver::kSoundIopBase;
        CHECK(event >= 0 && size_t(event) + 3 <= patched.iop.size());
        patched.iop[size_t(event)] = status;
        patched.iop[size_t(event) + 1] = data1;
        auto d = idleDriver(source, patched);
        CHECK(throws([&] { d->tick(); }));
    }
    std::printf("tick refusals: pitch bend and an unmodelled controller are refused\n");
    return 0;
}

}

int main(int argc, char** argv) try {
    if (argc < 3) return 2;
    const std::string mode = argv[1];
    if (mode == "skip") {
        std::printf("SKIPPED: %s\n", argv[2]);
        return 77;
    }
    if (mode == "refuse") return refusals(argv[2]);
    if (mode == "refuse-tick") return tickRefusals(argv[2]);
    if (argc < 5) return 2;
    std::vector<std::string> names;
    for (int i = 4; i < argc; ++i) names.push_back(argv[i]);
    if (mode == "scenario") return watsonMode(argv[2], argv[3], argv[4], std::vector<std::string>(names.begin() + 1, names.end()));
    return modelMode(mode, argv[2], argv[3], names);
}
catch (const std::exception& e) {
    std::fprintf(stderr, "refused: %s\n", e.what());
    return 1;
}
