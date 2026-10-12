#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <vector>

namespace audio {

struct SoundCommand {
    uint16_t id = 0, a1 = 0, a2 = 0, a3 = 0;
    bool operator==(const SoundCommand&) const = default;
};

class EeSoundQueue {
public:
    static constexpr size_t kEntries = 128;
    static constexpr int kRampSteps = 15;

    explicit EeSoundQueue(int32_t rampCounter = 0, bool sendsRamp = true) : m_rampCounter(rampCounter), m_sendsRamp(sendsRamp) {}

    bool enqueue(const SoundCommand& command);
    std::vector<SoundCommand> drain();

    uint16_t carriedA2() const { return m_carriedA2; }
    uint16_t carriedA3() const { return m_carriedA3; }

private:
    bool push(const SoundCommand& command);
    std::array<SoundCommand, kEntries> m_slots{};
    uint32_t m_head = 0, m_tail = 0;
    int32_t m_rampCounter = 0;
    bool m_sendsRamp = true;
    uint16_t m_carriedA2 = 0, m_carriedA3 = 0;
};

}
