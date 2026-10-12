#include "Audio/spu2/Reverb.hpp"

#include <algorithm>
#include <utility>

namespace audio::spu2 {

namespace {

constexpr int kTaps = 39;
constexpr int kCentre = 19;
constexpr int kRing = 64;
constexpr int kHalfBand[10] = {-1, 2, -10, 35, -103, 266, -616, 1332, -2960, 10246};

constexpr int32_t tapGain(int index) {
    const int distance = index < kCentre ? kCentre - index : index - kCentre;
    if (distance == 0) return 16384;
    if (!(distance & 1)) return 0;
    return kHalfBand[(19 - distance) / 2];
}

int16_t saturate(int32_t x) { return int16_t(std::clamp(x, -32768, 32767)); }
int32_t weigh(int32_t volume, int32_t value) { return volume * value >> 15; }

int16_t resample(const std::array<int16_t, 128>& history, uint32_t position, int32_t scale) {
    const uint32_t first = position < uint32_t(kTaps) ? position + (kRing - kTaps) : position - kTaps;
    int32_t sum = 0;
    for (int tap = 0; tap < kTaps; ++tap) {
        const int32_t gain = tapGain(tap) * scale;
        if (gain) sum += (gain * history[first + tap] + 0x4000) >> 15;
    }
    return saturate(sum);
}

struct Window {
    uint32_t start, size, advance;
};

uint32_t locate(const Window& w, int64_t offset) {
    const int64_t span = w.size;
    return w.start + uint32_t(((offset + w.advance) % span + span) % span);
}

int16_t fetch(const assets::Bytes& ram, const Window& w, int64_t offset) {
    const uint32_t at = locate(w, offset) * 2;
    return int16_t(ram[at] | ram[at + 1] << 8);
}

void store(assets::Bytes& ram, const Window& w, int64_t offset, int32_t value) {
    const uint32_t at = locate(w, offset) * 2;
    const int16_t v = saturate(value);
    ram[at] = uint8_t(v);
    ram[at + 1] = uint8_t(uint16_t(v) >> 8);
}

}

int16_t reverbFilter(const std::array<int16_t, 128>& history, uint32_t position, bool up, ReverbPath) {
    return resample(history, position, up ? 2 : 1);
}

// psx-spx "SPU Reverb Formula": left is computed on even cycles and right on odd ones, the work area advances one word per pair.
Stereo runReverb(Core& core, assets::Bytes& ram, uint32_t cycles, Stereo input, ReverbPath path) {
    if (core.effectsEnd <= core.effectsStart) return {};
    const ReverbRegs& r = core.reverb;
    const Window window{core.effectsStart, core.effectsEnd - core.effectsStart + 1, cycles >> 1};
    const bool right = cycles & 1;
    const int channel = right ? 1 : 0;
    const uint32_t slot = core.reverbPosition & 63;

    const int16_t heard[2] = {saturate(input.left), saturate(input.right)};
    for (int ch = 0; ch < 2; ++ch) core.down[ch][slot] = core.down[ch][slot + 64] = heard[ch];
    // The 48 kHz input is kept in the history ring and decimated by the half-band filter; the result is zero-stuffed into the output ring.
    const int32_t lineIn = weigh(right ? r.inCoefR : r.inCoefL, reverbFilter(core.down[channel], slot, false, path));

    const uint32_t sameSrc = right ? r.sameRSrc : r.sameLSrc, sameDst = right ? r.sameRDst : r.sameLDst;
    const uint32_t diffSrc = right ? r.diffLSrc : r.diffRSrc, diffDst = right ? r.diffRDst : r.diffLDst;
    const bool writes = core.fxEnable;
    for (const auto& [src, dst] : {std::pair{sameSrc, sameDst}, std::pair{diffSrc, diffDst}}) {
        const int32_t last = fetch(ram, window, int64_t(dst) - 1);
        const int32_t wall = weigh(r.wallVol, fetch(ram, window, src));
        int32_t next = weigh(r.iirVol, lineIn + wall - last) + last;
        if (r.iirVol == -0x8000) next = -next;
        if (writes) store(ram, window, dst, next);
    }

    const uint32_t combs[2][4] = {{r.comb1LSrc, r.comb2LSrc, r.comb3LSrc, r.comb4LSrc}, {r.comb1RSrc, r.comb2RSrc, r.comb3RSrc, r.comb4RSrc}};
    const int16_t volumes[4] = {r.comb1Vol, r.comb2Vol, r.comb3Vol, r.comb4Vol};
    int32_t wave = 0;
    for (int tap = 0; tap < 4; ++tap) wave += weigh(volumes[tap], fetch(ram, window, combs[channel][tap]));
    wave = saturate(wave);

    const struct { uint32_t dst; uint32_t size; int16_t volume; } stages[2] = {
        {right ? r.apf1RDst : r.apf1LDst, r.apf1Size, r.apf1Vol}, {right ? r.apf2RDst : r.apf2LDst, r.apf2Size, r.apf2Vol}};
    for (const auto& stage : stages) {
        const int32_t echo = fetch(ram, window, int64_t(stage.dst) - stage.size);
        const int32_t entering = saturate(wave - weigh(stage.volume, echo));
        if (writes) store(ram, window, stage.dst, entering);
        wave = saturate(weigh(stage.volume, entering) + echo);
    }

    core.up[channel][slot] = core.up[channel][slot + 64] = int16_t(wave);
    core.up[1 - channel][slot] = core.up[1 - channel][slot + 64] = 0;
    core.reverbPosition = (slot + 1) & 63;
    return {reverbFilter(core.up[0], core.reverbPosition, true, path), reverbFilter(core.up[1], core.reverbPosition, true, path)};
}

}
