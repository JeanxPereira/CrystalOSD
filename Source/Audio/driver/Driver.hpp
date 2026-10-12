#pragma once
#include <cstdint>
#include <functional>
#include <memory>
#include <vector>

#include "Audio/SpuWrite.hpp"
#include "Audio/driver/IopClock.hpp"
#include "Audio/driver/Memory.hpp"

namespace audio::driver {

struct EnvxFeed {
    std::function<uint16_t(uint32_t core, uint32_t voice)> tick;
    std::function<uint16_t(uint32_t core, uint32_t voice)> allocation;
};

struct FillEvent {
    uint32_t core = 0;
    uint32_t start = 0;
    uint64_t bytes = 0;
    uint64_t transferred = 0;
};

inline constexpr uint32_t kTickCyclesNtsc = 599776;

class Driver {
public:
    Driver(const Snapshot& snapshot, assets::Bytes libsd, EnvxFeed feed, bool coldStart = false);
    ~Driver();
    Driver(const Driver&) = delete;
    Driver& operator=(const Driver&) = delete;

    void seedRegister(uint32_t address, uint16_t value);
    void enableTiming();
    void setDmaCompletion(DmaCompletion completion);
    bool timing() const;
    void beginFrame(uint32_t frame);
    void command(const DriverCommand& command);
    void tick();
    WriteStream takeWrites();
    std::vector<FillEvent> takeFills();

    struct State;

private:
    std::unique_ptr<State> m_state;
};

}
