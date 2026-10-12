#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#include "../Check.hpp"
#include "FixtureReader.hpp"
#include "Audio/spu2/Adpcm.hpp"
#include "Audio/spu2/Gauss.hpp"
#include "Spu2Replay.hpp"
#include "Audio/spu2/Spu2.hpp"

namespace fs = std::filesystem;

namespace {

int decodeTest() {
    using namespace audio::spu2;
    const Where kill = decode(0x1F9005A4);
    CHECK(kill.core == 1 && kill.kind == Kind::Core && kill.reg == 0x1A4);
    const Where pitch = decode(0x1F900454);
    CHECK(pitch.core == 1 && pitch.kind == Kind::Voice && pitch.voice == 5 && pitch.reg == 4);
    const Where address = decode(0x1F9001C0 + 12 * 3 + 4);
    CHECK(address.core == 0 && address.kind == Kind::VoiceAddress && address.voice == 3 && address.reg == 4);
    CHECK(decode(0x1F9002E4).kind == Kind::Reverb);
    CHECK(decode(0x1F900760).kind == Kind::Reverb && decode(0x1F900788).core == 1);
    CHECK(decode(0x1F900348).kind == Kind::Unknown);
    CHECK(isStatus(0x1F90000A));
    CHECK(!isStatus(0x1F9001C0) && isStatus(0x1F9001C8) && isStatus(0x1F9001CA));
    CHECK(isStatus(0x1F900340) && isStatus(0x1F9001A0) && isStatus(0x1F900770));
    CHECK(!isStatus(0x1F900004) && !isStatus(0x1F90019A));
    bool thrown = false;
    try {
        decode(0x1F910000);
    } catch (const std::out_of_range&) {
        thrown = true;
    }
    CHECK(thrown);
    std::printf("decode: core, voice and register ranges, status registers, out of range refused\n");
    return 0;
}

int quirks() {
    using namespace audio::spu2;
    Spu2 spu;
    spu.write(0x1F9001C0, 0xFFFF);
    spu.write(0x1F9001C2, 0xFFFF);
    CHECK(spu.read(0x1F9001C0) == 0x000F && spu.read(0x1F9001C2) == 0xFFF8);
    CHECK(spu.voice(0, 0).startAddress == 0xFFFF8);
    spu.write(0x1F9001C8, 0x0001);
    spu.write(0x1F9001CA, 0x0012);
    CHECK(spu.voice(0, 0).nextAddress == 0x10011);
    spu.write(0x1F900004, 0x0123);
    CHECK(spu.read(0x1F900004) == 0x0123 && spu.voice(0, 0).pitch == 0x0123);
    spu.write(0x1F900000, 0x2000);
    CHECK(spu.voice(0, 0).left.level == 0x4000);
    spu.write(0x1F900002, 0x8000);
    CHECK(spu.voice(0, 0).right.level == 0 && spu.voice(0, 0).right.reg == 0x8000);
    spu.write(0x1F9001A8, 0x0001);
    spu.write(0x1F9001AA, 0x2340);
    spu.write(0x1F9001AC, 0xBEEF);
    spu.write(0x1F9001AC, 0xCAFE);
    CHECK(spu.ram()[2 * 0x12340] == 0xEF && spu.ram()[2 * 0x12340 + 1] == 0xBE);
    CHECK(spu.ram()[2 * 0x12341] == 0xFE && spu.ram()[2 * 0x12341 + 1] == 0xCA);
    CHECK(spu.read(0x1F9001AA) == 0x2342);
    spu.write(0x1F90033C, 0x000F);
    spu.write(0x1F90033E, 0x1234);
    CHECK(spu.core(0).effectsEnd == 0x000FFFFF && spu.read(0x1F90033E) == 0xFFFF);
    spu.write(0x1F900724, 0x0001);
    spu.write(0x1F900726, 0x0002);
    CHECK(spu.core(1).reverb.diffRSrc == 0x00010002 && spu.core(1).reverb.diffLSrc == 0);
    CHECK(spu.read(0x1F900728) == 1 && spu.read(0x1F900724) == 0);
    spu.write(0x1F900324, 0x0003);
    CHECK(spu.core(0).reverb.diffLSrc == 0x00030000);
    spu.write(0x1F900188, 0x0001);
    spu.write(0x1F90018A, 0x0002);
    CHECK(spu.voice(0, 0).dryL == -1 && spu.voice(0, 1).dryL == 0 && spu.voice(0, 16).dryL == 0 && spu.voice(0, 17).dryL == -1);
    spu.write(0x1F90019A, 0xC080);
    CHECK(spu.core(0).fxEnable && spu.core(0).attr == 0xC080);
    spu.write(0x1F900760, 0x3FFF);
    CHECK(spu.core(0).masterLeft.level == 0x7FFE);
    spu.write(0x1F900770, 0x1234);
    CHECK(spu.core(0).masterLeft.level == 0x7FFE);
    spu.write(0x1F900764, 0x8000);
    CHECK(spu.core(0).fxVol.left == -32768);
    std::printf("quirks: address masks, data port, partial registers, swapped DIFF sources, gates and sweeps\n");
    return 0;
}

int adpcm() {
    using namespace audio::spu2;
    uint8_t zero[16] = {0x0C, 0x00, 0x87};
    AdpcmState s;
    AdpcmBlock a = decodeBlock(zero, s);
    CHECK(a.pcm[0] == 7);
    CHECK(a.pcm[1] == -8);
    CHECK(!a.loopStart && !a.loopEnd && !a.loopRepeat);

    uint8_t flags[16] = {0x0C, 0x07};
    AdpcmState t;
    AdpcmBlock f = decodeBlock(flags, t);
    CHECK(f.loopEnd && f.loopRepeat && f.loopStart);

    uint8_t shifted[16] = {0x08, 0x00, 0x07};
    AdpcmState u;
    CHECK(decodeBlock(shifted, u).pcm[0] == 112);

    uint8_t filtered[16] = {0x10, 0x00, 0x01};
    AdpcmState v;
    v.prev1 = 1000;
    AdpcmBlock g = decodeBlock(filtered, v);
    CHECK(g.pcm[0] == 5034);
    CHECK(g.pcm[1] == 4719);
    CHECK(v.prev1 == g.pcm[27] && v.prev2 == g.pcm[26]);

    uint8_t unknown[16] = {0x70, 0x00, 0x01};
    AdpcmState w;
    w.prev1 = 20000;
    w.prev2 = -20000;
    CHECK(decodeBlock(unknown, w).pcm[0] == 4096);

    uint8_t clamp[16] = {0x40, 0x00, 0x77, 0x77, 0x77, 0x77, 0x77, 0x77, 0x77, 0x77, 0x77, 0x77, 0x77, 0x77, 0x77, 0x77};
    AdpcmState x;
    x.prev1 = 32767;
    x.prev2 = 32767;
    AdpcmBlock c = decodeBlock(clamp, x);
    CHECK(c.pcm[0] == 32767 && c.pcm[27] == 32767);
    uint8_t low[16] = {0x40, 0x00, 0x88, 0x88, 0x88, 0x88, 0x88, 0x88, 0x88, 0x88, 0x88, 0x88, 0x88, 0x88, 0x88, 0x88};
    AdpcmState y;
    y.prev1 = -32768;
    y.prev2 = -32768;
    CHECK(decodeBlock(low, y).pcm[27] == -32768);
    std::printf("adpcm: shift, filters, unknown filter, loop flags, clamp\n");
    return 0;
}

int envelope() {
    using namespace audio::spu2;
    Envelope e;
    e.keyOn();
    CHECK(e.phase == Phase::Attack);
    int32_t last = -1;
    for (int i = 0; i < 100000 && e.phase == Phase::Attack; ++i) {
        e.step(0x00FF, 0x1FC0);
        CHECK(e.level >= last);
        last = e.level;
    }
    CHECK(e.phase != Phase::Attack && e.level <= 0x7FFF);
    e.keyOff();
    for (int i = 0; i < 1000000 && e.phase != Phase::Off; ++i) e.step(0x00FF, 0x1FC0);
    CHECK(e.phase == Phase::Off && e.level == 0);

    Envelope linear;
    linear.keyOn();
    linear.step(0x00FF, 0x1FC0);
    CHECK(linear.level == 7 << 11 && linear.counter == 0);

    Envelope slow;
    slow.keyOn();
    slow.step(0x3C00 | 0x00FF, 0x1FC0);
    CHECK(slow.level == 0 && slow.counter == (0x8000 >> 4));

    Envelope sustain;
    sustain.phase = Phase::Sustain;
    sustain.level = 100;
    CHECK(sustain.step(0x00FF, 0x1FC0) == true);
    sustain.level = 0;
    sustain.counter = 0;
    CHECK(sustain.step(0x00FF, 0x1FC0) == false && sustain.phase == Phase::Off);

    VolumeSweep sweep;
    sweep.write(0x3FFF);
    CHECK(sweep.level == 0x7FFE);
    sweep.write(0xA000);
    sweep.level = 0x4000;
    for (int i = 0; i < 100000 && sweep.level > 0; ++i) sweep.step();
    CHECK(sweep.level == 0);
    Envelope exponential;
    exponential.phase = Phase::Attack;
    exponential.level = 0x6001;
    exponential.step(0x80FF, 0x1FC0);
    CHECK(exponential.level == 0x6001 && exponential.counter == 0x2000);
    exponential.level = 0x6000;
    exponential.counter = 0;
    exponential.step();
    CHECK(exponential.level == 0x7FFF && exponential.counter == 0 && exponential.phase == Phase::Decay);

    VolumeSweep rise;
    rise.write(0xC000);
    rise.level = 0x6001;
    rise.step();
    CHECK(rise.level == 0x6001 && rise.counter == 0x2000);
    rise.level = 0x6000;
    rise.counter = 0;
    rise.step();
    CHECK(rise.level == 0x7FFF && rise.counter == 0);

    VolumeSweep fall;
    fall.write(0xE000);
    fall.level = 0x4000;
    fall.step();
    CHECK(fall.level == 0x2000 && fall.counter == 0);

    VolumeSweep mirrored;
    mirrored.write(0x9000);
    mirrored.level = 0;
    mirrored.step();
    CHECK(mirrored.level == -(7 << 11));
    std::printf("envelope: attack rises, key off releases to zero, rates, sustain, volume sweeps\n");
    return 0;
}

int gauss() {
    using namespace audio::spu2;
    CHECK(gaussTap(0) == -1 && gaussTap(0x0FF) == 0x12C7 && gaussTap(0x100) == 0x1307 && gaussTap(0x1FF) == 0x59B3);
    for (uint32_t i = 0; i < 256; ++i) {
        const int32_t sum = gaussTap(0x0FF - i) + gaussTap(0x1FF - i) + gaussTap(0x100 + i) + gaussTap(i);
        CHECK(sum >= 0x7F7F && sum <= 0x7F81);
    }
    CHECK(interpolate({1000, 1000, 1000, 1000}, 0) == 993);
    for (uint32_t counter : {0u, 0x10u, 0xFF0u, 0x1230u}) {
        const int32_t out = interpolate({1000, 1000, 1000, 1000}, counter);
        CHECK(out >= 990 && out <= 1000);
    }
    CHECK(interpolate({0, 0, 0, 0}, 0x800) == 0);
    CHECK(interpolate({0, 32767, 0, 0}, 0) == (0x59B3 * 32767 >> 15));
    CHECK(interpolate({0, 0, 0, 32767}, 0x10) == (gaussTap(1) * 32767 >> 15));
    std::printf("gauss: taps sum to 0x7F80 within one, constants stay constant, taps pair with the four samples\n");
    return 0;
}

int gaussTable(const fs::path& reference) {
    using namespace audio::spu2;
    std::ifstream in(reference);
    CHECK(bool(in));
    std::string line;
    uint32_t index = 0;
    while (std::getline(in, line)) {
        if (line.empty() || line[0] == '#') continue;
        CHECK(index < 512);
        CHECK(gaussTap(index) == std::stoi(line));
        ++index;
    }
    CHECK(index == 512);
    std::printf("gaussTable: the 512 taps equal the psx-spx table\n");
    return 0;
}

int64_t num(const nlohmann::json& x) {
    if (x.is_string()) return int64_t(std::stoull(x.get<std::string>(), nullptr, 16));
    if (x.is_boolean()) return x.get<bool>() ? 1 : 0;
    return x.get<int64_t>();
}

int replayVoices(const fs::path& captures, const fs::path& fixtures, const std::string& name, bool strictAll) {
    audio::spu2::Spu2 spu;
    const audio::spu2::Snapshot start = audio::spu2::Snapshot::load(captures, name, "start");
    spu.restore(start);
    const fs::path history = fixtures / (name + ".start.history.bin");
    if (!fs::exists(history)) throw audio::test::MissingFixture(history.string());
    spu.restoreHistory(assets::readFile(history));
    const audio::spu2::Snapshot end = audio::spu2::Snapshot::load(captures, name, "end");
    const audio::WriteStream writes = readWrites(fixtures / (name + ".writes.bin"));
    const uint32_t samples = uint32_t(num(end.state.at("ticks")) - num(start.state.at("ticks")));
    size_t w = 0;
    for (uint32_t at = 0; at < samples; ++at) {
        while (w < writes.size() && writes[w].sample <= at) {
            spu.write(writes[w].address, writes[w].value);
            ++w;
        }
        spu.advance(1);
    }
    CHECK(w == writes.size());
    CHECK(spu.ticks() == uint32_t(num(end.state.at("ticks"))));
    size_t moved = 0, sounding = 0;
    for (int c = 0; c < 2; ++c)
        for (int v = 0; v < 24; ++v) {
            moved += spu.voice(c, v).nextAddress != uint32_t(num(start.state["cores"][c]["voices"][v]["nextA"]));
            sounding += spu.voice(c, v).envelope.phase != audio::spu2::Phase::Off;
        }
    CHECK(moved > 0);
    size_t compared = 0, mismatches = 0;
    const auto check = [&](int c, int v, const char* field, int64_t got, int64_t want) {
        ++compared;
        if (got == want) return;
        ++mismatches;
        if (mismatches <= 12) std::fprintf(stderr, "core %d voice %d %s: got %lld, want %lld\n", c, v, field, (long long)got, (long long)want);
    };
    for (int c = 0; c < 2; ++c) {
        const auto& core = end.state["cores"][c];
        check(c, -1, "endx", spu.core(c).endx, num(core["regs"]["endx"]));
        check(c, -1, "noiseOut", spu.core(c).noiseOut, num(core["noiseOut"]));
        check(c, -1, "noiseCnt", spu.core(c).noiseCounter, num(core["noiseCnt"]));
        check(c, -1, "masterLeft", spu.core(c).masterLeft.level, num(core["masterVol"]["left"]["value"]));
        check(c, -1, "masterRight", spu.core(c).masterRight.level, num(core["masterVol"]["right"]["value"]));
        for (int v = 0; v < 24; ++v) {
            const auto& j = core["voices"][v];
            const audio::spu2::Voice& got = spu.voice(c, v);
            check(c, v, "adsr.value", got.envelope.level, num(j["adsr"]["value"]));
            check(c, v, "adsr.phase", int(got.envelope.phase), num(j["adsr"]["phase"]));
            check(c, v, "adsr.counter", got.envelope.counter, num(j["adsr"]["counter"]));
            check(c, v, "volume.left", got.left.level, num(j["volume"]["left"]["value"]));
            check(c, v, "volume.left.counter", got.left.counter, num(j["volume"]["left"]["counter"]));
            check(c, v, "volume.right", got.right.level, num(j["volume"]["right"]["value"]));
            check(c, v, "volume.right.counter", got.right.counter, num(j["volume"]["right"]["counter"]));
            check(c, v, "sp", got.phase, num(j["sp"]));
            check(c, v, "nextA", got.nextAddress, num(j["nextA"]));
            check(c, v, "loopStartA", got.loopAddress, num(j["loopStartA"]));
            check(c, v, "loopFlags", got.loopFlags, num(j["loopFlags"]));
            check(c, v, "decPosRead", got.fifoRead, num(j["decPosRead"]));
            check(c, v, "decPosWrite", got.fifoWrite, num(j["decPosWrite"]));
            check(c, v, "prev1", got.prev1, num(j["prev1"]));
            check(c, v, "prev2", got.prev2, num(j["prev2"]));
            check(c, v, "outX", got.outX, num(j["outX"]));
        }
    }
    std::printf("voices: %zu fields compared against the end state of %s after %u samples (%zu voices advanced, %zu sounding), %zu differ\n", compared, name.c_str(), samples, moved, sounding, mismatches);
    return mismatches == 0 || !strictAll ? 0 : 1;
}

int reverbUnits() {
    using namespace audio::spu2;
    assets::Bytes ram(kRamBytes);
    Core core;
    core.fxEnable = true;
    core.effectsEnd = 0;
    Stereo none = runReverb(core, ram, 100, {1000, -1000}, ReverbPath::Avx);
    CHECK(none.left == 0 && none.right == 0 && core.reverbPosition == 0);

    core.effectsStart = 0x20000;
    core.effectsEnd = 0x2FFFF;
    core.reverb.apf2LDst = 0x40;
    core.reverb.apf2Size = 0x10;
    ram[2 * 0x20062] = 0xD2;
    ram[2 * 0x20062 + 1] = 0x04;
    runReverb(core, ram, 100, {0, 0}, ReverbPath::Avx);
    CHECK(core.up[0][0] == 1234 && core.up[1][0] == 0 && core.up[0][64] == 1234);
    CHECK(core.reverbPosition == 1);
    CHECK(ram[2 * 0x20072] == 0 && ram[2 * 0x20072 + 1] == 0);

    core.reverbPosition = 0;
    core.reverb.apf2RDst = 0x80;
    core.reverb.apf2Size = 0x10;
    ram[2 * (0x20000 + 25 + 0x70)] = 0x0A;
    ram[2 * (0x20000 + 25 + 0x70) + 1] = 0x00;
    runReverb(core, ram, 51, {0, 0}, ReverbPath::Avx);
    CHECK(core.up[1][0] == 10 && core.up[0][0] == 0);

    core.effectsStart = 0xFFF00;
    core.effectsEnd = 0xFFFFF;
    core.reverb.apf2LDst = 0xFFFF0000;
    core.reverb.sameLSrc = 0xFFFFF000;
    for (uint32_t cycles = 0; cycles < 600; ++cycles) runReverb(core, ram, cycles, {32767, -32768}, ReverbPath::Avx);
    CHECK(core.reverbPosition < 64);

    std::array<int16_t, 128> constant{};
    constant.fill(1000);
    for (ReverbPath path : {ReverbPath::Avx, ReverbPath::Sse}) {
        for (uint32_t position : {0u, 17u, 63u}) {
            const int down = reverbFilter(constant, position, false, path);
            const int up = reverbFilter(constant, position, true, path);
            CHECK(down >= 996 && down <= 1004);
            CHECK(up >= 1992 && up <= 2008);
        }
    }
    std::array<int16_t, 128> zero{};
    CHECK(reverbFilter(zero, 5, false, ReverbPath::Avx) == 0);
    std::array<int16_t, 128> pulse{};
    pulse[19] = 10000;
    CHECK(reverbFilter(pulse, 39, false, ReverbPath::Avx) == 5000);
    CHECK(reverbFilter(pulse, 39, false, ReverbPath::Sse) == 5000);
    CHECK(reverbFilter(pulse, 39, true, ReverbPath::Avx) == 10000);
    pulse[19] = 0;
    pulse[18] = 10000;
    CHECK(reverbFilter(pulse, 39, false, ReverbPath::Avx) == 3127);
    std::printf("reverb: empty window, one-tap path through the all-pass stages, wrap inside RAM, filter gains\n");
    return 0;
}

int resamplerPaths() {
    using namespace audio::spu2;
    uint32_t seed = 12345;
    for (int round = 0; round < 200; ++round) {
        std::array<int16_t, 128> history{};
        for (int16_t& h : history) {
            seed = seed * 1664525u + 1013904223u;
            h = int16_t(int32_t(seed >> 16) % 1500 - 750);
        }
        const uint32_t position = uint32_t(round) & 63;
        CHECK(reverbFilter(history, position, false, ReverbPath::Avx) == reverbFilter(history, position, false, ReverbPath::Sse));
        CHECK(reverbFilter(history, position, true, ReverbPath::Avx) == reverbFilter(history, position, true, ReverbPath::Sse));
    }
    std::printf("resampler: the AVX and SSE paths agree on non-saturating input%s", "");
    std::fputc(10, stdout);
    return 0;
}

int clampTest() {
    using namespace audio::spu2;
    for (int sign : {1, -1}) {
        Spu2 spu;
        uint16_t block[8] = {0x0300, 0x7777, 0x7777, 0x7777, 0x7777, 0x7777, 0x7777, 0x7777};
        if (sign < 0)
            for (int i = 1; i < 8; ++i) block[i] = 0x8888;
        spu.upload(0x3000, block, 8);
        const uint32_t base = 0x1F900400;
        for (uint32_t v = 0; v < 3; ++v) {
            spu.write(base + 16 * v + 0, 0x3FFF);
            spu.write(base + 16 * v + 2, 0x3FFF);
            spu.write(base + 16 * v + 4, 0x1000);
            spu.write(base + 16 * v + 6, 0x00FF);
            spu.write(base + 16 * v + 8, 0x1FC0);
            spu.write(0x1F9005C0 + 12 * v + 0, 0);
            spu.write(0x1F9005C0 + 12 * v + 2, 0x3000);
            spu.write(0x1F9005C0 + 12 * v + 4, 0);
            spu.write(0x1F9005C0 + 12 * v + 6, 0x3000);
        }
        spu.write(0x1F900588, 0xFFFF);
        spu.write(0x1F90058A, 0x00FF);
        spu.write(0x1F900590, 0xFFFF);
        spu.write(0x1F900592, 0x00FF);
        spu.write(0x1F900788, 0x3FFF);
        spu.write(0x1F90078A, 0x3FFF);
        spu.write(0x1F9005A0, 0x0007);
        spu.write(0x1F9005A2, 0x0000);
        StageSample last;
        for (int i = 0; i < 200; ++i) last = spu.mix();
        CHECK(last.field[10] == (sign > 0 ? 32767 : -32768) && last.field[18] == last.field[10]);
        CHECK(sign > 0 ? spu.finalLeft() == 32765 : spu.finalLeft() == -32766);
        CHECK(sign > 0 ? spu.finalRight() == 32765 : spu.finalRight() == -32766);
        CHECK(last.field[22] == spu.finalLeft());
    }
    std::printf("clamp: three voices past the 16-bit range clamp before the master volume, both signs\n");
    return 0;
}

int coldEnd() {
    using namespace audio::spu2;
    Spu2 spu;
    CHECK(spu.core(0).effectsEnd == 0xFFFFF && spu.core(1).effectsEnd == 0xFFFFF);
    spu.write(0x1F90073C, 0xE);
    CHECK(spu.core(1).effectsEnd == 0xEFFFF);
    spu.write(0x1F90073E, 0x1234);
    CHECK(spu.core(1).effectsEnd == 0xEFFFF);
    spu.write(0x1F90033C, 0x10F);
    CHECK(spu.core(0).effectsEnd == 0xFFFFF);
    std::printf("cold-end: the effect area ends on its register's high half with the low half fixed at 0xFFFF, and a reset core ends at 0xFFFFF\n");
    return 0;
}

int ramImage() {
    using namespace audio::spu2;
    Spu2 spu;
    assets::Bytes image(spu.ram().size(), 0x5A);
    spu.loadRam(image);
    CHECK(spu.ram() == image);
    bool refused = false;
    try {
        spu.loadRam(assets::Bytes(10, 0));
    } catch (const std::runtime_error&) {
        refused = true;
    }
    CHECK(refused);
    spu.clearRam(0x100, 4);
    CHECK(spu.ram()[0xFF] == 0x5A && spu.ram()[0x100] == 0 && spu.ram()[0x103] == 0 && spu.ram()[0x104] == 0x5A);
    spu.clearRam(uint32_t(image.size() - 2), 100);
    CHECK(spu.ram()[image.size() - 3] == 0x5A && spu.ram()[image.size() - 1] == 0);
    spu.setTicks(4003);
    CHECK(spu.ticks() == 4003);
    std::printf("ram-image: a RAM image of the wrong size is refused, a clear stops at the end of RAM, the tick count is set\n");
    return 0;
}

int edges() {
    using namespace audio::spu2;
    Spu2 spu;
    const uint16_t words[4] = {0x1111, 0x2222, 0x3333, 0x4444};
    spu.upload(0xFFFFE, words, 4);
    CHECK(spu.ram()[2 * 0xFFFFE] == 0x11 && spu.ram()[2 * 0xFFFFF + 1] == 0x22 && spu.ram()[0] == 0x33 && spu.ram()[3] == 0x44);
    uint16_t block[8] = {0x0100, 0x7777, 0x7777, 0x7777, 0x7777, 0x7777, 0x7777, 0x7777};
    spu.upload(0xFFFF8, block, 8);
    const uint32_t base = 0x1F900400;
    spu.write(base + 0, 0x3FFF);
    spu.write(base + 2, 0x3FFF);
    spu.write(base + 4, 0x3FFF);
    spu.write(base + 6, 0x00FF);
    spu.write(base + 8, 0x1FC0);
    spu.write(0x1F9005C0, 0x000F);
    spu.write(0x1F9005C2, 0xFFF8);
    spu.write(0x1F9005A0, 0x0001);
    for (int i = 0; i < 400; ++i) spu.mix();
    CHECK(spu.voice(1, 0).nextAddress < 0x100000);
    CHECK((spu.core(1).endx & 1) == 1);
    CHECK(spu.voice(1, 0).envelope.phase == Phase::Off && spu.voice(1, 0).loopAddress == 0x2800);
    CHECK(spu.voice(1, 0).nextAddress > 0x2800 && spu.voice(1, 0).nextAddress < 0x2800 + 0x400);
    std::printf("edges: uploads wrap inside RAM, a voice at the last block of RAM plays on and ends without leaving it\n");
    return 0;
}

int completeness() {
    audio::test::Replayed r;
    r.samples = 10;
    r.wavSamples = 10;
    r.wavCompared = true;
    r.ramCompared = true;
    CHECK(audio::test::checkComplete(r) == 0);
    audio::test::Replayed noWav = r;
    noWav.wavCompared = false;
    CHECK(audio::test::checkComplete(noWav) == 1);
    audio::test::Replayed shortWav = r;
    shortWav.wavSamples = 9;
    CHECK(audio::test::checkComplete(shortWav) == 1);
    audio::test::Replayed noRam = r;
    noRam.ramCompared = false;
    CHECK(audio::test::checkComplete(noRam) == 1);
    std::printf("complete: a missing or short WAV, or a missing end RAM, is a failure%s", "");
    std::fputc(10, stdout);
    return 0;
}

int missingHistory(const fs::path& captures, const std::string& name) {
    const fs::path empty = fs::temp_directory_path() / "audio-no-history";
    fs::create_directories(empty);
    bool thrown = false;
    try {
        audio::test::replay(captures, empty, name);
    } catch (const audio::test::MissingFixture& e) {
        thrown = std::string(e.what()).find(".start.history.bin") != std::string::npos;
    }
    CHECK(thrown);
    std::printf("missing-history: a replay without the history file refuses and names the file%s", "");
    std::fputc(10, stdout);
    return 0;
}

int printStages(const fs::path& captures, const fs::path& fixtures, const std::string& name) {
    const audio::test::Replayed r = audio::test::replay(captures, fixtures, name);
    std::printf("%s\n", audio::test::toJson(name, r).dump(1).c_str());
    return 0;
}

int stageGate(const fs::path& captures, const fs::path& fixtures, const fs::path& budgets, const std::string& name, const std::vector<std::string>& owned) {
    const audio::test::Replayed r = audio::test::replay(captures, fixtures, name);
    const int failures = audio::test::checkBudget(budgets / (name + ".json"), r, owned) + audio::test::checkComplete(r);
    std::printf("stages: %zu fields of %s within their declared budgets (%llu samples), %d outside\n", owned.size(), name.c_str(), (unsigned long long)r.samples, failures);
    return failures == 0 ? 0 : 1;
}

int restoreAndWrites(const fs::path& captures, const fs::path& fixtures, const std::string& name) {
    audio::spu2::Spu2 spu;
    spu.restore(audio::spu2::Snapshot::load(captures, name, "start"));
    const audio::WriteStream writes = readWrites(fixtures / (name + ".writes.bin"));
    std::map<uint32_t, uint16_t> last;
    for (const auto& w : writes) {
        spu.write(w.address, w.value);
        last[w.address] = w.value;
    }
    size_t compared = 0;
    for (const auto& [address, value] : last) {
        if (audio::spu2::isStatus(address)) continue;
        const auto where = audio::spu2::decode(address);
        uint16_t expected = value;
        if (where.kind == audio::spu2::Kind::VoiceAddress) {
            if (where.reg == 0 || where.reg == 4) expected &= 0x000F;
            else expected &= 0xFFF8;
        }
        CHECK(spu.read(address) == expected);
        ++compared;
    }
    CHECK(compared > 0);
    const nlohmann::json end = audio::spu2::Snapshot::load(captures, name, "end").state;
    size_t equal = 0;
    for (int c = 0; c < 2; ++c) {
        for (int v = 0; v < 24; ++v) {
            const auto& j = end["cores"][c]["voices"][v];
            const auto num = [](const nlohmann::json& x) { return x.is_string() ? std::stoul(x.get<std::string>(), nullptr, 16) : size_t(x.get<int64_t>()); };
            const uint32_t reg1 = uint32_t(num(j["adsr"]["reg1"]));
            const uint32_t reg2 = uint32_t(num(j["adsr"]["reg2"]));
            CHECK(spu.voice(c, v).envelope.reg1 == reg1);
            CHECK(spu.voice(c, v).envelope.reg2 == reg2);
            CHECK(spu.voice(c, v).pitch == num(j["pitch"]));
            CHECK(spu.voice(c, v).left.reg == num(j["volume"]["left"]["reg"]));
            CHECK(spu.voice(c, v).right.reg == num(j["volume"]["right"]["reg"]));
            CHECK(spu.voice(c, v).startAddress == num(j["startA"]));
            ++equal;
        }
    }
    std::printf("restore: %zu written registers read back, %zu voices equal the end state of %s in their static registers\n", compared, equal, name.c_str());
    return 0;
}

}

int run(int argc, char** argv) {
    const std::string mode = argc > 1 ? argv[1] : "";
    if (mode == "decode") return decodeTest() || quirks();
    if (mode == "voices" && argc > 4) return replayVoices(argv[2], argv[3], argv[4], true);
    if (mode == "envelope") return envelope();
    if (mode == "print" && argc > 4) return printStages(argv[2], argv[3], argv[4]);
    if (mode == "dry" && argc > 5) return stageGate(argv[2], argv[3], argv[4], argv[5], {"c0.dry.l", "c0.dry.r", "c1.dry.l", "c1.dry.r"});
    if (mode == "reverb") return reverbUnits();
    if (mode == "stages" && argc > 5) return stageGate(argv[2], argv[3], argv[4], argv[5], {"c0.wet.l", "c0.wet.r", "c0.pre.l", "c0.pre.r", "c0.post.l", "c0.post.r", "c0.mix.l", "c0.mix.r", "c1.wet.l", "c1.wet.r"});
    if (mode == "edges") return edges();
    if (mode == "cold-end") return coldEnd();
    if (mode == "ram-image") return ramImage();
    if (mode == "clamp") return clampTest();
    if (mode == "all" && argc > 5) {
        std::vector<std::string> all;
        for (const char* field : audio::test::kFields) all.push_back(field);
        return stageGate(argv[2], argv[3], argv[4], argv[5], all);
    }
    if (mode == "resampler") return resamplerPaths();
    if (mode == "complete") return completeness();
    if (mode == "missing-history" && argc > 3) return missingHistory(argv[2], argv[3]);
    if (mode == "adpcm") return adpcm();
    if (mode == "gauss") return gauss();
    if (mode == "gauss-table" && argc > 2) return gaussTable(argv[2]);
    if (mode == "restore" && argc > 4) return restoreAndWrites(argv[2], argv[3], argv[4]);
    std::fprintf(stderr, "usage: AudioSpu2Test decode | restore <captures> <fixtures> <name>\n");
    return 2;
}

int main(int argc, char** argv) {
    try {
        return run(argc, argv);
    } catch (const audio::test::MissingFixture& e) {
        std::fprintf(stderr, "SKIP: missing fixture %s", e.what());
        std::fputc(10, stderr);
        return 77;
    }
}
