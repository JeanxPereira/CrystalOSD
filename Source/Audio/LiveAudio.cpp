#include "Audio/LiveAudio.hpp"

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <fstream>

#include <SDL3/SDL.h>

#include "Core/Log.hpp"

namespace audio {
namespace {

constexpr int kRate = 48000;
constexpr uint64_t kSamplesNumerator = 4004, kSamplesDenominator = 5;
constexpr uint32_t kPrefillFrames = 4;
constexpr uint32_t kMaxQueuedFrames = 8;
constexpr uint32_t kFrameSamples = 801;
constexpr uint64_t kUnmeasuredSendSpacing = 26;
constexpr uint64_t kEeStartAfterInit = 15000;
constexpr uint16_t kRampId = 0x60D0;
constexpr uint16_t kSpdifId = 0x8070;

uint64_t spacingAfter(uint16_t id) {
    switch (id) {
    case 0x6140: return 3;
    case 0x6150: return 23;
    default: return kUnmeasuredSendSpacing;
    }
}

void put32(std::vector<uint8_t>& b, uint32_t v) {
    for (int k = 0; k < 4; ++k) b.push_back(uint8_t(v >> (8 * k)));
}

void writeWavFile(const std::filesystem::path& path, const std::vector<int16_t>& samples) {
    std::vector<uint8_t> h;
    const uint32_t bytes = uint32_t(samples.size() * 2);
    for (char c : {'R', 'I', 'F', 'F'}) h.push_back(uint8_t(c));
    put32(h, 36 + bytes);
    for (char c : {'W', 'A', 'V', 'E', 'f', 'm', 't', ' '}) h.push_back(uint8_t(c));
    put32(h, 16);
    h.push_back(1), h.push_back(0), h.push_back(2), h.push_back(0);
    put32(h, kRate);
    put32(h, kRate * 4);
    h.push_back(4), h.push_back(0), h.push_back(16), h.push_back(0);
    for (char c : {'d', 'a', 't', 'a'}) h.push_back(uint8_t(c));
    put32(h, bytes);
    std::ofstream out(path, std::ios::binary);
    out.write(reinterpret_cast<const char*>(h.data()), std::streamsize(h.size()));
    out.write(reinterpret_cast<const char*>(samples.data()), std::streamsize(bytes));
}

}

LiveAudio::LiveAudio(ClockSoundSources sources, const LiveAudioOptions& options)
    : m_sound(std::move(sources), ClockSoundOptions{options.video, true, true, true, kEeStartAfterInit}), m_options(options), m_muted(options.mute) {
    m_stats.minQueuedFrames = UINT32_MAX;
    if (!options.device) {
        core::log(core::Level::Info, core::Subsystem::Audio, "device off");
        return;
    }
    if (SDL_InitSubSystem(SDL_INIT_AUDIO)) {
        m_sdl = true;
        const SDL_AudioSpec spec{SDL_AUDIO_S16, 2, kRate};
        m_stream = SDL_OpenAudioDeviceStream(SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK, &spec, nullptr, nullptr);
        if (m_stream != nullptr) {
            std::vector<int16_t> silence(size_t(2) * kFrameSamples * kPrefillFrames, 0);
            SDL_PutAudioStreamData(m_stream, silence.data(), int(silence.size() * 2));
            SDL_ResumeAudioStreamDevice(m_stream);
            m_stats.deviceOpen = true;
        } else {
            core::log(core::Level::Warn, core::Subsystem::Audio, "no output device: {}", SDL_GetError());
        }
    } else {
        core::log(core::Level::Warn, core::Subsystem::Audio, "SDL audio init failed: {}", SDL_GetError());
    }
    core::log(core::Level::Info, core::Subsystem::Audio, "device {}", m_stats.deviceOpen ? "open" : "none");
}

LiveAudio::~LiveAudio() {
    if (m_stream != nullptr) SDL_DestroyAudioStream(m_stream);
    if (m_sdl) SDL_QuitSubSystem(SDL_INIT_AUDIO);
}

template <class F> void LiveAudio::guarded(F&& body) {
    if (m_stats.failed) return;
    try {
        body();
    } catch (const std::exception& error) {
        m_stats.failed = true;
        m_error = error.what();
        core::log(core::Level::Error, core::Subsystem::Audio, "stopped: {}", m_error);
    }
}

void LiveAudio::queue(const SoundCommand& command, bool carriedA2, bool carriedA3) {
    SoundCommand c = command;
    if (carriedA2) c.a2 = m_queue.carriedA2();
    if (carriedA3) c.a3 = m_queue.carriedA3();
    m_queue.enqueue(c);
}

namespace {
uint32_t extend(uint16_t halfword) { return uint32_t(int32_t(int16_t(halfword))); }
}

std::vector<SoundCommand> LiveAudio::drain() {
    if (m_skipDrain) {
        m_skipDrain = false;
        return {};
    }
    std::vector<SoundCommand> sent = m_queue.drain();
    for (const SoundCommand& c : sent)
        if (c.id == kRampId) m_skipDrain = true;
    if (m_stats.failed) return sent;
    uint64_t at = m_sound.position();
    uint16_t previous = 0;
    const auto send = [&](const DriverCommand& d, uint16_t id) {
        if (previous != 0) at += spacingAfter(previous);
        DriverCommand c = d;
        c.sample = at;
        guarded([&] { m_sound.queue(c); });
        previous = id;
    };
    for (const SoundCommand& c : sent) {
        DriverCommand d;
        d.id = c.id;
        d.words = {extend(c.a1), extend(c.a2), extend(c.a3), 0, 0};
        core::log(core::Level::Debug, core::Subsystem::Audio, "send {:x} {} {} {}", c.id, c.a1, c.a2, c.a3);
        send(d, c.id);
    }
    if (m_spdifPending) {
        m_spdifPending = false;
        DriverCommand d;
        d.id = kSpdifId;
        d.words = {10u, 0u, 0x1F0662u, 0, 0};
        core::log(core::Level::Debug, core::Subsystem::Audio, "send {:x} 10 0 0", kSpdifId);
        send(d, kSpdifId);
    }
    return sent;
}

void LiveAudio::step() {
    if (m_stats.failed) return;
    const uint64_t count = ((m_stats.frames + 1) * kSamplesNumerator) / kSamplesDenominator - (m_stats.frames * kSamplesNumerator) / kSamplesDenominator;
    ++m_stats.frames;
    std::vector<int16_t>& out = m_last;
    out.assign(size_t(2) * count, 0);
    guarded([&] { m_sound.render(out.data(), count); });
    if (m_stats.failed) return;
    m_stats.samples += count;
    for (int16_t v : out) {
        const uint32_t magnitude = uint32_t(std::abs(int32_t(v)));
        m_stats.peak = std::max(m_stats.peak, magnitude);
        if (v == INT16_MAX || v == INT16_MIN) ++m_stats.clipped;
    }
    if (!m_options.wav.empty()) m_recorded.insert(m_recorded.end(), out.begin(), out.end());
    if (m_stream == nullptr) return;
    const uint32_t queued = uint32_t(SDL_GetAudioStreamQueued(m_stream)) / 4;
    m_stats.minQueuedFrames = std::min(m_stats.minQueuedFrames, queued);
    m_stats.maxQueuedFrames = std::max(m_stats.maxQueuedFrames, queued);
    if (queued == 0 && m_stats.frames > 120) ++m_stats.underruns;
    if (queued > kMaxQueuedFrames * kFrameSamples) {
        ++m_stats.overruns;
        return;
    }
    if (m_muted) std::fill(out.begin(), out.end(), int16_t(0));
    else if (m_volume != 1.0f)
        for (int16_t& v : out) v = int16_t(std::clamp(int32_t(float(v) * m_volume), -32768, 32767));
    SDL_PutAudioStreamData(m_stream, out.data(), int(out.size() * 2));
}

std::string LiveAudio::finish() {
    if (!m_options.wav.empty()) writeWavFile(m_options.wav, m_recorded);
    if (!m_options.commandLog.empty()) {
        std::ofstream log(m_options.commandLog);
        log << "samples " << m_stats.samples << " video " << (m_options.video == Video::Pal ? "pal" : "ntsc") << " preroll " << kEeStartAfterInit << "\n";
        for (const LoggedCommand& c : m_sound.commandLog()) {
            log << c.sample << ' ' << c.command.frame << ' ' << std::hex << c.command.id << std::dec;
            for (uint32_t w : c.command.words) log << ' ' << w;
            log << "\n";
        }
    }
    char line[256];
    std::snprintf(line, sizeof line, "audio: %llu frames, %llu samples, peak %u, %llu clipped, queue %u..%u frames, %llu underruns, %llu overruns, device %s%s%s",
                  (unsigned long long)m_stats.frames, (unsigned long long)m_stats.samples, m_stats.peak, (unsigned long long)m_stats.clipped,
                  m_stats.minQueuedFrames == UINT32_MAX ? 0u : m_stats.minQueuedFrames, m_stats.maxQueuedFrames, (unsigned long long)m_stats.underruns,
                  (unsigned long long)m_stats.overruns, m_stats.deviceOpen ? "open" : "none", m_stats.failed ? ", FAILED: " : "", m_error.c_str());
    return line;
}

}
