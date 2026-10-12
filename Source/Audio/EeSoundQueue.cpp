#include "Audio/EeSoundQueue.hpp"

namespace audio {

namespace {
constexpr uint16_t kDedupId = 0x6300;
constexpr uint16_t kRampId = 0x60D0;
}

bool EeSoundQueue::push(const SoundCommand& command) {
    if (m_head - m_tail >= kEntries) return false;
    m_slots[m_head & (kEntries - 1)] = command;
    m_head += 1;
    return true;
}

// sound_handler_queue_cmd (HDD 0x00200C00): drop at head - tail >= 128; a3 and a2 are left as 0x1F0658 + 8s and 0x1F065C + 8s (0x00200CB4, 0x00200CC0).
bool EeSoundQueue::enqueue(const SoundCommand& command) {
    const uint32_t s = m_head & (kEntries - 1);
    if (!push(command)) return false;
    m_carriedA3 = static_cast<uint16_t>(0x0658 + 8 * s);
    m_carriedA2 = static_cast<uint16_t>(0x065C + 8 * s);
    return true;
}

// sound_handler_exec_queue_cmd (HDD 0x00200A80): dedup of equal-a2 0x6300 (0x00200B2C..0x00200B5C), tail = head, then sound_handler_2009E0(15) in the pad/sound thread, whose registers are not the sender's.
std::vector<SoundCommand> EeSoundQueue::drain() {
    std::vector<SoundCommand> sends;
    const uint32_t head = m_head;
    bool seen = false;
    uint16_t previous = 0;
    for (uint32_t at = m_tail; at != head; ++at) {
        SoundCommand& slot = m_slots[at & (kEntries - 1)];
        if (slot.id == 0) continue;
        bool send = true;
        if (slot.id == kDedupId && seen && previous == slot.a2) send = false;
        else previous = slot.a2;
        seen = true;
        if (send && (m_sendsRamp || slot.id != kRampId)) sends.push_back(slot);
        slot = SoundCommand{};
    }
    m_tail = head;
    if (m_rampCounter < kRampSteps) {
        const uint32_t v = static_cast<uint32_t>((0x9FFEC * static_cast<int64_t>(m_rampCounter) / 0x7F) / kRampSteps);
        push({kRampId, 1, static_cast<uint16_t>(v), static_cast<uint16_t>(v)});
        m_rampCounter += 1;
    }
    return sends;
}

}
