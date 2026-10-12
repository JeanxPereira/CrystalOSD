#include "Audio/ClockSound.hpp"

#include <algorithm>
#include <array>
#include <stdexcept>
#include <string>
#include <utility>

#include "Audio/driver/SnapshotBuilder.hpp"

namespace audio {
namespace {

struct Timed {
    uint32_t offset;
    uint32_t id;
    std::array<uint32_t, 5> words;
};

constexpr uint64_t kCyclesPerSample = 768;
constexpr uint32_t kFirstTickAfterInit = 8808;

constexpr std::array<Timed, 43> kInitCommands{{
    {0, 0x6010, {4u, 68u, 4096u, 0u, 64u}},
    {47, 0x61a0, {965632u, 20496u, 65536u, 0u, 7u}},
    {50, 0x6070, {4u, 68u, 0u, 2684493968u, 64u}},
    {1082, 0x61a0, {965632u, 86032u, 65536u, 0u, 13u}},
    {1085, 0x6070, {4u, 68u, 0u, 2684494736u, 64u}},
    {2119, 0x61a0, {965632u, 151568u, 65536u, 0u, 19u}},
    {2123, 0x6070, {4u, 68u, 0u, 2684495504u, 64u}},
    {3154, 0x61a0, {965632u, 217104u, 65536u, 0u, 25u}},
    {3157, 0x6070, {4u, 68u, 0u, 2684496272u, 64u}},
    {4188, 0x61a0, {965632u, 282640u, 65536u, 0u, 0u}},
    {4192, 0x6070, {4u, 68u, 0u, 2684493072u, 64u}},
    {5223, 0x61a0, {965632u, 348176u, 65536u, 0u, 6u}},
    {5226, 0x6070, {4u, 68u, 0u, 2684493840u, 64u}},
    {6261, 0x61a0, {965632u, 544784u, 65536u, 0u, 12u}},
    {6264, 0x6070, {4u, 68u, 0u, 2684494608u, 64u}},
    {7299, 0x8070, {2u, 1u, 4096u, 0u, 5u}},
    {7301, 0x8070, {3u, 1u, 0u, 2684493712u, 64u}},
    {7304, 0x8010, {2049u, 4095u, 0u, 2684493968u, 64u}},
    {7306, 0x60c0, {0u, 4u, 0u, 2684494224u, 64u}},
    {7833, 0x60c0, {1u, 4u, 0u, 2684494480u, 64u}},
    {8354, 0x6060, {965632u, 20496u, 0u, 2684494736u, 64u}},
    {8357, 0x6060, {990208u, 544784u, 0u, 2684494992u, 64u}},
    {8359, 0x60a0, {60u, 68u, 0u, 2684495248u, 64u}},
    {8363, 0x6090, {0u, 969728u, 0u, 2684495504u, 64u}},
    {8365, 0x6090, {0u, 973824u, 0u, 2684495760u, 64u}},
    {8368, 0x6090, {0u, 977920u, 0u, 2684496016u, 64u}},
    {8371, 0x6090, {0u, 982016u, 0u, 2684496272u, 64u}},
    {8375, 0x6090, {0u, 986112u, 0u, 2684496528u, 64u}},
    {8379, 0x6090, {0u, 994304u, 0u, 2684492816u, 64u}},
    {8382, 0x6090, {0u, 998400u, 0u, 2684493072u, 64u}},
    {8384, 0x6090, {0u, 1002496u, 0u, 2684493328u, 64u}},
    {8388, 0x6130, {0u, 66u, 0u, 2684493584u, 64u}},
    {8391, 0x6130, {1u, 42u, 0u, 2684493840u, 64u}},
    {8394, 0x6130, {2u, 45u, 0u, 2684494096u, 64u}},
    {8397, 0x6130, {3u, 27u, 0u, 2684494352u, 64u}},
    {8400, 0x6130, {4u, 27u, 0u, 2684494608u, 64u}},
    {8403, 0x6130, {5u, 27u, 0u, 2684494864u, 64u}},
    {8406, 0x6130, {6u, 54u, 0u, 2684495120u, 64u}},
    {8409, 0x6130, {7u, 54u, 0u, 2684495376u, 64u}},
    {8412, 0x6310, {1u, 28u, 0u, 2684495632u, 64u}},
    {8414, 0x6120, {0u, 16383u, 16383u, 2684495888u, 64u}},
    {8417, 0x6120, {1u, 16383u, 16383u, 2684496144u, 64u}},
    {8419, 0x6200, {4u, 68u, 0u, 2684496400u, 64u}},
}};

class ModelledStamp final : public WriteTiming {
public:
    uint64_t sample(const WriteContext& context) override { return context.eventSample + context.write.cycle / kCyclesPerSample; }
};

constexpr uint32_t kWarmupTicks = 14;
constexpr uint32_t kWarmupTickCycles = 299872;
constexpr uint32_t kWarmupEndCycles = 362012;

uint32_t tickCycles(Video video, uint32_t index) {
    if (video == Video::Pal) return 603968;
    if (index < kWarmupTicks - 1) return kWarmupTickCycles;
    if (index == kWarmupTicks - 1) return kWarmupEndCycles;
    return driver::kTickCyclesNtsc;
}

}

ClockSoundSources clockSoundSources(const std::filesystem::path& resources) {
    driver::SoundImages images = driver::buildSoundImages(resources);
    ClockSoundSources sources;
    sources.snapshot = std::move(images.snapshot);
    sources.libsd = std::move(images.libsd);
    sources.spuRam = std::move(images.spuRam);
    return sources;
}

ClockSoundSources clockSoundSources(const assets::AssetSet& decoded) {
    const assets::Asset* program = decoded.find("PROGRAM");
    const assets::Asset* sounds = decoded.find("SNDIMAGE");
    if (!program || !sounds) throw std::runtime_error(std::string("the decoded set lacks ") + (program ? "SNDIMAGE" : "PROGRAM") + ": give --resources once to decode it");
    driver::SoundImages images = driver::buildSoundImages(program->data, data::SndImage::fromContainer(sounds->data));
    ClockSoundSources sources;
    sources.snapshot = std::move(images.snapshot);
    sources.libsd = std::move(images.libsd);
    sources.spuRam = std::move(images.spuRam);
    return sources;
}

ClockSound::ClockSound(const std::filesystem::path& resources, ClockSoundOptions options) : ClockSound(clockSoundSources(resources), options) {}

ClockSound::ClockSound(ClockSoundSources sources, ClockSoundOptions options) : m_options(options), m_timing(std::make_shared<EntryStamp>()) {
    m_spu.loadRam(sources.spuRam);
    m_spu.setTicks(sources.spuTicks);
    driver::EnvxFeed feed;
    const auto own = [this](uint32_t core, uint32_t voice) -> uint16_t { return uint16_t(m_spu.voice(int(core), int(voice)).envelope.level); };
    feed.tick = own;
    feed.allocation = own;
    m_driver = std::make_unique<driver::Driver>(sources.snapshot, std::move(sources.libsd), feed, true);
    if (m_options.modelledWrites) {
        m_driver->enableTiming();
        m_driver->setDmaCompletion(driver::nominalDmaCompletion());
        m_timing = std::make_shared<ModelledStamp>();
    }
    uint64_t firstTick = 0;
    if (m_options.replayInit) {
        for (const Timed& t : kInitCommands) {
            DriverCommand c;
            c.id = t.id;
            c.words = t.words;
            enqueue(t.offset, c);
        }
        firstTick = kFirstTickAfterInit;
        m_log.clear();
    }
    if (m_options.autoTicks) {
        m_nextTickCycle = firstTick * kCyclesPerSample;
        scheduleAutoTick();
    }
    if (m_options.preRollSamples > 0) {
        std::vector<int16_t> discard(size_t(2) * m_options.preRollSamples);
        render(discard.data(), m_options.preRollSamples);
    }
}

void ClockSound::setWriteTiming(std::shared_ptr<WriteTiming> timing) {
    std::lock_guard lock(m_lock);
    m_timing = timing ? std::move(timing) : std::make_shared<EntryStamp>();
}

uint32_t ClockSound::frameOf(uint64_t sample) const {
    const uint64_t centiHertz = m_options.video == Video::Pal ? 5000 : 5994;
    return uint32_t(sample * centiHertz / (48000 * 100));
}

void ClockSound::enqueue(uint64_t sample, const DriverCommand& command) {
    Event e;
    e.command = command;
    e.frame = command.frame != 0 ? command.frame : frameOf(sample);
    e.command.frame = e.frame;
    m_log.push_back({sample, e.command});
    m_events.emplace(std::pair<uint64_t, int>{sample, 0}, std::move(e));
}

void ClockSound::scheduleAutoTick() {
    Event e;
    e.tick = true;
    e.automatic = true;
    const uint64_t sample = m_nextTickCycle / kCyclesPerSample;
    e.frame = frameOf(sample);
    m_events.emplace(std::pair<uint64_t, int>{sample, 1}, std::move(e));
    m_nextTickCycle += tickCycles(m_options.video, m_tickIndex++);
}

void ClockSound::scheduleTick(uint64_t sample, uint32_t frame) {
    std::lock_guard lock(m_lock);
    Event e;
    e.tick = true;
    e.frame = frame;
    m_events.emplace(std::pair<uint64_t, int>{sample, 1}, std::move(e));
}

void ClockSound::queue(const DriverCommand& command) {
    std::lock_guard lock(m_lock);
    enqueue(std::max<uint64_t>(command.sample, m_mixed), command);
}

std::vector<LoggedCommand> ClockSound::commandLog() const {
    std::lock_guard lock(m_lock);
    return m_log;
}

uint64_t ClockSound::position() const {
    std::lock_guard lock(m_lock);
    return m_mixed;
}

void ClockSound::run(uint64_t sample, const Event& event) {
    m_driver->beginFrame(event.frame);
    if (event.tick) m_driver->tick();
    else m_driver->command(event.command);
    for (const driver::FillEvent& f : m_driver->takeFills()) m_spu.clearRam(f.start, f.bytes);
    size_t index = 0;
    for (const SpuWrite& w : m_driver->takeWrites()) {
        WriteContext context;
        context.tick = event.tick;
        context.id = event.command.id;
        context.eventSample = sample;
        context.index = index++;
        context.write = w;
        const uint64_t stamp = std::max<uint64_t>(m_timing->sample(context), m_mixed);
        m_pending.emplace(stamp, Pending{w.address, w.value});
    }
}

void ClockSound::render(int16_t* out, size_t frames) {
    std::lock_guard lock(m_lock);
    for (size_t i = 0; i < frames; ++i) {
        while (!m_events.empty() && m_events.begin()->first.first <= m_mixed) {
            const auto it = m_events.begin();
            const Event event = it->second;
            const uint64_t at = it->first.first;
            m_events.erase(it);
            if (event.automatic) scheduleAutoTick();
            run(at, event);
        }
        for (auto it = m_pending.begin(); it != m_pending.end() && it->first <= m_mixed; it = m_pending.erase(it)) m_spu.write(it->second.address, it->second.value);
        m_spu.mix();
        out[2 * i] = m_spu.finalLeft();
        out[2 * i + 1] = m_spu.finalRight();
        ++m_mixed;
    }
}

}
