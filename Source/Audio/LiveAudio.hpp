#pragma once
#include <cstdint>
#include <filesystem>
#include <memory>
#include <string>
#include <vector>

#include "Audio/ClockSound.hpp"
#include "Audio/EeSoundQueue.hpp"

#include <SDL3/SDL_audio.h>

namespace audio {

struct LiveAudioOptions {
    bool mute = false;
    bool device = true;
    Video video = Video::Ntsc;
    std::filesystem::path wav;
    std::filesystem::path commandLog;
};

struct LiveAudioStats {
    uint64_t frames = 0, samples = 0, underruns = 0, overruns = 0, clipped = 0;
    uint32_t peak = 0;
    uint32_t minQueuedFrames = 0, maxQueuedFrames = 0;
    bool deviceOpen = false, failed = false;
};

class LiveAudio {
public:
    LiveAudio(ClockSoundSources sources, const LiveAudioOptions& options);
    ~LiveAudio();
    LiveAudio(const LiveAudio&) = delete;
    LiveAudio& operator=(const LiveAudio&) = delete;

    void discardPending() { m_queue.drain(); }
    void queue(const SoundCommand& command, bool carriedA2 = false, bool carriedA3 = false);
    std::vector<SoundCommand> drain();
    void step();
    void setMuted(bool muted) { m_muted = muted; }
    bool muted() const { return m_muted; }
    void setVolume(float volume) { m_volume = volume; }
    float volume() const { return m_volume; }
    const LiveAudioStats& stats() const { return m_stats; }
    int queuedFrames() const { return m_stream ? int(SDL_GetAudioStreamQueued(m_stream)) / 4 : -1; }
    const std::vector<int16_t>& lastFrame() const { return m_last; }
    std::string finish();

private:
    template <class F> void guarded(F&& body);

    ClockSound m_sound;
    EeSoundQueue m_queue;
    bool m_skipDrain = false;
    bool m_spdifPending = true;
    LiveAudioOptions m_options;
    SDL_AudioStream* m_stream = nullptr;
    bool m_sdl = false;
    bool m_muted = false;
    float m_volume = 1.0f;
    LiveAudioStats m_stats;
    std::vector<int16_t> m_recorded;
    std::vector<int16_t> m_last;
    std::string m_error;
};

}
