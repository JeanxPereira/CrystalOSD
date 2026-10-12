#include <cstdio>
#include <cstring>
#include <string>

#include "../Check.hpp"
#include "Audio/data/HdBank.hpp"
#include "Audio/data/SqSequence.hpp"

using assets::Bytes;

namespace {

void put16(Bytes& b, size_t at, uint16_t v) {
    b[at] = uint8_t(v);
    b[at + 1] = uint8_t(v >> 8);
}
void put32(Bytes& b, size_t at, uint32_t v) {
    put16(b, at, uint16_t(v));
    put16(b, at + 2, uint16_t(v >> 16));
}
uint16_t get16(const Bytes& b, size_t at) { return uint16_t(b[at] | b[at + 1] << 8); }

Bytes emptyBank(size_t size) {
    Bytes b(size, 0);
    std::memcpy(b.data() + 0xC, "SShd", 4);
    put32(b, 0x10, 0xFFFFFFFF);
    put32(b, 0x14, 0xFFFFFFFF);
    put32(b, 0x2C, 0xFFFFFFFF);
    return b;
}

template <class F>
bool refused(F&& f) {
    try {
        f();
    } catch (const std::runtime_error&) {
        return true;
    }
    return false;
}

int hdFields() {
    Bytes b = emptyBank(0x700);
    put32(b, 0x10, 0x100);
    put32(b, 0x14, 0x200);
    put32(b, 0x2C, 0x300);
    put16(b, 0x100, 2);
    put16(b, 0x102, 0x10);
    put16(b, 0x104, 0xFFFF);
    put16(b, 0x106, 0x50);
    b[0x110] = 0x01;
    b[0x111] = 0x21;
    b[0x112] = 0x22;
    for (size_t t = 0; t < 2; ++t)
        for (size_t i = 0; i < 16; ++i) b[0x118 + 16 * t + i] = uint8_t((t ? 0x60 : 0x30) + i);
    b[0x118 + 3] = 0xF0;
    b[0x128 + 3] = 0x05;
    b[0x150] = 0x80;
    b[0x151] = 0x41;
    b[0x152] = 0x42;
    for (size_t i = 0; i < 16; ++i) b[0x158 + i] = uint8_t(0x90 + i);
    for (size_t i = 0; i < 128; ++i) b[0x202 + i] = uint8_t(i * 3 + 1);
    b[0x300] = 0x64;
    for (size_t n = 0; n < 15; ++n)
        for (size_t i = 0; i < 20; ++i) b[0x320 + 64 * n + i] = uint8_t(n * 20 + i * 7 + 1);

    const audio::data::HdBank bank = audio::data::HdBank::parse(b);
    CHECK(bank.programs.size() == 2);
    const audio::data::Program& p0 = bank.programs[0];
    CHECK(p0.id == 0 && p0.head == 0x01 && p0.volume == 0x21 && p0.pan == 0x22 && p0.offset == 0x110 && p0.tones.size() == 2);
    for (size_t t = 0; t < 2; ++t) {
        const audio::data::Tone& x = p0.tones[t];
        const size_t o = 0x118 + 16 * t;
        CHECK(x.keyLow == b[o] && x.keyHigh == b[o + 1] && x.rootKey == b[o + 2]);
        CHECK(x.sampleStart == get16(b, o + 4) && x.adsr1 == get16(b, o + 6) && x.adsr2 == get16(b, o + 8));
        CHECK(x.pan == b[o + 11] && x.bendRange == b[o + 13] && x.flags == b[o + 15]);
    }
    CHECK(p0.tones[0].fineTune == -16 && p0.tones[1].fineTune == 5);
    CHECK(p0.tones[0].keyLow == 0x30 && p0.tones[0].pan == 0x3B && p0.tones[0].bendRange == 0x3D && p0.tones[0].flags == 0x3F);
    CHECK(bank.program(1) == nullptr);
    const audio::data::Program* p2 = bank.program(2);
    CHECK(p2 && p2->head == 0x80 && p2->volume == 0x41 && p2->pan == 0x42 && p2->offset == 0x150 && p2->tones.size() == 1);
    CHECK(p2->tones[0].keyLow == 0x90 && p2->tones[0].bendRange == 0x9D && p2->tones[0].flags == 0x9F && p2->tones[0].fineTune == int8_t(0x93));
    CHECK(bank.velocity.size() == 128);
    for (size_t i = 0; i < 128; ++i) CHECK(bank.velocity[i] == uint8_t(i * 3 + 1));
    CHECK(bank.effectTable && *bank.effectTable == 0x300 && bank.effectMaster == 0x64);
    CHECK(bank.effects.size() == 14);
    for (size_t n = 0; n < 14; ++n) {
        const audio::data::Effect& e = bank.effects[n];
        const size_t o = 0x320 + 64 * n;
        CHECK(e.left == get16(b, o) && e.right == get16(b, o + 2) && e.pitch == get16(b, o + 4) && e.flagsA == get16(b, o + 6));
        CHECK(e.adsr1 == get16(b, o + 8) && e.adsr2 == get16(b, o + 10) && e.word12 == get16(b, o + 12) && e.word14 == get16(b, o + 14));
        CHECK(e.bdOffset == (uint32_t(get16(b, o + 16)) | uint32_t(get16(b, o + 18)) << 16));
    }
    std::printf("hdFields: every program, tone, velocity and effect field read from its own byte of a synthetic bank\n");
    return 0;
}

int hdBounds() {
    {
        Bytes b = emptyBank(0x38);
        put32(b, 0x10, 0x20);
        put16(b, 0x20, 0);
        put16(b, 0x22, 0x08);
        b[0x28] = 0x01;
        CHECK(refused([&] { audio::data::HdBank::parse(b); }));
        b[0x28] = 0x00;
        CHECK(refused([&] { audio::data::HdBank::parse(b); }));
        b.resize(0x3C);
        b[0x28] = 0x01;
        CHECK(refused([&] { audio::data::HdBank::parse(b); }));
        b[0x28] = 0x00;
        CHECK(refused([&] { audio::data::HdBank::parse(b); }));
        b.resize(0x40);
        CHECK(!refused([&] { audio::data::HdBank::parse(b); }));
    }
    {
        Bytes b = emptyBank(0x40);
        put32(b, 0x14, 0x20 + 0x10 - 2);
        CHECK(refused([&] { audio::data::HdBank::parse(b); }));
        Bytes big = emptyBank(0x100);
        put32(big, 0x14, 0x20);
        CHECK(!refused([&] { audio::data::HdBank::parse(big); }));
    }
    {
        Bytes b = emptyBank(0x40);
        put32(b, 0x2C, 0x40);
        CHECK(refused([&] { audio::data::HdBank::parse(b); }));
        put32(b, 0x2C, 0x3F);
        const audio::data::HdBank bank = audio::data::HdBank::parse(b);
        CHECK(bank.effects.empty() && bank.effectTable && *bank.effectTable == 0x3F);
    }
    {
        Bytes b = emptyBank(0x40);
        put32(b, 0x10, 0x20);
        put16(b, 0x20, 0xFFFF);
        CHECK(refused([&] { audio::data::HdBank::parse(b); }));
        put32(b, 0x10, 0x40);
        CHECK(refused([&] { audio::data::HdBank::parse(b); }));
    }
    std::printf("hdBounds: a tone, velocity table, effect master, program entry and program table past the end are refused\n");
    return 0;
}

Bytes sequence(const Bytes& events) {
    Bytes b(0x110, 0);
    std::memcpy(b.data() + 0xC, "SSsq", 4);
    put16(b, 0, 0x1234);
    put16(b, 2, 0x01E0);
    put32(b, 4, 0x000A1B2C);
    for (size_t c = 0; c < 16; ++c) b[0x10 + 16 * c + 2] = 0xFF;
    b[0x10 + 1] = 5;
    b[0x10 + 2] = 0x20;
    b[0x10 + 3] = 0x30;
    b[0x10 + 4] = 0x40;
    b[0x30 + 1] = 7;
    b[0x30 + 2] = 0x21;
    b[0x30 + 3] = 0x31;
    b[0x30 + 4] = 0x41;
    b.insert(b.end(), events.begin(), events.end());
    return b;
}

int sqFields() {
    const Bytes data = sequence({0xB0, 0x63, 0x14, 0x00,
                                 0x90, 0x3C, 0x64, 0x83, 0x60,
                                 0x3E, 0x65, 0x81, 0x80, 0x00,
                                 0xC0, 0x2A, 0x7F,
                                 0xD1, 0x55, 0x05,
                                 0xFF, 0x51, 0x11, 0x22, 0x33,
                                 0xB0, 0x63, 0x1E, 0x00,
                                 0x64, 0x28, 0x00,
                                 0xFF, 0x2F});
    const audio::data::SqSequence seq = audio::data::SqSequence::parse(data);
    CHECK(seq.volume == 0x1234 && seq.resolution == 0x01E0 && seq.tempo == 0x000A1B2C);
    CHECK(seq.channels.size() == 2);
    CHECK(seq.channels[0].channel == 5 && seq.channels[0].program == 0x20 && seq.channels[0].volume == 0x30 && seq.channels[0].pan == 0x40);
    CHECK(seq.channels[1].channel == 7 && seq.channels[1].program == 0x21 && seq.channels[1].volume == 0x31 && seq.channels[1].pan == 0x41);
    CHECK(seq.events.size() == 9);
    const auto& e = seq.events;
    CHECK(e[0].tick == 0 && e[0].status == 0xB0 && e[0].data1 == 0x63 && e[0].data2 == 0x14 && e[0].hasData2);
    CHECK(e[1].tick == 0 && e[1].status == 0x90 && e[1].data1 == 0x3C && e[1].data2 == 0x64);
    CHECK(e[2].tick == 480 && e[2].status == 0x90 && e[2].data1 == 0x3E && e[2].data2 == 0x65 && e[2].hasData2);
    CHECK(e[3].tick == 480 + 16384 && e[3].status == 0xC0 && e[3].data1 == 0x2A && !e[3].hasData2 && e[3].data2 == 0);
    CHECK(e[4].tick == 480 + 16384 + 127 && e[4].status == 0xD1 && e[4].data1 == 0x55 && !e[4].hasData2);
    CHECK(e[5].tick == 480 + 16384 + 127 + 5 && e[5].status == 0xFF && e[5].data1 == 0x51 && e[5].tempo == 0x332211);
    CHECK(e[6].tick == e[5].tick && e[6].status == 0xB0 && e[6].data1 == 0x63 && e[6].data2 == 0x1E);
    CHECK(e[7].tick == e[5].tick && e[7].status == 0xB0 && e[7].data1 == 0x64 && e[7].data2 == 0x28);
    CHECK(e[8].tick == e[5].tick && e[8].status == 0xFF && e[8].data1 == 0x2F);
    const audio::data::SqSequence longVlq = audio::data::SqSequence::parse(sequence({0x90, 0x3C, 0x64, 0x81, 0x80, 0x80, 0x00, 0x80, 0x3C, 0x00, 0x00, 0xFF, 0x2F}));
    CHECK(longVlq.events.size() == 3 && longVlq.events[1].tick == (1u << 21));
    CHECK(refused([&] { audio::data::SqSequence::parse(sequence({0x90, 0x3C, 0x64, 0x81, 0x80, 0x80, 0x80, 0x00, 0xFF, 0x2F})); }));
    CHECK(refused([&] { audio::data::SqSequence::parse(sequence({0xFF, 0x7F, 0xAA, 0xBB, 0xCC, 0xFF, 0x2F})); }));
    CHECK(refused([&] { audio::data::SqSequence::parse(sequence({0xFF, 0x51, 0x11, 0x22})); }));
    CHECK(refused([&] { audio::data::SqSequence::parse(sequence({0x90, 0x3C, 0x64, 0x00})); }));
    std::printf("sqFields: header, channel records, running status, one-byte events, tempo meta, VLQs and loop markers of a synthetic sequence\n");
    return 0;
}

}

int main(int argc, char** argv) {
    const std::string mode = argc > 1 ? argv[1] : "";
    if (mode == "hdFields") return hdFields();
    if (mode == "hdBounds") return hdBounds();
    if (mode == "sqFields") return sqFields();
    return 2;
}
