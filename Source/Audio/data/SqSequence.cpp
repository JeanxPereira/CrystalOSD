#include "Audio/data/SqSequence.hpp"

#include <cstring>
#include <stdexcept>

namespace audio::data {

namespace {

constexpr size_t kMagicAt = 0xC, kChannelsAt = 0x10, kChannelSize = 16, kChannelCount = 16, kEventsAt = 0x110;
constexpr uint8_t kNoProgram = 0xFF;

uint8_t byteAt(assets::View d, size_t at) {
    if (at >= d.size()) throw std::runtime_error("SQ read past the end");
    return d[at];
}

}

SqSequence SqSequence::parse(assets::View data) {
    if (data.size() < kEventsAt || std::memcmp(data.data() + kMagicAt, "SSsq", 4) != 0) throw std::runtime_error("not an SSsq sequence");
    SqSequence seq;
    seq.volume = assets::le16(data, 0);
    seq.resolution = assets::le16(data, 2);
    seq.tempo = assets::le32(data, 4);
    for (size_t c = 0; c < kChannelCount; ++c) {
        const size_t o = kChannelsAt + kChannelSize * c;
        if (data[o + 2] == kNoProgram) continue;
        seq.channels.push_back({data[o + 1], data[o + 2], data[o + 3], data[o + 4]});
    }
    size_t at = kEventsAt;
    uint32_t tick = 0;
    uint8_t status = 0;
    for (;;) {
        uint8_t s = byteAt(data, at);
        if (s & 0x80) {
            status = s;
            ++at;
        } else {
            s = status;
        }
        if (s == 0) throw std::runtime_error("SQ event without a status");
        SqEvent event;
        event.tick = tick;
        event.status = s;
        if (s == 0xFF) {
            const uint8_t type = byteAt(data, at++);
            event.data1 = type;
            if (type == 0x2F) {
                seq.events.push_back(event);
                break;
            }
            if (type != 0x51) throw std::runtime_error("unknown SQ meta event");
            event.tempo = uint32_t(byteAt(data, at)) | uint32_t(byteAt(data, at + 1)) << 8 | uint32_t(byteAt(data, at + 2)) << 16;
            at += 3;
            seq.events.push_back(event);
            continue;
        }
        event.data1 = byteAt(data, at++);
        const uint8_t kind = s & 0xF0;
        if (kind != 0xC0 && kind != 0xD0) {
            event.data2 = byteAt(data, at++);
            event.hasData2 = true;
        }
        seq.events.push_back(event);
        uint32_t delta = 0;
        for (int i = 0;; ++i) {
            if (i == 4) throw std::runtime_error("SQ VLQ longer than four bytes");
            const uint8_t c = byteAt(data, at++);
            delta = (delta << 7) | (c & 0x7F);
            if ((c & 0x80) == 0) break;
        }
        tick += delta;
    }
    return seq;
}

}
