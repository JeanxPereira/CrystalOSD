#include <algorithm>
#include <stdexcept>
#include <string>

#include "Audio/driver/State.hpp"

namespace audio::driver {

namespace {

constexpr int64_t kSq = M(0x9280);
constexpr int64_t kProgTab = M(0x9284);
constexpr int64_t kProgTab2 = M(0x9288);
constexpr int64_t kVelTab = M(0x928c);
constexpr int64_t kHd = M(0x9298);
constexpr int64_t kProgHdr = M(0x9220);
constexpr int64_t kTone = M(0x9224);
constexpr int64_t kSq2 = M(0x9218);
constexpr int64_t kChan = M(0x9214);
constexpr int64_t kPitchTable = M(0x8a30);
constexpr int64_t kPanTable = M(0x8ef0);
constexpr int64_t kSlotSize = 0x44;
constexpr int64_t kVoiceSize = 0x3c;
constexpr int kVoiceCount = 24;
constexpr int kSeqCore = 1;

int32_t div48000(int64_t x) {
    const int32_t v = i32(x);
    return (mulHi(v, 0x057619f1) >> 10) - (v >> 31);
}

int32_t imul(int64_t a, int64_t b) { return i32(int64_t(uint32_t(uint64_t(a)) * uint64_t(uint32_t(uint64_t(b))))); }

int32_t sequencerPitch(const IopMemory& mem, uint32_t root, uint32_t key, int32_t fine, uint32_t bend, uint32_t range) {
    const auto table = [&](int64_t index) { return mem.u16(kPitchTable + 2 * (index & 0xffff)); };
    const int32_t bendTerm = imul(int64_t(bend) - 0x40, range) >> 2;
    if (key >= root) {
        const int64_t d = (int64_t(key) - int64_t(root)) & 0xffff;
        const int64_t octave = d / 12;
        const int64_t semitone = d - 12 * octave;
        const int64_t index = (semitone << 4) + (bendTerm + 0xd0) + s16(fine);
        const int32_t x = imul(table(index), 44100);
        return div48000(i32(int64_t(uint32_t(x) << (octave & 31)))) & 0xffff;
    }
    const int64_t d = (int64_t(root) - int64_t(key)) & 0xffff;
    const int64_t octave = d / 12;
    const int64_t semitone = d - 12 * octave;
    const int64_t index = ((12 - semitone) << 4) + (bendTerm + 0xd0) + s16(fine);
    const int32_t x = imul(table(index), 44100);
    return div48000(x >> ((octave + 1) & 31)) & 0xffff;
}

class Sequencer {
public:
    explicit Sequencer(Driver::State& state) : s(state), mem(state.mem) {}

    void run() {
        releaseFinished();
        int changed = 0;
        for (int i = 0; i < 0x18; ++i) {
            const int64_t slot = slotAt(i);
            if (mem.u16(slot + 0x26) == 1 && mem.u16(slot + 0x28) == 1) {
                selectBank(i);
                while (mem.s32(slot + 4) <= 0) {
                    readEvent(i);
                    const int r = prepareEvent(i);
                    if (r == 1) {
                        changed = 1;
                        const uint32_t status = mem.u8(slot) & 0xf0;
                        if (status == 0xb0) {
                            controller(i);
                        } else if (status == 0x90) {
                            noteOn(i);
                        } else if (status == 0x80) {
                            noteOff(i);
                        } else if (status == 0xa0) {
                        } else if (status == 0xe0) {
                            throw std::runtime_error("pitch bend is not modelled (SNDCLOKS does not use it)");
                        } else if (status == 0xc0) {
                            programChange(i);
                        } else if (status == 0xf0) {
                            const uint32_t type = mem.u8(slot + 2);
                            if (type == 0x2f) {
                                endOfSequence(i);
                                break;
                            }
                            if (type == 0x51) tempo(i);
                        }
                    } else {
                        changed = 0;
                    }
                    readDelta(i);
                }
                if (changed == 1) {
                    mem.write32(kCtx + 4, mem.u32(kCtx + 4) | mem.u32(slot + 0xc));
                    mem.write32(kCtx + 8, mem.u32(kCtx + 8) | mem.u32(slot + 0x10));
                    mem.write32(slot + 0x10, 0);
                    mem.write32(slot + 0xc, 0);
                    changed = 0;
                }
                if (mem.u16(slot + 0x3e) != 0) mem.write32(slot + 4, int64_t(mem.u32(slot + 4)) - int64_t(mem.u32(slot + 8)));
                if (mem.u16(slot + 0x2c) == 1) {
                    mem.write8(slot, mem.u8(slot + 0x2e));
                    mem.write8(slot + 1, mem.u8(slot + 0x2e));
                    mem.write32(slot + 0x14, mem.u32(slot + 0x38));
                    mem.write16(slot + 0x2c, 0);
                    mem.write16(slot + 0x28, 1);
                    mem.write32(slot + 4, 0);
                }
            }
        }
        if (mem.u32(kCtx + 8) != 0) s.setSwitch(kSeqCore, reg::Koff0, mem.u32(kCtx + 8));
        if (mem.u32(kCtx + 4) != 0) s.setSwitch(kSeqCore, reg::Kon0, mem.u32(kCtx + 4));
        mem.write32(kCtx + 4, 0);
        mem.write32(kCtx + 8, 0);
        voiceUpdates();
    }

private:
    Driver::State& s;
    IopMemory& mem;

    static int64_t slotAt(int i) { return kSlots + kSlotSize * i; }
    static int64_t voiceAt(int j) { return kVoices + kVoiceSize * j; }
    void voiceParam(int voice, uint32_t param, int64_t value) { s.setParam(kSeqCore, voice, param, value); }

    void selectBank(int i) {
        const int64_t slot = slotAt(i);
        mem.write32(kSq, mem.u32(slot + 0x18));
        const int64_t hd = mem.u32(kBanks + 12 * int64_t(mem.u16(slot + 0x24)));
        mem.write32(kCtx, hd);
        mem.write32(kHd, hd);
        mem.write32(kProgTab, hd + mem.u32(hd + 0x10));
        mem.write32(kProgTab2, hd + mem.u32(hd + 0x10));
        mem.write32(kVelTab, hd + mem.u32(hd + 0x14));
    }

    void readEvent(int i) {
        const int64_t slot = slotAt(i);
        const uint32_t first = mem.u8(int64_t(mem.u32(kSq)) + mem.u32(slot + 0x14));
        if (first & 0x80) {
            mem.write8(slot + 1, first);
            mem.write8(slot, first);
        } else {
            mem.write32(slot + 0x14, int64_t(mem.u32(slot + 0x14)) - 1);
            mem.write8(slot, mem.u8(slot + 1));
        }
        const int64_t base = int64_t(mem.u32(kSq)) + mem.u32(slot + 0x14);
        mem.write8(slot + 2, mem.u8(base + 1));
        mem.write8(slot + 3, mem.u8(base + 2));
    }

    int prepareEvent(int i) {
        const int64_t slot = slotAt(i);
        const int64_t channel = mem.u8(slot) & 0xf;
        const int64_t sq = mem.u32(kSq);
        const uint32_t program = mem.u8(sq + (channel << 4) + 0x12);
        const uint32_t entry = mem.u16(int64_t(mem.u32(kProgTab)) + 2 * int64_t(program) + 2);
        if (mem.u8(slot) < 0xa0) {
            const bool bad = entry == 0xffff || mem.u16(mem.u32(kProgTab)) < program || mem.u32(int64_t(mem.u32(kHd)) + 0x10) == 0xffffffffu;
            if (bad) {
                mem.write32(slot + 0x14, int64_t(mem.u32(slot + 0x14)) + 3);
                return 0;
            }
        }
        const int64_t hd = mem.u32(kCtx);
        const int64_t progHdr = int64_t(mem.u32(int64_t(mem.u32(kHd)) + 0x10)) + hd + entry;
        mem.write32(kProgHdr, progHdr);
        mem.write32(kTone, progHdr + 8);
        mem.write32(kSq2, mem.u32(slot + 0x18));
        mem.write32(kChan, int64_t(mem.u32(slot + 0x18)) + (channel << 4) + 0x10);
        return 1;
    }

    void readDelta(int i) {
        const int64_t slot = slotAt(i);
        uint32_t delta = 0;
        uint32_t b;
        do {
            b = mem.u8(int64_t(mem.u32(kSq)) + mem.u32(slot + 0x14));
            mem.write32(slot + 0x14, int64_t(mem.u32(slot + 0x14)) + 1);
            delta = (delta << 7) | (b & 0x7f);
        } while (b & 0x80);
        if (mem.u16(slot + 0x3e) != 0) mem.write32(slot + 4, int64_t(mem.u32(slot + 4)) + int64_t(delta << 12));
    }

    int allocateVoice() {
        for (int j = 0; j < kVoiceCount; ++j) {
            const int64_t v = voiceAt(j);
            if (mem.u16(v) == 0 && mem.u16(v + 2) == 0) return j;
        }
        int best = kVoiceCount;
        uint32_t age = 0x18;
        for (int j = 0; j < kVoiceCount; ++j) {
            const int64_t v = voiceAt(j);
            if (mem.u16(v + 8) == 1 && mem.u16(v + 0xa) < age) {
                age = mem.u16(v + 0xa);
                best = j;
            }
        }
        if (best == kVoiceCount) return -1;
        for (int j = 0; j < kVoiceCount; ++j) {
            const int64_t v = voiceAt(j);
            if (age < mem.u16(v + 0xa)) mem.write16(v + 0xa, int64_t(mem.u16(v + 0xa)) - 1);
        }
        return best;
    }

    bool toneMatches(uint32_t head, int64_t t, uint32_t key) const {
        if (head == 0xff) return true;
        const int64_t tone = int64_t(mem.u32(kTone)) + (t << 4);
        return key >= mem.u8(tone) && key <= mem.u8(tone + 1);
    }

    int32_t voiceVolume(int j, int side) const { return voiceVolumeOf(mem, j, side); }

    void noteOff(int i) {
        const int64_t slot = slotAt(i);
        for (int j = 0; j < kVoiceCount; ++j) {
            const int64_t v = voiceAt(j);
            if (mem.u16(v) == 1 && mem.u16(v + 6) == uint32_t(i) && mem.u16(v + 2) == mem.u8(slot + 2) && mem.u16(v + 0x1c) == mem.u16(slot + 0x24) &&
                mem.u16(v + 4) == (mem.u8(slot) & 0xfu)) {
                mem.write16(v + 8, 1);
                mem.write32(slot + 0x10, mem.u32(slot + 0x10) | (uint32_t(1) << j));
            }
        }
        mem.write32(slot + 0x14, int64_t(mem.u32(slot + 0x14)) + 3);
    }

    void noteOn(int i) {
        const int64_t slot = slotAt(i);
        if (mem.u8(slot + 3) == 0) {
            noteOff(i);
            return;
        }
        const int64_t tone0 = mem.u32(kProgHdr);
        const uint32_t head = mem.u8(tone0);
        int64_t first;
        int64_t last;
        bool single;
        if (head == 0xff) {
            last = int64_t(mem.u8(slot + 2)) - mem.u8(tone0 + 6);
            first = last;
            single = false;
        } else if (head & 0x80) {
            last = int64_t(head) - 0x80;
            single = false;
            first = 0;
        } else {
            last = head;
            single = true;
            first = 0;
        }
        for (int64_t t = first; t < last + 1; ++t) {
            if (!toneMatches(head, t, mem.u8(slot + 2))) continue;
            const int voice = allocateVoice();
            if (voice == -1) break;
            mem.write32(kTone, int64_t(mem.u32(kTone)) + (t << 4));
            const int64_t v = voiceAt(voice);
            const int64_t tone = mem.u32(kTone);
            const int64_t chan = mem.u32(kChan);
            const uint32_t flags = mem.u8(tone + 0xf);
            if (flags & 1) {
                mem.write16(v + 8, 0);
                mem.write16(v + 0xc, 1);
            } else {
                mem.write16(v + 8, 1);
                mem.write16(v + 0xc, 0);
            }
            mem.write16(v, 1);
            mem.write16(v + 2, mem.u8(slot + 2));
            mem.write16(v + 4, mem.u8(slot) & 0xf);
            mem.write16(v + 6, i);
            mem.write16(v + 0xa, mem.u16(kCtx + 0xc));
            mem.write16(v + 0xe, t);
            mem.write16(v + 0x12, 0);
            mem.write16(v + 0x1c, mem.u16(slot + 0x24));
            mem.write16(v + 0x1e, mem.u8(int64_t(mem.u32(kProgHdr)) + 1));
            mem.write16(v + 0x20, mem.u8(int64_t(mem.u8(slot + 3)) + mem.u32(kVelTab) + 2));
            mem.write16(v + 0x22, mem.u8(tone + 0xb));
            const int32_t pan = std::max(0, std::min(0x7f, s16(int64_t(mem.u8(chan + 4)) + mem.u8(tone + 0xc) - 0x40)));
            mem.write16(v + 0x24, mem.u8(kPanTable + 2 * (pan >> 2)));
            mem.write16(v + 0x26, mem.u8(kPanTable + 2 * (pan >> 2) + 1));
            mem.write16(v + 0x28, mem.u8(chan + 3));
            mem.write16(v + 0x2a, mem.u8(mem.u32(kSq2)));
            const uint32_t fine = mem.u8(tone + 3);
            const uint32_t finePitch = fine | ((fine & 0x80) ? 0xff00u : 0u);
            mem.write16(v + 0x2c, finePitch);
            mem.write16(v + 0x2e, mem.u8(chan + 0xa));
            mem.write16(v + 0x30, mem.u8(tone + 0xd));
            mem.write16(v + 0x32, mem.u8(chan + 0xc));
            mem.write16(v + 0x34, mem.u8(tone + 2));
            mem.write16(v + 0x36, mem.u8(tone + 0xa));
            mem.write16(v + 0x38, mem.u8(chan + 4));
            mem.write16(v + 0x3a, mem.u8(tone + 0xc));
            if ((flags & 0x20) && mem.u8(chan + 9) != 0) {
                mem.write16(v + 0x10, mem.u8(tone + 0xe));
                mem.write16(v + 0x14, 1);
                mem.write16(v + 0x16, mem.u8(chan + 9));
            } else {
                mem.write16(v + 0x14, 0);
                mem.write16(v + 0x16, 0);
            }
            const uint32_t bit = uint32_t(1) << voice;
            const int32_t pitch = sequencerPitch(mem, mem.u8(tone + 2), mem.u8(slot + 2), s16(finePitch), mem.u8(chan + 0xa), mem.u8(tone + 0xd));
            const int32_t left = voiceVolume(voice, 0);
            const int32_t right = voiceVolume(voice, 1);
            const uint32_t address = uint32_t((int64_t(mem.u16(tone + 4)) + mem.u32(kBanks + 12 * int64_t(mem.u16(slot + 0x24)) + 4))) << 3;
            voiceParam(voice, reg::Voll, left);
            voiceParam(voice, reg::Volr, right);
            voiceParam(voice, reg::Pitch, pitch);
            s.setAddr(kSeqCore, voice, address);
            voiceParam(voice, reg::Adsr1, mem.u16(tone + 6));
            voiceParam(voice, reg::Adsr2, mem.u16(tone + 8));
            if (flags & 0x80) {
                s.setSwitch(kSeqCore, reg::Vmixel0, s.getSwitch(kSeqCore, reg::Vmixel0) | bit);
                s.setSwitch(kSeqCore, reg::Vmixer0, s.getSwitch(kSeqCore, reg::Vmixer0) | bit);
            } else {
                s.setSwitch(kSeqCore, reg::Vmixel0, s.getSwitch(kSeqCore, reg::Vmixel0) ^ bit);
                s.setSwitch(kSeqCore, reg::Vmixer0, s.getSwitch(kSeqCore, reg::Vmixer0) ^ bit);
            }
            mem.write32(slot + 0xc, mem.u32(slot + 0xc) | bit);
            mem.write16(kCtx + 0xc, mem.u16(kCtx + 0xc) + (mem.u16(kCtx + 0xc) < 0x18 ? 1 : 0));
            mem.write32(kTone, int64_t(mem.u32(kTone)) - (t << 4));
            if (single) break;
        }
        mem.write32(slot + 0x14, int64_t(mem.u32(slot + 0x14)) + 3);
    }

    void endOfSequence(int i) {
        const int64_t slot = slotAt(i);
        mem.write32(slot + 0x14, 0x110);
        mem.write16(slot + 0x28, 0);
        for (int j = 0; j < kVoiceCount; ++j) {
            const int64_t v = voiceAt(j);
            if (mem.u16(v + 6) == uint32_t(i)) {
                mem.write16(v + 0x14, 0);
                mem.write16(v + 0x2e, 0x40);
            }
        }
        mem.write8(slot + 1, mem.u8(slot));
    }

    void tempo(int i) {
        const int64_t slot = slotAt(i);
        const int64_t ev = int64_t(mem.u32(slot + 0x18)) + mem.u32(slot + 0x14);
        mem.write16(slot + 0x3e, (mem.u8(ev + 3) << 8) | mem.u8(ev + 2));
        const int32_t product = int32_t((uint32_t(mem.u16(slot + 0x40)) * uint32_t(mem.u16(slot + 0x3e))) << 12);
        const uint32_t hz = mem.u16(kCtx + 0xe);
        if (hz == 0) throw std::runtime_error("tick rate 0");
        const int32_t divided = product / int32_t(hz);
        mem.write32(slot + 8, div60(divided));
        mem.write32(slot + 0x14, int64_t(mem.u32(slot + 0x14)) + 4);
    }

    void programChange(int i) {
        const int64_t slot = slotAt(i);
        const int64_t chan = mem.u32(kChan);
        mem.write8(chan + 2, mem.u8(int64_t(mem.u32(slot + 0x14)) + mem.u32(kSq) + 1));
        mem.write8(chan + 0xa, 0x40);
        mem.write8(chan + 0xb, 0x40);
        mem.write32(slot + 0x14, int64_t(mem.u32(slot + 0x14)) + 2);
    }

    void controllerVolume(int i) {
        const int64_t slot = slotAt(i);
        const int64_t chan = mem.u32(kChan);
        const uint32_t value = mem.u8(int64_t(mem.u32(slot + 0x14)) + mem.u32(kSq) + 2);
        mem.write8(chan + 3, value);
        for (int j = 0; j < kVoiceCount; ++j) {
            const int64_t v = voiceAt(j);
            if (mem.u16(v) == 1 && mem.u16(v + 8) != 1 && mem.u16(v + 6) == uint32_t(i) && mem.u16(v + 0x1c) == mem.u16(slot + 0x24) &&
                mem.u16(v + 4) == (mem.u8(slot) & 0xfu)) {
                mem.write16(v + 0x28, mem.u8(int64_t(mem.u32(slot + 0x14)) + mem.u32(kSq) + 2));
                voiceParam(j, reg::Voll, voiceVolume(j, 0));
                voiceParam(j, reg::Volr, voiceVolume(j, 1));
            }
        }
        mem.write32(slot + 0x14, int64_t(mem.u32(slot + 0x14)) + 3);
    }

    void controllerPan(int i) {
        const int64_t slot = slotAt(i);
        const int64_t chan = mem.u32(kChan);
        const uint32_t value = mem.u8(int64_t(mem.u32(slot + 0x14)) + mem.u32(kSq) + 2);
        mem.write8(chan + 4, value);
        for (int j = 0; j < kVoiceCount; ++j) {
            const int64_t v = voiceAt(j);
            if (mem.u16(v + 4) == (mem.u8(slot) & 0xfu) && mem.u16(v + 0x1c) == mem.u16(slot + 0x24) && mem.u16(v + 6) == uint32_t(i) && mem.u16(v + 8) != 1 &&
                mem.u16(v) == 1) {
                mem.write16(v + 0x38, value);
                const int32_t pan = std::max(0, std::min(0x7f, s16(int64_t(mem.u16(v + 0x38)) + mem.u16(v + 0x3a) + 0xffc0)));
                mem.write16(v + 0x24, mem.u8(kPanTable + 2 * (pan >> 2)));
                mem.write16(v + 0x26, mem.u8(kPanTable + 2 * (pan >> 2) + 1));
                voiceParam(j, reg::Voll, voiceVolume(j, 0));
                voiceParam(j, reg::Volr, voiceVolume(j, 1));
            }
        }
        mem.write32(slot + 0x14, int64_t(mem.u32(slot + 0x14)) + 3);
    }

    void controllerLoopCount(int i) {
        const int64_t slot = slotAt(i);
        if (mem.u16(slot + 0x34) == 0) {
            mem.write16(slot + 0x30, mem.u8(slot + 3));
            mem.write16(slot + 0x34, 0);
        }
        mem.write32(slot + 0x14, int64_t(mem.u32(slot + 0x14)) + 3);
    }

    void controllerLoop(int i) {
        const int64_t slot = slotAt(i);
        const uint32_t value = mem.u8(slot + 3);
        if (value == 0x14) {
            mem.write16(slot + 0x2e, mem.u8(slot));
            mem.write32(slot + 0x38, mem.u32(slot + 0x14));
            mem.write16(slot + 0x32, 0);
            mem.write16(slot + 0x34, 0);
        } else if (value == 0x1e) {
            if (mem.u16(slot + 0x30) == 0x7f) {
                mem.write16(slot + 0x2c, 1);
            } else if (mem.u16(slot + 0x2a) >= mem.u16(slot + 0x30)) {
                mem.write16(slot + 0x2a, 0);
                mem.write32(slot + 0x38, 0);
                mem.write16(slot + 0x2c, 0);
            } else {
                mem.write16(slot + 0x2a, int64_t(mem.u16(slot + 0x2a)) + 1);
                mem.write16(slot + 0x2c, 1);
            }
            mem.write16(slot + 0x32, 0);
        }
        mem.write32(slot + 0x14, int64_t(mem.u32(slot + 0x14)) + 3);
    }

    void controller(int i) {
        const uint32_t cc = mem.u8(slotAt(i) + 2);
        if (cc == 7) return controllerVolume(i);
        if (cc == 10) return controllerPan(i);
        if (cc == 6) return controllerLoopCount(i);
        if (cc == 99) return controllerLoop(i);
        throw std::runtime_error("controller " + std::to_string(cc) + " is not modelled (SNDCLOKS does not use it)");
    }

    void releaseFinished() {
        for (int k = 0; k < kVoiceCount; ++k) {
            const uint32_t e = s.feed.tick(kSeqCore, uint32_t(k)) & 0xffffu;
            const int64_t v = voiceAt(k);
            if ((e & 0x7fff) < 3 && mem.u16(v + 8) == 1) {
                const uint32_t age = mem.u16(v + 0xa);
                for (int j = 0; j < kVoiceCount; ++j) {
                    const int64_t w = voiceAt(j);
                    if (age < mem.u16(w + 0xa) && mem.u16(w + 0xa) != 0xffff) mem.write16(w + 0xa, int64_t(mem.u16(w + 0xa)) - 1);
                }
                for (int b = 0; b < kVoiceSize; ++b) mem.write8(v + b, 0);
                mem.write16(v + 0x1c, 0xffff);
                mem.write16(v + 0xa, 0xffff);
                mem.write16(v + 6, 0xffff);
                mem.write16(kCtx + 0xc, int64_t(mem.u16(kCtx + 0xc)) - (mem.u16(kCtx + 0xc) != 0 ? 1 : 0));
            }
        }
    }

    void voiceUpdates() const {
        for (int j = 0; j < kVoiceCount; ++j) {
            const int64_t v = voiceAt(j);
            if (mem.u16(v) == 1 && mem.u16(v + 0x14) == 1 && mem.u16(v + 6) < 0x18) throw std::runtime_error("voice LFO update is not modelled (SNDCLOKS does not use it)");
        }
    }
};

}

int32_t voiceVolumeOf(const IopMemory& mem, int j, int side) {
    const int64_t v = kVoices + kVoiceSize * j;
    const uint32_t gain = side == 0 ? mem.u16(v + 0x24) : mem.u16(v + 0x26);
    int32_t t = imul(mem.u16(v + 0x2a), mem.u16(v + 0x28));
    t = imul(t, mem.u16(v + 0x1e));
    t = imul(t, mem.u16(v + 0x20));
    const int32_t scaled = t >> 14;
    const int32_t pan = imul(mem.u16(v + 0x22), s16(gain));
    int32_t r = (imul(scaled, pan) >> 14) & 0xffff;
    if (mem.u16(v + 0x36) != 0) r = int32_t((uint32_t(s16(r) >> 7) | (uint32_t(mem.u16(v + 0x36)) << 8)) & 0xffff);
    return r;
}

void Driver::State::tick() { Sequencer(*this).run(); }

}
