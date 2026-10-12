#include <cstdio>
#include <fstream>
#include <algorithm>
#include <cstring>
#include <filesystem>
#include <string>

#include "../Check.hpp"
#include <nlohmann/json.hpp>

#include "Audio/data/HdBank.hpp"
#include "Audio/data/SndImage.hpp"
#include "Audio/data/SqSequence.hpp"

namespace fs = std::filesystem;
using assets::Bytes;

namespace {

bool sameBytes(const Bytes& a, const Bytes& b) { return a.size() == b.size() && std::memcmp(a.data(), b.data(), a.size()) == 0; }

int imageMatchesModel(const fs::path& model, const fs::path& dumps, const fs::path& captures) {
    const audio::data::SndImage hdd = audio::data::SndImage::fromFolder(dumps);
    const Bytes rom = assets::readFile(model / "bios-SNDIMAGE.member");
    const audio::data::SndImage plain = audio::data::SndImage::fromContainer(rom);
    for (std::string_view name : audio::data::kSoundMembers) {
        const std::string file = std::string(name) + ".expanded";
        CHECK(sameBytes(hdd.member(name), assets::readFile(model / "hdd-SNDIMAGE" / file)));
        CHECK(sameBytes(plain.member(name), assets::readFile(model / "bios-SNDIMAGE" / file)));
    }
    if (!captures.empty()) {
        const Bytes ram = assets::readFile(captures / "hddosd-110U-sound-hide.start.spuram.bin");
        const Bytes mine = hdd.spuRam();
        CHECK(mine.size() == audio::data::kSpuRamSize && ram.size() == audio::data::kSpuRamSize);
        const Bytes& boot = hdd.member("SNDBOOTB");
        const Bytes& osdd = hdd.member("SNDOSDDB");
        CHECK(std::memcmp(mine.data() + audio::data::kBootBodyAt, ram.data() + audio::data::kBootBodyAt, boot.size()) == 0);
        CHECK(std::memcmp(mine.data() + audio::data::kOsddBodyAt, ram.data() + audio::data::kOsddBodyAt, osdd.size()) == 0);
    }
    std::printf("image: 12 members of the HDD and ROM images equal the model, SPU RAM bodies equal the capture's\n");
    return 0;
}

int robust() {
    const Bytes junk(64, 0);
    try {
        audio::data::SndImage::fromContainer(junk);
        CHECK(false);
    } catch (const std::runtime_error&) {
    }
    try {
        audio::data::SndImage::fromFolder(fs::path("does-not-exist"));
        CHECK(false);
    } catch (const std::exception&) {
    }
    std::printf("robust: a container with no directory and a missing folder are refused\n");
    return 0;
}

int hdMatchesModel(const fs::path& banks, const fs::path& dumps) {
    const audio::data::SndImage image = audio::data::SndImage::fromFolder(dumps);
    size_t tones = 0, effects = 0;
    for (const auto& [file, member] : {std::pair{"hd-BOOT.json", "SNDBOOTH"}, std::pair{"hd-OSDD.json", "SNDOSDDH"}}) {
        std::ifstream in(banks / file);
        const nlohmann::json want = nlohmann::json::parse(in);
        const audio::data::HdBank bank = audio::data::HdBank::parse(image.member(member));
        CHECK(bank.programs.size() == want.at("programs").size());
        for (size_t p = 0; p < bank.programs.size(); ++p) {
            const auto& wp = want.at("programs")[p];
            const auto& a = bank.programs[p];
            CHECK(a.id == wp.at("id").get<int>() && a.head == wp.at("head").get<int>() && a.volume == wp.at("volume").get<int>());
            CHECK(a.pan == wp.at("pan").get<int>() && a.offset == wp.at("offset").get<size_t>());
            CHECK(a.tones.size() == wp.at("tones").size());
            for (size_t t = 0; t < a.tones.size(); ++t) {
                const auto& x = a.tones[t];
                const auto& w = wp.at("tones")[t];
                CHECK(x.keyLow == w.at("keyLow").get<int>() && x.keyHigh == w.at("keyHigh").get<int>() && x.rootKey == w.at("rootKey").get<int>());
                CHECK(x.fineTune == w.at("fineTune").get<int>() && x.sampleStart == w.at("sampleStart").get<int>());
                CHECK(x.adsr1 == w.at("adsr1").get<int>() && x.adsr2 == w.at("adsr2").get<int>());
                CHECK(x.pan == w.at("pan").get<int>() && x.bendRange == w.at("bendRange").get<int>() && x.flags == w.at("flags").get<int>());
                ++tones;
            }
        }
        if (want.at("velocity").is_null()) {
            CHECK(bank.velocity.empty());
        } else {
            CHECK(bank.velocity.size() == want.at("velocity").size());
            for (size_t v = 0; v < bank.velocity.size(); ++v) CHECK(bank.velocity[v] == want.at("velocity")[v].get<int>());
        }
        if (want.at("effects").is_null()) {
            CHECK(!bank.effectTable && bank.effects.empty());
        } else {
            CHECK(bank.effectTable && *bank.effectTable == want.at("effectTable").get<uint32_t>());
            CHECK(bank.effectMaster == want.at("effectMaster").get<int>());
            CHECK(bank.effects.size() == want.at("effects").size());
            for (size_t n = 0; n < bank.effects.size(); ++n) {
                const auto& e = bank.effects[n];
                const auto& w = want.at("effects")[n];
                CHECK(e.left == w.at("left").get<int>() && e.right == w.at("right").get<int>() && e.pitch == w.at("pitch").get<int>() && e.flagsA == w.at("flagsA").get<int>());
                CHECK(e.adsr1 == w.at("adsr1").get<int>() && e.adsr2 == w.at("adsr2").get<int>() && e.word12 == w.at("word12").get<int>() && e.word14 == w.at("word14").get<int>());
                CHECK(e.bdOffset == w.at("bdOffset").get<uint32_t>());
                ++effects;
            }
        }
        CHECK(bank.program(0xFE) == nullptr);
    }
    CHECK(tones > 0 && effects > 0);
    std::printf("hd: BOOT and OSDD programs, %zu tones, velocity and %zu effects equal sound_banks.mjs\n", tones, effects);
    return 0;
}

int hdRobust() {
    Bytes bank(0x30, 0);
    std::memcpy(bank.data() + 0xC, "SShd", 4);
    bank[0x10] = 0x80;
    bank[0x14] = bank[0x15] = bank[0x16] = bank[0x17] = 0xFF;
    bank[0x2C] = bank[0x2D] = bank[0x2E] = bank[0x2F] = 0xFF;
    try {
        audio::data::HdBank::parse(bank);
        CHECK(false);
    } catch (const std::runtime_error&) {
    }
    try {
        audio::data::HdBank::parse(Bytes(8, 0));
        CHECK(false);
    } catch (const std::runtime_error&) {
    }
    Bytes late(0x40, 0);
    std::memcpy(late.data() + 0xC, "SShd", 4);
    late[0x10] = 0x30;
    late[0x30] = 0;
    late[0x32] = 0x0A;
    late[0x14] = late[0x15] = late[0x16] = late[0x17] = 0xFF;
    late[0x2C] = late[0x2D] = late[0x2E] = late[0x2F] = 0xFF;
    late[0x38] = 0xFF;
    try {
        audio::data::HdBank::parse(late);
        CHECK(false);
    } catch (const std::runtime_error&) {
    }
    Bytes skipped(0x40, 0);
    std::memcpy(skipped.data() + 0xC, "SShd", 4);
    skipped[0x10] = 0x30;
    skipped[0x14] = skipped[0x15] = skipped[0x16] = skipped[0x17] = 0xFF;
    skipped[0x2C] = skipped[0x2D] = skipped[0x2E] = skipped[0x2F] = 0xFF;
    skipped[0x30] = 0;
    skipped[0x32] = skipped[0x33] = 0xFF;
    const audio::data::HdBank none = audio::data::HdBank::parse(skipped);
    CHECK(none.programs.empty() && none.effects.empty() && none.velocity.empty());
    std::printf("hdRobust: a table past the end, a short bank and a program past the end are refused; a 0xFFFF program is skipped\n");
    return 0;
}

int sqMatchesModel(const fs::path& banks, const fs::path& dumps) {
    const audio::data::SndImage image = audio::data::SndImage::fromFolder(dumps);
    size_t events = 0, tempos = 0;
    for (const char* name : {"SNDBOOTS", "SNDTNNLS", "SNDCLOKS", "SNDTM30S", "SNDTM60S", "SNDLOGOS", "SNDWARNS", "SNDRCLKS"}) {
        std::ifstream in(banks / (std::string("sq-") + name + ".json"));
        const nlohmann::json want = nlohmann::json::parse(in);
        const audio::data::SqSequence seq = audio::data::SqSequence::parse(image.member(name));
        CHECK(seq.volume == want.at("volume").get<int>() && seq.resolution == want.at("resolution").get<int>() && seq.tempo == want.at("tempo").get<uint32_t>());
        CHECK(seq.channels.size() == want.at("channels").size());
        for (size_t c = 0; c < seq.channels.size(); ++c) {
            const auto& w = want.at("channels")[c];
            CHECK(seq.channels[c].channel == w.at("channel").get<int>() && seq.channels[c].program == w.at("program").get<int>());
            CHECK(seq.channels[c].volume == w.at("volume").get<int>() && seq.channels[c].pan == w.at("pan").get<int>());
        }
        CHECK(seq.events.size() == want.at("events").size());
        for (size_t e = 0; e < seq.events.size(); ++e) {
            const auto& x = seq.events[e];
            const auto& w = want.at("events")[e];
            const auto& d = w.at("data");
            CHECK(x.tick == w.at("tick").get<uint32_t>() && x.status == w.at("status").get<int>());
            CHECK(x.data1 == d[0].get<int>());
            if (x.status == 0xFF && x.data1 == 0x51) {
                CHECK(x.tempo == (d[1].get<uint32_t>() | d[2].get<uint32_t>() << 8 | d[3].get<uint32_t>() << 16));
                ++tempos;
            } else if (x.status == 0xFF) {
                CHECK(d.size() == 1 && x.tempo == 0);
            } else {
                CHECK(d.size() == (x.hasData2 ? 2u : 1u) && (!x.hasData2 || x.data2 == d[1].get<int>()) && x.tempo == 0);
            }
            ++events;
        }
    }
    CHECK(events > 0 && tempos > 0);
    const audio::data::SqSequence clock = audio::data::SqSequence::parse(image.member("SNDCLOKS"));
    CHECK(clock.volume == 100 && clock.resolution == 480 && clock.tempo == 120 && clock.channels.size() == 7 && clock.events.size() == 278);
    std::printf("sq: 8 sequences, %zu events, %zu tempo events equal sound_banks.mjs; SNDCLOKS has 278 events and volume 100%s", events, tempos, "\n");
    return 0;
}

int sqRobust() {
    Bytes seq(0x20, 0);
    std::memcpy(seq.data() + 0xC, "SSsq", 4);
    try {
        audio::data::SqSequence::parse(seq);
        CHECK(false);
    } catch (const std::runtime_error&) {
    }
    const auto sequenceWith = [](std::initializer_list<uint8_t> body, size_t padTo) {
        Bytes data(0x110, 0);
        std::memcpy(data.data() + 0xC, "SSsq", 4);
        data.insert(data.end(), body.begin(), body.end());
        data.resize(std::max(data.size(), padTo), 0);
        return data;
    };
    const auto refused = [](const Bytes& data) {
        try {
            audio::data::SqSequence::parse(data);
        } catch (const std::runtime_error&) {
            return true;
        }
        return false;
    };
    CHECK(refused(sequenceWith({0x90, 60, 100}, 0)));
    CHECK(refused(sequenceWith({0x90, 60, 100, 0x00, 0x90, 60}, 0)));
    CHECK(refused(sequenceWith({0x90, 60, 100, 0x81, 0x81, 0x81, 0x81, 0x01}, 0)));
    CHECK(refused(sequenceWith({0xFF, 0x7F}, 0)));
    CHECK(refused(sequenceWith({0x00}, 0)));
    CHECK(refused(sequenceWith({0xFF, 0x51, 1}, 0)));
    const audio::data::SqSequence ok = audio::data::SqSequence::parse(sequenceWith({0x90, 60, 100, 0x10, 0x80, 60, 0, 0x00, 0xFF, 0x2F}, 0));
    CHECK(ok.events.size() == 3 && ok.events[1].tick == 0x10 && ok.events[2].status == 0xFF && ok.events[2].data1 == 0x2F);
    std::printf("sqRobust: a header-only sequence, no end marker, a cut event, a long VLQ, an unknown meta and a status-less event are refused%s", "\n");
    return 0;
}

}

int main(int argc, char** argv) {
    const std::string mode = argc > 1 ? argv[1] : "";
    if (mode == "robust") return robust();
    if (mode == "image" && argc > 3) return imageMatchesModel(argv[2], argv[3], argc > 4 ? fs::path(argv[4]) : fs::path());
    if (mode == "hd" && argc > 3) return hdMatchesModel(argv[2], argv[3]);
    if (mode == "hdRobust") return hdRobust();
    if (mode == "sq" && argc > 3) return sqMatchesModel(argv[2], argv[3]);
    if (mode == "sqRobust") return sqRobust();
    return 2;
}
