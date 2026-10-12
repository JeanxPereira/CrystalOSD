#include "Audio/driver/Driver.hpp"

#include <stdexcept>
#include <string>

#include "Audio/driver/State.hpp"

namespace audio::driver {

Driver::State::State(const Snapshot& snapshot, assets::Bytes libsdImage, EnvxFeed envx, bool coldStart) : lib(std::move(libsdImage)), feed(std::move(envx)) {
    if (coldStart)
        for (int core : {0, 1})
            for (int at : {0x24, 0x2c, 0x30}) lib.write32(kLibsdState + at + 20 * core, 0);
    mem.load(kOsdsndBase, snapshot.osdsnd);
    mem.load(kSoundIopBase, snapshot.iop);
    this->snapshot = snapshot;
    const assets::View image = lib.bytes();
    libsdStart.assign(image.begin(), image.end());
}

uint32_t Driver::State::getSwitch(int64_t core, uint32_t offset0) const {
    return uint32_t(regs.read(reg::core(core, offset0))) | uint32_t(regs.read(reg::core(core, offset0 + 2))) << 16;
}

void Driver::State::setSwitch(int64_t core, uint32_t offset0, uint32_t bits) {
    regs.write(reg::core(core, offset0), bits & 0xffff);
    regs.write(reg::core(core, offset0 + 2), (bits >> 16) & 0xffff);
}

void Driver::State::setAddr(int64_t core, int64_t voice, uint32_t byteAddress) {
    const uint32_t half = byteAddress >> 1;
    regs.write(reg::voiceStart(core, voice, false), half >> 16);
    regs.write(reg::voiceStart(core, voice, true), half & 0xffff);
}

Driver::Driver(const Snapshot& snapshot, assets::Bytes libsd, EnvxFeed feed, bool coldStart)
    : m_state(std::make_unique<State>(snapshot, std::move(libsd), std::move(feed), coldStart)) {}

Driver::~Driver() = default;

void Driver::seedRegister(uint32_t address, uint16_t value) {
    m_state->regs.seed(address, value);
    if (m_state->clock) m_state->clock->seed(address, value);
}

void Driver::beginFrame(uint32_t frame) { m_state->regs.frame = frame; }

namespace {

void stamp(Driver::State& s, size_t first, const HandlerTiming& timing, const std::string& what) {
    auto& log = s.regs.log;
    if (log.size() - first != timing.writes.size()) throw std::runtime_error(what + ": the IOP clock ran " + std::to_string(timing.writes.size()) + " writes, the driver " + std::to_string(log.size() - first));
    for (size_t k = 0; k < timing.writes.size(); ++k) {
        SpuWrite& w = log[first + k];
        if (w.address != timing.writes[k].address || w.value != timing.writes[k].value)
            throw std::runtime_error(what + ": the IOP clock write " + std::to_string(k) + " differs from the driver's");
        w.cycle = timing.writes[k].cycle;
        w.resume = timing.writes[k].resume;
    }
}

}

void Driver::enableTiming() {
    if (m_state->clock) return;
    State& s = *m_state;
    if (s.started) throw std::runtime_error("write timing is enabled before the first event");
    s.clock = std::make_unique<IopClock>(s.libsdStart, s.snapshot.osdsnd, s.snapshot.iop);
    for (const auto& [address, value] : s.regs.values) s.clock->seed(address, value);
    EnvxFeed inner = s.feed;
    s.feed.tick = [&s, inner](uint32_t core, uint32_t voice) {
        const uint16_t v = inner.tick(core, voice);
        s.envxLog.push_back({core, voice, v});
        return v;
    };
    s.feed.allocation = [&s, inner](uint32_t core, uint32_t voice) {
        const uint16_t v = inner.allocation(core, voice);
        s.envxLog.push_back({core, voice, v});
        return v;
    };
}

void Driver::setDmaCompletion(DmaCompletion completion) {
    if (!m_state->clock) throw std::runtime_error("the DMA completion is set before write timing is enabled");
    m_state->clock->setDmaCompletion(std::move(completion));
}

bool Driver::timing() const { return bool(m_state->clock); }

void Driver::command(const DriverCommand& command) {
    State& s = *m_state;
    const size_t first = s.regs.log.size();
    s.started = true;
    s.envxLog.clear();
    if (command.id == 0x6300) s.effect(command);
    else if (command.id == 0x60d0 || command.id == 0x6120) s.ramp(command);
    else s.init(command);
    if (s.clock) stamp(s, first, s.clock->command(command.id, command.words, s.envxLog), "command " + std::to_string(command.id));
}

void Driver::tick() {
    State& s = *m_state;
    const size_t first = s.regs.log.size();
    s.started = true;
    s.envxLog.clear();
    s.tick();
    if (s.clock) stamp(s, first, s.clock->tick(s.envxLog), "tick");
}

WriteStream Driver::takeWrites() {
    WriteStream out;
    out.swap(m_state->regs.log);
    return out;
}

std::vector<FillEvent> Driver::takeFills() {
    std::vector<FillEvent> out;
    out.swap(m_state->fills);
    return out;
}

}
