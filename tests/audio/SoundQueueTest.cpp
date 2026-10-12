#include <cstdio>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "../Check.hpp"
#include "Audio/EeSoundQueue.hpp"

using audio::EeSoundQueue;
using audio::SoundCommand;

namespace {

int unitCases() {
    {
        EeSoundQueue q(EeSoundQueue::kRampSteps);
        int accepted = 0;
        for (int i = 0; i < 130; ++i) accepted += q.enqueue({0x6300, 1, static_cast<uint16_t>(i + 1), 0}) ? 1 : 0;
        CHECK(accepted == 128);
        const auto sends = q.drain();
        CHECK(sends.size() == 128);
        for (size_t i = 0; i < sends.size(); ++i) CHECK(sends[i].a2 == i + 1);
        CHECK(q.enqueue({0x6300, 1, 9, 0}));
    }
    {
        EeSoundQueue q(EeSoundQueue::kRampSteps);
        q.enqueue({0x6300, 1, 6, 0});
        q.enqueue({0x6300, 1, 6, 0});
        q.enqueue({0x6300, 1, 6, 0});
        CHECK(q.drain().size() == 1);
        q.enqueue({0x6300, 1, 6, 0});
        CHECK(q.drain().size() == 1);
        q.enqueue({0x6300, 1, 5, 0});
        q.enqueue({0x6140, 1, 7, 0});
        q.enqueue({0x6300, 1, 7, 0});
        q.enqueue({0x6300, 1, 5, 0});
        const auto sends = q.drain();
        CHECK(sends.size() == 3);
        CHECK(sends[0].a2 == 5 && sends[1].id == 0x6140 && sends[2].a2 == 5);
    }
    {
        EeSoundQueue q;
        CHECK(q.drain().empty());
        auto first = q.drain();
        CHECK(first.size() == 1 && first[0] == (SoundCommand{0x60D0, 1, 0, 0}));
        auto second = q.drain();
        CHECK(second.size() == 1 && second[0] == (SoundCommand{0x60D0, 1, 0x158, 0x158}));
        size_t ramps = 2;
        for (int i = 0; i < 20; ++i) {
            const auto sends = q.drain();
            ramps += sends.size();
            if (sends.empty()) continue;
            CHECK(sends[0].id == 0x60D0 && sends[0].a2 == sends[0].a3);
            if (ramps == 15) CHECK(sends[0].a2 == 0x12D0);
        }
        CHECK(ramps == 15);
    }
    {
        EeSoundQueue q;
        q.enqueue({0x6140, 0, 0, 0});
        const uint16_t a2 = q.carriedA2(), a3 = q.carriedA3();
        q.drain();
        q.drain();
        CHECK(q.carriedA2() == a2 && q.carriedA3() == a3);
    }
    {
        EeSoundQueue q(EeSoundQueue::kRampSteps);
        q.enqueue({0x6300, 1, 4, 0});
        CHECK(q.carriedA3() == 0x0658 && q.carriedA2() == 0x065C);
        q.enqueue({0x6300, 1, 4, 0});
        CHECK(q.carriedA3() == 0x0660 && q.carriedA2() == 0x0664);
        for (int i = 0; i < 126; ++i) q.enqueue({0x6140, 0, 0, 0});
        const uint16_t a3 = q.carriedA3();
        CHECK(!q.enqueue({0x6140, 0, 0, 0}));
        CHECK(q.carriedA3() == a3 && a3 == 0x0658 + 8 * 127);
    }
    return 0;
}

struct Totals {
    size_t queued = 0, sent = 0, drains = 0;
};

int replay(const std::filesystem::path& file, Totals& totals) {
    std::ifstream in(file);
    CHECK(in.good());
    std::string text;
    std::string name;
    int32_t counter = 0;
    int64_t align = -1;
    std::getline(in, text);
    name = text.substr(8);
    std::getline(in, text);
    counter = std::stoi(text.substr(8));
    std::getline(in, text);
    align = std::stoll(text.substr(6));
    EeSoundQueue q(counter);
    if (align >= 0) {
        for (int64_t i = 0; i < (align & 127); ++i) q.enqueue({1, 0, 0, 0});
        q.drain();
    }
    std::string row;
    size_t drains = 0;
    bool previousWasQ = false;
    uint16_t beforeA2 = 0, beforeA3 = 0;
    const bool clockBoot = name.find("sound-clock-boot") != std::string::npos;
    const bool square = name.find("sound-menu-square") != std::string::npos;
    while (std::getline(in, row)) {
        std::istringstream words(row);
        std::string tag;
        words >> tag;
        if (tag == "Q") {
            unsigned a0, a1, a2, a3;
            long long head;
            words >> a0 >> a1 >> a2 >> a3 >> head;
            if (previousWasQ && clockBoot && a0 == 0x6140) CHECK(a2 == beforeA2 && a3 == beforeA3);
            if (previousWasQ && square) CHECK(a3 == beforeA3);
            CHECK(q.enqueue({static_cast<uint16_t>(a0), static_cast<uint16_t>(a1), static_cast<uint16_t>(a2), static_cast<uint16_t>(a3)}));
            if (head >= 0) {
                CHECK(q.carriedA3() == static_cast<uint16_t>(0x0658 + 8 * (head & 127)));
                CHECK(q.carriedA2() == static_cast<uint16_t>(0x065C + 8 * (head & 127)));
            }
            if (a0 != 0) totals.queued += 1;
            if (a0 != 0x60D0) { beforeA2 = q.carriedA2(); beforeA3 = q.carriedA3(); }
            previousWasQ = true;
        } else if (tag == "D") {
            previousWasQ = false;
            std::vector<SoundCommand> want;
            while (std::getline(in, row) && row != ".") {
                std::istringstream sent(row);
                std::string s;
                unsigned a0, a1, a2, a3;
                sent >> s >> a0 >> a1 >> a2 >> a3;
                want.push_back({static_cast<uint16_t>(a0), static_cast<uint16_t>(a1), static_cast<uint16_t>(a2), static_cast<uint16_t>(a3)});
            }
            const auto got = q.drain();
            if (got != want) {
                std::fprintf(stderr, "%s: drain %zu: want %zu sends, got %zu\n", name.c_str(), drains, want.size(), got.size());
                return 1;
            }
            totals.sent += got.size();
            drains += 1;
        }
    }
    totals.drains += drains;
    return 0;
}

}

int main(int argc, char** argv) {
    if (int rc = unitCases()) return rc;
    if (argc < 3) return 0;
    const std::filesystem::path dir = argv[1];
    size_t allSent = 0;
    for (int i = 2; i < argc; ++i) {
        Totals totals;
        if (int rc = replay(dir / (std::string(argv[i]) + ".queue.txt"), totals)) return rc;
        allSent += totals.sent;
        std::printf("%s: %zu drains, %zu queued, %zu sent\n", argv[i], totals.drains, totals.queued, totals.sent);
        if (std::string(argv[i]) == "hddosd-110U-sound-ee-queue") CHECK(totals.queued - totals.sent == 1);
    }
    CHECK(allSent > 0);
    return 0;
}
