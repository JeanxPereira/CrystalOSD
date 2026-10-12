#pragma once
#include <array>
#include <cstdint>
#include <functional>
#include <optional>
#include <span>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#include "Assets/Bytes.hpp"
#include "Audio/SpuWrite.hpp"

namespace audio::driver {

inline constexpr uint32_t kVblankHandlerCycles = 8431;
inline constexpr uint32_t kIopCyclesPerSample = 768;

struct EnvxRead {
    uint32_t core = 0;
    uint32_t voice = 0;
    uint16_t value = 0;
};

struct TimedWrite {
    uint32_t address = 0;
    uint16_t value = 0;
    uint32_t cycle = 0;
    uint32_t resume = 0;
};

using DmaCompletion = std::function<std::optional<uint32_t>(uint32_t ordinal, uint32_t entry)>;

// psx-spx documents the PS1 SPU only and gives no SPU2 DMA rate. 12622 is the shortest observed time of one 1 KiB chunk in Watson (PCSX2)
// boot-a, the emulator's floor; 751 is the unmodelled kernel-call time between the clock's wait entry and the transfer start (mode of 167 waits).
inline constexpr uint32_t kDmaChunkCycles = 12622;
inline constexpr uint32_t kDmaStartCycles = 751;

inline DmaCompletion nominalDmaCompletion() {
    return [](uint32_t, uint32_t entry) -> std::optional<uint32_t> { return entry + kDmaStartCycles + kDmaChunkCycles; };
}

struct HandlerTiming {
    std::vector<TimedWrite> writes;
    uint32_t instructions = 0;
    uint32_t unmodelledStubs = 0;
    uint32_t unmeasuredOps = 0;
};

void addVblankPreemption(std::span<SpuWrite> writes, uint64_t entryCycle, std::span<const uint64_t> vblankCycles);

inline uint64_t sampleOfCycle(uint64_t cycle, uint64_t originCycle) { return (cycle - originCycle) / kIopCyclesPerSample; }

class IopClock {
public:
    IopClock(assets::View libsd, assets::View osdsnd, assets::View iop);

    void seed(uint32_t address, uint16_t value);
    void setDmaCompletion(DmaCompletion completion) { m_dma = std::move(completion); }
    HandlerTiming tick(std::span<const EnvxRead> envx);
    HandlerTiming command(uint32_t id, const std::array<uint32_t, 5>& words, std::span<const EnvxRead> envx);

private:
    struct Counters {
        uint32_t instructions = 0;
        uint32_t multiplies = 0;
        uint32_t divides = 0;
    };
    struct Call {
        uint32_t target = 0;
        uint32_t length = 0;
    };

    HandlerTiming run(uint32_t entry, std::span<const uint32_t> args, uint32_t handlerId, bool isCommand, std::span<const EnvxRead> envx);
    void step();
    void execute(uint32_t word, uint32_t at);
    void delaySlot(uint32_t at);
    void tally(uint32_t word);
    void enterBlock(uint32_t at);
    uint32_t compile(uint32_t start) const;
    void stub(uint32_t at);
    void hostFill(uint32_t at);
    uint32_t stubCost(const Call& call, uint32_t ordinal) const;

    uint32_t load(uint32_t address, int size, bool sign);
    void store(uint32_t address, int size, uint32_t value);
    uint32_t mmioRead(uint32_t address);
    void mmioWrite(uint32_t address, uint32_t value);
    uint32_t ramIndex(uint32_t address, uint32_t size) const;

    std::vector<uint8_t> m_ram;
    std::array<int32_t, 32> m_r{};
    int32_t m_hi = 0;
    int32_t m_lo = 0;
    uint32_t m_pc = 0;
    std::unordered_map<uint32_t, uint16_t> m_values;
    std::unordered_map<uint32_t, uint32_t> m_blocks;
    std::unordered_set<uint32_t> m_loopHeads;
    uint32_t m_blockEnd = 0xffffffffu;
    bool m_boundary = false;
    Counters m_count;
    Counters m_seen;
    uint32_t m_stubCycles = 0;
    uint32_t m_ordinal = 0;
    uint32_t m_dmaOrdinal = 0;
    uint32_t m_resume = 0;
    DmaCompletion m_dma;
    uint32_t m_handlerIsInit = 0;
    HandlerTiming* m_out = nullptr;
    std::unordered_map<uint32_t, std::vector<uint16_t>> m_envx;
    std::unordered_map<uint32_t, uint16_t> m_envxLast;
};

}
