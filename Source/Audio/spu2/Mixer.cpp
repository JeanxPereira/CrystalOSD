#include <algorithm>

#include "Audio/spu2/Adpcm.hpp"
#include "Audio/spu2/Gauss.hpp"
#include "Audio/spu2/Spu2.hpp"

namespace audio::spu2 {

namespace {

constexpr uint32_t kAddressMask = 0xFFFFF;
constexpr uint32_t kBlockMask = 7;
constexpr uint32_t kFifoMask = 31;
constexpr uint32_t kRefillBelow = 13;
constexpr uint32_t kPitchTop = 0x3FFF;
constexpr uint32_t kVoiceCount = 24;
constexpr uint32_t kRingMask = 0x1FF;

constexpr uint32_t kCaptureVoice1 = 0x400;
constexpr uint32_t kCaptureVoice3 = 0x600;
constexpr uint32_t kCaptureCore1Input = 0x800;
constexpr uint32_t kCaptureMixed = 0x1000;
constexpr uint32_t kMemoryInput = 0x2000;
constexpr uint32_t kCoreStride = 0x800;
constexpr uint32_t kMemoryInputStride = 0x400;
constexpr uint32_t kRightOffset = 0x200;

int32_t scale(int32_t value, int32_t volume) { return (volume * value) >> 15; }
int32_t clamp16(int32_t value) { return std::clamp(value, -0x8000, 0x7FFF); }

struct Sum {
    int32_t left = 0, right = 0;
};

}

struct Mixer {
    static uint16_t read(const Spu2& spu, uint32_t address) {
        const uint32_t at = (address & kAddressMask) * 2;
        return uint16_t(spu.m_ram[at] | spu.m_ram[at + 1] << 8);
    }

    static void touch(Spu2& spu, const Core& core, uint32_t address) {
        if (core.irqEnable && (address & kAddressMask) == core.irqAddress) spu.m_spdif[1] |= 4 << core.index;
    }

    static void capture(Spu2& spu, Core& core, uint32_t area, int32_t value) {
        const uint32_t address = area + core.index * kCoreStride + spu.m_outPos;
        touch(spu, core, address);
        spu.writeRamWord(address, uint16_t(value));
    }

    static void applyKeys(Core& core) {
        for (uint32_t v = 0; v < kVoiceCount; ++v) {
            const uint32_t bit = 1u << v;
            Voice& voice = core.voices[v];
            if (core.keyOff & bit) voice.envelope.keyOff();
            if (!(core.keyOn & bit)) continue;
            voice.envelope.keyOn();
            voice.nextAddress = voice.startAddress;
            voice.phase = 0;
            voice.prev1 = voice.prev2 = 0;
            voice.fifoRead = voice.fifoWrite = 0;
            voice.fifo.fill(0);
            voice.blockPending = false;
            core.endx &= ~bit;
        }
        core.keyOn = 0;
        core.keyOff = 0;
    }

    // A block start is handled once its last word has been fetched and the voice output is done; the block itself
    // is decoded when its first data word is fetched.
    static void takeHeader(Spu2& spu, Core& core, Voice& voice) {
        const uint32_t at = (voice.nextAddress & kAddressMask) * 2;
        touch(spu, core, voice.nextAddress);
        voice.loopFlags = int8_t(spu.m_ram[at + 1]);
        if ((voice.loopFlags & 4) && !voice.loopMode) voice.loopAddress = voice.nextAddress;
        voice.nextAddress = (voice.nextAddress + 1) & kAddressMask;
        voice.blockPending = true;
    }

    static void decodeBlockAhead(Spu2& spu, Voice& voice) {
        const uint32_t at = (voice.nextAddress & ~kBlockMask & kAddressMask) * 2;
        AdpcmState state{voice.prev1, voice.prev2};
        voice.block = decodeBlock(&spu.m_ram[at], state).pcm;
        voice.prev1 = state.prev1;
        voice.prev2 = state.prev2;
        voice.blockPending = false;
    }

    static void finishBlock(Core& core, uint32_t index, Voice& voice) {
        if (!(voice.loopFlags & 1)) return;
        core.endx |= 1u << index;
        voice.nextAddress = voice.loopAddress;
        if (voice.loopFlags & 2) return;
        voice.envelope.phase = Phase::Off;
        voice.envelope.level = 0;
    }

    // A stopped voice keeps walking through the sample memory but no longer decodes it.
    static void refill(Spu2& spu, Core& core, Voice& voice) {
        if (!(voice.nextAddress & kBlockMask)) takeHeader(spu, core, voice);
        if (voice.fifoWrite - voice.fifoRead >= kRefillBelow) return;
        if (voice.envelope.phase == Phase::Off) {
            for (uint32_t k = 0; k < 4; ++k) voice.fifo[voice.fifoWrite++ & kFifoMask] = 0;
        } else {
            if (voice.blockPending) decodeBlockAhead(spu, voice);
            touch(spu, core, voice.nextAddress);
            const uint32_t first = ((voice.nextAddress & kBlockMask) - 1) * 4;
            for (uint32_t k = 0; k < 4; ++k) voice.fifo[voice.fifoWrite++ & kFifoMask] = voice.block[first + k];
        }
        voice.nextAddress = (voice.nextAddress + 1) & kAddressMask;
    }

    static int32_t interpolated(const Voice& voice) {
        std::array<int16_t, 4> taps;
        for (uint32_t k = 0; k < 4; ++k) taps[k] = int16_t(voice.fifo[(voice.fifoRead + k) & kFifoMask]);
        return interpolate(taps, uint32_t(voice.phase));
    }

    static uint32_t pitchOf(const Voice& voice, const Voice* previous) {
        if (!voice.modulated || !previous) return std::min<uint32_t>(voice.pitch, kPitchTop);
        const int64_t modulated = (int64_t(voice.pitch) * (0x8000 + previous->outX)) >> 15;
        return uint32_t(std::clamp<int64_t>(modulated, 0, kPitchTop));
    }

    static void stepVoice(Spu2& spu, Core& core, uint32_t index, Sum& dry, Sum& wet) {
        Voice& voice = core.voices[index];
        const Voice* previous = index ? &core.voices[index - 1] : nullptr;
        voice.left.step();
        voice.right.step();
        refill(spu, core, voice);
        const int32_t raw = voice.noise ? int16_t(core.noiseOut) : interpolated(voice);
        const bool running = voice.envelope.phase != Phase::Off;
        voice.envelope.step();
        const int32_t shaped = scale(raw, voice.envelope.level);
        if (running) voice.outX = shaped;
        const int32_t left = scale(shaped, voice.left.level), right = scale(shaped, voice.right.level);
        dry.left += voice.dryL & left;
        dry.right += voice.dryR & right;
        wet.left += voice.wetL & left;
        wet.right += voice.wetR & right;

        voice.phase += int32_t(pitchOf(voice, previous));
        voice.fifoRead += uint32_t(voice.phase >> 12);
        voice.phase &= 0xFFF;
        if (!(voice.nextAddress & kBlockMask)) {
            finishBlock(core, index, voice);
            takeHeader(spu, core, voice);
        }

        if (index == 1) capture(spu, core, kCaptureVoice1, voice.outX);
        if (index == 3) capture(spu, core, kCaptureVoice3, voice.outX);
    }

    // psx-spx "SPU Noise Generator": the timer advances by the step each cycle and the register shifts when it overflows.
    static void stepNoise(Core& core) {
        const uint32_t step = 4 + (core.noiseClock & 3);
        const uint32_t period = 0x80000000u >> (core.noiseClock >> 2);
        core.noiseCounter += step << 14;
        for (int pass = 0; pass < 2 && core.noiseCounter >= period; ++pass) {
            const uint32_t x = core.noiseOut;
            const uint32_t parity = ((x >> 15) ^ (x >> 12) ^ (x >> 11) ^ (x >> 10) ^ 1) & 1;
            core.noiseOut = (x << 1) | parity;
            core.noiseCounter -= period;
        }
    }

    static Sum memoryInput(Spu2& spu, const Core& core) {
        const uint32_t at = kMemoryInput + core.index * kMemoryInputStride + spu.m_outPos;
        return {int16_t(read(spu, at)), int16_t(read(spu, at + kRightOffset))};
    }

    static Sum mixCore(Spu2& spu, Core& core, const Sum& external, StageSample& stage) {
        const uint32_t base = core.index * 10;
        Sum dry, wet;
        for (uint32_t v = 0; v < kVoiceCount; ++v) stepVoice(spu, core, v, dry, wet);
        core.masterLeft.step();
        core.masterRight.step();
        stepNoise(core);

        dry = {clamp16(dry.left), clamp16(dry.right)};
        wet = {clamp16(wet.left), clamp16(wet.right)};
        stage.field[base + 0] = dry.left;
        stage.field[base + 1] = dry.right;
        stage.field[base + 2] = wet.left;
        stage.field[base + 3] = wet.right;
        capture(spu, core, kCaptureMixed, dry.left);
        capture(spu, core, kCaptureMixed + kRightOffset, dry.right);
        capture(spu, core, kCaptureMixed + 2 * kRightOffset, wet.left);
        capture(spu, core, kCaptureMixed + 3 * kRightOffset, wet.right);

        const Sum memory = memoryInput(spu, core);
        const int32_t inL = scale(memory.left, core.inpVol.left), inR = scale(memory.right, core.inpVol.right);
        const int32_t extL = scale(external.left, core.extVol.left), extR = scale(external.right, core.extVol.right);
        const CoreGates& dg = core.dryGate;
        const CoreGates& wg = core.wetGate;
        const Sum td{clamp16((dry.left & dg.sndL) + (inL & dg.inpL) + (extL & dg.extL)), clamp16((dry.right & dg.sndR) + (inR & dg.inpR) + (extR & dg.extR))};
        const Sum tw{clamp16((wet.left & wg.sndL) + (inL & wg.inpL) + (extL & wg.extL)), clamp16((wet.right & wg.sndR) + (inR & wg.inpR) + (extR & wg.extR))};
        stage.field[base + 4] = tw.left;
        stage.field[base + 5] = tw.right;

        const Stereo reverb = runReverb(core, spu.m_ram, spu.m_ticks + 1, {tw.left, tw.right}, spu.m_reverbPath);
        stage.field[base + 6] = reverb.left;
        stage.field[base + 7] = reverb.right;

        const Sum mixed{clamp16(td.left + scale(reverb.left, core.fxVol.left)), clamp16(td.right + scale(reverb.right, core.fxVol.right))};
        stage.field[base + 8] = mixed.left;
        stage.field[base + 9] = mixed.right;
        return {clamp16(scale(mixed.left, core.masterLeft.level)), clamp16(scale(mixed.right, core.masterRight.level))};
    }

    static StageSample tick(Spu2& spu) {
        StageSample stage;
        for (Core& core : spu.m_core) applyKeys(core);

        const Sum first = mixCore(spu, spu.m_core[0], {}, stage);
        stage.field[20] = first.left;
        stage.field[21] = first.right;
        spu.writeRamWord(kCaptureCore1Input + spu.m_outPos, uint16_t(first.left));
        spu.writeRamWord(kCaptureCore1Input + kRightOffset + spu.m_outPos, uint16_t(first.right));

        const bool silent = (spu.m_playMode & 4) || spu.m_core[1].mute;
        const Sum second = mixCore(spu, spu.m_core[1], silent ? Sum{} : first, stage);
        stage.field[22] = second.left;
        stage.field[23] = second.right;
        spu.m_final = {int16_t(second.left), int16_t(second.right)};

        spu.m_outPos = (spu.m_outPos + 1) & kRingMask;
        ++spu.m_ticks;
        return stage;
    }
};

StageSample Spu2::mix() { return Mixer::tick(*this); }

int16_t Spu2::finalLeft() const { return m_final.first; }
int16_t Spu2::finalRight() const { return m_final.second; }

}
