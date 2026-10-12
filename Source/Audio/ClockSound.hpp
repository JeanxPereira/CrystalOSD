#pragma once
#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <map>
#include <memory>
#include <mutex>
#include <utility>
#include <vector>

#include "Assets/Bytes.hpp"
#include "Assets/Resources.hpp"
#include "Audio/SpuWrite.hpp"
#include "Audio/driver/Driver.hpp"
#include "Audio/spu2/Spu2.hpp"

namespace audio {

enum class Video { Ntsc, Pal };

struct ClockSoundSources {
    driver::Snapshot snapshot;
    assets::Bytes libsd;
    assets::Bytes spuRam;
    uint32_t spuTicks = 0;
};

ClockSoundSources clockSoundSources(const std::filesystem::path& resources);
ClockSoundSources clockSoundSources(const assets::AssetSet& decoded);

struct ClockSoundOptions {
    Video video = Video::Ntsc;
    bool autoTicks = true;
    bool replayInit = true;
    bool modelledWrites = false;
    uint64_t preRollSamples = 0;
};

struct LoggedCommand {
    uint64_t sample = 0;
    DriverCommand command;
};

struct WriteContext {
    bool tick = false;
    uint32_t id = 0;
    uint64_t eventSample = 0;
    size_t index = 0;
    SpuWrite write;
};

class WriteTiming {
public:
    virtual ~WriteTiming() = default;
    virtual uint64_t sample(const WriteContext& context) = 0;
};

class EntryStamp final : public WriteTiming {
public:
    uint64_t sample(const WriteContext& context) override { return context.eventSample; }
};

class ClockSound {
public:
    explicit ClockSound(ClockSoundSources sources, ClockSoundOptions options = {});
    explicit ClockSound(const std::filesystem::path& resources, ClockSoundOptions options = {});
    ClockSound(const ClockSound&) = delete;
    ClockSound& operator=(const ClockSound&) = delete;

    void setWriteTiming(std::shared_ptr<WriteTiming> timing);
    void queue(const DriverCommand& command);
    void scheduleTick(uint64_t sample, uint32_t frame);
    void render(int16_t* interleavedStereo, size_t frames);
    uint64_t position() const;
    std::vector<LoggedCommand> commandLog() const;

private:
    struct Event {
        bool tick = false;
        bool automatic = false;
        uint32_t frame = 0;
        DriverCommand command;
    };
    struct Pending {
        uint32_t address;
        uint16_t value;
    };

    uint32_t frameOf(uint64_t sample) const;
    void enqueue(uint64_t sample, const DriverCommand& command);
    void scheduleAutoTick();
    void run(uint64_t sample, const Event& event);

    mutable std::mutex m_lock;
    ClockSoundOptions m_options;
    audio::spu2::Spu2 m_spu;
    std::unique_ptr<driver::Driver> m_driver;
    std::shared_ptr<WriteTiming> m_timing;
    std::multimap<std::pair<uint64_t, int>, Event> m_events;
    std::vector<LoggedCommand> m_log;
    std::multimap<uint64_t, Pending> m_pending;
    uint64_t m_mixed = 0;
    uint64_t m_nextTickCycle = 0;
    uint32_t m_tickIndex = 0;
};

}
